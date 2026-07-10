"""
Agente nocturno: descarga AFIP para todos los clientes activos de un estudio
y envía reportes IVA a los que tienen saldo a pagar.
"""
import json
import os
import traceback
from datetime import datetime, timezone, timedelta

from database import SessionLocal
import models
from services.crypto_service import decrypt
from services.afip_service import ejecutar_descarga
from services.email_service import enviar_reporte_iva, enviar_email_generico
from services import iva_service

STORAGE_PATH = os.getenv("STORAGE_PATH", "./storage")


def _now_ar():
    return datetime.now(timezone(timedelta(hours=-3))).replace(tzinfo=None)


def _periodo_actual() -> str:
    """Devuelve YYYY-MM del mes en curso."""
    hoy = _now_ar()
    return f"{hoy.year}-{hoy.month:02d}"




async def ejecutar_agente_estudio(estudio_id: int) -> dict:
    """
    Job principal del agente para un estudio.
    1. Descarga AFIP del mes anterior para todos los clientes activos.
    2. Calcula posición IVA.
    3. Envía email a clientes con saldo > 0.
    4. Envía resumen al admin del estudio.
    5. Guarda log en DB.
    Devuelve dict con resumen de la ejecución.
    """
    db = SessionLocal()
    try:
        estudio = db.query(models.Estudio).filter(models.Estudio.id == estudio_id).first()
        if not estudio or not estudio.activo:
            return {"error": "Estudio inactivo o no encontrado"}

        periodo = _periodo_actual()
        periodo_desde = f"{periodo}-01"
        periodo_hasta_d = datetime.strptime(periodo_desde, "%Y-%m-%d")
        import calendar
        ultimo = calendar.monthrange(periodo_hasta_d.year, periodo_hasta_d.month)[1]
        periodo_hasta = f"{periodo}-{ultimo:02d}"

        clientes = db.query(models.Cliente).filter(
            models.Cliente.estudio_id == estudio_id,
            models.Cliente.activo == True,
        ).all()

        # Descifrar contraseña SMTP del estudio
        smtp_password = ""
        if estudio.smtp_password_enc:
            try:
                smtp_password = decrypt(estudio.smtp_password_enc)
            except Exception as e:
                print(f"[AGENTE] Error descifrando SMTP password: {e}")

        smtp_host = estudio.smtp_host or "smtp.gmail.com"
        smtp_port = estudio.smtp_port or 587

        # Verificar si hoy es día de envío de mails a clientes
        hoy_dia = _now_ar().day
        raw_dias = estudio.agente_mail_dias or "5,10,20,25"
        mail_dias = [int(d.strip()) for d in raw_dias.split(",") if d.strip().isdigit()]
        es_dia_mail = hoy_dia in mail_dias
        print(f"[AGENTE] Día actual: {hoy_dia} | Días de mail: {mail_dias} | Envía mails: {es_dia_mail}")

        detalle_clientes = []
        reportes_enviados = 0
        errores = 0

        # ── Fase 1: descargar AFIP ──────────────────────────────────────────
        for cliente in clientes:
            print(f"[AGENTE] Descargando {cliente.nombre} ...")
            try:
                afip_password = decrypt(cliente.afip_password_enc)
            except Exception as e:
                detalle_clientes.append({
                    "cliente": cliente.nombre,
                    "descarga": False,
                    "envio": False,
                    "error": f"Error contraseña: {e}",
                })
                errores += 1
                continue

            try:
                resultados = await ejecutar_descarga(
                    afip_cuit=cliente.afip_cuit,
                    afip_password=afip_password,
                    cliente_cuit=cliente.cuit,
                    representado=cliente.representado or cliente.nombre,
                    periodo_desde=periodo_desde,
                    periodo_hasta=periodo_hasta,
                    tipos=["emitidos", "recibidos"],
                    storage_base=STORAGE_PATH,
                )
            except Exception as e:
                traceback.print_exc()
                detalle_clientes.append({
                    "cliente": cliente.nombre,
                    "descarga": False,
                    "envio": False,
                    "error": f"Error AFIP: {str(e)[:200]}",
                })
                errores += 1
                continue

            # Guardar archivos descargados
            for tipo, (ruta, error) in resultados.items():
                if ruta and os.path.exists(ruta):
                    ya_existe = db.query(models.ArchivoAfip).filter(
                        models.ArchivoAfip.cliente_id == cliente.id,
                        models.ArchivoAfip.nombre_archivo == os.path.basename(ruta),
                    ).first()
                    if not ya_existe:
                        archivo = models.ArchivoAfip(
                            cliente_id=cliente.id,
                            descargado_por=_get_admin_id(db, estudio_id),
                            tipo=tipo,
                            periodo=periodo,
                            nombre_archivo=os.path.basename(ruta),
                            ruta_archivo=ruta,
                            tamanio_bytes=os.path.getsize(ruta),
                        )
                        db.add(archivo)
            db.commit()

            # ── Fase 2: calcular IVA y enviar reporte ──────────────────────
            archivos_db = db.query(models.ArchivoAfip).filter(
                models.ArchivoAfip.cliente_id == cliente.id
            ).all()

            rutas_e = [(a.ruta_archivo, a.periodo) for a in archivos_db if a.tipo == "emitidos"]
            rutas_r = [(a.ruta_archivo, a.periodo) for a in archivos_db if a.tipo == "recibidos"]

            datos_e = iva_service.agregar_iva(rutas_e)
            datos_r = iva_service.agregar_iva(rutas_r)

            use_e = iva_service.slice_periodo(datos_e, periodo)
            use_r = iva_service.slice_periodo(datos_r, periodo)

            use_e_iva = use_e.get("total_iva", 0.0)
            use_r_iva = use_r.get("total_iva", 0.0)
            use_e_det = {k: use_e.get(k, 0.0) for k in iva_service.DETALLE_KEYS}
            use_r_det = {k: use_r.get(k, 0.0) for k in iva_service.DETALLE_KEYS}

            saldo = round(use_e_iva - use_r_iva, 2)

            info = {
                "cliente": cliente.nombre,
                "descarga": True,
                "saldo": saldo,
                "envio": False,
                "error": None,
            }

            # Solo enviar si es día de mail, tiene saldo positivo y tiene email
            if saldo > 0 and es_dia_mail and cliente.email and estudio.email_institucional:
                try:
                    enviar_reporte_iva(
                        from_email=estudio.email_institucional,
                        to_email=cliente.email,
                        cliente_nombre=cliente.nombre,
                        estudio_nombre=estudio.nombre,
                        periodo_label=periodo,
                        iva_ventas=round(use_e_iva, 2),
                        iva_compras=round(use_r_iva, 2),
                        saldo=saldo,
                        detalle_ventas=use_e_det,
                        detalle_compras=use_r_det,
                        smtp_host=smtp_host,
                        smtp_port=smtp_port,
                        smtp_password=smtp_password,
                    )
                    info["envio"] = True
                    reportes_enviados += 1
                except Exception as e:
                    info["error"] = f"Error email: {str(e)[:200]}"
                    errores += 1
            elif saldo > 0 and not es_dia_mail:
                info["error"] = f"No es día de envío (próximos: {sorted(d for d in mail_dias if d > hoy_dia) or mail_dias})"
            elif saldo > 0 and not cliente.email:
                info["error"] = "Sin email registrado"

            detalle_clientes.append(info)

        # ── Fase 3: email resumen al admin ──────────────────────────────────
        _enviar_resumen_admin(
            estudio=estudio,
            periodo=periodo,
            detalle_clientes=detalle_clientes,
            reportes_enviados=reportes_enviados,
            errores=errores,
            smtp_host=smtp_host,
            smtp_port=smtp_port,
            smtp_password=smtp_password,
        )

        # ── Guardar log ─────────────────────────────────────────────────────
        log = models.AgenteLog(
            estudio_id=estudio_id,
            ejecutado_en=_now_ar(),
            periodo=periodo,
            clientes_procesados=len(clientes),
            reportes_enviados=reportes_enviados,
            errores=errores,
            detalle=json.dumps(detalle_clientes, ensure_ascii=False),
        )
        db.add(log)
        db.commit()

        resumen = {
            "estudio": estudio.nombre,
            "periodo": periodo,
            "clientes": len(clientes),
            "reportes_enviados": reportes_enviados,
            "errores": errores,
        }
        print(f"[AGENTE] Fin estudio {estudio.nombre}: {resumen}")
        return resumen

    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}
    finally:
        db.close()


