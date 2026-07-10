import os
import traceback
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
import models, schemas, auth
from services.crypto_service import decrypt
from services.afip_service import ejecutar_descarga
from services.email_service import enviar_reporte_iva
from services import iva_service
from dotenv import load_dotenv

load_dotenv()
STORAGE_PATH = os.getenv("STORAGE_PATH", "./storage")

router = APIRouter(prefix="/api/contador", tags=["contador"])


def _get_estudio_id(current: models.Usuario) -> int:
    if not current.estudio_id:
        raise HTTPException(status_code=400, detail="Usuario sin estudio asignado")
    return current.estudio_id


@router.get("/clientes")
def mis_clientes(
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_contador),
):
    estudio_id = _get_estudio_id(current)

    if current.rol == "admin":
        clientes = db.query(models.Cliente).filter(
            models.Cliente.estudio_id == estudio_id,
            models.Cliente.activo == True,
        ).all()
    else:
        asignaciones = db.query(models.ClienteContador).filter(
            models.ClienteContador.contador_id == current.id
        ).all()
        ids = [a.cliente_id for a in asignaciones]
        clientes = db.query(models.Cliente).filter(
            models.Cliente.id.in_(ids),
            models.Cliente.estudio_id == estudio_id,
            models.Cliente.activo == True,
        ).all()

    result = []
    for c in clientes:
        usuarios = [cc.contador for cc in c.contadores]
        result.append(schemas.ClienteConContadores(
            id=c.id,
            nombre=c.nombre,
            cuit=c.cuit,
            email=c.email,
            afip_cuit=c.afip_cuit,
            representado=c.representado,
            activo=c.activo,
            creado_en=c.creado_en,
            contadores=[
                schemas.UsuarioOut.model_validate(u, from_attributes=True)
                for u in usuarios
            ],
        ).model_dump(mode="json"))
    return result


@router.get("/clientes/{cliente_id}/archivos", response_model=List[schemas.ArchivoAfipOut])
def archivos_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_contador),
):
    _verificar_acceso(current, cliente_id, db)
    return (
        db.query(models.ArchivoAfip)
        .filter(models.ArchivoAfip.cliente_id == cliente_id)
        .order_by(models.ArchivoAfip.descargado_en.desc())
        .all()
    )


