from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone, timedelta

def _now_ar():
    """Hora actual en Argentina (UTC-3), sin info de timezone para compatibilidad con SQLite."""
    return datetime.now(timezone(timedelta(hours=-3))).replace(tzinfo=None)
import enum
from database import Base


class RolEnum(str, enum.Enum):
    superadmin = "superadmin"
    admin = "admin"        # admin de un estudio contable
    contador = "contador"
    cliente = "cliente"


class TipoArchivoEnum(str, enum.Enum):
    emitidos = "emitidos"
    recibidos = "recibidos"


class Estudio(Base):
    __tablename__ = "estudios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False)
    # Config correo saliente (configura cada admin, no el superadmin)
    email_institucional = Column(String(150), nullable=True)   # remitente / smtp_user
    smtp_host           = Column(String(100), nullable=True)   # ej: smtp.gmail.com
    smtp_port           = Column(Integer, default=587)
    smtp_password_enc   = Column(Text, nullable=True)          # contraseña cifrada con Fernet
    # Config agente nocturno
    agente_activo    = Column(Boolean, default=False)
    agente_hora      = Column(String(5), default="02:00")
    agente_mail_dias = Column(String(20), default="5,10,20,25")
    activo = Column(Boolean, default=True)
    creado_en = Column(DateTime, default=datetime.utcnow)

    usuarios = relationship("Usuario", back_populates="estudio")
    clientes = relationship("Cliente", back_populates="estudio")
    agente_logs = relationship("AgenteLog", back_populates="estudio", order_by="AgenteLog.ejecutado_en.desc()")


class AgenteLog(Base):
    __tablename__ = "agente_logs"

    id = Column(Integer, primary_key=True, index=True)
    estudio_id = Column(Integer, ForeignKey("estudios.id"), nullable=False)
    ejecutado_en = Column(DateTime, default=_now_ar)
    periodo = Column(String(7), nullable=False)         # YYYY-MM
    clientes_procesados = Column(Integer, default=0)
    reportes_enviados = Column(Integer, default=0)
    errores = Column(Integer, default=0)
    detalle = Column(Text, nullable=True)               # JSON con resultado por cliente

    estudio = relationship("Estudio", back_populates="agente_logs")


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    password_visible = Column(String(255), nullable=True)
    rol = Column(Enum(RolEnum), nullable=False)
    estudio_id = Column(Integer, ForeignKey("estudios.id"), nullable=True)  # null para superadmin
    activo = Column(Boolean, default=True)
    creado_en = Column(DateTime, default=datetime.utcnow)

    estudio = relationship("Estudio", back_populates="usuarios")
    clientes_asignados = relationship("ClienteContador", back_populates="contador")
    descargas_realizadas = relationship("ArchivoAfip", back_populates="descargado_por_usuario")


class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)
    estudio_id = Column(Integer, ForeignKey("estudios.id"), nullable=False)
    nombre = Column(String(150), nullable=False)
    cuit = Column(String(13), nullable=False)
    email = Column(String(150), nullable=True)
    afip_cuit = Column(String(13), nullable=False)
    afip_password_enc = Column(Text, nullable=False)
    representado = Column(String(150), nullable=True)   # nombre del representado en AFIP (si difiere del cliente)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    activo = Column(Boolean, default=True)
    creado_en = Column(DateTime, default=datetime.utcnow)

    estudio = relationship("Estudio", back_populates="clientes")
    usuario = relationship("Usuario", foreign_keys=[usuario_id])
    contadores = relationship("ClienteContador", back_populates="cliente")
    archivos = relationship("ArchivoAfip", back_populates="cliente")


class ClienteContador(Base):
    __tablename__ = "cliente_contador"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    contador_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    asignado_en = Column(DateTime, default=datetime.utcnow)

    cliente = relationship("Cliente", back_populates="contadores")
    contador = relationship("Usuario", back_populates="clientes_asignados")


class ArchivoAfip(Base):
    __tablename__ = "archivos_afip"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    descargado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    tipo = Column(Enum(TipoArchivoEnum), nullable=False)
    periodo = Column(String(7), nullable=False)
    nombre_archivo = Column(String(255), nullable=False)
    ruta_archivo = Column(String(500), nullable=False)
    tamanio_bytes = Column(Integer, nullable=True)
    descargado_en = Column(DateTime, default=_now_ar)

    cliente = relationship("Cliente", back_populates="archivos")
    descargado_por_usuario = relationship("Usuario", back_populates="descargas_realizadas")
