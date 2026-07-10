# Plataforma Contable

## Estructura

```
contable-platform/
├── backend/      FastAPI + SQLite
└── frontend/     React + Vite + Tailwind
```

## Instalación y arranque local

### 1. Backend

```bash
cd backend

# Crear entorno virtual
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/Mac

# Instalar dependencias
pip install -r requirements.txt

# Instalar navegador para Playwright
playwright install chromium

# Generar claves de seguridad
python generar_clave.py
# Copiar FERNET_KEY y SECRET_KEY en .env

# Arrancar servidor
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Acceder en: http://localhost:5173

## Credenciales iniciales

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| admin@estudio.com | admin1234 | Administrador |

**Cambiar la contraseña del admin luego del primer login.**

## Flujo de uso

1. Admin carga contadores (Sección → Contadores)
2. Admin carga clientes con sus credenciales AFIP (Sección → Clientes)
3. Admin asigna contadores a cada cliente
4. Contador ingresa, ve sus clientes, selecciona período y descarga IVA de AFIP

## Notas AFIP

El servicio de automatización usa Playwright para navegar el portal de AFIP.
Si AFIP cambia su UI, editar `backend/services/afip_service.py`.
Los archivos se guardan en `backend/storage/`.
