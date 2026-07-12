import os
import re
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import select
from jose import jwt
import bcrypt

from ..conexion_bd import get_db
from ..modelos import Usuario, Rol
from ..esquemas import DatosLogin, RespuestaLogin, UsuarioRespuesta
from ..servicio_auditoria import registrar_auditoria_usuario_login, registrar_auditoria_intento_fallido, registrar_auditoria_completa

router = APIRouter(prefix="/auth", tags=["Autenticación"])

_intentos_login = {}

# La clave y algoritmo para firmar los tokens JWT
# El admin master se auto-crea con estas credenciales la primera vez
# --- CONFIGURACIÓN DE SEGURIDAD ---
CLAVE_SECRETA = os.getenv("CLAVE_SECRETA", "clave_extremadamente_secreta_123")
ALGORITMO = "HS256"
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@master.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Master123!")
ADMIN_ROLE_NAME = os.getenv("ADMIN_ROLE_NAME", "master")

# Helpers de seguridad con bcrypt directamente

# Compara la contraseña que escribe el usuario con el hash guardado
# bcrypt se encarga de extraer el salt del propio hash
def verificar_password(password_plana, password_hasheada):
    password_bytes = password_plana.encode('utf-8')[:72]
    hash_bytes = password_hasheada.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hash_bytes)


# Genera el hash de la contraseña antes de guardarla en la base de datos
# Truncamos a 72 bytes porque bcrypt no lee más que eso
def hashear_password(password):
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode('utf-8')


# Crea el token JWT que el frontend usara para autenticarse
# Le ponemos el id del usuario y el rol dentro del token
def crear_token(datos: dict):
    # Expira en 1 día
    expira = datetime.utcnow() + timedelta(days=30)
    to_encode = datos.copy()
    to_encode.update({"exp": expira})
    return jwt.encode(to_encode, CLAVE_SECRETA, algorithm=ALGORITMO)


# Busca o crea el usuario administrador master al arrancar
# Si ya existe, asegura que tenga el rol correcto y la contrasena actualizada
async def obtener_usuario_admin(bd: Session):
    rol = bd.execute(select(Rol).where(Rol.rol_nombre == ADMIN_ROLE_NAME)).scalar_one_or_none()
    if not rol:
        rol = Rol(rol_nombre=ADMIN_ROLE_NAME)
        bd.add(rol)
        bd.commit()
        bd.refresh(rol)

    usuario_admin = bd.execute(select(Usuario).where(Usuario.usu_email == ADMIN_EMAIL)).scalar_one_or_none()
    if not usuario_admin:
        usuario_admin = Usuario(
            usu_nombre="Administrador",
            usu_apellido="Master",
            usu_email=ADMIN_EMAIL,
            usu_password_hash=hashear_password(ADMIN_PASSWORD),
            usu_fk_rol=rol.rol_id,
            usu_activo=True,
        )
        bd.add(usuario_admin)
        bd.commit()
        bd.refresh(usuario_admin)
        # Auditar creación del admin master
        try:
            await registrar_auditoria_completa(
                tipo_operacion="USUARIO_CREACION",
                usuario_id=usuario_admin.usu_id,
                bd=bd,
                exito=True,
                entidad_tipo="Usuario",
                entidad_id=str(usuario_admin.usu_id),
                detalles={
                    "email": usuario_admin.usu_email,
                    "rol": "master",
                    "nombre_completo": f"{usuario_admin.usu_nombre} {usuario_admin.usu_apellido}",
                    "metodo": "auto-creacion"
                }
            )
        except Exception:
            pass
    else:
        if usuario_admin.usu_fk_rol != rol.rol_id:
            usuario_admin.usu_fk_rol = rol.rol_id
            bd.commit()
        if not verificar_password(ADMIN_PASSWORD, usuario_admin.usu_password_hash):
            usuario_admin.usu_password_hash = hashear_password(ADMIN_PASSWORD)
            bd.commit()

    return usuario_admin


# Revisa que la contrasena cumpla con minimos de seguridad
# Esto evita que los usuarios pongan contrasenas debiles
def validar_password(password: str) -> tuple[bool, str]:
    """Valida que la contraseña cumpla con requisitos mínimos de seguridad.
    Retorna (es_valida, mensaje_error)."""
    if len(password) < 8:
        return False, "La contraseña debe tener al menos 8 caracteres"
    
    if not re.search(r'[A-Z]', password):
        return False, "La contraseña debe contener al menos una letra mayúscula"
    
    if not re.search(r'[a-z]', password):
        return False, "La contraseña debe contener al menos una letra minúscula"
    
    if not re.search(r'[0-9]', password):
        return False, "La contraseña debe contener al menos un número"
    
    if not re.search(r'[@$!%*?&#._\-]', password):
        return False, "La contraseña debe contener al menos un carácter especial (@$!%*?&#._-)"
    
    return True, ""


