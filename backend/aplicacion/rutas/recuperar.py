import os
import re
import unicodedata
import bcrypt
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from jose import jwt

from ..conexion_bd import get_db
from ..modelos import Usuario, PreguntaSeguridad, RespuestaSeguridad
from ..rutas.login import validar_password
from ..esquemas import (
    SolicitarRecuperacionRequest, SolicitarRecuperacionResponse,
    PreguntaSeguridadResponse, VerificarRespuestasRequest, VerificarRespuestasResponse,
    CambiarPasswordRequest
)
from ..dependencias import obtener_usuario_actual

router = APIRouter(prefix="/auth", tags=["Recuperación"])

_intentos_recuperacion = {}

CLAVE_SECRETA = os.getenv("CLAVE_SECRETA", "clave_extremadamente_secreta_123")
ALGORITMO = "HS256"

# Limpia la respuesta para poder compararla sin importar acentos ni mayusculas
# Es la misma funcion que en registro.py para mantener consistencia
def normalizar_respuesta(respuesta: str) -> str:
    """Normaliza una respuesta: minúsculas, sin acentos, sin espacios extra"""
    # Minúsculas y strip
    texto = respuesta.lower().strip()
    # Quitar acentos (NFD decomposition + remove combining marks)
    texto = unicodedata.normalize('NFD', texto)
    texto = ''.join(c for c in texto if unicodedata.category(c) != 'Mn')
    # Quitar puntuación y espacios múltiples
    texto = re.sub(r'[^\w\s]', '', texto)
    texto = re.sub(r'\s+', ' ', texto).strip()
    return texto

# Convierte la respuesta a hash antes de guardarla
# Normaliza primero para que variaciones de escritura no afecten la verificacion
def hashear_respuesta(respuesta: str) -> str:
    respuesta_bytes = normalizar_respuesta(respuesta).encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(respuesta_bytes, salt).decode('utf-8')

# Compara lo que el usuario escribio con el hash guardado
# Normaliza ambos para que "Madrid!" y "madrid" sean iguales
def verificar_respuesta(respuesta_plana: str, respuesta_hasheada: str) -> bool:
    respuesta_bytes = normalizar_respuesta(respuesta_plana).encode('utf-8')[:72]
    hash_bytes = respuesta_hasheada.encode('utf-8')
    return bcrypt.checkpw(respuesta_bytes, hash_bytes)

# Devuelve todas las preguntas de seguridad disponibles para que el usuario elija
# El frontend muestra esto en un selector al configurar las preguntas
@router.get("/preguntas-seguridad", response_model=list[PreguntaSeguridadResponse])
def obtener_preguntas(bd: Session = Depends(get_db)):
    """Retorna el pool de preguntas disponibles"""
    preguntas = bd.execute(
        select(PreguntaSeguridad).order_by(PreguntaSeguridad.pse_id)
    ).scalars().all()
    return [PreguntaSeguridadResponse(id=p.pse_id, pregunta=p.pse_pregunta) for p in preguntas]


# Paso 1 de la recuperacion: si el email existe, devuelve las preguntas de seguridad
# Si el email no existe devuelve datos vacios para no revelar que emails estan registrados
@router.post("/recuperar/solicitar")
def solicitar_recuperacion(datos: SolicitarRecuperacionRequest, bd: Session = Depends(get_db)):
    """Paso 1: Buscar usuario por email y devolver sus preguntas de seguridad"""
    usuario = bd.execute(
        select(Usuario).where(
            Usuario.usu_email == datos.email,
            Usuario.usu_activo == True,
            Usuario.usu_eliminado == False
        )
    ).scalar_one_or_none()
    
    # No revelar si el email existe o no
    if not usuario:
        return {"usuario_id": 0, "preguntas": []}
    
    # Obtener las preguntas del usuario
    respuestas = bd.execute(
        select(RespuestaSeguridad).where(RespuestaSeguridad.rsu_fk_usuario == usuario.usu_id)
        .order_by(RespuestaSeguridad.rsu_orden)
    ).scalars().all()
    
    if not respuestas:
        return {"usuario_id": 0, "preguntas": []}
    
    preguntas_ids = [r.rsu_fk_pregunta for r in respuestas]
    preguntas = bd.execute(
        select(PreguntaSeguridad).where(PreguntaSeguridad.pse_id.in_(preguntas_ids))
    ).scalars().all()
    
    preguntas_map = {p.pse_id: p.pse_pregunta for p in preguntas}
    
    return {
        "usuario_id": usuario.usu_id,
        "preguntas": [
            PreguntaSeguridadResponse(id=r.rsu_fk_pregunta, pregunta=preguntas_map.get(r.rsu_fk_pregunta, ""))
            for r in respuestas
        ]
    }


