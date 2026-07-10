from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
import models, schemas, auth

router = APIRouter(prefix="/api/superadmin", tags=["superadmin"])


@router.get("/estudios", response_model=List[schemas.EstudioConStats])
def listar_estudios(
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(auth.require_superadmin),
):
    estudios = db.query(models.Estudio).all()
    result = []
    for e in estudios:
        total_usuarios = db.query(models.Usuario).filter(
            models.Usuario.estudio_id == e.id,
            models.Usuario.activo == True,
        ).count()
        total_clientes = db.query(models.Cliente).filter(
            models.Cliente.estudio_id == e.id,
            models.Cliente.activo == True,
        ).count()
        admin = db.query(models.Usuario).filter(
            models.Usuario.estudio_id == e.id,
            models.Usuario.rol == "admin",
        ).first()
        out = schemas.EstudioConStats.model_validate(e)
        out.total_usuarios = total_usuarios
        out.total_clientes = total_clientes
        out.admin_nombre = admin.nombre if admin else None
        out.admin_email = admin.email if admin else None
        out.admin_id = admin.id if admin else None
        out.admin_password_visible = admin.password_visible if admin else None
        result.append(out)
    return result


@router.post("/estudios", response_model=schemas.EstudioOut)
def crear_estudio(
    data: schemas.EstudioCreate,
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(auth.require_superadmin),
):
    email_existe = db.query(models.Usuario).filter(
        models.Usuario.email == data.admin_email
    ).first()
    if email_existe:
        raise HTTPException(status_code=400, detail="El email del administrador ya está registrado")

    estudio = models.Estudio(nombre=data.nombre, email_institucional=data.email_institucional)
    db.add(estudio)
    db.flush()

    admin = models.Usuario(
        nombre=data.admin_nombre,
        email=data.admin_email,
        password_hash=auth.hash_password(data.admin_password),
        password_visible=data.admin_password,
        rol="admin",
        estudio_id=estudio.id,
    )
    db.add(admin)
    db.commit()
    db.refresh(estudio)
    return estudio


@router.put("/estudios/{estudio_id}", response_model=schemas.EstudioOut)
def actualizar_estudio(
    estudio_id: int,
    data: schemas.EstudioUpdate,
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(auth.require_superadmin),
):
    estudio = db.query(models.Estudio).filter(models.Estudio.id == estudio_id).first()
    if not estudio:
        raise HTTPException(status_code=404, detail="Estudio no encontrado")
    if data.nombre is not None:
        estudio.nombre = data.nombre
    if data.email_institucional is not None:
        estudio.email_institucional = data.email_institucional
    if data.activo is not None:
        estudio.activo = data.activo
    db.commit()
    db.refresh(estudio)
    return estudio


@router.put("/estudios/{estudio_id}/admin", response_model=schemas.UsuarioOut)
def actualizar_admin(
    estudio_id: int,
    data: schemas.AdminUpdate,
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(auth.require_superadmin),
):
    estudio = db.query(models.Estudio).filter(models.Estudio.id == estudio_id).first()
    if not estudio:
        raise HTTPException(status_code=404, detail="Estudio no encontrado")

    # Verificar que el email no pertenezca a otro usuario
    email_conflict = db.query(models.Usuario).filter(
        models.Usuario.email == data.admin_email,
        models.Usuario.estudio_id != estudio_id,
    ).first()
    if email_conflict:
        raise HTTPException(status_code=400, detail="El email ya está registrado en otro estudio")

    admin = db.query(models.Usuario).filter(
        models.Usuario.estudio_id == estudio_id,
        models.Usuario.rol == "admin",
    ).first()

    if admin:
        admin.nombre = data.admin_nombre
        admin.email = data.admin_email
        if data.admin_password:
            admin.password_hash = auth.hash_password(data.admin_password)
            admin.password_visible = data.admin_password
    else:
        if not data.admin_password:
            raise HTTPException(status_code=400, detail="La contraseña es obligatoria para crear el administrador")
        admin = models.Usuario(
            nombre=data.admin_nombre,
            email=data.admin_email,
            password_hash=auth.hash_password(data.admin_password),
            password_visible=data.admin_password,
            rol="admin",
            estudio_id=estudio_id,
        )
        db.add(admin)

    db.commit()
    db.refresh(admin)
    return admin


@router.get("/estudios/{estudio_id}/usuarios", response_model=List[schemas.UsuarioOut])
def usuarios_del_estudio(
    estudio_id: int,
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(auth.require_superadmin),
):
    return db.query(models.Usuario).filter(
        models.Usuario.estudio_id == estudio_id
    ).all()


@router.get("/me", response_model=schemas.UsuarioOut)
def me(current: models.Usuario = Depends(auth.require_superadmin)):
    return current