@router.post("/descargar-afip", response_model=schemas.DescargaAfipResponse)
async def descargar_afip(
    data: schemas.DescargaAfipRequest,
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_contador),
):
    _verificar_acceso(current, data.cliente_id, db)

    cliente = db.query(models.Cliente).filter(models.Cliente.id == data.cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    try:
        afip_password = decrypt(cliente.afip_password_enc)
    except Exception as e:
        print(f"[AFIP] Error descifrando contraseña del cliente {cliente.id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al descifrar contraseña AFIP: {e}")

    print(f"[AFIP] Iniciando descarga para CUIT={cliente.afip_cuit} desde={data.periodo_desde} hasta={data.periodo_hasta} tipos={data.tipos}")
    try:
        resultados = await ejecutar_descarga(
            afip_cuit=cliente.afip_cuit,
            afip_password=afip_password,
            cliente_cuit=cliente.cuit,
            representado=cliente.representado or cliente.nombre,
            periodo_desde=data.periodo_desde,
            periodo_hasta=data.periodo_hasta,
            tipos=[t.value for t in data.tipos],
            storage_base=STORAGE_PATH,
        )
    except Exception as e:
        print(f"[AFIP] Excepcion no capturada en ejecutar_descarga: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error interno AFIP: {str(e)}")

    archivos_guardados = []
    errores = []

    periodo_label = data.periodo_desde if data.periodo_desde == data.periodo_hasta else f"{data.periodo_desde}/{data.periodo_hasta}"
    for tipo, (ruta, error) in resultados.items():
        if ruta and os.path.exists(ruta):
            archivo = models.ArchivoAfip(
                cliente_id=data.cliente_id,
                descargado_por=current.id,
                tipo=tipo,
                periodo=periodo_label,
                nombre_archivo=os.path.basename(ruta),
                ruta_archivo=ruta,
                tamanio_bytes=os.path.getsize(ruta),
            )
            db.add(archivo)
            db.flush()
            db.refresh(archivo)
            archivos_guardados.append(schemas.ArchivoAfipOut.model_validate(archivo, from_attributes=True))
        else:
            msg = error or f"No se pudo descargar {tipo}"
            errores.append(msg)

    db.commit()
    iva_service.invalidar_cache()  # nuevos archivos → invalidar caché de IVA
    return schemas.DescargaAfipResponse(
        exitoso=len(errores) == 0,
        archivos=archivos_guardados,
        errores=errores,
    )


@router.post("/descargar-afip-masivo")
async def descargar_afip_masivo(
    data: schemas.DescargaAfipMasivoRequest,
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_contador),
):
    estudio_id = _get_estudio_id(current)

    if current.rol == "admin":
        clientes = db.query(models.Cliente).filter(
            models.Cliente.estudio_id == estudio_id,
            models.Cliente.activo == True,
        ).all()
    else:
        ids = [a.cliente_id for a in db.query(models.ClienteContador).filter(
            models.ClienteContador.contador_id == current.id
        ).all()]
        clientes = db.query(models.Cliente).filter(
            models.Cliente.id.in_(ids),
            models.Cliente.estudio_id == estudio_id,
            models.Cliente.activo == True,
        ).all()

    # Filtrar por cliente_ids si se especifica
    if data.cliente_ids:
        clientes = [c for c in clientes if c.id in set(data.cliente_ids)]

    periodo_label = data.periodo_desde if data.periodo_desde == data.periodo_hasta else f"{data.periodo_desde}/{data.periodo_hasta}"
    tipos_str = [t.value for t in data.tipos]

    resultados_clientes = []

    for cliente in clientes:
        print(f"[AFIP MASIVO] Iniciando cliente={cliente.nombre} CUIT={cliente.afip_cuit}")
        try:
            afip_password = decrypt(cliente.afip_password_enc)
        except Exception as e:
            resultados_clientes.append({
                "cliente_id": cliente.id,
                "cliente_nombre": cliente.nombre,
                "exitoso": False,
                "archivos": [],
                "errores": [f"Error al descifrar contraseña: {e}"],
            })
            continue

        try:
            resultados = await ejecutar_descarga(
                afip_cuit=cliente.afip_cuit,
                afip_password=afip_password,
                cliente_cuit=cliente.cuit,
                representado=cliente.representado or cliente.nombre,
                periodo_desde=data.periodo_desde,
                periodo_hasta=data.periodo_hasta,
                tipos=tipos_str,
                storage_base=STORAGE_PATH,
            )
        except Exception as e:
            traceback.print_exc()
            resultados_clientes.append({
                "cliente_id": cliente.id,
                "cliente_nombre": cliente.nombre,
                "exitoso": False,
                "archivos": [],
                "errores": [f"Error AFIP: {str(e)[:200]}"],
            })
            continue

        archivos_guardados = []
        errores = []
        for tipo, (ruta, error) in resultados.items():
            if ruta and os.path.exists(ruta):
                archivo = models.ArchivoAfip(
                    cliente_id=cliente.id,
                    descargado_por=current.id,
                    tipo=tipo,
                    periodo=periodo_label,
                    nombre_archivo=os.path.basename(ruta),
                    ruta_archivo=ruta,
                    tamanio_bytes=os.path.getsize(ruta),
                )
                db.add(archivo)
                db.flush()
                db.refresh(archivo)
                archivos_guardados.append(schemas.ArchivoAfipOut.model_validate(archivo, from_attributes=True))
            else:
                errores.append(error or f"No se pudo descargar {tipo}")

        db.commit()
        iva_service.invalidar_cache()  # nuevos archivos → invalidar caché de IVA
        resultados_clientes.append({
            "cliente_id": cliente.id,
            "cliente_nombre": cliente.nombre,
            "exitoso": len(errores) == 0,
            "archivos": [a.model_dump(mode="json") for a in archivos_guardados],
            "errores": errores,
        })
        print(f"[AFIP MASIVO] {cliente.nombre}: {len(archivos_guardados)} archivos, {len(errores)} errores")

    return resultados_clientes


