import os
import re
import unicodedata
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from jose import jwt
import bcrypt

from aplicacion.conexion_bd import get_db
from aplicacion.modelos import Usuario, Rol, RespuestaSeguridad
from aplicacion.esquemas import DatosRegistro, RespuestaLogin, UsuarioRespuesta
from aplicacion.rutas.login import validar_password
from aplicacion.servicio_auditoria import registrar_auditoria_completa

router = APIRouter(prefix="/auth", tags=["Autenticación"])

# La misma clave que en login.py para firmar los tokens de usuarios nuevos
# --- CONFIGURACIÓN DE SEGURIDAD ---
CLAVE_SECRETA = os.getenv("CLAVE_SECRETA", "clave_extremadamente_secreta_123")
ALGORITMO = "HS256"

# Vuelve a definir hashear_password aqui porque registro.py no importa login.py directamente
# La logica es la misma: bcrypt con truncado a 72 bytes
def hashear_password(password):
    # bcrypt tiene un límite de 72 bytes, truncamos si es necesario
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode('utf-8')

def crear_token(datos: dict):
    # Expira en 1 día
    expira = datetime.utcnow() + timedelta(days=30)
    to_encode = datos.copy()
    to_encode.update({"exp": expira})
    return jwt.encode(to_encode, CLAVE_SECRETA, algorithm=ALGORITMO)

# Limpia la respuesta para compararla sin importar mayusculas, acentos o puntuacion
# Asi "Madrid!" y "madrid" cuentan como lo mismo
def normalizar_respuesta(respuesta: str) -> str:
    """Normaliza una respuesta: minúsculas, sin acentos, sin espacios extra"""
    texto = respuesta.lower().strip()
    texto = unicodedata.normalize('NFD', texto)
    texto = ''.join(c for c in texto if unicodedata.category(c) != 'Mn')
    texto = re.sub(r'[^\w\s]', '', texto)
    texto = re.sub(r'\s+', ' ', texto).strip()
    return texto

# Guarda la respuesta de seguridad como hash para no almacenarla en texto plano
# Primero la normaliza para que "Madrid!" y "madrid" generen el mismo hash
def hashear_respuesta(respuesta: str) -> str:
    respuesta_bytes = normalizar_respuesta(respuesta).encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(respuesta_bytes, salt).decode('utf-8')

# Crea un usuario nuevo ya sea estudiante o profesor
# Primero revisa que el email no este repetido, que la contrasena cumpla requisitos
# y que el rol exista en la base de datos. Si todo bien, devuelve el token
@router.post("/registro", response_model=RespuestaLogin)
async def registro(datos: DatosRegistro, bd: Session = Depends(get_db)):
    # Verifica si email ya existe
    resultado = bd.execute(
        select(Usuario).where(Usuario.usu_email == datos.email)
    )
    usuario_existente = resultado.scalar_one_or_none()
    if usuario_existente:
        raise HTTPException(status_code=400, detail="El email ya está registrado")
    
    if datos.tipo not in ('estudiante', 'profesor'):
        raise HTTPException(status_code=400, detail="Solo es posible registrarse como estudiante o profesor")
    
    # Validar requisitos de contraseña
    es_valida, mensaje = validar_password(datos.password)
    if not es_valida:
        raise HTTPException(status_code=400, detail=mensaje)

    tipo_rol = "alumno" if datos.tipo == "estudiante" else "profesor"
    resultado_rol = bd.execute(select(Rol).where(Rol.rol_nombre == tipo_rol))
    rol = resultado_rol.scalar_one_or_none()
    
    if not rol:
        raise HTTPException(status_code=400, detail=f"El rol '{tipo_rol}' no existe")
    rol_id = rol.rol_id
    
    # Crea usuario con PASSWORD HASHEADA
    from aplicacion.rutas.rutas_quices import base64_to_file as _convertir_img
    imagen_final = _convertir_img(datos.imagen) if datos.imagen else None
    
    nuevo_usuario = Usuario(
        usu_nombre=datos.nombre,
        usu_apellido=datos.apellido,
        usu_email=datos.email,
        usu_password_hash=hashear_password(datos.password),
        usu_fk_rol=rol_id,
        usu_imagen=imagen_final,
        usu_activo=True
    )
    
    bd.add(nuevo_usuario)
    bd.commit()
    bd.refresh(nuevo_usuario)
    
    # Guardar preguntas de seguridad si se proporcionaron
    if datos.preguntas_seguridad and len(datos.preguntas_seguridad) >= 2:
        for orden, p in enumerate(datos.preguntas_seguridad, 1):
            nueva = RespuestaSeguridad(
                rsu_fk_usuario=nuevo_usuario.usu_id,
                rsu_fk_pregunta=p["pregunta_id"],
                rsu_respuesta_hash=hashear_respuesta(p["respuesta"]),
                rsu_orden=orden
            )
            bd.add(nueva)
        bd.commit()
    
    # Obtener el nombre del rol desde la base de datos
    resultado_rol = bd.execute(select(Rol).where(Rol.rol_id == nuevo_usuario.usu_fk_rol))
    rol = resultado_rol.scalar_one_or_none()
    nombre_rol = rol.rol_nombre if rol else "desconocido"

    token = crear_token(datos={
        "sub": str(nuevo_usuario.usu_id),
        "rol": nombre_rol,
        "rol_id": nuevo_usuario.usu_fk_rol,
    })

    # Registrar auditoría de creación de usuario
    try:
        await registrar_auditoria_completa(
            tipo_operacion="USUARIO_CREACION",
            usuario_id=nuevo_usuario.usu_id,
            bd=bd,
            exito=True,
            entidad_tipo="Usuario",
            entidad_id=str(nuevo_usuario.usu_id),
            detalles={
                "email": nuevo_usuario.usu_email,
                "rol": nombre_rol,
                "nombre_completo": f"{nuevo_usuario.usu_nombre} {nuevo_usuario.usu_apellido}"
            }
        )
    except Exception:
        pass  # No bloquear registro si auditoría falla
    
    return RespuestaLogin(
        token_acceso=token,
        usuario=UsuarioRespuesta(
            usu_id=nuevo_usuario.usu_id,
            usu_nombre=nuevo_usuario.usu_nombre,
            usu_apellido=nuevo_usuario.usu_apellido,
            usu_email=nuevo_usuario.usu_email,
            usu_puntos_app=nuevo_usuario.usu_puntos_app,
            usu_fk_rol=nuevo_usuario.usu_fk_rol,
            usu_activo=nuevo_usuario.usu_activo,
            rol_nombre=nombre_rol,
            usu_imagen=nuevo_usuario.usu_imagen
        )
    )
