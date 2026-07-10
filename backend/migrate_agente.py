from database import engine
from sqlalchemy import text
conn = engine.connect()
try:
    conn.execute(text("ALTER TABLE estudios ADD COLUMN agente_hora VARCHAR(5) DEFAULT '02:00'"))
    conn.commit()
    print("OK agente_hora")
except Exception as e:
    print("SKIP:", e)
conn.close()