def _get_admin_id(db, estudio_id: int) -> int:
    admin = db.query(models.Usuario).filter(
        models.Usuario.estudio_id == estudio_id,
        models.Usuario.rol == "admin",
    ).first()
    return admin.id if admin else 1


def _enviar_resumen_admin(estudio, periodo: str, detalle_clientes: list,
                          reportes_enviados: int, errores: int,
                          smtp_host: str = "smtp.gmail.com", smtp_port: int = 587,
                          smtp_password: str = ""):
    """Envía email de resumen al admin del estudio."""
    if not estudio.email_institucional:
        return

    from database import SessionLocal
    db = SessionLocal()
    try:
        admin = db.query(models.Usuario).filter(
            models.Usuario.estudio_id == estudio.id,
            models.Usuario.rol == "admin",
        ).first()
        if not admin or not admin.email:
            return
    finally:
        db.close()

    filas = ""
    for d in detalle_clientes:
        if d.get("descarga"):
            saldo = d.get("saldo", 0)
            envio = d.get("envio", False)
            error = d.get("error") or ""
            color_saldo = "#DC2626" if saldo > 0 else "#059669" if saldo < 0 else "#6B7280"
            saldo_txt = f"$ {abs(saldo):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            estado = "✓ Enviado" if envio else ("⚠ Sin email" if "Sin email" in error else ("✗ Error" if error else "— (saldo a favor / neutro)"))
            filas += f"""
            <tr style="border-bottom:1px solid #E5E7EB;">
              <td style="padding:8px 12px;font-size:13px;color:#111827;">{d['cliente']}</td>
              <td style="padding:8px 12px;font-size:13px;text-align:right;color:{color_saldo};font-family:monospace;">{saldo_txt}</td>
              <td style="padding:8px 12px;font-size:13px;text-align:center;">{estado}</td>
              <td style="padding:8px 12px;font-size:11px;color:#9CA3AF;">{error}</td>
            </tr>"""
        else:
            filas += f"""
            <tr style="border-bottom:1px solid #E5E7EB;">
              <td style="padding:8px 12px;font-size:13px;color:#6B7280;">{d['cliente']}</td>
              <td colspan="2" style="padding:8px 12px;font-size:13px;color:#EF4444;">✗ Error descarga</td>
              <td style="padding:8px 12px;font-size:11px;color:#9CA3AF;">{d.get('error','')}</td>
            </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
    style="background:linear-gradient(135deg,#1D3070 0%,#2563EB 100%);">
    <tr><td style="padding:28px 36px;">
      <p style="margin:0;color:rgba(255,255,255,0.65);font-size:11px;letter-spacing:2px;text-transform:uppercase;">
        {estudio.nombre} — Agente Nocturno
      </p>
      <h1 style="margin:6px 0 0;color:#fff;font-size:22px;">Resumen de ejecución automática</h1>
      <p style="margin:4px 0 0;color:#93C5FD;font-size:13px;">Período procesado: <strong>{periodo}</strong></p>
    </td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding:28px 36px;">

      <!-- Cards resumen -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td width="32%" style="background:#fff;border-radius:10px;padding:16px 20px;text-align:center;border-top:4px solid #3B82F6;">
            <p style="margin:0;font-size:11px;color:#6B7280;text-transform:uppercase;font-weight:600;">Clientes procesados</p>
            <p style="margin:6px 0 0;font-size:28px;font-weight:700;color:#111827;">{len(detalle_clientes)}</p>
          </td>
          <td width="4%"></td>
          <td width="32%" style="background:#fff;border-radius:10px;padding:16px 20px;text-align:center;border-top:4px solid #10B981;">
            <p style="margin:0;font-size:11px;color:#6B7280;text-transform:uppercase;font-weight:600;">Reportes enviados</p>
            <p style="margin:6px 0 0;font-size:28px;font-weight:700;color:#059669;">{reportes_enviados}</p>
          </td>
          <td width="4%"></td>
          <td width="32%" style="background:#fff;border-radius:10px;padding:16px 20px;text-align:center;border-top:4px solid {'#EF4444' if errores else '#D1D5DB'};">
            <p style="margin:0;font-size:11px;color:#6B7280;text-transform:uppercase;font-weight:600;">Con errores</p>
            <p style="margin:6px 0 0;font-size:28px;font-weight:700;color:{'#DC2626' if errores else '#9CA3AF'};">{errores}</p>
          </td>
        </tr>
      </table>

      <!-- Tabla detalle -->
      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E5E7EB;">
        <thead>
          <tr style="background:#F9FAFB;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;font-weight:600;">Cliente</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6B7280;text-transform:uppercase;font-weight:600;">Saldo</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:#6B7280;text-transform:uppercase;font-weight:600;">Estado</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;font-weight:600;">Detalle</th>
          </tr>
        </thead>
        <tbody>{filas}</tbody>
      </table>

      <p style="margin:20px 0 0;font-size:12px;color:#9CA3AF;text-align:center;">
        Ejecutado automáticamente el {_now_ar().strftime('%d/%m/%Y a las %H:%M')} por ContAI Agente
      </p>

    </td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1E293B;">
    <tr><td style="padding:16px 36px;text-align:center;">
      <p style="margin:0;color:#94A3B8;font-size:12px;">
        <strong style="color:#60A5FA;">ContAI</strong> — {estudio.nombre}
      </p>
    </td></tr>
  </table>
</body>
</html>"""

    if not smtp_password or not estudio.email_institucional:
        print("[AGENTE] Sin credenciales SMTP configuradas, omitiendo resumen al admin")
        return

    try:
        enviar_email_generico(
            from_email=estudio.email_institucional,
            to_email=admin.email,
            subject=f"[Agente] Resumen nocturno {periodo} — {estudio.nombre}",
            html=html,
            plain=f"Resumen agente nocturno: {reportes_enviados} reportes enviados, {errores} errores.",
            estudio_nombre=estudio.nombre,
            smtp_host=smtp_host,
            smtp_port=smtp_port,
            smtp_password=smtp_password,
        )
        print(f"[AGENTE] Resumen enviado a {admin.email}")
    except Exception as e:
        print(f"[AGENTE] Error enviando resumen: {e}")