@router.get("/archivos")
def todos_archivos(
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_contador),
):
    estudio_id = _get_estudio_id(current)

    if current.rol == "admin":
        cliente_ids = [c.id for c in db.query(models.Cliente).filter(
            models.Cliente.estudio_id == estudio_id,
            models.Cliente.activo == True,
        ).all()]
    else:
        cliente_ids = [a.cliente_id for a in db.query(models.ClienteContador).filter(
            models.ClienteContador.contador_id == current.id
        ).all()]

    clientes_map = {c.id: c for c in db.query(models.Cliente).filter(models.Cliente.id.in_(cliente_ids)).all()}

    archivos = (
        db.query(models.ArchivoAfip)
        .filter(models.ArchivoAfip.cliente_id.in_(cliente_ids))
        .order_by(models.ArchivoAfip.descargado_en.desc())
        .all()
    )

    resultado = []
    for a in archivos:
        cliente = clientes_map.get(a.cliente_id)
        base = schemas.ArchivoAfipOut.model_validate(a, from_attributes=True).model_dump(mode="json")
        base["cliente_id"] = a.cliente_id
        base["cliente_nombre"] = cliente.nombre if cliente else "?"
        base["cliente_cuit"] = cliente.cuit if cliente else "?"
        resultado.append(base)
    return resultado


@router.get("/archivos/{archivo_id}/descargar")
def descargar_archivo(
    archivo_id: int,
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_contador),
):
    archivo = db.query(models.ArchivoAfip).filter(models.ArchivoAfip.id == archivo_id).first()
    if not archivo:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    _verificar_acceso(current, archivo.cliente_id, db)
    if not os.path.exists(archivo.ruta_archivo):
        raise HTTPException(status_code=404, detail="Archivo físico no encontrado")
    ext = os.path.splitext(archivo.ruta_archivo)[1].lower()
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if ext == ".xlsx" else "text/csv"
    )
    return FileResponse(
        path=archivo.ruta_archivo,
        filename=archivo.nombre_archivo,
        media_type=media_type,
    )


@router.delete("/archivos/{archivo_id}")
def eliminar_archivo(
    archivo_id: int,
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_contador),
):
    archivo = db.query(models.ArchivoAfip).filter(models.ArchivoAfip.id == archivo_id).first()
    if not archivo:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    _verificar_acceso(current, archivo.cliente_id, db)
    if os.path.exists(archivo.ruta_archivo):
        os.remove(archivo.ruta_archivo)
    db.delete(archivo)
    db.commit()
    return {"ok": True}



