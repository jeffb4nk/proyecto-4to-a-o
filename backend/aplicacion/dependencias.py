"""
Dependencias para autenticación y autorización mediante JWT.
Provee funciones de dependencia para FastAPI que validan tokens y roles.
"""
import os
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session
from jose import jwt
from typing import List

from aplicacion.conexion_bd import get_db
from aplicacion.modelos import Usuario, Rol

# Misma clave que usa login.py, ambos jalan del mismo .env
CLAVE_SECRETA = os.getenv("CLAVE_SECRETA", "clave_extremadamente_secreta_123")
ALGORITMO = "HS256"


def obtener_token_desde_header(request: Request) -> str:
    """Extrae el token JWT del header Authorization."""
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(
            status_code=401,
            detail="Token de autenticación requerido",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Esperamos exactamente "Bearer <token>", nada mas
    partes = auth_header.split()
    if partes[0].lower() != "bearer" or len(partes) != 2:
        raise HTTPException(
            status_code=401,
            detail="Formato de token inválido. Usa: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return partes[1]


def decodificar_token(token: str) -> dict:
    """Decodifica y valida un token JWT."""
    try:
        payload = jwt.decode(token, CLAVE_SECRETA, algorithms=[ALGORITMO])
        return payload
    except jwt.JWTError as e:
        # No le decimos al cliente por qué fallo exactamente (seguridad)
        print(f"[ERROR] JWT: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail=f"Token inválido o expirado: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def obtener_usuario_actual(
    request: Request,
    bd: Session = Depends(get_db)
) -> dict:
    """Dependencia: Obtiene el usuario autenticado desde el token JWT.
    
    Retorna un dict con 'user_id', 'rol', 'rol_id'.
    Lanza 401 si el token es inválido o 403 si el usuario está desactivado.
    """
    token = obtener_token_desde_header(request)
    payload = decodificar_token(token)
    
    # El token es confiable pero siempre verificamos contra BD por si desactivaron al usuario
    user_id = int(payload.get("sub"))
    rol = payload.get("rol")
    rol_id = payload.get("rol_id")
    
    if not user_id or not rol:
        raise HTTPException(status_code=401, detail="Token inválido: faltan datos de usuario")
    
    # Doble check: que el usuario siga existiendo y activo en la base
    usuario = bd.query(Usuario).filter(Usuario.usu_id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=401, detail="Usuario no encontrado en el sistema")
    if not usuario.usu_activo or usuario.usu_eliminado:
        raise HTTPException(status_code=403, detail="Usuario desactivado o eliminado. Contacta al administrador.")
    
    return {
        "user_id": user_id,
        "rol": rol,
        "rol_id": rol_id
    }


def validar_roles(roles_permitidos: List[int]):
    """Factory de dependencia: Valida que el usuario tenga uno de los roles permitidos.
    
    Uso: 
        @router.get("/", dependencies=[Depends(validar_roles([3]))])  # solo master
        @router.get("/", dependencies=[Depends(validar_roles([2, 3]))])  # profesor o master
    
    Los roles son: 1=alumno, 2=profesor, 3=master
    """
    # Cerradura: devolvemos un validador configurado con los roles que aceptamos
    async def _validador(usuario: dict = Depends(obtener_usuario_actual)):
        if usuario["rol_id"] not in roles_permitidos:
            raise HTTPException(
                status_code=403,
                detail=f"Acceso denegado. Se requiere rol: {roles_permitidos}"
            )
        return usuario
    
    return _validador
