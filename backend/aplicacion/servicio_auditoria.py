"""
Servicio de Auditoría Informática Completo
Este módulo proporciona funcionalidades de auditoría para todo el sistema
"""
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlalchemy import select
from aplicacion.conexion_bd import coleccion_auditoria
from aplicacion.modelos import Usuario
import logging

logger = logging.getLogger(__name__)

# Cada evento del sistema se registra acá con un código corto y su descripción en español.
# Separamos por dominio (usuarios, quices, sesiones, etc.) para mantener el diccionario ordenado.
TIPOS_OPERACION = {
    # Usuarios
    "USUARIO_LOGIN": "Inicio de sesión",
    "USUARIO_LOGOUT": "Cierre de sesión",
    "USUARIO_CREACION": "Creación de usuario",
    "USUARIO_MODIFICACION": "Modificación de usuario",
    "USUARIO_ELIMINACION": "Eliminación de usuario",
    "USUARIO_DESACTIVACION": "Desactivación de usuario",
    "USUARIO_CAMBIO_PASSWORD": "Cambio de contraseña",
    
    # Logros
    "LOGRO_OBTENIDO": "Logro desbloqueado",
    
    # Quizes
    "QUIZ_CREACION": "Creación de quiz",
    "QUIZ_MODIFICACION": "Modificación de quiz",
    "QUIZ_ELIMINACION": "Eliminación de quiz",
    "QUIZ_ACCESO": "Acceso a quiz",
    "QUIZ_GENERAR_CODIGO": "Generación de código de quiz",
    "QUIZ_COMPARTIR_CODIGO": "Compartir código de quiz",
    
    # Sesiones
    "SESION_CREACION": "Creación de sesión",
    "SESION_INICIO": "Inicio de sesión de quiz",
    "SESION_FIN": "Finalización de sesión",
    "SESION_MODIFICACION": "Modificación de sesión",
    "SESION_ELIMINACION": "Eliminación de sesión",
    "SESION_RESULTADO": "Registro de resultado",
    
    # Materias
    "MATERIA_CREACION": "Creación de materia",
    "MATERIA_MODIFICACION": "Modificación de materia",
    "MATERIA_ELIMINACION": "Eliminación de materia",
    
    # Inscripciones
    "INSCRIPCION_CREACION": "Inscripción a materia",
    "INSCRIPCION_ELIMINACION": "Baja de materia",
    
    # Seguridad
    "SEGURIDAD_INTENTO_FALLIDO": "Intento de acceso fallido",
    "SEGURIDAD_BLOQUEO": "Bloqueo de cuenta",
    "SEGURIDAD_DESBLOQUEO": "Desbloqueo de cuenta",
    
    # Sistema
    "SISTEMA_BACKUP": "Backup del sistema",
    "SISTEMA_CONFIGURACION": "Cambio de configuración",
    "PDF_GENERACION": "Generación de PDF"
}


# Funcion principal: todas las demas wrappers terminan llamando a esta.
# Centralizar aca permite mantener estructura uniforme en MongoDB.
async def registrar_auditoria_completa(
    tipo_operacion: str,
    usuario_id: Optional[int],
    bd,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    detalles: Optional[Dict[str, Any]] = None,
    entidad_tipo: Optional[str] = None,
    entidad_id: Optional[str] = None,
    datos_anteriores: Optional[Dict[str, Any]] = None,
    datos_nuevos: Optional[Dict[str, Any]] = None,
    exito: bool = True,
    mensaje_error: Optional[str] = None
) -> bool:
    """
    Registra un evento de auditoría completo con toda la información relevante
    """
    try:
        # Si hay usuario_id, buscamos datos actuales del usuario en PostgreSQL.
        # Esto enriquece el log con nombre, email y rol por si el usuario cambia después.
        usuario_info = None
        if usuario_id and bd:
            try:
                usuario = await asyncio.to_thread(
                    lambda: bd.execute(
                        select(Usuario).where(Usuario.usu_id == usuario_id)
                    ).scalar_one_or_none()
                )
                if usuario:
                    rol_nombre = usuario.rol.rol_nombre if hasattr(usuario, 'rol') and usuario.rol else "Sin rol"
                    usuario_info = {
                        "id": usuario.usu_id,
                        "nombre": usuario.usu_nombre,
                        "apellido": usuario.usu_apellido,
                        "email": usuario.usu_email,
                        "rol": rol_nombre
                    }
            except Exception as e:
                # Si falla la consulta, el log sigue adelante sin datos del usuario
                logger.warning(f"No se pudo obtener información del usuario: {e}")
        
        # Construir el registro de auditoría
        # Separamos en secciones para que sea facil consultar en MongoDB Compass
        registro_auditoria = {
            "tipo_operacion": tipo_operacion,
            "nombre_operacion": TIPOS_OPERACION.get(tipo_operacion, tipo_operacion),
            "fecha_operacion": datetime.now(timezone.utc),
            "usuario": usuario_info,
            "contexto": {
                "ip_address": ip_address,
                "user_agent": user_agent,
                "timestamp_unix": int(datetime.now(timezone.utc).timestamp())
            },
            # entidad es opcional: algunas operaciones no afectan una entidad especifica
            "entidad": {
                "tipo": entidad_tipo,
                "id": entidad_id
            } if entidad_tipo or entidad_id else None,
            # cambio guarda el antes y despues para operaciones de modificacion
            "cambio": {
                "datos_anteriores": datos_anteriores,
                "datos_nuevos": datos_nuevos
            } if datos_anteriores or datos_nuevos else None,
            "detalles": detalles or {},
            "resultado": {
                "exito": exito,
                "mensaje_error": mensaje_error
            }
        }
        
        # Guardar en MongoDB
        if coleccion_auditoria is not None:
            await coleccion_auditoria.insert_one(registro_auditoria)
            logger.info(f"✅ Auditoría registrada: {tipo_operacion} - Usuario: {usuario_id}")
            return True
        else:
            logger.warning("⚠️ Colección auditoría no disponible")
            return False
            
    except Exception as e:
        logger.error(f"❌ Error al registrar auditoría: {str(e)}")
        return False


