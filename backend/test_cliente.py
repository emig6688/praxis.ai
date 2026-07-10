"""
Diagnóstico AFIP para un cliente específico.
Uso: python test_cliente.py <id_cliente>
     python test_cliente.py 2    ← KUNE
     python test_cliente.py 3    ← FACUNDO AGUAD
"""
import sys, asyncio
from database import SessionLocal
from models import Cliente
from services.crypto_service import decrypt
from services.afip_service import ejecutar_descarga
import tempfile, os

cliente_id = int(sys.argv[1]) if len(sys.argv) > 1 else 2

db = SessionLocal()
c = db.query(Cliente).filter(Cliente.id == cliente_id).first()
if not c:
    print(f"Cliente ID={cliente_id} no encontrado")
    sys.exit(1)

print(f"\n{'='*60}")
print(f"Cliente:      {c.nombre}")
print(f"CUIT:         {c.cuit}")
print(f"AFIP CUIT:    {c.afip_cuit}")
print(f"Representado: {c.representado}")
try:
    pwd = decrypt(c.afip_password_enc)
    print(f"Password:     {pwd[:2]}***{pwd[-1]} (len={len(pwd)})")
except Exception as e:
    print(f"Password:     ERROR DECRYPT: {e}")
    sys.exit(1)
print(f"{'='*60}\n")

tmp_dir = tempfile.mkdtemp()
print(f"Directorio temporal: {tmp_dir}")

async def main():
    resultados = await ejecutar_descarga(
        afip_cuit=c.afip_cuit,
        afip_password=pwd,
        cliente_cuit=c.cuit,
        representado=c.representado or c.nombre,
        periodo_desde="2026-06-01",
        periodo_hasta="2026-06-30",
        tipos=["emitidos", "recibidos"],
        storage_base=tmp_dir,
    )
    print("\n=== RESULTADOS ===")
    for tipo, (ruta, error) in resultados.items():
        if ruta:
            size = os.path.getsize(ruta) if os.path.exists(ruta) else 0
            print(f"  {tipo}: OK → {ruta} ({size} bytes)")
        else:
            print(f"  {tipo}: ERROR → {error}")

asyncio.run(main())
db.close()
