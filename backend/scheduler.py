"""
Configura y arranca APScheduler con jobs dinámicos por estudio.
Cada estudio con agente_activo=True tiene su propio cron job a la hora configurada.
"""
import asyncio
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = BackgroundScheduler(timezone="America/Argentina/Buenos_Aires")


def _run_estudio(estudio_id: int):
    """Wrapper sincrónico que lanza el coroutine del agente."""
    from services.agente_service import ejecutar_agente_estudio
    print(f"[SCHEDULER] Disparando agente para estudio_id={estudio_id}")
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(ejecutar_agente_estudio(estudio_id))
    finally:
        loop.close()


def recargar_jobs():
    """
    Lee la DB y sincroniza los jobs del scheduler.
    Llamar al iniciar y cada vez que se modifica la config del agente.
    """
    from database import SessionLocal
    import models

    db = SessionLocal()
    try:
        estudios = db.query(models.Estudio).filter(models.Estudio.activo == True).all()
        jobs_actuales = {j.id for j in scheduler.get_jobs()}

        for estudio in estudios:
            job_id = f"agente_estudio_{estudio.id}"
            if estudio.agente_activo:
                hora = estudio.agente_hora or "02:00"
                partes = hora.split(":")
                h, m = int(partes[0]), int(partes[1]) if len(partes) > 1 else 0

                if job_id in jobs_actuales:
                    scheduler.reschedule_job(
                        job_id,
                        trigger=CronTrigger(hour=h, minute=m),
                    )
                else:
                    scheduler.add_job(
                        _run_estudio,
                        trigger=CronTrigger(hour=h, minute=m),
                        id=job_id,
                        name=f"Agente {estudio.nombre}",
                        args=[estudio.id],
                        replace_existing=True,
                        misfire_grace_time=3600,
                    )
                print(f"[SCHEDULER] Job registrado: {estudio.nombre} a las {hora}")
            else:
                if job_id in jobs_actuales:
                    scheduler.remove_job(job_id)
                    print(f"[SCHEDULER] Job removido: {estudio.nombre}")
    finally:
        db.close()


def _run_backup_semanal():
    from services.backup_service import ejecutar_backup_todos
    ejecutar_backup_todos()


def start():
    recargar_jobs()

    # Backup semanal: todos los domingos a las 03:00 AR
    backup_job_id = "backup_semanal"
    if not scheduler.get_job(backup_job_id):
        scheduler.add_job(
            _run_backup_semanal,
            trigger=CronTrigger(day_of_week="sun", hour=3, minute=0),
            id=backup_job_id,
            name="Backup semanal DB",
            replace_existing=True,
            misfire_grace_time=3600,
        )
        print("[SCHEDULER] Job backup semanal registrado (domingos 03:00 AR)")

    if not scheduler.running:
        scheduler.start()
        print("[SCHEDULER] APScheduler iniciado")