@router.get("/dashboard/iva")
def dashboard_iva(
    periodo: Optional[str] = Query(None, description="Filtro de período, ej: 2026-06"),
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_contador),
):
    estudio_id = _get_estudio_id(current)

    if current.rol == "admin":
        clientes = db.query(models.Cliente).filter(
            models.Cliente.estudio_id == estudio_id,
            models.Cliente.activo == True,
        ).all()
    else:
        ids = [a.cliente_id for a in db.query(models.ClienteContador).filter(
            models.ClienteContador.contador_id == current.id
        ).all()]
        clientes = db.query(models.Cliente).filter(
            models.Cliente.id.in_(ids),
            models.Cliente.estudio_id == estudio_id,
            models.Cliente.activo == True,
        ).all()

    # Carga todos los archivos de todos los clientes en una sola query
    cliente_ids = [c.id for c in clientes]
    todos_archivos = (
        db.query(models.ArchivoAfip)
        .filter(models.ArchivoAfip.cliente_id.in_(cliente_ids))
        .order_by(models.ArchivoAfip.descargado_en.desc())
        .all()
    )
    archivos_por_cliente: dict = {c.id: [] for c in clientes}
    for a in todos_archivos:
        archivos_por_cliente[a.cliente_id].append(a)

    resultado = []
    for cliente in clientes:
        archivos = archivos_por_cliente[cliente.id]

        rutas_emitidos  = [(a.ruta_archivo, a.periodo) for a in archivos if a.tipo == "emitidos"]
        rutas_recibidos = [(a.ruta_archivo, a.periodo) for a in archivos if a.tipo == "recibidos"]

        datos_e = iva_service.agregar_iva(rutas_emitidos)
        datos_r = iva_service.agregar_iva(rutas_recibidos)

        use_e = iva_service.slice_periodo(datos_e, periodo)
        use_r = iva_service.slice_periodo(datos_r, periodo)

        iva_ventas       = use_e.get("total_iva", 0)
        imp_total_ventas = use_e.get("imp_total", 0)
        detalle_ventas   = {k: use_e.get(k, 0.0) for k in ["iva_21", "iva_105", "iva_27", "iva_5", "iva_25"]}
        # Con filtro de período: solo cuenta como "tiene" si hay data para ese período puntual
        tiene_emitidos   = (periodo in datos_e["por_periodo"]) if periodo else bool(rutas_emitidos)

        iva_compras       = use_r.get("total_iva", 0)
        imp_total_compras = use_r.get("imp_total", 0)
        detalle_compras   = {k: use_r.get(k, 0.0) for k in ["iva_21", "iva_105", "iva_27", "iva_5", "iva_25"]}
        tiene_recibidos   = (periodo in datos_r["por_periodo"]) if periodo else bool(rutas_recibidos)

        # Períodos reales usados (unión de ambos tipos)
        periodos_usados = sorted(set(datos_e["por_periodo"]) | set(datos_r["por_periodo"]))

        saldo = round(iva_ventas - iva_compras, 2)
        resultado.append({
            "cliente_id": cliente.id,
            "cliente_nombre": cliente.nombre,
            "cliente_cuit": cliente.cuit,
            "cliente_representado": cliente.representado if cliente.representado and cliente.representado != cliente.nombre else None,
            "iva_ventas": round(iva_ventas, 2),
            "iva_compras": round(iva_compras, 2),
            "imp_total_ventas": round(imp_total_ventas, 2),
            "imp_total_compras": round(imp_total_compras, 2),
            "saldo": saldo,
            "detalle_ventas": {k: round(v, 2) for k, v in detalle_ventas.items()},
            "detalle_compras": {k: round(v, 2) for k, v in detalle_compras.items()},
            "tiene_emitidos": tiene_emitidos,
            "tiene_recibidos": tiene_recibidos,
            "periodos_usados": periodos_usados,
            "alerta": "pagar" if saldo > 0 else ("favor" if saldo < 0 else "neutro"),
        })

    resultado.sort(key=lambda x: abs(x["saldo"]), reverse=True)
    return resultado