# --- Wrappers por dominio ---
# Cada uno tipa los parámetros específicos de esa operación y llama a la funcion central.
# Así desde el resto del código solo importas el wrapper que necesitas.

async def registrar_auditoria_usuario_login(usuario_id: int, bd, ip_address: str = None, user_agent: str = None):
    """Registra el inicio de sesión de un usuario"""
    return await registrar_auditoria_completa(
        tipo_operacion="USUARIO_LOGIN",
        usuario_id=usuario_id,
        bd=bd,
        ip_address=ip_address,
        user_agent=user_agent,
        entidad_tipo="Usuario",
        entidad_id=str(usuario_id),
        detalles={"accion": "Inicio de sesión exitoso"}
    )


async def registrar_auditoria_usuario_logout(usuario_id: int, bd):
    """Registra el cierre de sesión de un usuario"""
    return await registrar_auditoria_completa(
        tipo_operacion="USUARIO_LOGOUT",
        usuario_id=usuario_id,
        bd=bd,
        entidad_tipo="Usuario",
        entidad_id=str(usuario_id),
        detalles={"accion": "Cierre de sesión"}
    )


# Separamos actor_id (quien hace el cambio) de usuario_afectado_id (a quien modifican).
# Un admin puede modificar a otro usuario, el log debe reflejar ambos.
async def registrar_auditoria_usuario_modificacion(
    actor_id: int,
    usuario_afectado_id: int,
    bd,
    datos_anteriores: dict,
    datos_nuevos: dict,
    ip_address: str = None,
    user_agent: str = None
):
    """Registra la modificación de un perfil de usuario, distinguiendo quien hizo el cambio de quien fue afectado"""
    from aplicacion.modelos import Usuario
    from sqlalchemy import select

    usuario_afectado = await asyncio.to_thread(
        lambda: bd.execute(
            select(Usuario).where(Usuario.usu_id == usuario_afectado_id)
        ).scalar_one_or_none()
    )

    afectado_info = None
    if usuario_afectado:
        afectado_info = {
            "id": usuario_afectado.usu_id,
            "nombre": usuario_afectado.usu_nombre,
            "apellido": usuario_afectado.usu_apellido,
            "email": usuario_afectado.usu_email,
        }

    return await registrar_auditoria_completa(
        tipo_operacion="USUARIO_MODIFICACION",
        usuario_id=actor_id,
        bd=bd,
        ip_address=ip_address,
        user_agent=user_agent,
        entidad_tipo="Usuario",
        entidad_id=str(usuario_afectado_id),
        datos_anteriores=datos_anteriores,
        datos_nuevos=datos_nuevos,
        detalles={
            "usuario_afectado": afectado_info,
            "campos_modificados": list(datos_nuevos.keys()),
        }
    )


