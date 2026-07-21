"""
Backup semanal de la base de datos SQLite.
Genera un ZIP con la DB y lo envía al email institucional de cada estudio.
Metadata de último backup guardada en {STORAGE_PATH}/backups/meta_{estudio_id}.json
"""
import os
import json
import shutil
import zipfile
import tempfile
from datetime import datetime, timezone, timedelta

AR_TZ = timezone(timedelta(hours=-3))


def _now_ar() -> datetime:
    return datetime.now(AR_TZ).replace(tzinfo=None)


def _meta_path(estudio_id: int) -> str:
    storage = os.getenv("STORAGE_PATH", "./storage")
    backup_dir = os.path.join(storage, "backups")
    os.makedirs(backup_dir, exist_ok=True)
    return os.path.join(backup_dir, f"meta_{estudio_id}.json")


def leer_ultimo_backup(estudio_id: int) -> dict | None:
    try:
        with open(_meta_path(estudio_id)) as f:
            return json.load(f)
    except Exception:
        return None


def _guardar_meta(estudio_id: int, info: dict):
    with open(_meta_path(estudio_id), "w") as f:
        json.dump(info, f)


BACKUP_TO_EMAIL = os.getenv("BACKUP_TO_EMAIL", "licgiraudoeg@gmail.com")


def ejecutar_backup_estudio(estudio) -> bool:
    """
    Recibe un objeto Estudio SQLAlchemy.
    Crea un ZIP con la DB SQLite y lo envía a BACKUP_TO_EMAIL (o email_institucional).
    """
    from services.email_service import enviar_email_con_adjunto

    if not estudio.email_institucional:
        print(f"[BACKUP] Estudio {estudio.id} sin email institucional, omitiendo.")
        return False

    db_url = os.getenv("DATABASE_URL", "sqlite:///./contable.db")
    if not db_url.startswith("sqlite"):
        print("[BACKUP] Solo SQLite soportado.")
        return False

    db_path = db_url.replace("sqlite:///", "")
    if not os.path.isabs(db_path):
        db_path = os.path.abspath(db_path)

    if not os.path.exists(db_path):
        print(f"[BACKUP] DB no encontrada: {db_path}")
        return False

    ahora = _now_ar()
    fecha_str = ahora.strftime("%Y%m%d_%H%M")
    nombre_zip = f"backup_{estudio.nombre.replace(' ', '_')}_{fecha_str}.zip"

    # Crear ZIP con copia de la DB (copy2 captura el archivo sin bloquear SQLite)
    with tempfile.TemporaryDirectory() as tmpdir:
        db_copy = os.path.join(tmpdir, "contable.db")
        shutil.copy2(db_path, db_copy)
        zip_path = os.path.join(tmpdir, nombre_zip)
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(db_copy, "contable.db")
        with open(zip_path, "rb") as f:
            zip_bytes = f.read()

    smtp_password = ""
    if not os.getenv("RESEND_API_KEY"):
        from services.crypto_service import decrypt
        if not estudio.smtp_password_enc:
            print(f"[BACKUP] Estudio {estudio.id} sin SMTP configurado, omitiendo.")
            return False
        try:
            smtp_password = decrypt(estudio.smtp_password_enc)
        except Exception as e:
            print(f"[BACKUP] Error descifrando password estudio {estudio.id}: {e}")
            return False

    destino = BACKUP_TO_EMAIL
    fecha_display = ahora.strftime("%d/%m/%Y a las %H:%M")
    try:
        enviar_email_con_adjunto(
            from_email=estudio.email_institucional,
            to_email=destino,
            subject=f"[Praxis AI] Backup semanal — {ahora.strftime('%d/%m/%Y')} — {estudio.nombre}",
            html=f"""
                <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;">
                  <h2 style="color:#1D3070;">Backup semanal</h2>
                  <p>Se adjunta el backup de la base de datos de <strong>{estudio.nombre}</strong>
                     generado el <strong>{fecha_display} (hora Argentina)</strong>.</p>
                  <p>Guardá este archivo en un lugar seguro. Contiene toda la información del estudio:
                     clientes, archivos descargados, historial del agente y configuración.</p>
                  <p style="color:#6B7280;font-size:13px;">Este backup fue enviado automáticamente
                     por <strong>Praxis AI</strong>.</p>
                </div>
            """,
            plain=(
                f"Backup semanal de {estudio.nombre} — {fecha_display}\n\n"
                "Se adjunta el archivo contable.db.zip con toda la información del estudio.\n"
                "Guardalo en un lugar seguro."
            ),
            estudio_nombre=estudio.nombre,
            smtp_host=estudio.smtp_host or "smtp.gmail.com",
            smtp_port=estudio.smtp_port or 587,
            smtp_password=smtp_password,
            adjunto_bytes=zip_bytes,
            adjunto_nombre=nombre_zip,
        )
    except Exception as e:
        print(f"[BACKUP] Error enviando email estudio {estudio.id}: {e}")
        return False

    meta = {
        "fecha": ahora.isoformat(),
        "fecha_display": fecha_display,
        "enviado_a": destino,
        "tamano_bytes": len(zip_bytes),
    }
    _guardar_meta(estudio.id, meta)
    print(f"[BACKUP] OK {estudio.nombre} → {destino}")
    return True


def ejecutar_backup_todos():
    """Ejecuta el backup para todos los estudios activos con SMTP configurado."""
    from database import SessionLocal
    import models

    print("[BACKUP] Iniciando backup semanal de todos los estudios...")
    db = SessionLocal()
    try:
        estudios = db.query(models.Estudio).filter(
            models.Estudio.activo == True,
            models.Estudio.email_institucional != None,
        ).all()
        for estudio in estudios:
            ejecutar_backup_estudio(estudio)
    finally:
        db.close()
    print("[BACKUP] Backup semanal finalizado.")
