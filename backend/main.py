import asyncio
import sys

# Playwright en Windows requiere ProactorEventLoop para crear subprocesos
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from dotenv import load_dotenv

from database import engine, Base
import models  # noqa
from routers import auth_router, admin_router, contador_router, superadmin_router, agente_router
from auth import hash_password
from database import SessionLocal
import scheduler as sched

load_dotenv()

app = FastAPI(title="Plataforma Contable", version="2.0.0")

# En producción el frontend se sirve desde el mismo servidor, no se necesita CORS.
# En desarrollo se agregan los orígenes locales.
_extra_origins = os.getenv("CORS_ORIGINS", "").split(",")
_allowed_origins = [o.strip() for o in _extra_origins if o.strip()] or [
    "http://localhost:5173",
    "http://localhost:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(superadmin_router.router)
app.include_router(admin_router.router)
app.include_router(contador_router.router)
app.include_router(agente_router.router)

STORAGE_PATH = os.getenv("STORAGE_PATH", "./storage")
os.makedirs(STORAGE_PATH, exist_ok=True)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    _crear_superadmin()
    sched.start()


def _crear_superadmin():
    db = SessionLocal()
    try:
        superadmin = db.query(models.Usuario).filter(models.Usuario.rol == "superadmin").first()
        if not superadmin:
            superadmin = models.Usuario(
                nombre="Emiliano Giraudo",
                email="licgiraudoeg@gmail.com",
                password_hash=hash_password("masca123"),
                rol="superadmin",
                estudio_id=None,
            )
            db.add(superadmin)
            db.commit()
            print("OK Superadmin creado: licgiraudoeg@gmail.com / masca123")
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


# ── Endpoint temporal de migración de DB (se elimina después del primer uso) ──
from fastapi import UploadFile, File, Header
import shutil

@app.post("/api/_migrate/upload-db")
async def upload_db(
    file: UploadFile = File(...),
    x_migrate_token: str = Header(...),
):
    secret = os.getenv("SECRET_KEY", "")
    if not secret or x_migrate_token != secret:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    db_url = os.getenv("DATABASE_URL", "sqlite:///./contable.db")
    db_path = db_url.replace("sqlite:///", "")
    if not os.path.isabs(db_path):
        db_path = os.path.abspath(db_path)
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    with open(db_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    size = os.path.getsize(db_path)
    return {"ok": True, "path": db_path, "bytes": size}


# ── Servir frontend React en producción ───────────────────────────────────────
# Solo si existe la carpeta static/ (generada por el build de Vite)
_static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(_static_dir, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        file_path = os.path.join(_static_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(_static_dir, "index.html"))
