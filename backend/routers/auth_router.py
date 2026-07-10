from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas, auth

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=schemas.TokenResponse)
def login(data: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.Usuario).filter(
        models.Usuario.email == data.email,
        models.Usuario.activo == True
    ).first()

    if not user or not auth.verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")

    # Verificar que el estudio esté activo (si aplica)
    if user.estudio_id:
        estudio = db.query(models.Estudio).filter(
            models.Estudio.id == user.estudio_id,
            models.Estudio.activo == True,
        ).first()
        if not estudio:
            raise HTTPException(status_code=403, detail="El estudio contable está inactivo")

    token = auth.create_access_token({"sub": str(user.id), "rol": user.rol})

    estudio_nombre = None
    if user.estudio_id and user.estudio:
        estudio_nombre = user.estudio.nombre

    return schemas.TokenResponse(
        access_token=token,
        token_type="bearer",
        rol=user.rol,
        nombre=user.nombre,
        id=user.id,
        estudio_id=user.estudio_id,
        estudio_nombre=estudio_nombre,
    )


@router.get("/me", response_model=schemas.UsuarioOut)
def me(current_user: models.Usuario = Depends(auth.get_current_user)):
    return current_user
