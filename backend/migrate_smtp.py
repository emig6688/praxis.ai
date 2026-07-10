from database import engine
from sqlalchemy import text
conn = engine.connect()
for col, ddl in [
    ("smtp_host",         "VARCHAR(100)"),
    ("smtp_port",         "INTEGER DEFAULT 587"),
    ("smtp_password_enc", "TEXT"),
]:
    try:
        conn.execute(text(f"ALTER TABLE estudios ADD COLUMN {col} {ddl}"))
        conn.commit()
        print(f"OK {col}")
    except Exception as e:
        print(f"SKIP {col}:", e)
conn.close()
