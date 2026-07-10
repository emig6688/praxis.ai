from database import engine
from sqlalchemy import text
conn = engine.connect()
try:
    conn.execute(text("ALTER TABLE estudios ADD COLUMN agente_mail_dias VARCHAR(20) DEFAULT '5,15,25'"))
    conn.commit()
    print("OK agente_mail_dias")
except Exception as e:
    print("SKIP:", e)
conn.close()
