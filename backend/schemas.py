from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from enum import Enum


class RolEnum(str, Enum):
    superadmin = "superadmin"
    admin = "admin"
    contador = "contador"
    cliente = "cliente"


class TipoArchivoEnum(str, Enum):
    emitidos = "emitidos"
    recibidos = "recibidos"


# Auth
class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    rol: str
    nombre: str
    id: int
    estudio_id: Optional[int] = None
    estudio_nombre: Optional[str] = None


# Estudio
class EstudioCreate(BaseModel):
    nombre: str
    email_institucional: Optional[str] = None
    admin_nombre: str
    admin_email: EmailStr
    admin_password: str


class EstudioUpdate(BaseModel):
    nombre: Optional[str] = None
    email_institucional: Optional[str] = None
    activo: Optional[bool] = None


class EstudioOut(BaseModel):
    id: int
    nombre: str
    email_institucional: Optional[str] = None
    activo: bool
    creado_en: datetime

    class Config:
        from_attributes = True


class EstudioConStats(EstudioOut):
    total_usuarios: int = 0
    total_clientes: int = 0
    admin_nombre: Optional[str] = None
    admin_email: Optional[str] = None
    admin_id: Optional[int] = None
    admin_password_visible: Optional[str] = None


class AdminUpdate(BaseModel):
    admin_nombre: str
    admin_email: EmailStr
    admin_password: Optional[str] = None


# Usuario
class UsuarioCreate(BaseModel):
    nombre: str
    email: EmailStr
    password: str
    rol: RolEnum


class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    activo: Optional[bool] = None


class UsuarioOut(BaseModel):
    id: int
    nombre: str
    email: str
    rol: RolEnum
    activo: bool
    estudio_id: Optional[int] = None
    creado_en: datetime

    class Config:
        from_attributes = True


# Cliente
class ClienteCreate(BaseModel):
    nombre: str
    cuit: str
    email: Optional[str] = None
    afip_cuit: str
    afip_password: str
    representado: Optional[str] = None   # si vacío, se usa el nombre del cliente
    contador_ids: Optional[List[int]] = []


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    email: Optional[str] = None
    afip_cuit: Optional[str] = None
    afip_password: Optional[str] = None
    representado: Optional[str] = None
    activo: Optional[bool] = None
    contador_ids: Optional[List[int]] = None


class ClienteOut(BaseModel):
    id: int
    nombre: str
    cuit: str
    email: Optional[str]
    afip_cuit: str
    representado: Optional[str]
    activo: bool
    creado_en: datetime

    class Config:
        from_attributes = True


class ClienteConContadores(ClienteOut):
    contadores: List[UsuarioOut] = []


# Archivo AFIP
class ArchivoAfipOut(BaseModel):
    id: int
    tipo: TipoArchivoEnum
    periodo: str
    nombre_archivo: str
    tamanio_bytes: Optional[int]
    descargado_en: datetime
    descargado_por_usuario: UsuarioOut


class ArchivoAfipConClienteOut(ArchivoAfipOut):
    cliente_id: int
    cliente_nombre: str
    cliente_cuit: str

    class Config:
        from_attributes = True

    class Config:
        from_attributes = True


# Descarga AFIP
class DescargaAfipRequest(BaseModel):
    cliente_id: int
    periodo_desde: str   # YYYY-MM
    periodo_hasta: str   # YYYY-MM
    tipos: List[TipoArchivoEnum]


class DescargaAfipMasivoRequest(BaseModel):
    periodo_desde: str
    periodo_hasta: str
    tipos: List[TipoArchivoEnum]
    cliente_ids: Optional[List[int]] = None  # si None → todos los clientes asignados


class DescargaAfipResponse(BaseModel):
    exitoso: bool
    archivos: List[ArchivoAfipOut] = []
    errores: List[str] = []


# Reportes IVA
class EnviarReporteRequest(BaseModel):
    periodo: Optional[str] = None   # YYYY-MM; None = todos los períodos
    cliente_ids: List[int]


class ResultadoEnvioReporte(BaseModel):
    cliente_id: int
    cliente_nombre: str
    enviado: bool
    error: Optional[str] = None