async def registrar_auditoria_sesion_inicio(
    sesion_id: int, usuario_id: int, quiz_id: str, bd,
    codigo_acceso: str = None, quiz_titulo: str = None,
    materia_nombre: str = None, profesor_nombre: str = None
):
    """Registra el inicio de una sesión de quiz"""
    return await registrar_auditoria_completa(
        tipo_operacion="SESION_INICIO",
        usuario_id=usuario_id,
        bd=bd,
        entidad_tipo="SesionQuiz",
        entidad_id=str(sesion_id),
        detalles={
            "quiz_id": quiz_id,
            "codigo_acceso": codigo_acceso,
            "quiz_titulo": quiz_titulo,
            "materia_nombre": materia_nombre,
            "profesor_nombre": profesor_nombre,
            "accion": "Inicio de sesión de quiz"
        }
    )


# La repetición se marca para distinguir estadísticamente primeros intentos vs reintentos
async def registrar_auditoria_sesion_fin(
    sesion_id: int, usuario_id: int, nota_final: float, puntos_ganados: int, bd,
    es_repeticion: bool = False, codigo_acceso: str = None, quiz_titulo: str = None,
    materia_nombre: str = None, escala_puntuacion: int = None, modo_juego: str = None
):
    """Registra la finalización de una sesión de quiz"""
    return await registrar_auditoria_completa(
        tipo_operacion="SESION_RESULTADO",
        usuario_id=usuario_id,
        bd=bd,
        entidad_tipo="SesionQuiz",
        entidad_id=str(sesion_id),
        detalles={
            "nota_final": nota_final,
            "puntos_ganados": puntos_ganados,
            "es_repeticion": es_repeticion,
            "codigo_acceso": codigo_acceso,
            "quiz_titulo": quiz_titulo,
            "materia_nombre": materia_nombre,
            "escala_puntuacion": escala_puntuacion,
            "modo_juego": modo_juego,
            "accion": "Finalización de quiz con resultado" + (" (repetición)" if es_repeticion else "")
        }
    )


# Los intentos fallidos no tienen usuario_id (aún no hay sesion), solo email e IP.
# Esto permite detectar patrones de ataque por direccion IP o email.
async def registrar_auditoria_intento_fallido(email: str, razon: str, ip_address: str = None, bd=None):
    """Registra un intento de acceso fallido"""
    return await registrar_auditoria_completa(
        tipo_operacion="SEGURIDAD_INTENTO_FALLIDO",
        usuario_id=None,
        bd=bd,
        ip_address=ip_address,
        entidad_tipo="Seguridad",
        detalles={
            "email_intento": email,
            "razon": razon,
            "accion": "Intento de acceso fallido"
        },
        exito=False,
        mensaje_error=razon
    )


# --- Auditoria de materias ---
# Materias son el eje organizador: los quices se agrupan por materia,
# los estudiantes se inscriben a materias. Por eso su auditoria va aparte.

async def registrar_auditoria_materia_creacion(
    materia_id: int,
    nombre: str,
    codigo: str,
    profesor_id: int,
    bd,
    actor_id: int = None,
    ip_address: str = None,
    user_agent: str = None
):
    """Registra la creación de una materia"""
    datos_nuevos = {
        "nombre": nombre,
        "codigo": codigo,
        "profesor_id": profesor_id,
        "activo": True
    }
    
    return await registrar_auditoria_completa(
        tipo_operacion="MATERIA_CREACION",
        usuario_id=actor_id,
        bd=bd,
        ip_address=ip_address,
        user_agent=user_agent,
        entidad_tipo="Materia",
        entidad_id=str(materia_id),
        datos_nuevos=datos_nuevos,
        detalles={
            "materia_nombre": nombre,
            "materia_codigo": codigo,
            "profesor_asignado_id": profesor_id,
            "accion": "Creación de materia"
        }
    )


async def registrar_auditoria_materia_modificacion(
    materia_id: int,
    profesor_id: int,
    bd,
    datos_anteriores: dict,
    datos_nuevos: dict,
    nombre: str = None,
    codigo: str = None,
    actor_id: int = None,
    ip_address: str = None,
    user_agent: str = None
):
    """Registra la modificación de una materia"""
    return await registrar_auditoria_completa(
        tipo_operacion="MATERIA_MODIFICACION",
        usuario_id=actor_id,
        bd=bd,
        ip_address=ip_address,
        user_agent=user_agent,
        entidad_tipo="Materia",
        entidad_id=str(materia_id),
        datos_anteriores=datos_anteriores,
        datos_nuevos=datos_nuevos,
        detalles={
            "materia_id": materia_id,
            "materia_nombre": nombre,
            "materia_codigo": codigo,
            "profesor_asignado_id": profesor_id,
            "accion": "Modificación de materia"
        }
    )


