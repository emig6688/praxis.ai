# ── Stage 1: Build del frontend ──────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ── Stage 2: Backend Python ───────────────────────────────────────────────────
FROM python:3.11-slim

# Dependencias del sistema para Playwright/Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libx11-6 libxcb1 libxext6 libxshmfence1 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir apscheduler pytz openpyxl

# Instalar Chromium para Playwright (deps ya instaladas arriba manualmente)
RUN playwright install chromium

# Copiar código backend
COPY backend/ .

# Copiar frontend compilado para servir como archivos estáticos
COPY --from=frontend-build /frontend/dist ./static

# Directorio de datos persistentes (montar como volumen en producción)
RUN mkdir -p /data/storage /data/backups

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