# Paso 2: verifica las respuestas de seguridad y si son correctas genera un token de 15 minutos
# Si falla 3 veces bloquea al usuario por 10 minutos para evitar fuerza bruta
@router.post("/recuperar/verificar", response_model=VerificarRespuestasResponse)
def verificar_respuestas(datos: VerificarRespuestasRequest, bd: Session = Depends(get_db)):
    """Paso 2: Verificar respuestas y generar token temporal"""
    # Verificar rate limiting (en memoria)
    intento = _intentos_recuperacion.get(datos.usuario_id)
    ahora = datetime.utcnow()
    
    if intento and intento["bloqueo_hasta"] and ahora < intento["bloqueo_hasta"]:
        falta = int((intento["bloqueo_hasta"] - ahora).total_seconds())
        raise HTTPException(
            status_code=429,
            detail=f"Demasiados intentos. Intenta de nuevo en {falta} segundos."
        )
    
    # Obtener respuestas del usuario
    respuestas_bd = bd.execute(
        select(RespuestaSeguridad).where(RespuestaSeguridad.rsu_fk_usuario == datos.usuario_id)
        .order_by(RespuestaSeguridad.rsu_orden)
    ).scalars().all()
    
    if not respuestas_bd:
        raise HTTPException(status_code=400, detail="Usuario no tiene configuradas preguntas de seguridad")
    
    # Verificar cada respuesta
    for i, r in enumerate(respuestas_bd):
        respuesta_plana = next((d.respuesta for d in datos.respuestas if d.pregunta_id == r.rsu_fk_pregunta), None)
        if not respuesta_plana or not verificar_respuesta(respuesta_plana, r.rsu_respuesta_hash):
            # Registrar intento fallido (en memoria)
            if not intento:
                intento = {"intentos": 1, "bloqueo_hasta": None}
                _intentos_recuperacion[datos.usuario_id] = intento
            else:
                intento["intentos"] += 1
                if intento["intentos"] >= 3:
                    intento["bloqueo_hasta"] = ahora + timedelta(minutes=10)
            
            raise HTTPException(status_code=400, detail="Respuestas incorrectas")
    
    # Respuestas correctas: generar token temporal (15 min)
    token = jwt.encode({
        "sub": str(datos.usuario_id),
        "propósito": "reset_password",
        "exp": datetime.utcnow() + timedelta(minutes=15)
    }, CLAVE_SECRETA, algorithm=ALGORITMO)
    
    # Resetear contador de intentos
    _intentos_recuperacion.pop(datos.usuario_id, None)
    
    return VerificarRespuestasResponse(token_reset=token, expiracion=900)


# Paso 3: cambia la contrasena usando el token que se genero en el paso 2
# El token expira a los 15 minutos, si ya paso hay que empezar de nuevo
@router.post("/recuperar/cambiar")
def cambiar_password(datos: CambiarPasswordRequest, bd: Session = Depends(get_db)):
    """Paso 3: Cambiar la contraseña usando el token temporal"""
    try:
        payload = jwt.decode(datos.token_reset, CLAVE_SECRETA, algorithms=[ALGORITMO])
        if payload.get("propósito") != "reset_password":
            raise HTTPException(status_code=400, detail="Token inválido")
        
        usuario_id = int(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="El token ha expirado. Solicita nuevamente la recuperación.")
    except Exception:
        raise HTTPException(status_code=400, detail="Token inválido")
    
    from ..rutas.registro import hashear_password
    
    usuario = bd.execute(select(Usuario).where(Usuario.usu_id == usuario_id)).scalar_one_or_none()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Validar requisitos de la nueva contraseña
    es_valida, mensaje = validar_password(datos.nueva_password)
    if not es_valida:
        raise HTTPException(status_code=400, detail=mensaje)
    
    usuario.usu_password_hash = hashear_password(datos.nueva_password)
    bd.commit()
    
    return {"mensaje": "Contraseña actualizada correctamente"}


# Guarda o actualiza las preguntas de seguridad del usuario que esta logueado
# Primero borra las viejas y luego inserta las nuevas, minimo 2 preguntas
@router.post("/usuarios/preguntas-seguridad")
def configurar_preguntas(
    datos: dict,
    bd: Session = Depends(get_db),
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    """Configurar o actualizar preguntas de seguridad del usuario actual"""
    usuario_id = usuario_actual["user_id"]
    preguntas = datos.get("preguntas", [])
    
    if len(preguntas) < 2:
        raise HTTPException(status_code=400, detail="Debes configurar al menos 2 preguntas de seguridad")
    
    # Eliminar preguntas anteriores
    bd.query(RespuestaSeguridad).filter(RespuestaSeguridad.rsu_fk_usuario == usuario_id).delete()
    
    # Insertar nuevas
    for orden, p in enumerate(preguntas, 1):
        nueva = RespuestaSeguridad(
            rsu_fk_usuario=usuario_id,
            rsu_fk_pregunta=p["pregunta_id"],
            rsu_respuesta_hash=hashear_respuesta(p["respuesta"]),
            rsu_orden=orden
        )
        bd.add(nueva)
    
    bd.commit()
    return {"mensaje": "Preguntas de seguridad configuradas correctamente"}