# En la eliminacion guardamos el estado anterior completo por si toca revertir
async def registrar_auditoria_materia_eliminacion(
    materia_id: int,
    nombre: str,
    codigo: str,
    profesor_id: int,
    eliminado_por: int,
    bd,
    ip_address: str = None,
    user_agent: str = None
):
    """Registra la eliminación de una materia"""
    datos_anteriores = {
        "nombre": nombre,
        "codigo": codigo,
        "profesor_id": profesor_id,
        "activo": True
    }
    
    return await registrar_auditoria_completa(
        tipo_operacion="MATERIA_ELIMINACION",
        usuario_id=eliminado_por,
        bd=bd,
        ip_address=ip_address,
        user_agent=user_agent,
        entidad_tipo="Materia",
        entidad_id=str(materia_id),
        datos_anteriores=datos_anteriores,
        detalles={
            "materia_nombre": nombre,
            "materia_codigo": codigo,
            "profesor_original_id": profesor_id,
            "accion": "Eliminación de materia"
        }
    )


# --- Auditoria de sesiones de quiz ---
# Una sesion es una instancia de un quiz publicado. Tiene su propio ciclo de vida:
# creacion, modificacion, eliminacion. El inicio y fin los registra el estudiante.

async def registrar_auditoria_sesion_creacion(
    sesion_id: int,
    codigo_acceso: str,
    quiz_id: str,
    materia_id: int,
    profesor_id: int,
    bd,
    quiz_titulo: str = None,
    ip_address: str = None,
    user_agent: str = None
):
    """Registra la creación de una sesión de quiz"""
    datos_nuevos = {
        "codigo_acceso": codigo_acceso,
        "quiz_id": quiz_id,
        "materia_id": materia_id,
        "profesor_id": profesor_id,
        "activo": True
    }
    
    return await registrar_auditoria_completa(
        tipo_operacion="SESION_CREACION",
        usuario_id=profesor_id,
        bd=bd,
        ip_address=ip_address,
        user_agent=user_agent,
        entidad_tipo="SesionQuiz",
        entidad_id=str(sesion_id),
        datos_nuevos=datos_nuevos,
        detalles={
            "codigo_acceso": codigo_acceso,
            "quiz_id": quiz_id,
            "quiz_titulo": quiz_titulo,
            "materia_id": materia_id,
            "accion": "Creación de sesión de quiz"
        }
    )


async def registrar_auditoria_sesion_modificacion(
    sesion_id: int,
    profesor_id: int,
    bd,
    datos_anteriores: dict,
    datos_nuevos: dict,
    quiz_titulo: str = None,
    codigo_acceso: str = None,
    ip_address: str = None,
    user_agent: str = None
):
    """Registra la modificación de una sesión de quiz"""
    return await registrar_auditoria_completa(
        tipo_operacion="SESION_MODIFICACION",
        usuario_id=profesor_id,
        bd=bd,
        ip_address=ip_address,
        user_agent=user_agent,
        entidad_tipo="SesionQuiz",
        entidad_id=str(sesion_id),
        datos_anteriores=datos_anteriores,
        datos_nuevos=datos_nuevos,
        detalles={
            "sesion_id": sesion_id,
            "quiz_titulo": quiz_titulo,
            "codigo_acceso": codigo_acceso,
            "accion": "Modificación de sesión de quiz"
        }
    )


async def registrar_auditoria_sesion_eliminacion(
    sesion_id: int,
    codigo_acceso: str,
    quiz_id: str,
    materia_id: int,
    profesor_id: int,
    eliminado_por: int,
    bd,
    quiz_titulo: str = None,
    ip_address: str = None,
    user_agent: str = None
):
    """Registra la eliminación de una sesión de quiz"""
    datos_anteriores = {
        "codigo_acceso": codigo_acceso,
        "quiz_id": quiz_id,
        "materia_id": materia_id,
        "profesor_id": profesor_id,
        "activo": True
    }
    
    return await registrar_auditoria_completa(
        tipo_operacion="SESION_ELIMINACION",
        usuario_id=eliminado_por,
        bd=bd,
        ip_address=ip_address,
        user_agent=user_agent,
        entidad_tipo="SesionQuiz",
        entidad_id=str(sesion_id),
        datos_anteriores=datos_anteriores,
        detalles={
            "codigo_acceso": codigo_acceso,
            "quiz_id": quiz_id,
            "quiz_titulo": quiz_titulo,
            "materia_id": materia_id,
            "profesor_original_id": profesor_id,
            "accion": "Eliminación de sesión de quiz"
        }
    )