@router.get("/dashboard/evolucion")
def dashboard_evolucion(
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_contador),
):
    estudio_id = _get_estudio_id(current)

    if current.rol == "admin":
        clientes = db.query(models.Cliente).filter(
            models.Cliente.estudio_id == estudio_id,
            models.Cliente.activo == True,
        ).all()
    else:
        ids = [a.cliente_id for a in db.query(models.ClienteContador).filter(
            models.ClienteContador.contador_id == current.id
        ).all()]
        clientes = db.query(models.Cliente).filter(
            models.Cliente.id.in_(ids),
            models.Cliente.estudio_id == estudio_id,
            models.Cliente.activo == True,
        ).all()

    todos_periodos = set()
    resultado_clientes = []

    # Una sola query para todos los archivos
    evo_cliente_ids = [c.id for c in clientes]
    evo_archivos = (
        db.query(models.ArchivoAfip)
        .filter(models.ArchivoAfip.cliente_id.in_(evo_cliente_ids))
        .order_by(models.ArchivoAfip.descargado_en)
        .all()
    )
    evo_archivos_map: dict = {c.id: [] for c in clientes}
    for a in evo_archivos:
        evo_archivos_map[a.cliente_id].append(a)

    # Una sola query para todas las asignaciones contador-cliente
    todas_asig = db.query(models.ClienteContador).filter(
        models.ClienteContador.cliente_id.in_(evo_cliente_ids)
    ).all()
    asig_map: dict = {c.id: [] for c in clientes}
    for asig in todas_asig:
        asig_map[asig.cliente_id].append(asig.contador_id)

    # Una sola query para todos los contadores referenciados
    todos_contador_ids = list({cid for ids in asig_map.values() for cid in ids})
    contadores_map = {
        u.id: schemas.UsuarioOut.model_validate(u, from_attributes=True).model_dump(mode="json")
        for u in db.query(models.Usuario).filter(models.Usuario.id.in_(todos_contador_ids)).all()
    }

    for cliente in clientes:
        archivos = evo_archivos_map[cliente.id]
        rutas_e = [(a.ruta_archivo, a.periodo) for a in archivos if a.tipo == "emitidos"]
        rutas_r = [(a.ruta_archivo, a.periodo) for a in archivos if a.tipo == "recibidos"]

        datos_e = iva_service.agregar_iva(rutas_e)
        datos_r = iva_service.agregar_iva(rutas_r)

        # Construir por_periodo combinando emitidos y recibidos
        todos_p = set(datos_e["por_periodo"]) | set(datos_r["por_periodo"])
        por_periodo: dict = {}
        for p in todos_p:
            todos_periodos.add(p)
            iva_v = datos_e["por_periodo"].get(p, {}).get("total_iva", 0.0)
            iva_c = datos_r["por_periodo"].get(p, {}).get("total_iva", 0.0)
            por_periodo[p] = {
                "iva_ventas":  round(iva_v, 2),
                "iva_compras": round(iva_c, 2),
                "saldo":       round(iva_v - iva_c, 2),
            }

        contadores_out = [contadores_map[cid] for cid in asig_map[cliente.id] if cid in contadores_map]

        resultado_clientes.append({
            "cliente_id": cliente.id,
            "cliente_nombre": cliente.nombre,
            "cliente_cuit": cliente.cuit,
            "cliente_representado": cliente.representado or cliente.nombre,
            "contadores": contadores_out,
            "por_periodo": por_periodo,
        })

    periodos_ordenados = sorted(todos_periodos)
    return {
        "periodos": periodos_ordenados,
        "clientes": resultado_clientes,
    }


