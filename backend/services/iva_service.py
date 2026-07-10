"""
Servicio de cálculo de IVA a partir de archivos xlsx descargados de AFIP.
Fuente única de verdad — usar desde contador_router y agente_service.
"""
import os

CAMPOS_IVA = [
    ("total_iva", "Total IVA"),
    ("iva_21",    "IVA 21%"),
    ("iva_105",   "IVA 10,5%"),
    ("iva_27",    "IVA 27%"),
    ("iva_5",     "IVA 5%"),
    ("iva_25",    "IVA 2,5%"),
    ("imp_total", "Imp. Total"),
]

DETALLE_KEYS = ["iva_21", "iva_105", "iva_27", "iva_5", "iva_25"]

# ── Caché en memoria ──────────────────────────────────────────────────────────
# Clave: frozenset de (ruta, mtime_int) → resultado de agregar_iva
_CACHE: dict = {}


def vacio_iva() -> dict:
    return {k: 0.0 for k, _ in CAMPOS_IVA}


def invalidar_cache() -> None:
    """Limpia toda la caché. Llamar cuando se guardan archivos nuevos."""
    _CACHE.clear()


def _safe_float(v) -> float:
    if v is None:
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _fecha_a_periodo(v) -> str:
    """Convierte un valor de celda de fecha AFIP a 'YYYY-MM'. Retorna '' si no parsea."""
    if v is None:
        return ""
    if hasattr(v, "year") and hasattr(v, "month"):
        return f"{v.year}-{int(v.month):02d}"
    s = str(v).strip()
    if "/" in s:
        parts = s.split("/")
        if len(parts) == 3:
            try:
                return f"{parts[2].strip()}-{int(parts[1]):02d}"
            except (ValueError, IndexError):
                return ""
    if "-" in s and len(s) >= 7:
        return s[:7]
    return ""


def normalizar_periodo(periodo: str) -> str:
    """Extrae YYYY-MM de strings como '2026-06-01' o '2026-06-01/2026-06-30'."""
    return periodo.split("/")[0][:7]


def _cache_key(archivos_list: list):
    parts = []
    for ruta, _ in archivos_list:
        if ruta and os.path.exists(ruta):
            parts.append((ruta, int(os.path.getmtime(ruta))))
    return frozenset(parts)


def agregar_iva(archivos_list: list) -> dict:
    """
    Recibe lista de (ruta_archivo, periodo_almacenado).
    Devuelve dict con totales + 'por_periodo': {YYYY-MM: {total_iva, iva_21, ...}}.
    Deduplica filas idénticas entre archivos y usa caché por mtime.
    """
    if not archivos_list:
        return {**vacio_iva(), "por_periodo": {}}

    key = _cache_key(archivos_list)
    if key in _CACHE:
        return _CACHE[key]

    result = _calcular(archivos_list)
    _CACHE[key] = result
    # Evitar crecimiento ilimitado
    if len(_CACHE) > 500:
        _CACHE.clear()
        _CACHE[key] = result
    return result


def slice_periodo(datos: dict, periodo: str | None) -> dict:
    """
    Si periodo está definido, devuelve sólo ese slice de por_periodo.
    Si no, devuelve los totales generales.
    """
    if periodo:
        return datos["por_periodo"].get(periodo, vacio_iva())
    return datos


def _calcular(archivos_list: list) -> dict:
    import openpyxl

    seen: set = set()
    totales = vacio_iva()
    por_periodo: dict = {}

    for ruta, periodo_almacenado in archivos_list:
        if not ruta or not os.path.exists(ruta):
            continue
        try:
            wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
            ws = wb.active
            rows = list(ws.iter_rows(values_only=True))
            wb.close()
        except Exception:
            continue

        if len(rows) < 2:
            continue

        headers = [str(h).strip() if h is not None else "" for h in rows[0]]

        def find_col(search: str):
            for i, h in enumerate(headers):
                if search.lower() in h.lower():
                    return i
            return None

        fecha_idx = find_col("Fecha")
        col_idx = {k: find_col(label) for k, label in CAMPOS_IVA}

        for row in rows[1:]:
            row_key = tuple(str(c) if c is not None else "" for c in row)
            if row_key in seen:
                continue
            seen.add(row_key)

            p = ""
            if fecha_idx is not None and fecha_idx < len(row):
                p = _fecha_a_periodo(row[fecha_idx])
            if not p:
                p = normalizar_periodo(periodo_almacenado)

            if p and p not in por_periodo:
                por_periodo[p] = vacio_iva()

            for k, _ in CAMPOS_IVA:
                idx = col_idx.get(k)
                if idx is not None and idx < len(row):
                    val = _safe_float(row[idx])
                    totales[k] = round(totales[k] + val, 2)
                    if p:
                        por_periodo[p][k] = round(por_periodo[p][k] + val, 2)

    return {**totales, "por_periodo": por_periodo}