# --- Auditoria de codigos de quiz ---
# El profesor puede generar y compartir codigos de acceso. Son eventos independientes:
# uno es "genere un codigo" y otro es "comparti el codigo con alguien".

async def registrar_auditoria_quiz_generar_codigo(
    quiz_id: str,
    codigo: str,
    profesor_id: int,
    bd,
    ip_address: str = None,
    user_agent: str = None
):
    """Registra la generación de código de un quiz"""
    return await registrar_auditoria_completa(
        tipo_operacion="QUIZ_GENERAR_CODIGO",
        usuario_id=profesor_id,
        bd=bd,
        ip_address=ip_address,
        user_agent=user_agent,
        entidad_tipo="Quiz",
        entidad_id=quiz_id,
        detalles={
            "quiz_id": quiz_id,
            "codigo_generado": codigo,
            "accion": "Generación de código de quiz"
        }
    )


async def registrar_auditoria_quiz_compartir_codigo(
    quiz_id: str,
    codigo: str,
    profesor_id: int,
    bd,
    ip_address: str = None,
    user_agent: str = None
):
    """Registra el compartir código de un quiz"""
    return await registrar_auditoria_completa(
        tipo_operacion="QUIZ_COMPARTIR_CODIGO",
        usuario_id=profesor_id,
        bd=bd,
        ip_address=ip_address,
        user_agent=user_agent,
        entidad_tipo="Quiz",
        entidad_id=quiz_id,
        detalles={
            "quiz_id": quiz_id,
            "codigo_compartido": codigo,
            "accion": "Compartir código de quiz"
        }
    )


# Los logros son automáticos (no los asigna un admin), pero igual se auditan
# para saber cuando y por que se disparo cada logro.
async def registrar_auditoria_logro_obtenido(
    usuario_id: int,
    logro_codigo: str,
    logro_nombre: str,
    puntos_recompensa: int,
    bd
):
    """Registra la obtención de un logro por un usuario"""
    return await registrar_auditoria_completa(
        tipo_operacion="LOGRO_OBTENIDO",
        usuario_id=usuario_id,
        bd=bd,
        entidad_tipo="Logro",
        entidad_id=logro_codigo,
        detalles={
            "logro_codigo": logro_codigo,
            "logro_nombre": logro_nombre,
            "puntos_recompensa": puntos_recompensa,
            "accion": f"Logro desbloqueado: {logro_nombre}"
        }
    )


# Desactivar o reactivar un usuario es una operacion delicada.
# Separamos actor_id (admin que ejecuta) de usuario_afectado_id (a quien desactivan).
# El parametro "activar" define si fue activacion o desactivacion.
async def registrar_auditoria_usuario_desactivacion(
    actor_id: int,
    usuario_afectado_id: int,
    activar: bool,
    bd,
    ip_address: str = None,
    user_agent: str = None
):
    """Registra la desactivación o activación de un usuario"""
    usuario_afectado = await asyncio.to_thread(
        lambda: bd.execute(
            select(Usuario).where(Usuario.usu_id == usuario_afectado_id)
        ).scalar_one_or_none()
    )

    afectado_info = None
    if usuario_afectado:
        afectado_info = {
            "id": usuario_afectado.usu_id,
            "nombre": usuario_afectado.usu_nombre,
            "apellido": usuario_afectado.usu_apellido,
            "email": usuario_afectado.usu_email,
        }

    accion = "Activación de usuario" if activar else "Desactivación de usuario"

    return await registrar_auditoria_completa(
        tipo_operacion="USUARIO_DESACTIVACION",
        usuario_id=actor_id,
        bd=bd,
        ip_address=ip_address,
        user_agent=user_agent,
        entidad_tipo="Usuario",
        entidad_id=str(usuario_afectado_id),
        datos_anteriores={"activo": not activar},
        datos_nuevos={"activo": activar},
        detalles={
            "usuario_afectado": afectado_info,
            "accion": accion
        }
    )


# La generacion de PDF se registra para saber quien genero que reporte y cuando
async def registrar_auditoria_pdf_generacion(
    usuario_id: int,
    tipo_pdf: str,
    bd,
    ip_address: str = None,
    user_agent: str = None
):
    """Registra la generación de un PDF de auditoría"""
    return await registrar_auditoria_completa(
        tipo_operacion="PDF_GENERACION",
        usuario_id=usuario_id,
        bd=bd,
        ip_address=ip_address,
        user_agent=user_agent,
        entidad_tipo="PDF",
        detalles={
            "tipo_pdf": tipo_pdf,
            "accion": f"Generación de PDF: {tipo_pdf}"
        }
    )
