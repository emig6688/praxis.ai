from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List
from database import get_db
import models, schemas, auth
from services.crypto_service import encrypt

router = APIRouter(prefix="/api/admin", tags=["admin"])


def get_estudio_id(current: models.Usuario) -> int:
    """Devuelve el estudio_id del usuario actual. Superadmin no puede usar estas rutas directamente."""
    if not current.estudio_id:
        raise HTTPException(status_code=400, detail="Esta ruta es solo para administradores de estudio")
    return current.estudio_id


# ── USUARIOS DEL ESTUDIO ────────────────────────────────────────────────────

@router.get("/usuarios", response_model=List[schemas.UsuarioOut])
def listar_usuarios(
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    estudio_id = get_estudio_id(current)
    return db.query(models.Usuario).filter(
        models.Usuario.estudio_id == estudio_id
    ).all()


@router.post("/usuarios", response_model=schemas.UsuarioOut)
def crear_usuario(
    data: schemas.UsuarioCreate,
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    estudio_id = get_estudio_id(current)

    if data.rol in ("superadmin", "admin"):
        raise HTTPException(status_code=400, detail="Solo podés crear contadores o clientes")

    existente = db.query(models.Usuario).filter(models.Usuario.email == data.email).first()
    if existente:
        raise HTTPException(status_code=400, detail="Email ya registrado")

    usuario = models.Usuario(
        nombre=data.nombre,
        email=data.email,
        password_hash=auth.hash_password(data.password),
        rol=data.rol,
        estudio_id=estudio_id,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


@router.put("/usuarios/{usuario_id}", response_model=schemas.UsuarioOut)
def actualizar_usuario(
    usuario_id: int,
    data: schemas.UsuarioUpdate,
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    estudio_id = get_estudio_id(current)
    usuario = db.query(models.Usuario).filter(
        models.Usuario.id == usuario_id,
        models.Usuario.estudio_id == estudio_id,
    ).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if data.nombre is not None:
        usuario.nombre = data.nombre
    if data.email is not None:
        conflicto = db.query(models.Usuario).filter(
            models.Usuario.email == data.email,
            models.Usuario.id != usuario_id,
        ).first()
        if conflicto:
            raise HTTPException(status_code=400, detail="El email ya está en uso por otro usuario")
        usuario.email = data.email
    if data.password is not None:
        usuario.password_hash = auth.hash_password(data.password)
        usuario.password_visible = data.password
    if data.activo is not None:
        usuario.activo = data.activo

    db.commit()
    db.refresh(usuario)
    return usuario


@router.delete("/usuarios/{usuario_id}")
def eliminar_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    estudio_id = get_estudio_id(current)
    if usuario_id == current.id:
        raise HTTPException(status_code=400, detail="No podés eliminarte a vos mismo")
    usuario = db.query(models.Usuario).filter(
        models.Usuario.id == usuario_id,
        models.Usuario.estudio_id == estudio_id,
    ).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    usuario.activo = False
    db.commit()
    return {"ok": True}


@router.get("/contadores", response_model=List[schemas.UsuarioOut])
def listar_contadores(
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    estudio_id = get_estudio_id(current)
    return db.query(models.Usuario).filter(
        models.Usuario.rol == "contador",
        models.Usuario.estudio_id == estudio_id,
        models.Usuario.activo == True,
    ).all()


# ── CLIENTES ─────────────────────────────────────────────────────────────────

@router.get("/clientes", response_model=List[schemas.ClienteConContadores])
def listar_clientes(
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    estudio_id = get_estudio_id(current)
    clientes = db.query(models.Cliente).filter(
        models.Cliente.estudio_id == estudio_id
    ).all()
    result = []
    for c in clientes:
        usuarios = [cc.contador for cc in c.contadores]
        out = schemas.ClienteConContadores(
            id=c.id,
            nombre=c.nombre,
            cuit=c.cuit,
            email=c.email,
            afip_cuit=c.afip_cuit,
            representado=c.representado,
            activo=c.activo,
            creado_en=c.creado_en,
            contadores=[
                schemas.UsuarioOut.model_validate(u, from_attributes=True)
                for u in usuarios
            ],
        )
        result.append(out)
    return result


@router.post("/clientes", response_model=schemas.ClienteOut)
def crear_cliente(
    data: schemas.ClienteCreate,
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    estudio_id = get_estudio_id(current)

    existente = db.query(models.Cliente).filter(
        models.Cliente.cuit == data.cuit,
        models.Cliente.estudio_id == estudio_id,
    ).first()
    if existente:
        raise HTTPException(status_code=400, detail="CUIT ya registrado en este estudio")

    cliente = models.Cliente(
        estudio_id=estudio_id,
        nombre=data.nombre,
        cuit=data.cuit,
        email=data.email or None,
        afip_cuit=data.afip_cuit,
        afip_password_enc=encrypt(data.afip_password),
        representado=data.representado or data.nombre,
    )
    db.add(cliente)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al guardar el cliente. Verificá los datos.")

    for contador_id in (data.contador_ids or []):
        contador = db.query(models.Usuario).filter(
            models.Usuario.id == contador_id,
            models.Usuario.rol == "contador",
            models.Usuario.estudio_id == estudio_id,
        ).first()
        if contador:
            db.add(models.ClienteContador(cliente_id=cliente.id, contador_id=contador_id))

    db.commit()
    db.refresh(cliente)
    return cliente


@router.put("/clientes/{cliente_id}", response_model=schemas.ClienteOut)
def actualizar_cliente(
    cliente_id: int,
    data: schemas.ClienteUpdate,
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    estudio_id = get_estudio_id(current)
    cliente = db.query(models.Cliente).filter(
        models.Cliente.id == cliente_id,
        models.Cliente.estudio_id == estudio_id,
    ).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    if data.nombre is not None:
        cliente.nombre = data.nombre
    if data.email is not None:
        cliente.email = data.email or None
    if data.afip_cuit is not None:
        cliente.afip_cuit = data.afip_cuit
    if data.afip_password is not None:
        cliente.afip_password_enc = encrypt(data.afip_password)
    if data.representado is not None:
        cliente.representado = data.representado
    if data.activo is not None:
        cliente.activo = data.activo

    if data.contador_ids is not None:
        db.query(models.ClienteContador).filter(
            models.ClienteContador.cliente_id == cliente_id
        ).delete()
        for contador_id in data.contador_ids:
            db.add(models.ClienteContador(cliente_id=cliente_id, contador_id=contador_id))

    db.commit()
    db.refresh(cliente)
    return cliente


@router.delete("/clientes/{cliente_id}")
def eliminar_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(auth.require_admin),
):
    estudio_id = get_estudio_id(current)
    cliente = db.query(models.Cliente).filter(
        models.Cliente.id == cliente_id,
        models.Cliente.estudio_id == estudio_id,
    ).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    cliente.activo = False
    db.commit()
    return {"ok": True}