@router.post("/reportes/enviar", response_model=List[schemas.ResultadoEnvioReporte])
def enviar_reportes_iva(
    data: schemas.EnviarReporteRequest,
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_contador),
):
    estudio_id = _get_estudio_id(current)
    estudio = db.query(models.Estudio).filter(models.Estudio.id == estudio_id).first()
    if not estudio:
        raise HTTPException(status_code=404, detail="Estudio no encontrado")

    from_email = estudio.email_institucional
    if not from_email:
        raise HTTPException(
            status_code=400,
            detail="El estudio no tiene configurado el email de envío. Configurarlo en Agente → Correo saliente."
        )

    # Descifrar contraseña SMTP
    smtp_password = ""
    if estudio.smtp_password_enc:
        try:
            from services.crypto_service import decrypt as _decrypt
            smtp_password = _decrypt(estudio.smtp_password_enc)
        except Exception:
            pass
    if not smtp_password:
        raise HTTPException(
            status_code=400,
            detail="El estudio no tiene configurada la contraseña SMTP. Configurarla en Agente → Correo saliente."
        )

    smtp_host = estudio.smtp_host or "smtp.gmail.com"
    smtp_port = estudio.smtp_port or 587

    # Obtener clientes autorizados
    if current.rol == "admin":
        clientes_auth = {c.id: c for c in db.query(models.Cliente).filter(
            models.Cliente.estudio_id == estudio_id,
            models.Cliente.activo == True,
        ).all()}
    else:
        ids = [a.cliente_id for a in db.query(models.ClienteContador).filter(
            models.ClienteContador.contador_id == current.id
        ).all()]
        clientes_auth = {c.id: c for c in db.query(models.Cliente).filter(
            models.Cliente.id.in_(ids),
            models.Cliente.estudio_id == estudio_id,
            models.Cliente.activo == True,
        ).all()}

    resultados = []
    for cliente_id in data.cliente_ids:
        cliente = clientes_auth.get(cliente_id)
        if not cliente:
            resultados.append(schemas.ResultadoEnvioReporte(
                cliente_id=cliente_id, cliente_nombre="Desconocido",
                enviado=False, error="Cliente no encontrado o sin acceso",
            ))
            continue

        if not cliente.email:
            resultados.append(schemas.ResultadoEnvioReporte(
                cliente_id=cliente.id, cliente_nombre=cliente.nombre,
                enviado=False, error="El cliente no tiene email registrado",
            ))
            continue

        # Calcular IVA (reutiliza la misma lógica del dashboard)
        archivos = db.query(models.ArchivoAfip).filter(
            models.ArchivoAfip.cliente_id == cliente.id
        ).all()

        rutas_e = [(a.ruta_archivo, a.periodo) for a in archivos if a.tipo == "emitidos"]
        rutas_r = [(a.ruta_archivo, a.periodo) for a in archivos if a.tipo == "recibidos"]

        datos_e = iva_service.agregar_iva(rutas_e)
        datos_r = iva_service.agregar_iva(rutas_r)

        if data.periodo:
            use_e = datos_e["por_periodo"].get(data.periodo, iva_service.vacio_iva())
            use_r = datos_r["por_periodo"].get(data.periodo, iva_service.vacio_iva())
            periodo_label = data.periodo
        else:
            use_e = datos_e
            use_r = datos_r
            # Determinar rango de períodos para el label
            todos_p = sorted(set(datos_e["por_periodo"]) | set(datos_r["por_periodo"]))
            periodo_label = (f"{todos_p[0]} / {todos_p[-1]}" if len(todos_p) > 1
                            else (todos_p[0] if todos_p else "Todos los períodos"))

        iva_ventas  = round(use_e.get("total_iva", 0), 2)
        iva_compras = round(use_r.get("total_iva", 0), 2)
        saldo = round(iva_ventas - iva_compras, 2)
        detalle_ventas  = {k: round(use_e.get(k, 0.0), 2) for k in ["iva_21","iva_105","iva_27","iva_5","iva_25"]}
        detalle_compras = {k: round(use_r.get(k, 0.0), 2) for k in ["iva_21","iva_105","iva_27","iva_5","iva_25"]}

        try:
            enviar_reporte_iva(
                from_email=from_email,
                to_email=cliente.email,
                cliente_nombre=cliente.nombre,
                estudio_nombre=estudio.nombre,
                periodo_label=periodo_label,
                iva_ventas=iva_ventas,
                iva_compras=iva_compras,
                saldo=saldo,
                detalle_ventas=detalle_ventas,
                detalle_compras=detalle_compras,
                smtp_host=smtp_host,
                smtp_port=smtp_port,
                smtp_password=smtp_password,
            )
            resultados.append(schemas.ResultadoEnvioReporte(
                cliente_id=cliente.id, cliente_nombre=cliente.nombre, enviado=True,
            ))
        except Exception as e:
            resultados.append(schemas.ResultadoEnvioReporte(
                cliente_id=cliente.id, cliente_nombre=cliente.nombre,
                enviado=False, error=str(e)[:300],
            ))

    return resultados


def _verificar_acceso(current: models.Usuario, cliente_id: int, db: Session):
    estudio_id = _get_estudio_id(current)
    cliente = db.query(models.Cliente).filter(
        models.Cliente.id == cliente_id,
        models.Cliente.estudio_id == estudio_id,
    ).first()
    if not cliente:
        raise HTTPException(status_code=403, detail="Sin acceso a este cliente")
    if current.rol in ("admin",):
        return
    asignacion = db.query(models.ClienteContador).filter(
        models.ClienteContador.contador_id == current.id,
        models.ClienteContador.cliente_id == cliente_id,
    ).first()
    if not asignacion:
        raise HTTPException(status_code=403, detail="Sin acceso a este cliente")