# Valida las credenciales del usuario y devuelve un token JWT
# Si el usuario falla 5 veces, lo bloqueamos 15 minutos para evitar fuerza bruta
# Tambien revisa que el tipo de usuario coincida con el rol que dice tener
@router.post("/login", response_model=RespuestaLogin)
async def login(datos: DatosLogin, request: Request, bd: Session = Depends(get_db)):
    # --- PROTECCIÓN CONTRA FUERZA BRUTA (en memoria) ---
    email_lower = datos.email.lower().strip()
    ahora = datetime.utcnow()
    
    # Verificar si el email está bloqueado por demasiados intentos
    intento_login = _intentos_login.get(email_lower)
    
    if intento_login and intento_login["bloqueo_hasta"] and ahora < intento_login["bloqueo_hasta"]:
        falta = int((intento_login["bloqueo_hasta"] - ahora).total_seconds())
        minutos = falta // 60
        segundos = falta % 60
        raise HTTPException(
            status_code=429,
            detail=f"Demasiados intentos. Intenta de nuevo en {minutos}m {segundos}s."
        )
    
    # Obtener IP y User Agent para auditoría
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    if datos.email.lower() == ADMIN_EMAIL.lower() and datos.password == ADMIN_PASSWORD:
        usuario = await obtener_usuario_admin(bd)
    else:
        resultado = bd.execute(
            select(Usuario).where(
                Usuario.usu_email == datos.email,
                Usuario.usu_activo == True,
                Usuario.usu_eliminado == False
            )
        )
        usuario = resultado.scalar_one_or_none()

    if not usuario:
        # Registrar intento fallido
        await registrar_auditoria_intento_fallido(
            email=datos.email,
            razon="Usuario no encontrado o inactivo",
            ip_address=ip_address,
            bd=bd
        )
        
        # Registrar intento fallido para rate limiting (en memoria)
        if not intento_login:
            intento_login = {"intentos": 1, "bloqueo_hasta": None}
            _intentos_login[email_lower] = intento_login
        else:
            intento_login["intentos"] += 1
            if intento_login["intentos"] >= 5:
                intento_login["bloqueo_hasta"] = ahora + timedelta(minutes=15)
        
        raise HTTPException(status_code=400, detail="Credenciales incorrectas")

    if usuario.usu_email.lower() != ADMIN_EMAIL.lower() or datos.password != ADMIN_PASSWORD:
        if not verificar_password(datos.password, usuario.usu_password_hash):
            # Registrar intento fallido
            await registrar_auditoria_intento_fallido(
                email=datos.email,
                razon="Contraseña incorrecta",
                ip_address=ip_address,
                bd=bd
            )
            
            # Registrar intento fallido para rate limiting (en memoria)
            if not intento_login:
                intento_login = {"intentos": 1, "bloqueo_hasta": None}
                _intentos_login[email_lower] = intento_login
            else:
                intento_login["intentos"] += 1
                if intento_login["intentos"] >= 5:
                    intento_login["bloqueo_hasta"] = ahora + timedelta(minutes=15)
            
            raise HTTPException(status_code=400, detail="Credenciales incorrectas")

    resultado_rol = bd.execute(select(Rol).where(Rol.rol_id == usuario.usu_fk_rol))
    rol = resultado_rol.scalar_one_or_none()
    nombre_rol = rol.rol_nombre if rol else "desconocido"

    token = crear_token(datos={
        "sub": str(usuario.usu_id),
        "rol": nombre_rol,
        "rol_id": usuario.usu_fk_rol,
    })

    # Validar que el rol del usuario coincida con el tipo seleccionado en el frontend
    if datos.tipo_usuario:
        # Mapeo de tipos de usuario a IDs de rol
        rol_ids = {
            'estudiante': 1,
            'profesor': 2,
            'admin': 3
        }
        
        rol_esperado = rol_ids.get(datos.tipo_usuario)
        if rol_esperado and usuario.usu_fk_rol != rol_esperado:
            # Registrar intento fallido por rol incorrecto
            await registrar_auditoria_intento_fallido(
                email=datos.email,
                razon=f"Rol incorrecto: usuario intentó acceder como {datos.tipo_usuario} pero su rol es {nombre_rol}",
                ip_address=ip_address,
                bd=bd
            )
            raise HTTPException(
                status_code=403, 
                detail=f"Las credenciales no corresponden a un {datos.tipo_usuario} válido"
            )
    
    # Login exitoso: resetear intentos fallidos
    _intentos_login.pop(email_lower, None)
    
    # Registrar login exitoso
    await registrar_auditoria_usuario_login(
        usuario_id=usuario.usu_id,
        bd=bd,
        ip_address=ip_address,
        user_agent=user_agent
    )

    return RespuestaLogin(
        token_acceso=token,
        usuario=UsuarioRespuesta(
            usu_id=usuario.usu_id,
            usu_nombre=usuario.usu_nombre,
            usu_apellido=usuario.usu_apellido,
            usu_email=usuario.usu_email,
            usu_puntos_app=usuario.usu_puntos_app,
            usu_fk_rol=usuario.usu_fk_rol,
            usu_activo=usuario.usu_activo,
            rol_nombre=nombre_rol,
            usu_imagen=usuario.usu_imagen
        )
    )