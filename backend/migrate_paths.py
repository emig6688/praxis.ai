"""
Script de migración: actualiza ruta_archivo en archivos_afip
de paths Windows locales a paths Linux de Railway.
Ejecutar una sola vez con: railway run python migrate_paths.py
"""
import os, sys
from database import SessionLocal
import models

LOCAL_PREFIX = None  # se detecta automáticamente
RAILWAY_STORAGE = os.getenv("STORAGE_PATH", "./storage")

db = SessionLocal()
archivos = db.query(models.ArchivoAfip).all()
print(f"Total archivos en DB: {len(archivos)}")

actualizados = 0
for a in archivos:
    ruta = a.ruta_archivo
    if not ruta:
        continue

    # Detectar el prefijo del storage local (Windows o Linux)
    # Buscar "storage" en el path y tomar todo lo que viene después
    ruta_normalizada = ruta.replace("\\", "/")

    # Encontrar el índice de /storage/ en el path
    idx = ruta_normalizada.find("/storage/")
    if idx == -1:
        # Puede ser \storage\ en Windows
        idx = ruta_normalizada.find("storage/")
        if idx == -1:
            print(f"  SKIP (no encontré 'storage/'): {ruta}")
            continue
        sufijo = ruta_normalizada[idx + len("storage/"):]
    else:
        sufijo = ruta_normalizada[idx + len("/storage/"):]

    nueva_ruta = os.path.join(RAILWAY_STORAGE, sufijo).replace("\\", "/")

    if nueva_ruta != ruta:
        print(f"  {ruta}\n  → {nueva_ruta}")
        a.ruta_archivo = nueva_ruta
        actualizados += 1

db.commit()
db.close()
print(f"\nActualizados: {actualizados} de {len(archivos)}")
