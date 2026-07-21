import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def _ar(n: float) -> str:
    """Formatea un número como moneda argentina."""
    return f"$ {n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _build_html(
    cliente_nombre: str,
    estudio_nombre: str,
    periodo_label: str,
    iva_ventas: float,
    iva_compras: float,
    saldo: float,
    detalle_ventas: dict,
    detalle_compras: dict,
) -> str:
    estado_color = "#DC2626" if saldo > 0 else ("#059669" if saldo < 0 else "#6B7280")
    estado_texto = "A PAGAR A AFIP" if saldo > 0 else ("SALDO A FAVOR" if saldo < 0 else "SIN MOVIMIENTOS")
    estado_emoji = "⚠️" if saldo > 0 else ("✅" if saldo < 0 else "➖")

    alicuotas = [
        ("21%",   "iva_21"),
        ("10,5%", "iva_105"),
        ("27%",   "iva_27"),
        ("5%",    "iva_5"),
        ("2,5%",  "iva_25"),
    ]

    def fila_alicuota(label: str, key: str, datos: dict) -> str:
        v = datos.get(key, 0)
        if not v:
            return ""
        return f"""
        <tr>
          <td style="padding:6px 12px;color:#6B7280;font-size:13px;">IVA {label}</td>
          <td style="padding:6px 12px;text-align:right;font-family:monospace;font-size:13px;color:#374151;">{_ar(v)}</td>
        </tr>"""

    filas_ventas  = "".join(fila_alicuota(l, k, detalle_ventas)  for l, k in alicuotas)
    filas_compras = "".join(fila_alicuota(l, k, detalle_compras) for l, k in alicuotas)

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte IVA – {periodo_label}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif;">

  <!-- Header -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1D3070 0%,#2563EB 100%);">
    <tr>
      <td style="padding:36px 40px;">
        <p style="margin:0;color:rgba(255,255,255,0.7);font-size:12px;letter-spacing:2px;text-transform:uppercase;">
          {estudio_nombre}
        </p>
        <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:26px;font-weight:700;">
          Reporte de Posición IVA
        </h1>
        <p style="margin:6px 0 0;color:#93C5FD;font-size:14px;">
          Período: <strong>{periodo_label}</strong>
        </p>
      </td>
    </tr>
  </table>

  <!-- Body -->
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:32px 40px;">

        <!-- Saludo -->
        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px;">
          Estimado/a <strong>{cliente_nombre}</strong>,
        </p>
        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 28px;">
          Le informamos su posición fiscal estimada de IVA correspondiente al período
          <strong>{periodo_label}</strong>, en base a los comprobantes procesados a la fecha.
        </p>

        <!-- Saldo destacado -->
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background:#FFFFFF;border-radius:12px;border-left:6px solid {estado_color};
                 box-shadow:0 2px 8px rgba(0,0,0,0.06);margin-bottom:28px;">
          <tr>
            <td style="padding:24px 28px;">
              <p style="margin:0;font-size:12px;color:#6B7280;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">
                Saldo Estimado
              </p>
              <p style="margin:8px 0 4px;font-size:32px;font-weight:700;color:{estado_color};">
                {_ar(abs(saldo))}
              </p>
              <p style="margin:0;font-size:14px;font-weight:700;color:{estado_color};">
                {estado_emoji} {estado_texto}
              </p>
            </td>
          </tr>
        </table>

        <!-- Detalle -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <!-- Ventas -->
            <td width="48%" valign="top">
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#EFF6FF;border-radius:10px;overflow:hidden;">
                <tr>
                  <td colspan="2" style="padding:12px 16px;background:#DBEAFE;">
                    <p style="margin:0;font-size:12px;font-weight:700;color:#1D4ED8;
                               letter-spacing:1px;text-transform:uppercase;">
                      Débito Fiscal — Ventas
                    </p>
                  </td>
                </tr>
                {filas_ventas if filas_ventas else '<tr><td colspan="2" style="padding:12px;color:#9CA3AF;font-size:13px;text-align:center;">Sin datos</td></tr>'}
                <tr style="border-top:1px solid #BFDBFE;">
                  <td style="padding:10px 12px;font-weight:700;font-size:13px;color:#1D4ED8;">Total IVA Ventas</td>
                  <td style="padding:10px 12px;text-align:right;font-weight:700;font-family:monospace;color:#1D4ED8;">{_ar(iva_ventas)}</td>
                </tr>
              </table>
            </td>

            <td width="4%"></td>

            <!-- Compras -->
            <td width="48%" valign="top">
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#F0FDF4;border-radius:10px;overflow:hidden;">
                <tr>
                  <td colspan="2" style="padding:12px 16px;background:#DCFCE7;">
                    <p style="margin:0;font-size:12px;font-weight:700;color:#15803D;
                               letter-spacing:1px;text-transform:uppercase;">
                      Crédito Fiscal — Compras
                    </p>
                  </td>
                </tr>
                {filas_compras if filas_compras else '<tr><td colspan="2" style="padding:12px;color:#9CA3AF;font-size:13px;text-align:center;">Sin datos</td></tr>'}
                <tr style="border-top:1px solid #BBF7D0;">
                  <td style="padding:10px 12px;font-weight:700;font-size:13px;color:#15803D;">Total IVA Compras</td>
                  <td style="padding:10px 12px;text-align:right;font-weight:700;font-family:monospace;color:#15803D;">{_ar(iva_compras)}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Nota -->
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background:#FFFBEB;border-radius:8px;border:1px solid #FDE68A;margin-bottom:28px;">
          <tr>
            <td style="padding:14px 18px;">
              <p style="margin:0;font-size:13px;color:#92400E;line-height:1.5;">
                <strong>Nota importante:</strong> Los valores informados son estimados y están sujetos
                a la información disponible en AFIP a la fecha de este reporte. Le recomendamos
                confirmar con su contador ante cualquier consulta.
              </p>
            </td>
          </tr>
        </table>

        <!-- Cierre -->
        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 8px;">
          Ante cualquier consulta, no dude en comunicarse con nuestro estudio.
        </p>
        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 32px;">
          Saludos cordiales,<br>
          <strong>{estudio_nombre}</strong>
        </p>

      </td>
    </tr>
  </table>

  <!-- Footer -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1E293B;">
    <tr>
      <td style="padding:20px 40px;text-align:center;">
        <p style="margin:0;color:#94A3B8;font-size:12px;">
          Este reporte fue generado automáticamente por <strong style="color:#60A5FA;">ContAI</strong>
          · {estudio_nombre}
        </p>
        <p style="margin:6px 0 0;color:#475569;font-size:11px;">
          Por favor no responda a este correo si es de carácter automático.
        </p>
      </td>
    </tr>
  </table>

