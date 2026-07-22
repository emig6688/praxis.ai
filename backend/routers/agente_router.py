"""
Endpoints para configurar y consultar el agente nocturno desde el panel admin.
"""
import json
import os
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from database import get_db
import models, auth
import scheduler as sched

router = APIRouter(prefix="/api/agente", tags=["agente"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class AgenteConfigIn(BaseModel):
    activo: bool
    hora: str = "02:00"
    mail_dias: List[int] = [5, 10, 20, 25]  # días del mes en que se envían mails a clientes


class AgenteConfigOut(BaseModel):
    activo: bool
    hora: str
    mail_dias: List[int]
    proximo_job: Optional[str] = None


class EmailConfigIn(BaseModel):
    email_institucional: str
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_password: str   # contraseña de aplicación (se cifra antes de guardar)


class EmailConfigOut(BaseModel):
    email_institucional: Optional[str]
    smtp_host: Optional[str]
    smtp_port: int
    tiene_password: bool  # nunca devolvemos la contraseña, solo si está configurada


class AgenteLogOut(BaseModel):
    id: int
    ejecutado_en: datetime
    periodo: str
    clientes_procesados: int
    reportes_enviados: int
    errores: int
    detalle: Optional[list] = None

    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_estudio(current: models.Usuario, db: Session) -> models.Estudio:
    if not current.estudio_id:
        raise HTTPException(status_code=400, detail="Sin estudio asignado")
    estudio = db.query(models.Estudio).filter(models.Estudio.id == current.estudio_id).first()
    if not estudio:
        raise HTTPException(status_code=404, detail="Estudio no encontrado")
    return estudio


def _parse_mail_dias(raw: Optional[str]) -> List[int]:
    if not raw:
        return [5, 10, 20, 25]
    try:
        dias = [int(d.strip()) for d in raw.split(",") if d.strip().isdigit()]
        return sorted(set(d for d in dias if 1 <= d <= 28))
    except Exception:
        return [5, 10, 20, 25]


def _proximo_job(estudio_id: int) -> Optional[str]:
    job_id = f"agente_estudio_{estudio_id}"
    job = sched.scheduler.get_job(job_id)
    if job and job.next_run_time:
        return job.next_run_time.strftime("%d/%m/%Y %H:%M")
    return None


# ── GET config ────────────────────────────────────────────────────────────────

@router.get("/config", response_model=AgenteConfigOut)
def get_config(
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    estudio = _get_estudio(current, db)
    mail_dias = _parse_mail_dias(estudio.agente_mail_dias)
    return AgenteConfigOut(
        activo=bool(estudio.agente_activo),
        hora=estudio.agente_hora or "02:00",
        mail_dias=mail_dias,
        proximo_job=_proximo_job(estudio.id),
    )


# ── PUT config ────────────────────────────────────────────────────────────────

@router.put("/config", response_model=AgenteConfigOut)
def set_config(
    data: AgenteConfigIn,
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    estudio = _get_estudio(current, db)

    # Validar formato HH:MM
    partes = data.hora.split(":")
    if len(partes) != 2 or not partes[0].isdigit() or not partes[1].isdigit():
        raise HTTPException(status_code=400, detail="Formato de hora inválido. Usar HH:MM")
    h, m = int(partes[0]), int(partes[1])
    if not (0 <= h <= 23 and 0 <= m <= 59):
        raise HTTPException(status_code=400, detail="Hora fuera de rango")

    if not estudio.email_institucional and data.activo:
        raise HTTPException(
            status_code=400,
            detail="El estudio no tiene email institucional configurado. Pedile al SuperAdmin que lo configure."
        )

    # Validar días del mes (1-28)
    dias_validos = sorted(set(d for d in data.mail_dias if 1 <= d <= 28))
    if not dias_validos:
        raise HTTPException(status_code=400, detail="Debe configurar al menos un día de envío de mails (1-28)")

    estudio.agente_activo = data.activo
    estudio.agente_hora = data.hora
    estudio.agente_mail_dias = ",".join(str(d) for d in dias_validos)
    db.commit()

    sched.recargar_jobs()

    return AgenteConfigOut(
        activo=bool(estudio.agente_activo),
        hora=estudio.agente_hora,
        mail_dias=dias_validos,
        proximo_job=_proximo_job(estudio.id),
    )


# ── GET email-config ──────────────────────────────────────────────────────────

@router.get("/email-config", response_model=EmailConfigOut)
def get_email_config(
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    estudio = _get_estudio(current, db)
    return EmailConfigOut(
        email_institucional=estudio.email_institucional,
        smtp_host=estudio.smtp_host or "smtp.gmail.com",
        smtp_port=estudio.smtp_port or 587,
        tiene_password=bool(estudio.smtp_password_enc),
    )


# ── PUT email-config ───────────────────────────────────────────────────────────

@router.put("/email-config", response_model=EmailConfigOut)
def set_email_config(
    data: EmailConfigIn,
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    from services.crypto_service import encrypt
    estudio = _get_estudio(current, db)

    if not data.email_institucional.strip():
        raise HTTPException(status_code=400, detail="El email institucional no puede estar vacío")
    if not data.smtp_password.strip():
        raise HTTPException(status_code=400, detail="La contraseña de aplicación no puede estar vacía")
    if not (1 <= data.smtp_port <= 65535):
        raise HTTPException(status_code=400, detail="Puerto SMTP inválido")

    estudio.email_institucional = data.email_institucional.strip()
    estudio.smtp_host           = data.smtp_host.strip() or "smtp.gmail.com"
    estudio.smtp_port           = data.smtp_port
    estudio.smtp_password_enc   = encrypt(data.smtp_password.strip())
    db.commit()

    return EmailConfigOut(
        email_institucional=estudio.email_institucional,
        smtp_host=estudio.smtp_host,
        smtp_port=estudio.smtp_port,
        tiene_password=True,
    )


# ── POST test-email ────────────────────────────────────────────────────────────

@router.post("/test-email")
def test_email(
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    """Envía un email de prueba al admin para verificar que las credenciales SMTP funcionan."""
    from services.crypto_service import decrypt
    from services.email_service import enviar_email_generico

    estudio = _get_estudio(current, db)
    if not estudio.email_institucional:
        raise HTTPException(status_code=400, detail="Configurá el correo saliente primero")

    smtp_password = ""
    if not os.getenv("RESEND_API_KEY"):
        if not estudio.smtp_password_enc:
            raise HTTPException(status_code=400, detail="Configurá la contraseña SMTP primero")
        try:
            smtp_password = decrypt(estudio.smtp_password_enc)
        except Exception:
            raise HTTPException(status_code=400, detail="Error al descifrar la contraseña guardada")

    try:
        enviar_email_generico(
            from_email=estudio.email_institucional,
            to_email=estudio.email_institucional,
            subject=f"[Praxis AI] Prueba de correo — {estudio.nombre}",
            html=f"<p>✅ El correo saliente de <strong>{estudio.nombre}</strong> está configurado correctamente.</p>",
            plain=f"El correo saliente de {estudio.nombre} está configurado correctamente.",
            estudio_nombre=estudio.nombre,
            smtp_host=estudio.smtp_host or "smtp.gmail.com",
            smtp_port=estudio.smtp_port or 587,
            smtp_password=smtp_password,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al enviar: {str(e)}")

    return {"mensaje": f"Email de prueba enviado a {estudio.email_institucional}"}


# ── GET historial ─────────────────────────────────────────────────────────────

@router.get("/historial", response_model=List[AgenteLogOut])
def get_historial(
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    estudio = _get_estudio(current, db)
    logs = (
        db.query(models.AgenteLog)
        .filter(models.AgenteLog.estudio_id == estudio.id)
        .order_by(models.AgenteLog.ejecutado_en.desc())
        .limit(30)
        .all()
    )
    result = []
    for log in logs:
        detalle = None
        if log.detalle:
            try:
                detalle = json.loads(log.detalle)
            except Exception:
                pass
        result.append(AgenteLogOut(
            id=log.id,
            ejecutado_en=log.ejecutado_en,
            periodo=log.periodo,
            clientes_procesados=log.clientes_procesados,
            reportes_enviados=log.reportes_enviados,
            errores=log.errores,
            detalle=detalle,
        ))
    return result


# ── POST ejecutar ahora (manual) ──────────────────────────────────────────────

@router.post("/ejecutar-ahora")
async def ejecutar_ahora(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    estudio = _get_estudio(current, db)

    if not estudio.email_institucional:
        raise HTTPException(
            status_code=400,
            detail="El estudio no tiene email institucional configurado."
        )

    from services.agente_service import ejecutar_agente_estudio

    async def _run():
        await ejecutar_agente_estudio(estudio.id)

    background_tasks.add_task(_run)
    return {"mensaje": "Agente iniciado en segundo plano. Revisá el historial en unos minutos."}


# ── GET último backup ─────────────────────────────────────────────────────────

@router.get("/backup")
def get_ultimo_backup(
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    from services.backup_service import leer_ultimo_backup
    estudio = _get_estudio(current, db)
    meta = leer_ultimo_backup(estudio.id)
    proximo = None
    job = sched.scheduler.get_job("backup_semanal")
    if job and job.next_run_time:
        proximo = job.next_run_time.strftime("%d/%m/%Y %H:%M")
    return {
        "ultimo": meta,        # None si nunca se hizo, o dict con fecha_display, enviado_a, tamano_bytes
        "proximo": proximo,
    }


# ── POST backup manual ────────────────────────────────────────────────────────

@router.post("/backup/ejecutar")
def ejecutar_backup_manual(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    from services.backup_service import ejecutar_backup_estudio
    estudio = _get_estudio(current, db)

    if not estudio.email_institucional or not estudio.smtp_password_enc:
        raise HTTPException(
            status_code=400,
            detail="Configurá el correo saliente antes de ejecutar el backup."
        )

    def _run():
        ejecutar_backup_estudio(estudio)

    background_tasks.add_task(_run)
    return {"mensaje": "Backup iniciado, revisar correo electrónico de Administrador."}