</body>
</html>"""


def _send_resend(
    to_addr: str,
    subject: str,
    html: str,
    plain: str,
    from_label: str,
    attachments: list | None = None,
) -> None:
    """Envía usando la API de Resend (no usa SMTP — funciona en Railway)."""
    import resend
    resend.api_key = os.getenv("RESEND_API_KEY", "")
    from_email = os.getenv("RESEND_FROM_EMAIL", "Praxis AI <onboarding@resend.dev>")
    params: dict = {
        "from": f"{from_label} <{from_email}>" if "<" not in from_email else from_email,
        "to": [to_addr],
        "subject": subject,
        "html": html,
        "text": plain,
    }
    if attachments:
        params["attachments"] = attachments
    resend.Emails.send(params)


def _send(
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_password: str,
    from_addr: str,
    to_addr: str,
    msg: MIMEMultipart,
) -> None:
    """Envía el mensaje por SMTP con STARTTLS (usado en desarrollo local)."""
    with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
        server.ehlo()
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(from_addr, to_addr, msg.as_string())


def enviar_reporte_iva(
    *,
    from_email: str,
    to_email: str,
    cliente_nombre: str,
    estudio_nombre: str,
    periodo_label: str,
    iva_ventas: float,
    iva_compras: float,
    saldo: float,
    detalle_ventas: dict,
    detalle_compras: dict,
    smtp_host: str,
    smtp_port: int,
    smtp_password: str,
) -> None:
    """Envía el reporte de IVA por email."""
    if not from_email:
        raise ValueError("El estudio no tiene email institucional configurado")

    html = _build_html(
        cliente_nombre=cliente_nombre,
        estudio_nombre=estudio_nombre,
        periodo_label=periodo_label,
        iva_ventas=iva_ventas,
        iva_compras=iva_compras,
        saldo=saldo,
        detalle_ventas=detalle_ventas,
        detalle_compras=detalle_compras,
    )
    subject = f"Reporte IVA – {periodo_label} | {estudio_nombre}"
    plain = (
        f"Estimado/a {cliente_nombre},\n\n"
        f"Su posición IVA estimada para {periodo_label}:\n"
        f"  IVA Ventas (Débito): {_ar(iva_ventas)}\n"
        f"  IVA Compras (Crédito): {_ar(iva_compras)}\n"
        f"  Saldo: {_ar(saldo)}\n\n"
        f"Saludos cordiales,\n{estudio_nombre}"
    )

    if os.getenv("RESEND_API_KEY"):
        _send_resend(to_email, subject, html, plain, estudio_nombre)
    else:
        if not smtp_password:
            raise ValueError("El estudio no tiene contraseña SMTP configurada")
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"{estudio_nombre} <{from_email}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(plain, "plain", "utf-8"))
        msg.attach(MIMEText(html, "html", "utf-8"))
        _send(smtp_host, smtp_port, from_email, smtp_password, from_email, to_email, msg)


def enviar_email_generico(
    *,
    from_email: str,
    to_email: str,
    subject: str,
    html: str,
    plain: str,
    estudio_nombre: str,
    smtp_host: str,
    smtp_port: int,
    smtp_password: str,
) -> None:
    """Envía un email genérico (resumen al admin)."""
    if os.getenv("RESEND_API_KEY"):
        _send_resend(to_email, subject, html, plain, estudio_nombre)
    else:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"{estudio_nombre} <{from_email}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(plain, "plain", "utf-8"))
        msg.attach(MIMEText(html, "html", "utf-8"))
        _send(smtp_host, smtp_port, from_email, smtp_password, from_email, to_email, msg)


def enviar_email_con_adjunto(
    *,
    from_email: str,
    to_email: str,
    subject: str,
    html: str,
    plain: str,
    estudio_nombre: str,
    smtp_host: str,
    smtp_port: int,
    smtp_password: str,
    adjunto_bytes: bytes,
    adjunto_nombre: str,
) -> None:
    """Envía un email con adjunto binario (backups)."""
    if os.getenv("RESEND_API_KEY"):
        import base64
        _send_resend(
            to_email, subject, html, plain, estudio_nombre,
            attachments=[{
                "filename": adjunto_nombre,
                "content": list(adjunto_bytes),
            }],
        )
    else:
        from email.mime.base import MIMEBase
        from email import encoders as enc
        msg = MIMEMultipart("mixed")
        msg["Subject"] = subject
        msg["From"]    = f"{estudio_nombre} <{from_email}>"
        msg["To"]      = to_email
        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(plain, "plain", "utf-8"))
        alt.attach(MIMEText(html, "html", "utf-8"))
        msg.attach(alt)
        part = MIMEBase("application", "zip")
        part.set_payload(adjunto_bytes)
        enc.encode_base64(part)
        part.add_header("Content-Disposition", "attachment", filename=adjunto_nombre)
        msg.attach(part)
        _send(smtp_host, smtp_port, from_email, smtp_password, from_email, to_email, msg)
