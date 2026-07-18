import random
import string
import os
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from bson import ObjectId
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel
from jose import jwt

# Este archivo tiene casi 3000 lineas porque maneja todo el ciclo de vida
# de una sesion: crearla, unirse, presentar el quiz, guardar resultado,
# ver rankings, desactivar, eliminar. Lo separamos de las rutas de MongoDB
# porque logica de sesiones es puramente relacional (PostgreSQL).
# La coleccion_quices de MongoDB solo se consulta para obtener el contenido
# del quiz que ya se creo antes.

from aplicacion.conexion_bd import get_db, coleccion_quices
from aplicacion import modelos
from aplicacion.servicio_auditoria import (
    registrar_auditoria_sesion_inicio,
    registrar_auditoria_sesion_fin,
    registrar_auditoria_sesion_creacion,
    registrar_auditoria_sesion_modificacion,
    registrar_auditoria_sesion_eliminacion,
    registrar_auditoria_logro_obtenido
)
from aplicacion.dependencias import validar_roles, obtener_usuario_actual
from aplicacion.esquemas import (
    DescargaOfflineRequest, DescargaOfflineResponse,
    SincronizarOfflineRequest, SincronizarOfflineResponse
)

router = APIRouter(
    prefix="/sesiones",
    tags=["Sesiones de Quiz"]
)

# Los esquemas Pydantic que siguen son los contratos de entrada.
# Preferimos mantenerlos aqui mismo en vez de moverlos a esquemas.py
# porque cada uno solo se usa en un endpoint y asi evitamos imports
# circulares que ya nos dieron dolores de cabeza antes.

# Esquema para crear sesión asignada (sin modificar DB)
class SesionAsignadaCrear(BaseModel):
    id_quiz_mongo: str
    id_materia: int
    id_profesor: int
    modo_juego: str  # "Igual" (clásico) o "Dificultad" (exactitud)
    escala_puntuacion: int = 100  # Valor entre 1 y 999
    tipo_publicacion: str = "inmediato"  # "inmediato" o "agendado"
    fecha_inicio: str | None = None  # ISO format datetime string (requerido si agendado)
    fecha_fin: str  # ISO format datetime string

# Esquema para unirse a sesión
class UnirseSesion(BaseModel):
    codigo_acceso: str
    id_usuario: int
    device_id: Optional[str] = None

class ResultadoSesion(BaseModel):
    id_usuario: int
    sesion_id: int
    nota_final: float
    puntos_ganados: int
    tiempo_total_ms: int
    informe_fallas: Optional[dict] = None
    hora_inicio_local: Optional[str] = None
    finalizado_en_local: Optional[str] = None
    es_offline: bool = False

class ProgresoSesion(BaseModel):
    sesion_id: int
    id_usuario: int
    puntos_actuales: float
    pregunta_actual: int
    total_preguntas: int

# Generamos codigos solo numericos porque los estudiantes los escriben
# rápido y desde el teléfono. Si usara letras se confunden (0 vs O, 1 vs I).
# Seis digitos dan 1 millon de combinaciones, suficiente para un salón.
def generar_codigo_acceso(longitud=6):
    return ''.join(random.choices(string.digits, k=longitud))

import base64
import uuid
import os

# Convertir base64 a imagen en disco es necesario porque el frontend
# manda las fotos como strings gigantes. Guardarlas como archivos
# ahorra espacio en MongoDB y acelera las consultas.
def base64_to_file(base64_str: str, upload_dir: str = None) -> str:
    """Convierte un string base64 a un archivo y retorna la ruta relativa."""
    if not base64_str or base64_str.startswith("http") or base64_str.startswith("/"):
        return base64_str
    
    if upload_dir is None:
        upload_dir = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")
        os.makedirs(upload_dir, exist_ok=True)
    
    try:
        if "base64," in base64_str:
            header, data = base64_str.split("base64,", 1)
            ext = "png"
            if "image/jpeg" in header:
                ext = "jpg"
            elif "image/png" in header:
                ext = "png"
            elif "image/gif" in header:
                ext = "gif"
        else:
            data = base64_str
            ext = "jpg"
        
        filename = f"{uuid.uuid4().hex}.{ext}"
        filepath = os.path.join(upload_dir, filename)
        image_data = base64.b64decode(data)
        with open(filepath, "wb") as f:
            f.write(image_data)
        
        return f"/uploads/{filename}"
    
    except Exception as e:
        print(f"[ERROR] Imagen: {e}")
        return None


def procesar_imagenes_quiz(quiz_dict: dict, es_guardar: bool = True) -> dict:
    """Procesa imágenes de un quiz: al guardar convierte base64 a archivo, al devolver limpia."""
    quiz = dict(quiz_dict)
    
    if "metadatos" in quiz and isinstance(quiz["metadatos"], dict):
        if es_guardar and quiz["metadatos"].get("imagen_portada"):
            ruta = base64_to_file(quiz["metadatos"]["imagen_portada"])
            quiz["metadatos"]["imagen_portada"] = ruta
    
    if "preguntas" in quiz and isinstance(quiz["preguntas"], list):
        for pregunta in quiz["preguntas"]:
            if pregunta.get("multimedia") and isinstance(pregunta["multimedia"], dict):
                multimedia = pregunta["multimedia"]
                for key in ["imagen", "src", "url", "data"]:
                    if key in multimedia and multimedia[key]:
                        if es_guardar:
                            ruta = base64_to_file(multimedia[key])
                            multimedia[key] = ruta
                        else:
                            if multimedia[key] and "base64" in str(multimedia[key]):
                                multimedia[key] = None
    
    return quiz

# La clave JWT esta duplicada con login.py. Habria que centralizarla
# en un solo archivo de configuracion, pero por ahora funciona asi.
# El fallback "clave_extremadamente_secreta_123" solo deberia usarse
# en desarrollo local, no en produccion.
CLAVE_SECRETA = os.getenv("CLAVE_SECRETA", "clave_extremadamente_secreta_123")
ALGORITMO = "HS256"


@router.post("/descarga-offline")
async def descargar_quiz_offline(
    data: DescargaOfflineRequest,
    request: Request,
    db: Session = Depends(get_db),
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    """Descargar un quiz para presentación offline.
    
    Funciona para cualquier sesión que no haya expirado (fecha_fin > ahora).
    Retorna el quiz completo + token JWT con timestamp del servidor.
    """
    # La descarga offline genera un token firmado que luego se valida
    # en sincronizar-offline. Esto evita que alguien se invente
    # resultados sin haber descargado el quiz realmente.
    
    # 1. Validar código de 6 dígitos
    if not data.codigo_acceso.isdigit() or len(data.codigo_acceso) != 6:
        raise HTTPException(
            status_code=400,
            detail="El código debe tener exactamente 6 números"
        )
    
    # 2. Buscar sesión por código
    sesion = db.query(modelos.SesionQuiz).filter(
        modelos.SesionQuiz.ses_codigo_acceso == data.codigo_acceso,
        modelos.SesionQuiz.ses_activo == True
    ).first()
    
    if not sesion:
        raise HTTPException(
            status_code=404,
            detail="Código de acceso inválido o sesión no existe"
        )
    
    # 3. Verificar que no haya expirado
    ahora = datetime.now()
    if sesion.ses_fecha_fin < ahora:
        raise HTTPException(
            status_code=400,
            detail="Esta sesión ya expiró"
        )
    
    # 3b. Verificar que no tenga resultado ya registrado (primera nota permanente)
    resultado_existente = db.query(modelos.Resultado).filter(
        modelos.Resultado.res_fk_usuario == usuario_actual["user_id"],
        modelos.Resultado.res_fk_sesion == sesion.ses_id
    ).first()

    if resultado_existente and resultado_existente.res_hora_final_real is not None:
        raise HTTPException(
            status_code=400,
            detail="Ya completaste este quiz. La primera nota es permanente."
        )
    
    # 4. Obtener quiz completo de MongoDB
    try:
        obj_id = ObjectId(sesion.ses_id_mongo_quiz)
        quiz = await coleccion_quices.find_one({"_id": obj_id})
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al obtener el quiz: {str(e)}"
        )
    
    if not quiz:
        raise HTTPException(
            status_code=404,
            detail="El quiz asociado no existe"
        )
    
    # 5. Serializar quiz para respuesta (procesar imágenes, etc.)
    quiz_serializable = procesar_imagenes_quiz(quiz, es_guardar=False)
    quiz_serializable["_id"] = str(quiz["_id"])
    
    # 7. El token dura 7 dias para cubrir fines de semana y feriados.
    # El timestamp del servidor es la referencia oficial de cuando
    # se descargo, no el reloj del cliente que puede estar alterado.
    timestamp_servidor = ahora.isoformat()
    token_descarga = jwt.encode({
        "sub": str(sesion.ses_id),
        "usuario_id": usuario_actual["user_id"],
        "propósito": "descarga_offline",
        "timestamp_servidor": timestamp_servidor,
        "exp": ahora + timedelta(days=7)
    }, CLAVE_SECRETA, algorithm=ALGORITMO)
    
    # 8. Obtener nombre de la materia
    materia_nombre = None
    try:
        materia = db.query(modelos.Materia).filter(
            modelos.Materia.mat_id == sesion.ses_fk_materia
        ).first()
        if materia:
            materia_nombre = materia.mat_nombre
    except:
        pass
    
    return DescargaOfflineResponse(
        sesion_id=sesion.ses_id,
        quiz_id=sesion.ses_id_mongo_quiz,
        titulo=quiz.get("metadatos", {}).get("titulo", "Quiz"),
        materia_nombre=materia_nombre,
        modo_juego=sesion.ses_puntuacion_tipo or "Igual",
        escala_puntuacion=sesion.ses_escala_puntuacion or 100,
        fecha_inicio=sesion.ses_fecha_inicio.isoformat(),
        fecha_fin=sesion.ses_fecha_fin.isoformat(),
        total_preguntas=len(quiz.get("preguntas", [])),
        quiz_completo=quiz_serializable,
        token_descarga=token_descarga,
        descargado_en=timestamp_servidor
    )


@router.post("/sincronizar-offline")
async def sincronizar_resultado_offline(
    data: SincronizarOfflineRequest,
    db: Session = Depends(get_db)
):
    """Sincronizar un resultado presentado offline.
    
    Valida el token de descarga, verifica la ventana de 24h,
    y guarda el resultado con la regla de 'primera nota permanente'.
    """
    # La ventana de 24h existe para evitar que alguien descargue un
    # quiz, lo resuelva con calma en una semana y suba el resultado
    # como si lo hubiera hecho en vivo. El token de descarga prueba
    # que la descarga fue legitima en su momento.
    try:
        payload = jwt.decode(data.token_descarga, CLAVE_SECRETA, algorithms=[ALGORITMO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="El token de descarga ha expirado")
    except Exception:
        raise HTTPException(status_code=400, detail="Token de descarga inválido")
    
    if payload.get("propósito") != "descarga_offline":
        raise HTTPException(status_code=400, detail="Token inválido para esta operación")
    
    sesion_id = int(payload["sub"])
    usuario_id_offline = payload.get("usuario_id")
    
    # 2. Obtener la sesión
    sesion = db.query(modelos.SesionQuiz).filter(
        modelos.SesionQuiz.ses_id == sesion_id,
        modelos.SesionQuiz.ses_activo == True
    ).first()
    
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    
    # 3. Verificar que no tenga resultado ya registrado (primera nota permanente)
    resultado_existente = db.query(modelos.Resultado).filter(
        modelos.Resultado.res_fk_sesion == sesion_id,
        modelos.Resultado.res_fk_usuario == usuario_id_offline
    ).first()
    
    # La regla de primera nota permanente aplica igual en offline.
    # Si ya completo antes, no importa si la nueva nota es mejor,
    # la que cuenta es la primera. Esto evita que el estudiante
    # borre la app, la reinstale y vuelva a subir el mismo quiz.
    if resultado_existente and resultado_existente.res_hora_final_real is not None:
        raise HTTPException(
            status_code=400,
            detail="Ya tienes un resultado registrado para esta sesión. La primera nota es permanente."
        )
    
    # 4. Validar ventana de 24 horas
    ahora = datetime.now()
    fecha_fin_sesion = sesion.ses_fecha_fin
    limite_sincronizacion = fecha_fin_sesion + timedelta(hours=24)
    
    if ahora > limite_sincronizacion:
        raise HTTPException(
            status_code=400,
            detail="Excedió la ventana de 24 horas para sincronizar el resultado"
        )
    
    # 5. Parsear hora_inicio_local del cliente (sin validar contra ventana de sesión)
    #    El token de descarga ya prueba que la descarga fue válida en su momento.
    #    Usamos el timestamp del servidor del token como referencia de tiempo válido.
    try:
        hora_inicio = datetime.fromisoformat(data.hora_inicio_local.replace('Z', '+00:00'))
        if hora_inicio.tzinfo is not None:
            hora_inicio = hora_inicio.replace(tzinfo=None)
    except Exception:
        hora_inicio = ahora
    
    # 6. Validar tiempo mínimo razonable (anti-trampa)
    # 5 segundos es el minimo para leer una pregunta. Si el estudiante
    # "termino" en menos, probablemente esta manipulando el reloj
    # del dispositivo o enviando datos falsos.
    if data.tiempo_total_ms < 5000:
        raise HTTPException(
            status_code=400,
            detail="Tiempo total sospechosamente bajo. No se puede sincronizar."
        )
    
    # 7. Parsear fecha de finalización
    try:
        hora_fin = datetime.fromisoformat(data.finalizado_en_local.replace('Z', '+00:00'))
        if hora_fin.tzinfo is not None:
            hora_fin = hora_fin.replace(tzinfo=None)
    except Exception:
        hora_fin = ahora
    
    # 8. Obtener usuario para otorgar puntos de app
    usuario = db.query(modelos.Usuario).filter(
        modelos.Usuario.usu_id == usuario_id_offline,
        modelos.Usuario.usu_activo == True
    ).first()
    
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # 9. El resultado_existente existe pero sin hora_final_real, que significa
    # que el estudiante se unio, descargo, pero nunca sincronizo.
    # Actualizamos el registro en vez de crear uno nuevo.
    if resultado_existente:
        resultado_existente.res_nota_final = data.nota_final
        resultado_existente.res_puntos_ganados_app = data.puntos_ganados
        resultado_existente.res_tiempo_total_ms = data.tiempo_total_ms
        resultado_existente.res_informe_fallas = data.informe_fallas if data.informe_fallas else None
        resultado_existente.res_hora_inicio_real = hora_inicio
        resultado_existente.res_hora_final_real = hora_fin
        resultado_existente.res_finalizado_offline = True
        resultado_existente.res_fecha_sincronizacion = ahora
        resultado_existente.res_nota_primera_vez = data.nota_final
        resultado_existente.res_repeticiones = 0
        resultado_existente.res_fecha_primera_vez = ahora
        
        usuario.usu_puntos_app = (usuario.usu_puntos_app or 0) + data.puntos_ganados
        db.commit()
        
        await registrar_auditoria_sesion_fin(
            sesion_id=sesion.ses_id,
            usuario_id=usuario_id_offline,
            nota_final=float(data.nota_final),
            puntos_ganados=data.puntos_ganados,
            es_repeticion=False,
            bd=db,
            codigo_acceso=sesion.ses_codigo_acceso,
            quiz_titulo=None,
            materia_nombre=sesion.materia.mat_nombre if sesion.materia else None,
            escala_puntuacion=sesion.ses_escala_puntuacion,
            modo_juego=sesion.ses_puntuacion_tipo
        )
        try:
            await verificar_y_desbloquear_logros(usuario_id_offline, db)
        except Exception as e:
            print(f"[WARN] Logros (no crítico): {str(e)}")
        
        return SincronizarOfflineResponse(
            mensaje="Resultado sincronizado correctamente",
            resultado_id=resultado_existente.res_id,
            primera_nota=True
        )
    else:
        # ... (continuar con el código existente)
        nuevo = modelos.Resultado(
            res_fk_usuario=usuario_id_offline,
            res_fk_sesion=sesion_id,
            res_nota_final=data.nota_final,
            res_puntos_ganados_app=data.puntos_ganados,
            res_tiempo_total_ms=data.tiempo_total_ms,
            res_informe_fallas=data.informe_fallas if data.informe_fallas else None,
            res_hora_inicio_real=hora_inicio,
            res_hora_final_real=hora_fin,
            res_finalizado_offline=True,
            res_fecha_sincronizacion=ahora,
            res_nota_primera_vez=data.nota_final,
            res_repeticiones=0,
            res_fecha_primera_vez=ahora
        )
        db.add(nuevo)
        
        usuario.usu_puntos_app = (usuario.usu_puntos_app or 0) + data.puntos_ganados
        db.commit()
        db.refresh(nuevo)
        
        await registrar_auditoria_sesion_fin(
            sesion_id=sesion.ses_id,
            usuario_id=usuario_id_offline,
            nota_final=float(data.nota_final),
            puntos_ganados=data.puntos_ganados,
            es_repeticion=False,
            bd=db,
            codigo_acceso=sesion.ses_codigo_acceso,
            quiz_titulo=None,
            materia_nombre=sesion.materia.mat_nombre if sesion.materia else None,
            escala_puntuacion=sesion.ses_escala_puntuacion,
            modo_juego=sesion.ses_puntuacion_tipo
        )
        try:
            await verificar_y_desbloquear_logros(usuario_id_offline, db)
        except Exception as e:
            print(f"[WARN] Logros (no crítico): {str(e)}")
        
        return SincronizarOfflineResponse(
            mensaje="Resultado sincronizado correctamente",
            resultado_id=nuevo.res_id,
            primera_nota=True
        )


# Este endpoint original se quedo sin usar cuando creamos /crear-asignada
# que acepta JSON estructurado en vez de parametros sueltos.
# Lo mantenemos por si algun cliente viejo lo llama, pero ya no se
# usa desde el frontend nuevo.
@router.post("/crear", deprecated=True, dependencies=[Depends(validar_roles([2, 3]))])
async def crear_sesion(id_quiz_mongo: str, id_materia: int, id_profesor: int = 0, request: Request = None, db: Session = Depends(get_db)):
    # 1. Validar si el ID de Mongo tiene formato correcto
    try:
        obj_id = ObjectId(id_quiz_mongo)
    except Exception:
        raise HTTPException(status_code=400, detail="El ID de Mongo no es válido")

    # 2. Verificar existencia en MongoDB (Ajustado a tu estructura de sub-objeto)
    # Buscamos por ID y que en la configuración el campo activo sea True
    quiz_existente = await coleccion_quices.find_one({
        "_id": obj_id, 
        "configuracion.activo": True 
    })

    if not quiz_existente:
        raise HTTPException(
            status_code=404, 
            detail="El Quiz no existe en la biblioteca de Mongo o no está marcado como activo"
        )

    # 3. Generar código aleatorio único
    codigo = generar_codigo_acceso()

    # 4. Guardar en PostgreSQL (Esquema evaluacion).
    # Este codigo legacy no revisa si el codigo ya existe. En teoria
    # 1M combinaciones es suficiente, pero si hay muchas sesiones
    # activas podria haber colision. /crear-asignada mejora esto.
    nueva_sesion = modelos.SesionQuiz(
        ses_codigo_acceso=codigo,
        ses_id_mongo_quiz=id_quiz_mongo,
        ses_fk_materia=id_materia,        ses_puntuacion_tipo='Igual',        ses_fk_profesor=id_profesor,
        ses_estatus="Activo",
        ses_fecha_inicio=datetime.now(),
        ses_fecha_fin=datetime.now(),
        ses_activo=True
    )

    try:
        db.add(nueva_sesion)
        db.commit()
        db.refresh(nueva_sesion)
    except Exception as e:
        db.rollback()
        # Esto te dirá si falla por la FK de materia o por otra cosa en Postgres
        raise HTTPException(
            status_code=500, 
            detail=f"Error al guardar en Postgres: {str(e)}"
        )

    # Obtener el profesor de la materia para auditoría
    materia = db.query(modelos.Materia).filter(
        modelos.Materia.mat_id == id_materia
    ).first()
    profesor_id = materia.mat_fk_profesor if materia else 0

    # Registrar en auditoría
    await registrar_auditoria_sesion_creacion(
        sesion_id=nueva_sesion.ses_id,
        codigo_acceso=codigo,
        quiz_id=id_quiz_mongo,
        materia_id=id_materia,
        profesor_id=profesor_id,
        bd=db,
        quiz_titulo=quiz_existente.get("metadatos", {}).get("titulo", "Quiz") if quiz_existente else None,
        ip_address=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None
    )

    return {
        "status": "success",
        "mensaje": "Sesión de Quiz creada exitosamente",
        "codigo_para_estudiantes": codigo,
        "quiz_titulo": quiz_existente.get("configuracion", {}).get("nombre_quiz")
    }

# Este es el endpoint principal para crear sesiones. A diferencia del
# anterior, recibe un JSON completo, valida fechas, modo de juego,
# y escala de puntuacion. Tambien verifica que la materia exista
# y no este eliminada logicamente.
@router.post("/crear-asignada", dependencies=[Depends(validar_roles([2, 3]))])
async def crear_sesion_asignada(data: SesionAsignadaCrear, request: Request, db: Session = Depends(get_db)):
    # 1. Validar modo de juego
    if data.modo_juego not in ['Igual', 'Dificultad']:
        raise HTTPException(
            status_code=400, 
            detail="modo_juego debe ser 'Igual' o 'Dificultad'"
        )

    if not (1 <= data.escala_puntuacion <= 999):
        raise HTTPException(
            status_code=400,
            detail="escala_puntuacion debe estar entre 1 y 999"
        )

    if data.tipo_publicacion not in ['inmediato', 'agendado']:
        raise HTTPException(
            status_code=400,
            detail="tipo_publicacion debe ser 'inmediato' o 'agendado'"
        )

    if data.tipo_publicacion == 'agendado' and not data.fecha_inicio:
        raise HTTPException(
            status_code=400,
            detail="fecha_inicio es requerida para publicación agendada"
        )

    # 2. Validar si el ID de Mongo tiene formato correcto
    try:
        obj_id = ObjectId(data.id_quiz_mongo)
    except Exception:
        raise HTTPException(status_code=400, detail="El ID de Mongo no es válido")

    # 3. Verificar existencia en MongoDB
    quiz_existente = await coleccion_quices.find_one({"_id": obj_id})

    if not quiz_existente:
        raise HTTPException(
            status_code=404, 
            detail="El Quiz no existe en la biblioteca de Mongo"
        )

    # 4. Generar código aleatorio único
    codigo = generar_codigo_acceso()

    # 5. Si es agendado, la fecha de inicio debe ser futura.
    # No permitimos fechas pasadas porque romperia el flujo
    # de "el quiz se habilita automaticamente a las X horas".
    ahora = datetime.now()
    if data.tipo_publicacion == 'inmediato':
        fecha_inicio = ahora
    else:
        try:
            fecha_inicio = datetime.fromisoformat(data.fecha_inicio)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="La fecha de inicio no tiene un formato ISO 8601 válido (ej: 2026-07-10T14:30:00)"
            )
        if fecha_inicio.tzinfo is not None:
            fecha_inicio = fecha_inicio.replace(tzinfo=None)
        if fecha_inicio <= ahora:
            raise HTTPException(
                status_code=400,
                detail="La fecha de inicio no puede ser anterior a la fecha actual"
            )

    try:
        fecha_fin = datetime.fromisoformat(data.fecha_fin)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="La fecha de fin no tiene un formato ISO 8601 válido (ej: 2026-07-10T15:00:00)"
        )
    if fecha_fin.tzinfo is not None:
        fecha_fin = fecha_fin.replace(tzinfo=None)
    if fecha_fin <= fecha_inicio:
        raise HTTPException(
            status_code=400,
            detail="La fecha de fin debe ser posterior a la fecha de inicio"
        )

    # 6. Guardar en PostgreSQL usando campos existentes.
    # Revisamos la materia explicitamente porque hay soft delete:
    # si el administrador "elimino" la materia, no deberian poder
    # crearse sesiones nuevas en ella.
    # Verificar que la materia no esté eliminada
    materia_check = db.query(modelos.Materia).filter(
        modelos.Materia.mat_id == data.id_materia,
        modelos.Materia.mat_eliminado == False
    ).first()
    if not materia_check:
        raise HTTPException(status_code=400, detail="La materia seleccionada ha sido eliminada o no existe")

    puntuacion_tipo = data.modo_juego
    tipo_sesion = 'agendado' if data.tipo_publicacion == 'agendado' else 'normal'
    nueva_sesion = modelos.SesionQuiz(
        ses_codigo_acceso=codigo,
        ses_id_mongo_quiz=data.id_quiz_mongo,
        ses_fk_materia=data.id_materia,
        ses_fk_profesor=data.id_profesor,
        ses_puntuacion_tipo=puntuacion_tipo,
        ses_escala_puntuacion=data.escala_puntuacion,
        ses_estatus="Espera",
        ses_fecha_inicio=fecha_inicio,
        ses_fecha_fin=fecha_fin,
        ses_activo=True,
        ses_tipo=tipo_sesion
    )

    try:
        db.add(nueva_sesion)
        db.commit()
        db.refresh(nueva_sesion)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, 
            detail=f"Error al guardar en Postgres: {str(e)}"
        )

    # Obtener el profesor de la materia para auditoría
    materia = db.query(modelos.Materia).filter(
        modelos.Materia.mat_id == data.id_materia
    ).first()
    profesor_id = materia.mat_fk_profesor if materia else 0

    # Registrar en auditoría
    await registrar_auditoria_sesion_creacion(
        sesion_id=nueva_sesion.ses_id,
        codigo_acceso=codigo,
        quiz_id=data.id_quiz_mongo,
        materia_id=data.id_materia,
        profesor_id=profesor_id,
        bd=db,
        quiz_titulo=quiz_existente.get("metadatos", {}).get("titulo", "Quiz") if quiz_existente else None,
        ip_address=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None
    )

    return {
        "status": "success",
        "mensaje": "Sesión asignada creada exitosamente",
        "codigo_para_estudiantes": codigo,
        "sesion_id": nueva_sesion.ses_id
    }

# El estudiante llama a este endpoint cuando toca "Comenzar Quiz"
# en la pantalla de preview. Es distinto de /unirse porque aqui
# la sesion ya fue validada antes; solo necesitamos devolver
# el contenido del quiz con sus metadatos de configuracion.
@router.get("/obtener-quiz/{sesion_id}")
async def obtener_quiz_por_sesion(sesion_id: int, request: Request, db: Session = Depends(get_db), usuario_actual: dict = Depends(obtener_usuario_actual)):
    """Obtener los datos del quiz por ID de sesión"""
    try:
        # 1. Buscar sesión por ID
        sesion = db.query(modelos.SesionQuiz).filter(
            modelos.SesionQuiz.ses_id == sesion_id
        ).first()
        
        if not sesion:
            raise HTTPException(
                status_code=404,
                detail="Sesión no encontrada"
            )
        
        # 1b. Validar device_id si hay resultado en progreso.
        # Si el estudiante ya inicio el quiz en otro telefono,
        # lo bloqueamos para evitar que dos personas presenten
        # el mismo quiz con la misma cuenta.
        user_id = usuario_actual.get("user_id")
        resultado = db.query(modelos.Resultado).filter(
            modelos.Resultado.res_fk_usuario == user_id,
            modelos.Resultado.res_fk_sesion == sesion_id,
            modelos.Resultado.res_hora_final_real == None
        ).first()
        if resultado and resultado.res_device_id is not None:
            device_id = request.headers.get("X-Device-Id")
            if device_id and resultado.res_device_id != device_id:
                raise HTTPException(
                    status_code=403,
                    detail="Este quiz ya fue iniciado desde otro dispositivo. Usa el mismo teléfono con el que iniciaste."
                )
        
        # 2. Obtener el quiz de MongoDB
        try:
            obj_id = ObjectId(sesion.ses_id_mongo_quiz)
            quiz = await coleccion_quices.find_one({"_id": obj_id})
        except Exception:
            raise HTTPException(
                status_code=500,
                detail="Error al obtener el quiz"
            )
        
        if not quiz:
            raise HTTPException(
                status_code=404,
                detail="El quiz asociado no existe"
            )
        
        # Convertir ObjectId a string para serialización JSON
        quiz_serializable = procesar_imagenes_quiz(quiz, es_guardar=False)
        quiz_serializable["_id"] = str(quiz["_id"])
        
        return {
            "status": "success",
            "quiz": quiz_serializable,
            "modo_juego": sesion.ses_puntuacion_tipo or 'Igual',
            "escala_puntuacion": sesion.ses_escala_puntuacion or 100,
            "codigo_acceso": sesion.ses_codigo_acceso
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al obtener quiz: {str(e)}"
        )


# El flujo de union es el mas complejo del sistema porque maneja
# multiples estados: sesion agendada, sesion en curso, repeticion,
# dispositivo duplicado, y primera vez. Cada combinacion requiere
# una respuesta diferente para que el frontend sepa que pantalla
# mostrar.
@router.post("/unirse", dependencies=[Depends(obtener_usuario_actual)])
async def unirse_sesion(data: UnirseSesion, request: Request, db: Session = Depends(get_db)):
    # Validar que el código sea de 6 dígitos
    if not data.codigo_acceso.isdigit() or len(data.codigo_acceso) != 6:
        raise HTTPException(
            status_code=400, 
            detail="El código debe tener exactamente 6 números"
        )
    
    # 1. Buscar sesión por código de acceso
    sesion = db.query(modelos.SesionQuiz).filter(
        modelos.SesionQuiz.ses_codigo_acceso == data.codigo_acceso,
        modelos.SesionQuiz.ses_activo == True
    ).first()
    
    if not sesion:
        raise HTTPException(
            status_code=404, 
            detail="Código de acceso inválido o sesión no existe"
        )
    
    # 2. Validar que la sesión no haya expirado
    if sesion.ses_fecha_fin < datetime.now():
        raise HTTPException(
            status_code=400, 
            detail="Esta sesión ha expirado"
        )
    
    # 3. Verificar si el usuario ya tiene un resultado en esta sesión
    resultado_existente = db.query(modelos.Resultado).filter(
        modelos.Resultado.res_fk_usuario == data.id_usuario,
        modelos.Resultado.res_fk_sesion == sesion.ses_id
    ).first()
    
    # 2b. Validar si es sesión agendada con inicio futuro
    if sesion.ses_fecha_inicio > datetime.now():
        if not resultado_existente:
            # Primera vez que se une a esta sesión agendada
            nuevo_resultado = modelos.Resultado(
                res_fk_usuario=data.id_usuario,
                res_fk_sesion=sesion.ses_id,
                res_hora_inicio_real=datetime.now(),
                res_hora_final_real=None,
                res_nota_final=0,
                res_puntos_ganados_app=0,
                res_tiempo_total_ms=0,
                res_informe_fallas=None,
                res_finalizado_offline=False,
                res_nota_primera_vez=None,
                res_repeticiones=0,
                res_fecha_primera_vez=None,
                res_device_id=data.device_id
            )
            db.add(nuevo_resultado)
            db.commit()
        else:
            # Ya se unió antes a esta agendada → validar dispositivo
            if resultado_existente.res_device_id is not None and resultado_existente.res_device_id != data.device_id:
                raise HTTPException(
                    status_code=403,
                    detail="Este quiz ya fue iniciado desde otro dispositivo. Usa el mismo teléfono con el que iniciaste."
                )
            elif resultado_existente.res_device_id is None and data.device_id:
                resultado_existente.res_device_id = data.device_id
                db.commit()
        
        return {
            "status": "pendiente",
            "mensaje": f"Sesión agendada. Comenzará el {sesion.ses_fecha_inicio.strftime('%d/%m/%Y a las %H:%M')}",
            "fecha_inicio": sesion.ses_fecha_inicio.isoformat(),
            "sesion_id": sesion.ses_id,
            "codigo_acceso": sesion.ses_codigo_acceso
        }
    
    # Si el estudiante ya completo el quiz antes, igual le dejamos
    # entrar para que vea sus resultados anteriores. La nota no
    # se sobreescribe, solo se incrementa el contador de repeticiones.
    if resultado_existente and resultado_existente.res_hora_final_real is not None:
        # Ya completó el quiz anteriormente (tiene hora_final_real)
        # Se permite repetir: se retorna el quiz completo + el resultado anterior
        resultado_data = {
            "res_id": resultado_existente.res_id,
            "nota_final": float(resultado_existente.res_nota_final),
            "escala_puntuacion": sesion.ses_escala_puntuacion or 100,
            "puntos_ganados": resultado_existente.res_puntos_ganados_app,
            "hora_final": resultado_existente.res_hora_final_real.isoformat() if resultado_existente.res_hora_final_real else None,
        }
        if resultado_existente.res_device_id is not None and resultado_existente.res_device_id != data.device_id:
            raise HTTPException(
                status_code=403,
                detail="Este quiz ya fue iniciado desde otro dispositivo. Usa el mismo teléfono con el que iniciaste."
            )
        elif resultado_existente.res_device_id is None and data.device_id:
            resultado_existente.res_device_id = data.device_id
        db.commit()
    else:
        resultado_data = None
    
    # 3c. Filtro de dispositivo: si ya hay un resultado en progreso
    # con un device_id distinto, bloqueamos. Esto evita que el
    # estudiante empiece en un telefono, se salga, y continue
    # en otro con mas tiempo.
    if resultado_existente and resultado_existente.res_hora_final_real is None:
        if resultado_existente.res_device_id is not None and resultado_existente.res_device_id != data.device_id:
            raise HTTPException(
                status_code=403,
                detail="Este quiz ya fue iniciado desde otro dispositivo. Usa el mismo teléfono con el que iniciaste."
            )
        elif resultado_existente.res_device_id is None and data.device_id:
            resultado_existente.res_device_id = data.device_id
            db.commit()
    
    # 4. Obtener el quiz de MongoDB
    try:
        obj_id = ObjectId(sesion.ses_id_mongo_quiz)
        quiz = await coleccion_quices.find_one({"_id": obj_id})
    except Exception:
        raise HTTPException(
            status_code=500, 
            detail="Error al obtener el quiz"
        )
    
    if not quiz:
        raise HTTPException(
            status_code=404, 
            detail="El quiz asociado no existe"
        )
    
    # Convertir ObjectId a string para serialización JSON
    quiz_serializable = procesar_imagenes_quiz(quiz, es_guardar=False)
    quiz_serializable["_id"] = str(quiz["_id"])
    
    # 4b. Si el resultado existe pero es pendiente (hora_inicio is None) y ya es la hora
    if resultado_existente and resultado_existente.res_hora_inicio_real is None and sesion.ses_fecha_inicio <= datetime.now():
        resultado_existente.res_hora_inicio_real = datetime.now()
        db.commit()
        # Ahora resultado_existente tiene hora_inicio, el flujo continúa normal
    
    # 5. Cambiar el estatus a "En curso" solo si estaba en "Espera".
    # Esto es importante para el profesor que ve en vivo cuantas
    # sesiones estan activas en este momento. Si ya estaba en curso
    # (porque otro estudiante se unio antes) no lo tocamos.
    if sesion.ses_estatus == "Espera":
        sesion.ses_estatus = "En curso"
        db.commit()
    
    # 6. Registrar inicio de sesión o re-join
    if not resultado_existente:
        # Primera vez que se une: crear tracking + auditoría
        await registrar_auditoria_sesion_inicio(
            sesion_id=sesion.ses_id,
            usuario_id=data.id_usuario,
            quiz_id=sesion.ses_id_mongo_quiz,
            bd=db,
            codigo_acceso=sesion.ses_codigo_acceso,
            quiz_titulo=quiz.get("metadatos", {}).get("titulo", "Quiz"),
            materia_nombre=sesion.materia.mat_nombre if sesion.materia else None,
            profesor_nombre=None
        )
        nuevo_resultado = modelos.Resultado(
            res_fk_usuario=data.id_usuario,
            res_fk_sesion=sesion.ses_id,
            res_hora_inicio_real=datetime.now(),
            res_hora_final_real=None,
            res_nota_final=0,
            res_puntos_ganados_app=0,
            res_tiempo_total_ms=0,
            res_informe_fallas=None,
            res_finalizado_offline=False,
            res_nota_primera_vez=None,
            res_repeticiones=0,
            res_fecha_primera_vez=None,
            res_device_id=data.device_id
        )
        db.add(nuevo_resultado)
        db.commit()
    elif resultado_existente and resultado_existente.res_hora_final_real is None:
        # Re-join: el estudiante inició pero no completó, actualizar hora_inicio para tracking en vivo
        resultado_existente.res_hora_inicio_real = datetime.now()
        db.commit()
    
    response = {
        "status": "success",
        "mensaje": "Te has unido a la sesión exitosamente",
        "sesion_id": sesion.ses_id,
        "quiz_id": str(quiz["_id"]),
        "quiz_titulo": quiz.get("titulo", "Quiz"),
        "modo_juego": sesion.ses_puntuacion_tipo or 'Igual',
        "escala_puntuacion": sesion.ses_escala_puntuacion or 100,
        "fecha_fin": sesion.ses_fecha_fin.isoformat(),
        "quiz": quiz_serializable
    }
    if resultado_data:
        response["ya_completado"] = True
        response["resultado"] = resultado_data
    return response

# Este endpoint tiene la logica mas delicada del sistema porque
# maneja la regla de "primera nota permanente". Hay tres casos:
# A) Repeticion: el estudiante ya completo antes, solo contamos
#    la repeticion pero no cambiamos la nota.
# B) Primera vez: el registro se creo en /unirse, solo lo cerramos.
# C) Fallback: si por algun bug no existe el registro, lo creamos.
@router.post("/resultado", dependencies=[Depends(obtener_usuario_actual)])
async def guardar_resultado(data: ResultadoSesion, request: Request, db: Session = Depends(get_db)):
    """Guardar resultado de un alumno. Si es repetición, actualizar contador pero mantener primera nota."""
    try:
        sesion = db.query(modelos.SesionQuiz).filter(
            modelos.SesionQuiz.ses_id == data.sesion_id
        ).first()
        if not sesion:
            raise HTTPException(status_code=404, detail="Sesión no encontrada")

        # Obtener quiz de MongoDB para datos de auditoría
        quiz_guardar = None
        try:
            from bson import ObjectId as _OID
            quiz_guardar = await coleccion_quices.find_one(
                {"_id": _OID(sesion.ses_id_mongo_quiz)},
                {"metadatos.titulo": 1}
            )
        except Exception:
            pass

        usuario = db.query(modelos.Usuario).filter(
            modelos.Usuario.usu_id == data.id_usuario
        ).first()
        if not usuario:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        resultado_existente = db.query(modelos.Resultado).filter(
            modelos.Resultado.res_fk_usuario == data.id_usuario,
            modelos.Resultado.res_fk_sesion == sesion.ses_id
        ).first()

        # Volvemos a validar el dispositivo aqui, aunque ya se valido
        # en /unirse. Si el estudiante cambio de telefono entre que
        # empezo y termino, el resultado no es valido.
        device_id = request.headers.get("X-Device-Id")
        if resultado_existente and resultado_existente.res_hora_final_real is None and resultado_existente.res_device_id is not None:
            if device_id and resultado_existente.res_device_id != device_id:
                raise HTTPException(
                    status_code=403,
                    detail="Este quiz ya fue iniciado desde otro dispositivo. Usa el mismo teléfono con el que iniciaste."
                )

        if resultado_existente and resultado_existente.res_hora_final_real is not None:
            # CASO A: REPETICIÓN — ya completó antes
            resultado_existente.res_repeticiones = (resultado_existente.res_repeticiones or 0) + 1
            resultado_existente.res_fecha_ultima_repeticion = datetime.now()
            
            if resultado_existente.res_nota_primera_vez is None:
                resultado_existente.res_nota_primera_vez = resultado_existente.res_nota_final
                resultado_existente.res_fecha_primera_vez = resultado_existente.res_hora_final_real
            
            db.commit()
            
            await registrar_auditoria_sesion_fin(
                sesion_id=sesion.ses_id,
                usuario_id=data.id_usuario,
                nota_final=float(data.nota_final),
                puntos_ganados=0,
                es_repeticion=True,
                bd=db,
                codigo_acceso=sesion.ses_codigo_acceso,
                quiz_titulo=quiz_guardar.get("metadatos", {}).get("titulo", "Quiz") if quiz_guardar else None,
                materia_nombre=sesion.materia.mat_nombre if sesion.materia else None,
                escala_puntuacion=sesion.ses_escala_puntuacion,
                modo_juego=sesion.ses_puntuacion_tipo
            )
            
            response = {
                "status": "success",
                "mensaje": "Quiz repetido. Se mantiene la nota de la primera realización.",
                "resultado": {
                    "res_id": resultado_existente.res_id,
                    "nota_final": float(resultado_existente.res_nota_final),
                    "nota_primera_vez": float(resultado_existente.res_nota_primera_vez) if resultado_existente.res_nota_primera_vez else float(resultado_existente.res_nota_final),
                    "repeticiones": resultado_existente.res_repeticiones,
                    "puntos_ganados": resultado_existente.res_puntos_ganados_app,
                    "hora_inicio": resultado_existente.res_hora_inicio_real.isoformat() if resultado_existente.res_hora_inicio_real else None,
                    "hora_fin": resultado_existente.res_hora_final_real.isoformat() if resultado_existente.res_hora_final_real else None
                }
            }
        
        elif resultado_existente and resultado_existente.res_hora_final_real is None:
            # CASO B: PRIMERA VEZ — completando (registro creado al unirse)
            def parsear_fecha(fecha_str):
                if not fecha_str:
                    return None
                try:
                    fecha = datetime.fromisoformat(fecha_str)
                    if fecha.tzinfo is not None:
                        fecha = fecha.replace(tzinfo=None)
                    return fecha
                except (ValueError, TypeError):
                    return None
            
            hora_inicio = parsear_fecha(data.hora_inicio_local) or resultado_existente.res_hora_inicio_real or datetime.now()
            hora_fin = parsear_fecha(data.finalizado_en_local) or datetime.now()
            
            # Detectamos resultados sospechosos: nota 0, tiempo menor a
            # 1 segundo y sin informe de fallas. No lo rechazamos porque
            # podria ser un error legitimo, pero al menos queda registrado
            # en los logs para que el soporte lo revise.
            tiempo_total = data.tiempo_total_ms if data.tiempo_total_ms is not None else 0
            if data.nota_final == 0 and tiempo_total < 1000 and not data.informe_fallas:
                print(f"[WARN] Resultado sospechoso: sesion={data.sesion_id}, usuario={data.id_usuario}, nota=0, tiempo={tiempo_total}ms")
                # No rechazar, pero al menos registrar el warning
            
            resultado_existente.res_nota_final = data.nota_final
            resultado_existente.res_puntos_ganados_app = data.puntos_ganados
            resultado_existente.res_tiempo_total_ms = data.tiempo_total_ms
            resultado_existente.res_informe_fallas = data.informe_fallas
            resultado_existente.res_hora_inicio_real = hora_inicio
            resultado_existente.res_hora_final_real = hora_fin
            resultado_existente.res_finalizado_offline = data.es_offline
            # Guardamos la nota como "primera vez" explicitamente
            # para que el frontend pueda mostrar "Tu primera nota: X"
            # aunque el estudiante repita el quiz despues.
            resultado_existente.res_nota_primera_vez = data.nota_final
            resultado_existente.res_repeticiones = 0
            resultado_existente.res_fecha_primera_vez = datetime.now()
            
            # Los puntos de la app se suman solo en la primera
            # realizacion. En repeticiones no se suman puntos
            # para evitar farming.
            usuario.usu_puntos_app = (usuario.usu_puntos_app or 0) + data.puntos_ganados
            db.commit()
            
            await registrar_auditoria_sesion_fin(
                sesion_id=sesion.ses_id,
                usuario_id=data.id_usuario,
                nota_final=float(data.nota_final),
                puntos_ganados=data.puntos_ganados,
                es_repeticion=False,
                bd=db,
                codigo_acceso=sesion.ses_codigo_acceso,
                quiz_titulo=quiz_guardar.get("metadatos", {}).get("titulo", "Quiz") if quiz_guardar else None,
                materia_nombre=sesion.materia.mat_nombre if sesion.materia else None,
                escala_puntuacion=sesion.ses_escala_puntuacion,
                modo_juego=sesion.ses_puntuacion_tipo
            )
            
            response = {
                "status": "success",
                "mensaje": "Resultado guardado exitosamente",
                "resultado": {
                    "res_id": resultado_existente.res_id,
                    "nota_final": float(resultado_existente.res_nota_final),
                    "nota_primera_vez": float(resultado_existente.res_nota_primera_vez),
                    "repeticiones": resultado_existente.res_repeticiones,
                    "puntos_ganados": resultado_existente.res_puntos_ganados_app,
                    "hora_inicio": resultado_existente.res_hora_inicio_real.isoformat() if resultado_existente.res_hora_inicio_real else None,
                    "hora_fin": resultado_existente.res_hora_final_real.isoformat() if resultado_existente.res_hora_final_real else None
                },
                "usuario": {
                    "usu_id": usuario.usu_id,
                    "usu_puntos_app": usuario.usu_puntos_app
                }
            }
        
        else:
            # CASO C: FALLBACK — no existe resultado (no debería pasar, pero por si acaso).
            # Esto puede ocurrir si el estudiante se salta /unirse y
            # llama directamente a /resultado con datos inventados.
            # Creamos el registro completo como autocontencion.
            def parsear_fecha(fecha_str):
                if not fecha_str:
                    return None
                try:
                    fecha = datetime.fromisoformat(fecha_str)
                    if fecha.tzinfo is not None:
                        fecha = fecha.replace(tzinfo=None)
                    return fecha
                except (ValueError, TypeError):
                    return None
            
            hora_inicio = parsear_fecha(data.hora_inicio_local) or datetime.now()
            hora_fin = parsear_fecha(data.finalizado_en_local) or datetime.now()
            
            nuevo_resultado = modelos.Resultado(
                res_fk_usuario=data.id_usuario,
                res_fk_sesion=sesion.ses_id,
                res_nota_final=data.nota_final,
                res_puntos_ganados_app=data.puntos_ganados,
                res_tiempo_total_ms=data.tiempo_total_ms,
                res_informe_fallas=data.informe_fallas,
                res_hora_inicio_real=hora_inicio,
                res_hora_final_real=hora_fin,
                res_finalizado_offline=data.es_offline,
                res_nota_primera_vez=data.nota_final,
                res_repeticiones=0,
                res_fecha_primera_vez=datetime.now(),
                res_device_id=device_id
            )
            
            db.add(nuevo_resultado)
            usuario.usu_puntos_app = (usuario.usu_puntos_app or 0) + data.puntos_ganados
            db.commit()
            db.refresh(nuevo_resultado)
            
            await registrar_auditoria_sesion_fin(
                sesion_id=sesion.ses_id,
                usuario_id=data.id_usuario,
                nota_final=float(data.nota_final),
                puntos_ganados=data.puntos_ganados,
                es_repeticion=False,
                bd=db,
                codigo_acceso=sesion.ses_codigo_acceso,
                quiz_titulo=quiz_guardar.get("metadatos", {}).get("titulo", "Quiz") if quiz_guardar else None,
                materia_nombre=sesion.materia.mat_nombre if sesion.materia else None,
                escala_puntuacion=sesion.ses_escala_puntuacion,
                modo_juego=sesion.ses_puntuacion_tipo
            )
            
            response = {
                "status": "success",
                "mensaje": "Resultado guardado exitosamente",
                "resultado": {
                    "res_id": nuevo_resultado.res_id,
                    "nota_final": float(nuevo_resultado.res_nota_final),
                    "nota_primera_vez": float(nuevo_resultado.res_nota_primera_vez),
                    "repeticiones": nuevo_resultado.res_repeticiones,
                    "puntos_ganados": nuevo_resultado.res_puntos_ganados_app,
                    "hora_inicio": nuevo_resultado.res_hora_inicio_real.isoformat() if nuevo_resultado.res_hora_inicio_real else None,
                    "hora_fin": nuevo_resultado.res_hora_final_real.isoformat() if nuevo_resultado.res_hora_final_real else None
                },
                "usuario": {
                    "usu_id": usuario.usu_id,
                    "usu_puntos_app": usuario.usu_puntos_app
                }
            }
        # La verificacion de logros va fuera del try principal para
        # que si falla, no afecte el resultado que ya se guardo.
        # Los logros son cosmeticos, el resultado es lo importante.
        try:
            await verificar_y_desbloquear_logros(data.id_usuario, db)
        except Exception as e:
            print(f"[WARN] Logros (no crítico): {str(e)}")
        return response
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar resultado: {str(e)}")

# Este endpoint lo llama el frontend DESPUES de cada respuesta,
# no al final. Sirve para que el profesor vea en la pantalla de
# "En Vivo" como va cada estudiante en tiempo real. Si no se
# llama, el progreso se pierde y solo queda el resultado final.
@router.patch("/progreso", dependencies=[Depends(obtener_usuario_actual)])
async def actualizar_progreso(data: ProgresoSesion, db: Session = Depends(get_db)):
    """Actualiza el progreso del estudiante en tiempo real (llamado tras cada respuesta)"""
    try:
        resultado = db.query(modelos.Resultado).filter(
            modelos.Resultado.res_fk_usuario == data.id_usuario,
            modelos.Resultado.res_fk_sesion == data.sesion_id,
            modelos.Resultado.res_hora_final_real.is_(None)
        ).first()
        
        if not resultado:
            raise HTTPException(
                status_code=404,
                detail="No hay sesión en curso para este estudiante"
            )
        
        resultado.res_nota_final = data.puntos_actuales
        resultado.res_informe_fallas = {
            "pregunta_actual": data.pregunta_actual,
            "total_preguntas": data.total_preguntas,
            "ultima_actualizacion": datetime.utcnow().isoformat()
        }
        db.commit()
        
        return {"status": "success", "puntos_actuales": data.puntos_actuales}
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al actualizar progreso: {str(e)}")

# El frontend llama a esto cuando el estudiante abre su dashboard
# para mostrar cuantos quices tiene sin terminar. Filtramos por
# res_hora_final_real IS NULL, que es el indicador de "en progreso".
@router.get("/pendientes/{usuario_id}", dependencies=[Depends(obtener_usuario_actual)])
async def obtener_sesiones_pendientes(usuario_id: int, db: Session = Depends(get_db)):
    """Devuelve las sesiones no completadas del estudiante (pendientes + en curso)"""
    try:
        pendientes = db.query(modelos.Resultado, modelos.SesionQuiz).join(
            modelos.SesionQuiz,
            modelos.Resultado.res_fk_sesion == modelos.SesionQuiz.ses_id
        ).filter(
            modelos.Resultado.res_fk_usuario == usuario_id,
            modelos.Resultado.res_hora_final_real.is_(None),
            modelos.SesionQuiz.ses_eliminado == False,
            modelos.SesionQuiz.ses_activo == True
        ).all()
        
        pendientes_data = []
        for res, sesion in pendientes:
            # Obtener título del quiz desde MongoDB
            quiz_titulo = "Quiz"
            try:
                quiz = await coleccion_quices.find_one(
                    {"_id": ObjectId(sesion.ses_id_mongo_quiz)},
                    {"metadatos.titulo": 1}
                )
                if quiz:
                    quiz_titulo = quiz.get("metadatos", {}).get("titulo", "Quiz")
            except Exception:
                pass
            
            pendientes_data.append({
                "resultado_id": res.res_id,
                "sesion_id": sesion.ses_id,
                "codigo_acceso": sesion.ses_codigo_acceso,
                "fecha_inicio": sesion.ses_fecha_inicio.isoformat(),
                "fecha_fin": sesion.ses_fecha_fin.isoformat(),
                "quiz_titulo": quiz_titulo,
                "quiz_id": sesion.ses_id_mongo_quiz
            })
        
        return {"status": "success", "pendientes": pendientes_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Historial completo de resultados del estudiante. Incluye el titulo
# del quiz (que vive en MongoDB) y el nombre de la materia (PostgreSQL).
# Por eso hacemos un join triple: Resultado -> SesionQuiz -> Materia.
@router.get("/mis-resultados/{usuario_id}", dependencies=[Depends(obtener_usuario_actual)])
async def obtener_resultados_usuario(usuario_id: int, db: Session = Depends(get_db), usuario_actual: dict = Depends(obtener_usuario_actual)):
    """Obtener el historial de resultados de un estudiante."""
    try:
        # VALIDACIÓN DE PERMISOS: Solo el estudiante dueño de los resultados o un Master pueden verlos
        if usuario_actual["rol_id"] != 3 and usuario_actual["user_id"] != usuario_id:
            raise HTTPException(
                status_code=403, 
                detail="No tienes permiso para ver estos resultados"
            )

        resultados = db.query(modelos.Resultado, modelos.SesionQuiz, modelos.Materia).join(
            modelos.SesionQuiz, modelos.Resultado.res_fk_sesion == modelos.SesionQuiz.ses_id
        ).join(
            modelos.Materia, modelos.SesionQuiz.ses_fk_materia == modelos.Materia.mat_id
        )        .filter(
            modelos.Resultado.res_fk_usuario == usuario_id,
            modelos.Resultado.res_hora_final_real.isnot(None)
        ).order_by(modelos.Resultado.res_hora_final_real.desc())

        resultados_data = []
        for res, sesion, materia in resultados:
            quiz_title = None
            try:
                obj_id = ObjectId(sesion.ses_id_mongo_quiz)
                quiz = await coleccion_quices.find_one({"_id": obj_id}, {"metadatos.titulo": 1})
                quiz_title = quiz.get("metadatos", {}).get("titulo") if quiz else None
            except Exception:
                quiz_title = None

            resultados_data.append({
                "res_id": res.res_id,
                "sesion_id": sesion.ses_id,
                "ses_codigo_acceso": sesion.ses_codigo_acceso,
                "quiz_id": sesion.ses_id_mongo_quiz,
                "quiz_titulo": quiz_title or "Quiz",
                "materia_nombre": materia.mat_nombre,
                "nota_final": float(res.res_nota_final),
                "puntos_ganados": res.res_puntos_ganados_app,
                "hora_fin": res.res_hora_final_real.isoformat() if res.res_hora_final_real else None,
                "ses_puntuacion_tipo": sesion.ses_puntuacion_tipo or 'Igual',
                "escala_puntuacion": sesion.ses_escala_puntuacion or 100
            })

        return {
            "status": "success",
            "resultados": resultados_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener resultados: {str(e)}")

# Las estadisticas normalizan todas las notas a escala 20 para que
# sean comparables entre si. Si un quiz era de 100 puntos y otro de
# 20, el promedio en bruto no tendria sentido. La normalizacion
# resuelve eso: (nota / escala) * 20.
@router.get("/estadisticas/{usuario_id}", dependencies=[Depends(obtener_usuario_actual)])
async def obtener_estadisticas_estudiante(usuario_id: int, db: Session = Depends(get_db), usuario_actual: dict = Depends(obtener_usuario_actual)):
    """Obtener estadísticas generales de un estudiante."""
    try:
        # VALIDACIÓN DE PERMISOS: Solo el estudiante dueño de las estadísticas o un Master pueden verlas
        if usuario_actual["rol_id"] != 3 and usuario_actual["user_id"] != usuario_id:
            raise HTTPException(
                status_code=403, 
                detail="No tienes permiso para ver estas estadísticas"
            )

        # Obtener usuario
        usuario = db.query(modelos.Usuario).filter(
            modelos.Usuario.usu_id == usuario_id
        ).first()
        
        if not usuario:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
        # Obtener todos los resultados del estudiante
        resultados = db.query(modelos.Resultado).filter(
            modelos.Resultado.res_fk_usuario == usuario_id,
            modelos.Resultado.res_hora_final_real.isnot(None)
        ).all()
        
        quices_completados = len(resultados)
        
        # Calcular promedio normalizando cada nota a escala 20
        if quices_completados > 0:
            notas_normalizadas = []
            for res in resultados:
                # Obtener la escala de la sesión
                sesion = db.query(modelos.SesionQuiz).filter(
                    modelos.SesionQuiz.ses_id == res.res_fk_sesion
                ).first()
                
                escala = sesion.ses_escala_puntuacion if sesion else 100
                
                # Normalizar nota a escala 20: (nota / escala) * 20
                # La nota normalizada nunca puede superar 20
                nota_normalizada = min((float(res.res_nota_final) / escala) * 20, 20)
                notas_normalizadas.append(nota_normalizada)
            
            promedio = sum(notas_normalizadas) / len(notas_normalizadas)
        else:
            promedio = 0
        
        return {
            "status": "success",
            "estadisticas": {
                "puntos": usuario.usu_puntos_app or 0,
                "quices_completados": quices_completados,
                "promedio": round(promedio, 2)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener estadísticas: {str(e)}")

# Los logros se definen como una lista fija en el codigo porque son
# solo 5. Si crecieran a 20 o mas, habria que moverlos a la base
# de datos. Pero por ahora, tenerlos hardcodeados es mas simple
# y evita consultas extras.
@router.get("/logros/{usuario_id}", dependencies=[Depends(obtener_usuario_actual)])
async def obtener_logros_estudiante(usuario_id: int, db: Session = Depends(get_db), usuario_actual: dict = Depends(obtener_usuario_actual)):
    """Obtener logros desbloqueados y disponibles de un estudiante."""
    try:
        # VALIDACIÓN DE PERMISOS: Solo el estudiante dueño de los logros o un Master pueden verlos
        if usuario_actual["rol_id"] != 3 and usuario_actual["user_id"] != usuario_id:
            raise HTTPException(
                status_code=403, 
                detail="No tienes permiso para ver estos logros"
            )

        # Definición de logros disponibles
        logros_disponibles = [
            {
                "codigo": "primer_quiz",
                "titulo": "Primer Quiz",
                "descripcion": "Completaste tu primer quiz",
                "icono": "flag",
                "color": "#4CAF50",
                "puntos_recompensa": 50
            },
            {
                "codigo": "perfect_score",
                "titulo": "Perfect Score",
                "descripcion": "Obtuviste 100 puntos en un quiz",
                "icono": "star",
                "color": "#FF9800",
                "puntos_recompensa": 100
            },
            {
                "codigo": "speed_demon",
                "titulo": "Speed Demon",
                "descripcion": "Completaste un quiz en menos de 1 minuto",
                "icono": "flash",
                "color": "#2196F3",
                "puntos_recompensa": 75
            },
            {
                "codigo": "quiz_master",
                "titulo": "Quiz Master",
                "descripcion": "Completaste 10 quizes",
                "icono": "trophy",
                "color": "#9C27B0",
                "puntos_recompensa": 200
            },
            {
                "codigo": "five_quizes",
                "titulo": "En Marcha",
                "descripcion": "Completaste 5 quizes",
                "icono": "rocket",
                "color": "#00BCD4",
                "puntos_recompensa": 100
            }
        ]
        
        # Obtener logros desbloqueados del usuario
        logros_desbloqueados_db = db.query(modelos.LogroUsuario).filter(
            modelos.LogroUsuario.log_fk_usuario == usuario_id
        ).all()
        
        logros_desbloqueados_codigos = {log.log_codigo for log in logros_desbloqueados_db}
        
        # Construir respuesta con estado de cada logro
        logros_respuesta = []
        for logro in logros_disponibles:
            esta_desbloqueado = logro["codigo"] in logros_desbloqueados_codigos
            logro_info = {
                **logro,
                "desbloqueado": esta_desbloqueado,
                "fecha_desbloqueo": None
            }
            
            if esta_desbloqueado:
                logro_db = next((l for l in logros_desbloqueados_db if l.log_codigo == logro["codigo"]), None)
                if logro_db:
                    logro_info["fecha_desbloqueo"] = logro_db.log_fecha_desbloqueo.isoformat()
            
            logros_respuesta.append(logro_info)
        
        # Calcular total de puntos de logros desbloqueados
        total_puntos_logros = sum(log.log_puntos_recompensa or 0 for log in logros_desbloqueados_db)
        
        return {
            "status": "success",
            "logros": logros_respuesta,
            "total_desbloqueados": len(logros_desbloqueados_codigos),
            "total_logros": len(logros_disponibles),
            "total_puntos_logros": total_puntos_logros
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener logros: {str(e)}")


# Endpoint de administracion que crea la tabla de logros si no existe.
# Se usa en el despliegue inicial para asegurar que el esquema
# de BD este completo sin tener que ejecutar migraciones aparte.
@router.post("/verificar-tabla-logros", dependencies=[Depends(validar_roles([3]))])
async def verificar_tabla_logros(db: Session = Depends(get_db)):
    """Verificar y crear la tabla de logros si no existe."""
    try:
        from sqlalchemy import text
        
        # Verificar si la tabla existe
        result = db.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'evaluacion' 
                AND table_name = 'tbl_logros_usuario'
            );
        """))
        tabla_existe = result.scalar()
        
        if not tabla_existe:
            # Ejecutar el SQL de creación
            db.execute(text("""
                CREATE TABLE evaluacion.tbl_logros_usuario (
                    log_id SERIAL PRIMARY KEY,
                    log_fk_usuario INTEGER NOT NULL,
                    log_codigo VARCHAR(50) NOT NULL,
                    log_fecha_desbloqueo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    log_puntos_recompensa INTEGER DEFAULT 0,
                    CONSTRAINT fk_logros_usuario FOREIGN KEY (log_fk_usuario) REFERENCES seguridad.tbl_usuarios(usu_id) ON DELETE CASCADE,
                    CONSTRAINT uq_usuario_logro UNIQUE (log_fk_usuario, log_codigo)
                );
            """))
            
            # Crear índices
            db.execute(text("""
                CREATE INDEX idx_logros_usuario_codigo ON evaluacion.tbl_logros_usuario(log_codigo);
            """))
            
            db.execute(text("""
                CREATE INDEX idx_logros_usuario_usuario ON evaluacion.tbl_logros_usuario(log_fk_usuario);
            """))
            
            db.commit()
            return {
                "status": "success",
                "mensaje": "Tabla tbl_logros_usuario creada exitosamente",
                "tabla_existe": False
            }
        else:
            return {
                "status": "success",
                "mensaje": "La tabla tbl_logros_usuario ya existe",
                "tabla_existe": True
            }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al verificar tabla de logros: {str(e)}")

# Esta funcion se llama desde guardar_resultado() y desde
# sincronizar_resultado_offline(). Revisa si el estudiante cumple
# las condiciones para cada logro y, si es asi, lo desbloquea.
# Es importante NOTA: los puntos de recompensa del logro NO se suman
# aqui porque los puntos del quiz ya se entregaron en /resultado.
# Si sumaramos puntos de logro aqui, estariamos duplicando.
async def verificar_y_desbloquear_logros(usuario_id: int, db: Session):
    """
    Verificar y desbloquear logros automáticamente después de un resultado.
    
    NOTA: Esta función SOLO registra el logro (tbl_logros_usuario).
    Los puntos de recompensa NO se suman aquí porque ya se entregaron
    en el endpoint /resultado a través de 'puntos_ganados_app'.
    Evitar duplicar puntos: los puntos del quiz ya se sumaron en guardar_resultado().
    """
    NOMBRES_LOGROS = {
        "primer_quiz": "Primer Quiz",
        "perfect_score": "Puntuación Perfecta",
        "speed_demon": "Velocidad Demoníaca",
        "five_quizes": "5 Quizzes",
        "quiz_master": "Quiz Master"
    }
    logros_nuevos = []
    try:
        # Obtener todos los resultados del usuario (solo la primera vez)
        resultados = db.query(modelos.Resultado).filter(
            modelos.Resultado.res_fk_usuario == usuario_id,
            modelos.Resultado.res_repeticiones == 0,
            modelos.Resultado.res_hora_final_real.isnot(None)
        ).all()
        
        total_quizes = len(resultados)
        
        # Logro: Primer Quiz.
        # Se desbloquea automaticamente al completar el primer quiz.
        # Es el unico logro que TODOS los estudiantes obtienen.
        if total_quizes >= 1:
            logro_existente = db.query(modelos.LogroUsuario).filter(
                modelos.LogroUsuario.log_fk_usuario == usuario_id,
                modelos.LogroUsuario.log_codigo == "primer_quiz"
            ).first()
            
            if not logro_existente:
                nuevo_logro = modelos.LogroUsuario(
                    log_fk_usuario=usuario_id,
                    log_codigo="primer_quiz",
                    log_puntos_recompensa=50
                )
                db.add(nuevo_logro)
                logros_nuevos.append(("primer_quiz", 50))
        
        # Logro: Perfect Score.
        # La nota debe ser mayor o igual a la escala de la sesion.
        # Si la escala es 100, necesita 100 puntos. Si es 20, necesita 20.
        # No es lo mismo sacar 100 en un quiz de 10 preguntas que en uno
        # de 50, pero la logica es proporcional.
        for res in resultados:
            nota_final = float(res.res_nota_final) if res.res_nota_final else 0
            # Obtener la escala de puntuación de la sesión asociada
            sesion = db.query(modelos.SesionQuiz).filter(
                modelos.SesionQuiz.ses_id == res.res_fk_sesion
            ).first()
            escala = sesion.ses_escala_puntuacion if sesion else 100
            if nota_final >= escala:
                logro_existente = db.query(modelos.LogroUsuario).filter(
                    modelos.LogroUsuario.log_fk_usuario == usuario_id,
                    modelos.LogroUsuario.log_codigo == "perfect_score"
                ).first()
                
                if not logro_existente:
                    nuevo_logro = modelos.LogroUsuario(
                        log_fk_usuario=usuario_id,
                        log_codigo="perfect_score",
                        log_puntos_recompensa=100
                    )
                    db.add(nuevo_logro)
                    logros_nuevos.append(("perfect_score", 100))
                break  # Solo desbloquear una vez
        
        # Logro: Speed Demon.
        # Menos de 60 segundos para todo el quiz. Eso significa
        # que el estudiante respondio cada pregunta en promedio
        # en menos de 6 segundos si eran 10 preguntas. Es intencional
        # que sea dificil de conseguir.
        for res in resultados:
            tiempo_ms = res.res_tiempo_total_ms or 0
            if tiempo_ms > 0 and tiempo_ms < 60000:
                logro_existente = db.query(modelos.LogroUsuario).filter(
                    modelos.LogroUsuario.log_fk_usuario == usuario_id,
                    modelos.LogroUsuario.log_codigo == "speed_demon"
                ).first()
                
                if not logro_existente:
                    nuevo_logro = modelos.LogroUsuario(
                        log_fk_usuario=usuario_id,
                        log_codigo="speed_demon",
                        log_puntos_recompensa=75
                    )
                    db.add(nuevo_logro)
                    logros_nuevos.append(("speed_demon", 75))
                break
        
        # Logro: 5 Quizes
        if total_quizes >= 5:
            logro_existente = db.query(modelos.LogroUsuario).filter(
                modelos.LogroUsuario.log_fk_usuario == usuario_id,
                modelos.LogroUsuario.log_codigo == "five_quizes"
            ).first()
            
            if not logro_existente:
                nuevo_logro = modelos.LogroUsuario(
                    log_fk_usuario=usuario_id,
                    log_codigo="five_quizes",
                    log_puntos_recompensa=100
                )
                db.add(nuevo_logro)
                logros_nuevos.append(("five_quizes", 100))
        
        # Logro: Quiz Master (10 quizes)
        if total_quizes >= 10:
            logro_existente = db.query(modelos.LogroUsuario).filter(
                modelos.LogroUsuario.log_fk_usuario == usuario_id,
                modelos.LogroUsuario.log_codigo == "quiz_master"
            ).first()
            
            if not logro_existente:
                nuevo_logro = modelos.LogroUsuario(
                    log_fk_usuario=usuario_id,
                    log_codigo="quiz_master",
                    log_puntos_recompensa=200
                )
                db.add(nuevo_logro)
                logros_nuevos.append(("quiz_master", 200))
        
        db.commit()
        
        for codigo, puntos in logros_nuevos:
            await registrar_auditoria_logro_obtenido(
                usuario_id=usuario_id,
                logro_codigo=codigo,
                logro_nombre=NOMBRES_LOGROS.get(codigo, codigo),
                puntos_recompensa=puntos,
                bd=db
            )
        
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Logros: {str(e)}")
        import traceback
        traceback.print_exc()

# Esquema para respuesta de sesión
class SesionResponse(BaseModel):
    ses_id: int
    ses_codigo_acceso: str
    ses_id_mongo_quiz: str
    ses_fk_materia: int
    ses_nombre_grupo: str
    ses_puntuacion_tipo: str
    ses_estatus: str
    ses_fecha_inicio: str
    ses_fecha_fin: str
    ses_activo: bool
    ses_escala_puntuacion: int
    quiz_titulo: str
    materia_nombre: str
    total_participantes: int
    total_finalizados: int
    ses_eliminado: bool = False
    ses_estado_display: str = "Activo"

# Este es el endpoint que alimenta la pantalla "Disponibles" del
# estudiante. Solo muestra sesiones activas, dentro del rango de
# fechas, y de materias en las que el estudiante esta inscrito.
# No mostramos sesiones de materias en las que no esta inscrito.
@router.get("/disponibles/{usuario_id}", dependencies=[Depends(obtener_usuario_actual)])
async def obtener_sesiones_disponibles(usuario_id: int, db: Session = Depends(get_db)):
    """Devuelve las sesiones activas en las materias del estudiante (para sección Disponibles en quices.tsx)"""
    try:
        # Obtener materias del estudiante
        inscripciones = db.query(modelos.Inscripcion).filter(
            modelos.Inscripcion.ins_fk_alumno == usuario_id
        ).all()
        materias_ids = [ins.ins_fk_materia for ins in inscripciones]

        if not materias_ids:
            return {"status": "success", "sesiones": []}

        # Obtener sesiones activas en esas materias (que no sean del estudiante)
        ahora = datetime.now()
        sesiones = db.query(
            modelos.SesionQuiz, modelos.Materia, modelos.Usuario
        ).join(
            modelos.Materia, modelos.SesionQuiz.ses_fk_materia == modelos.Materia.mat_id
        ).join(
            modelos.Usuario, modelos.SesionQuiz.ses_fk_profesor == modelos.Usuario.usu_id
        ).filter(
            modelos.SesionQuiz.ses_fk_materia.in_(materias_ids),
            modelos.Materia.mat_eliminado == False,
            modelos.SesionQuiz.ses_activo == True,
            modelos.SesionQuiz.ses_fecha_inicio <= ahora,
            modelos.SesionQuiz.ses_fecha_fin > ahora
        ).all()

        return {
            "status": "success",
            "sesiones": [{
                "sesion_id": s.ses_id,
                "codigo_acceso": s.ses_codigo_acceso,
                "materia_nombre": m.mat_nombre,
                "ses_fecha_fin": s.ses_fecha_fin.isoformat(),
                "quiz_id": s.ses_id_mongo_quiz,
                "profesor_nombre": f"{u.usu_nombre} {u.usu_apellido}"
            } for s, m, u in sesiones]
        }
    except Exception as e:
        print(f"[ERROR] Sesiones disponibles: {e}")
        return {"status": "error", "sesiones": []}

# El listado de sesiones del profesor incluye filtros por estatus
# para que pueda ver las activas, expiradas, finalizadas o eliminadas.
# Cada sesion lleva informacion enriquecida: titulo del quiz desde
# MongoDB, nombre de materia, y conteo de participantes/finalizados.
@router.get("/listar", dependencies=[Depends(validar_roles([2, 3]))])
async def listar_sesiones_profesor(
    id_profesor: int,
    estatus: str = None,  # "Activo", "Expirado", "Finalizado", o None para todos
    db: Session = Depends(get_db),
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    """Listar sesiones de un profesor con filtros opcionales"""
    try:
        # VALIDACIÓN DE PERMISOS: Solo el profesor dueño de las sesiones o un Master pueden verlas
        if usuario_actual["rol_id"] != 3 and usuario_actual["user_id"] != id_profesor:
            raise HTTPException(
                status_code=403, 
                detail="No tienes permiso para ver las sesiones de otro profesor"
            )
        
        # Query base para sesiones: solo las creadas por este profesor
        query = db.query(modelos.SesionQuiz, modelos.Materia, modelos.Usuario).join(
            modelos.Materia, modelos.SesionQuiz.ses_fk_materia == modelos.Materia.mat_id, isouter=True
        ).join(
            modelos.Usuario, modelos.Materia.mat_fk_profesor == modelos.Usuario.usu_id, isouter=True
        ).filter(
            modelos.SesionQuiz.ses_fk_profesor == id_profesor
        )
        
        # Los filtros de estatus se aplican con logica compuesta:
        # - "Activo": no eliminada, activa, fecha_inicio <= ahora < fecha_fin
        # - "Expirado": fecha_fin ya paso pero sigue activa (nadie la desactivo)
        # - "Finalizado": fue desactivada manualmente por el profesor
        # - "Eliminado": soft delete, ses_eliminado = True
        # - Sin filtro: excluye eliminadas porque el profesor ya no las ve
        if estatus:
            if estatus == "Activo":
                query = query.filter(
                    modelos.SesionQuiz.ses_eliminado == False,
                    modelos.SesionQuiz.ses_activo == True,
                    modelos.SesionQuiz.ses_fecha_inicio <= datetime.now(),
                    modelos.SesionQuiz.ses_fecha_fin > datetime.now()
                )
            elif estatus == "Expirado":
                query = query.filter(
                    modelos.SesionQuiz.ses_eliminado == False,
                    modelos.SesionQuiz.ses_fecha_fin <= datetime.now(),
                    modelos.SesionQuiz.ses_activo == True
                )
            elif estatus == "Finalizado":
                query = query.filter(
                    modelos.SesionQuiz.ses_eliminado == False,
                    modelos.SesionQuiz.ses_activo == False
                )
            elif estatus == "Eliminado":
                query = query.filter(modelos.SesionQuiz.ses_eliminado == True)
        else:
            # Sin filtro: excluir eliminadas por defecto
            query = query.filter(modelos.SesionQuiz.ses_eliminado == False)
        
        sesiones_results = query.order_by(modelos.SesionQuiz.ses_fecha_inicio.desc()).all()
        
        sesiones_response = []
        for sesion, materia_obj, profesor_obj in sesiones_results:
            # Obtener información del quiz
            try:
                obj_id = ObjectId(sesion.ses_id_mongo_quiz)
                quiz = await coleccion_quices.find_one({"_id": obj_id})
                quiz_titulo = quiz.get("metadatos", {}).get("titulo", "Quiz") if quiz else "Quiz no encontrado"
            except:
                quiz_titulo = "Quiz no encontrado"
            
            # Obtener nombre de la materia y profesor de los objetos ya cargados
            materia_nombre = materia_obj.mat_nombre
            
            # Contar participantes
            total_participantes = db.query(modelos.Resultado).filter(
                modelos.Resultado.res_fk_sesion == sesion.ses_id
            ).count()
            
            # Contar finalizados - simplificado para evitar errores
            total_finalizados = 0
            try:
                total_finalizados = db.query(modelos.Resultado).filter(
                    modelos.Resultado.res_fk_sesion == sesion.ses_id,
                    modelos.Resultado.res_hora_final_real.isnot(None)
                ).count()
            except:
                pass  # Si hay error en la consulta, usar 0
            
            sesiones_response.append(SesionResponse(
                ses_id=sesion.ses_id,
                ses_codigo_acceso=sesion.ses_codigo_acceso,
                ses_id_mongo_quiz=sesion.ses_id_mongo_quiz,
                ses_fk_materia=sesion.ses_fk_materia,
                ses_nombre_grupo=sesion.ses_nombre_grupo or quiz_titulo,
                ses_puntuacion_tipo=sesion.ses_puntuacion_tipo or "Igual",
                ses_estatus=sesion.ses_estatus,
                ses_fecha_inicio=sesion.ses_fecha_inicio.isoformat(),
                ses_fecha_fin=sesion.ses_fecha_fin.isoformat(),
                ses_activo=sesion.ses_activo,
                ses_escala_puntuacion=sesion.ses_escala_puntuacion or 100,
                quiz_titulo=quiz_titulo,
                materia_nombre=materia_nombre,
                total_participantes=total_participantes,
                total_finalizados=total_finalizados,
                ses_eliminado=sesion.ses_eliminado or False,
                ses_estado_display="Eliminado" if sesion.ses_eliminado else (
                    "Inactivo" if not sesion.ses_activo else (
                        "Agendado" if sesion.ses_fecha_inicio > datetime.now() else (
                            "Expirado" if sesion.ses_fecha_fin < datetime.now() else "Activo"
                        )
                    )
                )
            ))
        
        return {
            "status": "success",
            "sesiones": sesiones_response
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al listar sesiones: {str(e)}"
        )

# Version paralela de /listar que incluye sesiones eliminadas.
# La pantalla de reportes del profesor necesita ver TODO el historial,
# incluso lo que ya fue eliminado. Si usara /listar sin filtro,
# las eliminadas quedarian fuera.
@router.get("/listar-para-reportes/{id_profesor}", dependencies=[Depends(validar_roles([2, 3]))])
async def listar_sesiones_para_reportes(
    id_profesor: int,
    db: Session = Depends(get_db),
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    """Listar sesiones del profesor INCLUYENDO las eliminadas, para la pantalla de reportes"""
    try:
        if usuario_actual["rol_id"] != 3 and usuario_actual["user_id"] != id_profesor:
            raise HTTPException(
                status_code=403,
                detail="No tienes permiso para ver las sesiones de otro profesor"
            )

        query = db.query(modelos.SesionQuiz, modelos.Materia, modelos.Usuario).join(
            modelos.Materia, modelos.SesionQuiz.ses_fk_materia == modelos.Materia.mat_id, isouter=True
        ).join(
            modelos.Usuario, modelos.Materia.mat_fk_profesor == modelos.Usuario.usu_id, isouter=True
        ).filter(
            modelos.SesionQuiz.ses_fk_profesor == id_profesor
        )

        sesiones_results = query.order_by(modelos.SesionQuiz.ses_fecha_inicio.desc()).all()

        sesiones_response = []
        for sesion, materia_obj, profesor_obj in sesiones_results:
            try:
                obj_id = ObjectId(sesion.ses_id_mongo_quiz)
                quiz = await coleccion_quices.find_one({"_id": obj_id})
                quiz_titulo = quiz.get("metadatos", {}).get("titulo", "Quiz") if quiz else "Quiz no encontrado"
            except:
                quiz_titulo = "Quiz no encontrado"

            materia_nombre = materia_obj.mat_nombre if materia_obj else ""

            total_participantes = db.query(modelos.Resultado).filter(
                modelos.Resultado.res_fk_sesion == sesion.ses_id
            ).count()

            total_finalizados = 0
            try:
                total_finalizados = db.query(modelos.Resultado).filter(
                    modelos.Resultado.res_fk_sesion == sesion.ses_id,
                    modelos.Resultado.res_hora_final_real.isnot(None)
                ).count()
            except:
                pass

            # Calcular el estado display
            if sesion.ses_eliminado:
                estado_display = "Eliminado"
            elif not sesion.ses_activo:
                estado_display = "Inactivo"
            elif sesion.ses_fecha_inicio > datetime.now():
                estado_display = "Agendado"
            elif sesion.ses_fecha_fin < datetime.now():
                estado_display = "Expirado"
            else:
                estado_display = "Activo"

            sesiones_response.append(SesionResponse(
                ses_id=sesion.ses_id,
                ses_codigo_acceso=sesion.ses_codigo_acceso,
                ses_id_mongo_quiz=sesion.ses_id_mongo_quiz,
                ses_fk_materia=sesion.ses_fk_materia,
                ses_nombre_grupo=sesion.ses_nombre_grupo or quiz_titulo,
                ses_puntuacion_tipo=sesion.ses_puntuacion_tipo or "Igual",
                ses_estatus=sesion.ses_estatus,
                ses_fecha_inicio=sesion.ses_fecha_inicio.isoformat(),
                ses_fecha_fin=sesion.ses_fecha_fin.isoformat(),
                ses_activo=sesion.ses_activo,
                ses_escala_puntuacion=sesion.ses_escala_puntuacion or 100,
                quiz_titulo=quiz_titulo,
                materia_nombre=materia_nombre,
                total_participantes=total_participantes,
                total_finalizados=total_finalizados,
                ses_eliminado=sesion.ses_eliminado or False,
                ses_estado_display=estado_display
            ))

        return {
            "status": "success",
            "sesiones": sesiones_response
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al listar sesiones para reportes: {str(e)}"
        )

# Este es el endpoint mas pesado del archivo porque hace:
# 1) Trae la sesion y el quiz
# 2) Trae TODOS los estudiantes inscritos en la materia
# 3) Trae TODOS los resultados de la sesion
# 4) Combina ambos para mostrar quienes completaron y quienes no
# 5) Ordena y calcula estadisticas
# Si una materia tiene 100 estudiantes, esto hace 100+ consultas.
@router.get("/resultados-sesion/{sesion_id}/detallado", dependencies=[Depends(validar_roles([2, 3]))])
async def obtener_resultados_sesion(
    sesion_id: int,
    ordenar_por: str = "nota",  # "nota", "tiempo", "nombre"
    orden: str = "desc",  # "asc", "desc"
    db: Session = Depends(get_db),
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    """Obtener resultados detallados de una sesión con ordenamiento"""
    try:
        # Obtener la sesión
        sesion = db.query(modelos.SesionQuiz).filter(
            modelos.SesionQuiz.ses_id == sesion_id
        ).first()
        
        if not sesion:
            raise HTTPException(status_code=404, detail="Sesión no encontrada")
        
        # VALIDACIÓN DE PERMISOS: Solo el profesor de la sesión o un Master pueden ver los resultados
        if usuario_actual["rol_id"] != 3 and sesion.ses_fk_profesor != usuario_actual["user_id"]:
            raise HTTPException(
                status_code=403, 
                detail="No tienes permiso para acceder a los resultados de esta sesión"
            )
        
        # Obtener información del quiz
        quiz_titulo = "Quiz"
        try:
            obj_id = ObjectId(sesion.ses_id_mongo_quiz)
            quiz = await coleccion_quices.find_one({"_id": obj_id})
            quiz_titulo = quiz.get("metadatos", {}).get("titulo", "Quiz") if quiz else "Quiz"
        except:
            pass
        
        # Obtener materia
        materia = db.query(modelos.Materia).filter(
            modelos.Materia.mat_id == sesion.ses_fk_materia
        ).first()
        
        # Primero obtenemos los estudiantes inscritos en la materia.
        # Luego los resultados. Combinamos ambas listas para saber
        # quienes completaron y quienes no. Los usuarios NO inscritos
        # (como admins de prueba) se incluyen al final.
        estudiantes_inscritos = db.query(modelos.Usuario, modelos.Inscripcion).join(
            modelos.Inscripcion, modelos.Usuario.usu_id == modelos.Inscripcion.ins_fk_alumno
        ).filter(
            modelos.Inscripcion.ins_fk_materia == sesion.ses_fk_materia
        ).all()
        
        estudiantes_ids = set(est.usu_id for est, _ in estudiantes_inscritos)
        
        # Obtener resultados de la sesión (incluye testers/admin que no estén inscritos)
        resultados = db.query(modelos.Resultado, modelos.Usuario).join(
            modelos.Usuario, modelos.Resultado.res_fk_usuario == modelos.Usuario.usu_id
        ).filter(
            modelos.Resultado.res_fk_sesion == sesion_id
        ).all()
        
        # Construir lista completa con todos los estudiantes
        resultados_completos = []
        resultados_ids = set()
        
        for est_id in estudiantes_ids:
            # Buscar resultado del estudiante
            resultado_usuario = None
            for res, usu in resultados:
                if usu.usu_id == est_id:
                    resultado_usuario = (res, usu)
                    break
            
            # Obtener información del estudiante
            estudiante = db.query(modelos.Usuario).filter(
                modelos.Usuario.usu_id == est_id
            ).first()
            
            if resultado_usuario:
                res, usu = resultado_usuario
                resultados_ids.add(usu.usu_id)
                # Calcular porcentaje de aciertos
                nota_final = float(res.res_nota_primera_vez) if res.res_nota_primera_vez else float(res.res_nota_final)
                escala_puntuacion = sesion.ses_escala_puntuacion or 100
                porcentaje_aciertos = (nota_final / escala_puntuacion) * 100 if escala_puntuacion > 0 else 0
                
                resultados_completos.append({
                    "usuario_id": usu.usu_id,
                    "nombre": usu.usu_nombre,
                    "apellido": usu.usu_apellido,
                    "email": usu.usu_email,
                    "nota_final": nota_final,
                    "nota_actual": float(res.res_nota_final),
                    "porcentaje_aciertos": round(porcentaje_aciertos, 1),
                    "repeticiones": res.res_repeticiones or 0,
                    "puntos_ganados": res.res_puntos_ganados_app,
                    "tiempo_total_ms": res.res_tiempo_total_ms,
                    "hora_inicio": res.res_hora_inicio_real.isoformat() if res.res_hora_inicio_real else None,
                    "hora_fin": res.res_hora_final_real.isoformat() if res.res_hora_final_real else None,
                    "estado": "completado",
                    "finalizado_offline": res.res_finalizado_offline
                })
            else:
                # Estudiante no completó el quiz
                resultados_completos.append({
                    "usuario_id": estudiante.usu_id if estudiante else est_id,
                    "nombre": estudiante.usu_nombre if estudiante else "Desconocido",
                    "apellido": estudiante.usu_apellido if estudiante else "",
                    "email": estudiante.usu_email if estudiante else "",
                    "nota_final": 0,
                    "puntos_ganados": 0,
                    "tiempo_total_ms": 0,
                    "hora_inicio": None,
                    "hora_fin": None,
                    "estado": "no_completado",
                    "finalizado_offline": False
                })
        
        # Los usuarios que tienen resultado pero NO estan inscritos
        # en la materia (como el admin master probando) se incluyen
        # igual en la lista para que el profesor vea todo.
        for res, usu in resultados:
            if usu.usu_id not in resultados_ids:
                nota_final = float(res.res_nota_primera_vez) if res.res_nota_primera_vez else float(res.res_nota_final)
                escala_puntuacion = sesion.ses_escala_puntuacion or 100
                porcentaje_aciertos = (nota_final / escala_puntuacion) * 100 if escala_puntuacion > 0 else 0
                resultados_completos.append({
                    "usuario_id": usu.usu_id,
                    "nombre": usu.usu_nombre,
                    "apellido": usu.usu_apellido,
                    "email": usu.usu_email,
                    "nota_final": nota_final,
                    "nota_actual": float(res.res_nota_final),
                    "porcentaje_aciertos": round(porcentaje_aciertos, 1),
                    "repeticiones": res.res_repeticiones or 0,
                    "puntos_ganados": res.res_puntos_ganados_app,
                    "tiempo_total_ms": res.res_tiempo_total_ms,
                    "hora_inicio": res.res_hora_inicio_real.isoformat() if res.res_hora_inicio_real else None,
                    "hora_fin": res.res_hora_final_real.isoformat() if res.res_hora_final_real else None,
                    "estado": "completado",
                    "finalizado_offline": res.res_finalizado_offline
                })
        
        # Aplicar ordenamiento
        if ordenar_por == "nota":
            resultados_completos.sort(key=lambda x: x["nota_final"], reverse=(orden == "desc"))
        elif ordenar_por == "tiempo":
            resultados_completos.sort(key=lambda x: x["tiempo_total_ms"], reverse=(orden == "desc"))
        elif ordenar_por == "nombre":
            resultados_completos.sort(key=lambda x: f"{x['nombre']} {x['apellido']}", reverse=(orden == "desc"))
        
        # Calcular estadísticas
        total_estudiantes = len(resultados_completos)
        completados = len([r for r in resultados_completos if r["estado"] == "completado"])
        no_completados = total_estudiantes - completados
        
        notas = [r["nota_final"] for r in resultados_completos]
        nota_promedio = sum(notas) / total_estudiantes if total_estudiantes > 0 else 0
        nota_maxima = max(notas) if total_estudiantes > 0 else 0
        nota_minima = min(notas) if total_estudiantes > 0 else 0
        
        return {
            "status": "success",
            "sesion": {
                "ses_id": sesion.ses_id,
                "ses_codigo_acceso": sesion.ses_codigo_acceso,
                "quiz_titulo": quiz_titulo,
                "materia_nombre": materia.mat_nombre if materia else "Sin materia",
                "ses_fecha_inicio": sesion.ses_fecha_inicio.isoformat(),
                "ses_fecha_fin": sesion.ses_fecha_fin.isoformat(),
                "ses_puntuacion_tipo": sesion.ses_puntuacion_tipo or "Igual",
                "ses_escala_puntuacion": sesion.ses_escala_puntuacion or 100
            },
            "estadisticas": {
                "total_estudiantes": total_estudiantes,
                "completados": completados,
                "no_completados": no_completados,
                "nota_promedio": round(nota_promedio, 2),
                "nota_maxima": round(nota_maxima, 2),
                "nota_minima": round(nota_minima, 2)
            },
            "resultados": resultados_completos
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener resultados: {str(e)}")


# Vista detallada de las respuestas de UN estudiante en UNA sesion.
# El profesor la usa para ver que fallo cada alumno. Incluye el
# informe de fallas (que preguntas fueron incorrectas) y la nota
# normalizada a escala 20 para comparacion entre quizzes.
@router.get("/{sesion_id}/estudiantes/{usuario_id}/detalle", dependencies=[Depends(obtener_usuario_actual)])
async def obtener_detalle_estudiante_sesion(
    sesion_id: int,
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    """Obtener detalle completo de respuestas de un estudiante en una sesión"""
    try:
        # Obtener la sesión
        sesion = db.query(modelos.SesionQuiz).filter(
            modelos.SesionQuiz.ses_id == sesion_id
        ).first()
        
        if not sesion:
            raise HTTPException(status_code=404, detail="Sesión no encontrada")

        # VALIDACIÓN DE PERMISOS: Profesor de la sesión, Master, o el estudiante mismo
        if (usuario_actual["rol_id"] != 3 
            and sesion.ses_fk_profesor != usuario_actual["user_id"] 
            and usuario_actual["user_id"] != usuario_id):
            raise HTTPException(
                status_code=403, 
                detail="No tienes permiso para acceder al detalle de este estudiante"
            )
        
        # Obtener el resultado del estudiante
        resultado = db.query(modelos.Resultado).filter(
            modelos.Resultado.res_fk_sesion == sesion_id,
            modelos.Resultado.res_fk_usuario == usuario_id
        ).first()
        
        if not resultado:
            raise HTTPException(status_code=404, detail="Resultado no encontrado")
        
        # Obtener información del estudiante
        usuario = db.query(modelos.Usuario).filter(
            modelos.Usuario.usu_id == usuario_id
        ).first()
        
        if not usuario:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
        # Obtener el quiz de MongoDB
        quiz_titulo = "Quiz"
        quiz_preguntas = []
        try:
            obj_id = ObjectId(sesion.ses_id_mongo_quiz)
            quiz = await coleccion_quices.find_one({"_id": obj_id})
            if quiz:
                quiz_titulo = quiz.get("metadatos", {}).get("titulo", "Quiz")
                quiz_preguntas = quiz.get("preguntas", [])
        except:
            pass
        
        # Calcular estadísticas
        escala = sesion.ses_escala_puntuacion or 100
        nota_final = float(resultado.res_nota_final)
        nota_normalizada = (nota_final / escala) * 20 if escala > 0 else 0
        
        # Procesar informe de respuestas si existe
        informe_detalle = resultado.res_informe_fallas or {}
        preguntas_detalle = informe_detalle.get("preguntas", [])
        resumen = informe_detalle.get("resumen", {})
        
        return {
            "status": "success",
            "estudiante": {
                "usuario_id": usuario.usu_id,
                "nombre": usuario.usu_nombre,
                "apellido": usuario.usu_apellido,
                "email": usuario.usu_email,
                "foto_perfil": usuario.usu_imagen
            },
            "sesion": {
                "ses_id": sesion.ses_id,
                "codigo_acceso": sesion.ses_codigo_acceso,
                "quiz_titulo": quiz_titulo,
                "modo_juego": sesion.ses_puntuacion_tipo or "Igual",
                "escala_puntuacion": escala
            },
            "resultado": {
                "res_id": resultado.res_id,
                "nota_final": nota_final,
                "nota_normalizada_20": round(nota_normalizada, 2),
                "puntos_ganados": resultado.res_puntos_ganados_app or 0,
                "tiempo_total_ms": resultado.res_tiempo_total_ms or 0,
                "repeticiones": resultado.res_repeticiones or 0,
                "hora_inicio": resultado.res_hora_inicio_real.isoformat() if resultado.res_hora_inicio_real else None,
                "hora_fin": resultado.res_hora_final_real.isoformat() if resultado.res_hora_final_real else None,
                "finalizado_offline": resultado.res_finalizado_offline or False
            },
            "informe_detalle": {
                "preguntas": preguntas_detalle,
                "resumen": resumen
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener detalle: {str(e)}")


# El podio de la sesion. Lo ve el estudiante al terminar el quiz
# y tambien el profesor en los resultados. Ordena por nota
# descendente y, en caso de empate, por tiempo ascendente.
# El parametro limite controla cuantos aparecen (default 5).
@router.get("/top-resultados/{sesion_id}", dependencies=[Depends(obtener_usuario_actual)])
async def obtener_top_resultados_sesion(
    sesion_id: int,
    limite: int = 5,
    db: Session = Depends(get_db)
):
    """Obtener los top N mejores resultados de una sesión ordenados por nota y tiempo"""
    try:
        # Obtener resultados completados de la sesión
        resultados = db.query(modelos.Resultado, modelos.Usuario).join(
            modelos.Usuario, modelos.Resultado.res_fk_usuario == modelos.Usuario.usu_id
        ).filter(
            modelos.Resultado.res_fk_sesion == sesion_id,
            modelos.Resultado.res_hora_final_real.isnot(None)
        ).all()
        
        # Construir lista de resultados
        resultados_lista = []
        for res, usu in resultados:
            resultados_lista.append({
                "usuario_id": usu.usu_id,
                "nombre": usu.usu_nombre,
                "apellido": usu.usu_apellido,
                "nota_final": float(res.res_nota_primera_vez) if res.res_nota_primera_vez else float(res.res_nota_final),
                "tiempo_total_ms": res.res_tiempo_total_ms or 0,
                "puntos_ganados": res.res_puntos_ganados_app or 0
            })
        
        # Ordenar por nota (descendente) y luego por tiempo (ascendente para empates)
        resultados_lista.sort(key=lambda x: (-x["nota_final"], x["tiempo_total_ms"]))
        
        # Si limite es 0 o negativo, devolver todos los resultados
        if limite <= 0:
            top_resultados = resultados_lista
        else:
            # Tomar los top N
            top_resultados = resultados_lista[:limite]
        
        return {
            "status": "success",
            "top_resultados": top_resultados,
            "total": len(top_resultados),
            "total_completados": len(resultados_lista)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener top resultados: {str(e)}")


# La pantalla "En Vivo" del profesor. Muestra quienes estan
# presentando ahorita, quienes ya terminaron, y quienes ni empezaron.
# Los resultados en curso muestran su nota parcial y tiempo
# transcurrido. Se actualiza periodicamente desde el frontend.
@router.get("/resultados-tiempo-real/{sesion_id}", dependencies=[Depends(validar_roles([2, 3]))])
async def obtener_resultados_tiempo_real(
    sesion_id: int,
    db: Session = Depends(get_db)
):
    """Obtener todos los resultados de una sesión en tiempo real (incluyendo los que están en curso)"""
    try:
        # Obtener la sesión para la escala
        sesion = db.query(modelos.SesionQuiz).filter(modelos.SesionQuiz.ses_id == sesion_id).first()
        escala_puntuacion = sesion.ses_escala_puntuacion or 100 if sesion else 100

        # Obtener todos los resultados de la sesión (completados y en curso)
        resultados = db.query(modelos.Resultado, modelos.Usuario).join(
            modelos.Usuario, modelos.Resultado.res_fk_usuario == modelos.Usuario.usu_id
        ).filter(
            modelos.Resultado.res_fk_sesion == sesion_id
        ).all()
        
        # Construir lista de resultados
        resultados_lista = []
        for res, usu in resultados:
            # Determinar el estado del resultado
            en_curso = res.res_hora_inicio_real is not None and res.res_hora_final_real is None
            completado = res.res_hora_final_real is not None
            
            # Calcular nota actual
            nota_actual = 0
            if completado:
                nota_actual = float(res.res_nota_primera_vez) if res.res_nota_primera_vez else float(res.res_nota_final)
            elif en_curso:
                nota_actual = float(res.res_nota_final)
            
            # Calcular tiempo transcurrido si está en curso
            tiempo_transcurrido_ms = 0
            if en_curso and res.res_hora_inicio_real:
                tiempo_transcurrido_ms = int((datetime.now() - res.res_hora_inicio_real).total_seconds() * 1000)
            elif completado:
                tiempo_transcurrido_ms = res.res_tiempo_total_ms or 0
            
            resultados_lista.append({
                "usuario_id": usu.usu_id,
                "nombre": usu.usu_nombre,
                "apellido": usu.usu_apellido,
                "email": usu.usu_email,
                "foto_perfil": usu.usu_imagen or None,
                "estado": "en_curso" if en_curso else "completado" if completado else "no_iniciado",
                "nota_actual": nota_actual,
                "escala_puntuacion": escala_puntuacion,
                "tiempo_transcurrido_ms": tiempo_transcurrido_ms,
                "puntos_ganados": res.res_puntos_ganados_app or 0,
                "hora_inicio": res.res_hora_inicio_real.isoformat() if res.res_hora_inicio_real else None,
                "hora_final": res.res_hora_final_real.isoformat() if res.res_hora_final_real else None
            })
        
        # El orden es intencional: completados primero (ordenados por
        # nota descendente), luego los que estan en curso (por tiempo
        # transcurrido ascendente), y al final los que no iniciaron.
        # Esto le da al profesor una vista tipo ranking en vivo.
        resultados_lista.sort(key=lambda x: (
            0 if x["estado"] == "completado" else 1 if x["estado"] == "en_curso" else 2,
            -x["nota_actual"] if x["estado"] == "completado" else x["tiempo_transcurrido_ms"]
        ))
        
        return {
            "status": "success",
            "resultados": resultados_lista,
            "total": len(resultados_lista),
            "completados": sum(1 for r in resultados_lista if r["estado"] == "completado"),
            "en_curso": sum(1 for r in resultados_lista if r["estado"] == "en_curso"),
            "no_iniciados": sum(1 for r in resultados_lista if r["estado"] == "no_iniciado")
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener resultados en tiempo real: {str(e)}")

# Desactivar una sesion la cierra para nuevos participantes pero
# conserva los resultados de quienes ya completaron. Es diferente
# de eliminar, que borra logicamente todo. El profesor usa esto
# cuando quiere "cerrar la puerta" pero mantener los datos.
@router.patch("/desactivar/{sesion_id}", dependencies=[Depends(validar_roles([2, 3]))])
async def desactivar_sesion(
    sesion_id: int,
    id_profesor: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """Desactivar una sesión (no permite nuevos participantes)"""
    try:
        # Verificar que la sesión pertenezca al profesor
        sesion = db.query(modelos.SesionQuiz).filter(
            modelos.SesionQuiz.ses_id == sesion_id
        ).first()
        
        if not sesion:
            raise HTTPException(
                status_code=404,
                detail="Sesión no encontrada"
            )
        
        # Verificar que pertenezca al profesor o que sea admin (master)
        usuario = db.query(modelos.Usuario).filter(
            modelos.Usuario.usu_id == id_profesor
        ).first()
        
        es_admin = usuario and usuario.rol and usuario.rol.rol_nombre == 'master'
        
        materia = db.query(modelos.Materia).filter(
            modelos.Materia.mat_id == sesion.ses_fk_materia,
            modelos.Materia.mat_fk_profesor == id_profesor
        ).first()
        
        es_profesor_sesion = sesion.ses_fk_profesor == id_profesor
        
        if not materia and not es_profesor_sesion and not es_admin:
            raise HTTPException(
                status_code=403,
                detail="No tienes permiso para modificar esta sesión"
            )
        
        # Antes de modificar, guardamos el estado anterior para
        # la auditoria. Asi queda trazabilidad de quien desactivo
        # la sesion y cuando.
        datos_anteriores = {
            "codigo_acceso": sesion.ses_codigo_acceso,
            "quiz_id": sesion.ses_id_mongo_quiz,
            "materia_id": sesion.ses_fk_materia,
            "profesor_id": materia.mat_fk_profesor if materia else (sesion.ses_fk_profesor or id_profesor),
            "activo": sesion.ses_activo,
            "estatus": sesion.ses_estatus
        }
        
        # Desactivar sesión
        sesion.ses_activo = False
        sesion.ses_estatus = "Inactivo"
        db.commit()
        
        # Guardar datos nuevos para auditoría
        datos_nuevos = {
            "codigo_acceso": sesion.ses_codigo_acceso,
            "quiz_id": sesion.ses_id_mongo_quiz,
            "materia_id": sesion.ses_fk_materia,
            "profesor_id": materia.mat_fk_profesor if materia else id_profesor,
            "activo": sesion.ses_activo,
            "estatus": sesion.ses_estatus
        }
        
        # Registrar en auditoría
        quiz_titulo_sesion = None
        try:
            from bson import ObjectId as _OID
            quiz_sesion = await coleccion_quices.find_one({"_id": _OID(sesion.ses_id_mongo_quiz)}, {"metadatos.titulo": 1})
            quiz_titulo_sesion = quiz_sesion.get("metadatos", {}).get("titulo", "Quiz") if quiz_sesion else None
        except Exception:
            pass

        await registrar_auditoria_sesion_modificacion(
            sesion_id=sesion_id,
            profesor_id=id_profesor,
            bd=db,
            datos_anteriores=datos_anteriores,
            datos_nuevos=datos_nuevos,
            quiz_titulo=quiz_titulo_sesion,
            codigo_acceso=sesion.ses_codigo_acceso,
            ip_address=request.client.host if request else None,
            user_agent=request.headers.get("user-agent") if request else None
        )
        
        return {
            "status": "success",
            "mensaje": "Sesión desactivada exitosamente"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error al desactivar sesión: {str(e)}"
        )

# Rara vez se usa, pero si el profesor se equivoco al configurar
# el modo de juego o la escala, puede corregirlo aqui. Cambiar
# la puntuacion despues de que algunos estudiantes ya presentaron
# es cuestionable, pero el sistema lo permite.
@router.patch("/actualizar-puntuacion/{sesion_id}", dependencies=[Depends(validar_roles([2, 3]))])
async def actualizar_puntuacion_sesion(
    sesion_id: int,
    id_profesor: int,
    modo_juego: str,
    escala_puntuacion: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """Actualizar el modo de juego y escala de puntuación de una sesión"""
    try:
        # Verificar que la sesión pertenezca al profesor
        sesion = db.query(modelos.SesionQuiz).filter(
            modelos.SesionQuiz.ses_id == sesion_id
        ).first()
        
        if not sesion:
            raise HTTPException(
                status_code=404,
                detail="Sesión no encontrada"
            )
        
        # Verificar que pertenezca al profesor o que sea admin (master)
        usuario = db.query(modelos.Usuario).filter(
            modelos.Usuario.usu_id == id_profesor
        ).first()
        
        es_admin = usuario and usuario.rol and usuario.rol.rol_nombre == 'master'
        
        materia = db.query(modelos.Materia).filter(
            modelos.Materia.mat_id == sesion.ses_fk_materia,
            modelos.Materia.mat_fk_profesor == id_profesor
        ).first()
        
        es_profesor_sesion = sesion.ses_fk_profesor == id_profesor
        
        if not materia and not es_profesor_sesion and not es_admin:
            raise HTTPException(
                status_code=403,
                detail="No tienes permiso para modificar esta sesión"
            )
        
        # Guardar valores anteriores para auditoría
        datos_anteriores = {
            "codigo_acceso": sesion.ses_codigo_acceso,
            "quiz_id": sesion.ses_id_mongo_quiz,
            "materia_id": sesion.ses_fk_materia,
            "profesor_id": materia.mat_fk_profesor if materia else (sesion.ses_fk_profesor or id_profesor),
            "modo_juego": sesion.ses_puntuacion_tipo,
            "escala_puntuacion": sesion.ses_escala_puntuacion
        }
        
        # Actualizar valores
        sesion.ses_puntuacion_tipo = modo_juego
        sesion.ses_escala_puntuacion = escala_puntuacion
        db.commit()
        
        # Guardar datos nuevos para auditoría
        datos_nuevos = {
            "codigo_acceso": sesion.ses_codigo_acceso,
            "quiz_id": sesion.ses_id_mongo_quiz,
            "materia_id": sesion.ses_fk_materia,
            "profesor_id": materia.mat_fk_profesor if materia else (sesion.ses_fk_profesor or id_profesor),
            "modo_juego": modo_juego,
            "escala_puntuacion": escala_puntuacion
        }
        
        # Registrar en auditoría
        quiz_titulo_sesion = None
        try:
            from bson import ObjectId as _OID
            quiz_sesion = await coleccion_quices.find_one({"_id": _OID(sesion.ses_id_mongo_quiz)}, {"metadatos.titulo": 1})
            quiz_titulo_sesion = quiz_sesion.get("metadatos", {}).get("titulo", "Quiz") if quiz_sesion else None
        except Exception:
            pass

        await registrar_auditoria_sesion_modificacion(
            sesion_id=sesion_id,
            profesor_id=id_profesor,
            bd=db,
            datos_anteriores=datos_anteriores,
            datos_nuevos=datos_nuevos,
            quiz_titulo=quiz_titulo_sesion,
            codigo_acceso=sesion.ses_codigo_acceso,
            ip_address=request.client.host if request else None,
            user_agent=request.headers.get("user-agent") if request else None
        )
        
        return {
            "status": "success",
            "mensaje": "Puntuación actualizada correctamente",
            "modo_juego": modo_juego,
            "escala_puntuacion": escala_puntuacion
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error al actualizar puntuación: {str(e)}"
        )

# La eliminacion es logica (soft delete), no fisica. Marcamos
# ses_eliminado = True en vez de borrar el registro. Tambien
# descontamos los puntos de los estudiantes afectados porque
# si la sesion se elimina, los puntos que ganaron ahi ya no
# deberian contar.
# Solo se puede eliminar una sesion inactiva o expirada.
@router.delete("/eliminar/{sesion_id}", dependencies=[Depends(validar_roles([2, 3]))])
async def eliminar_sesion(
    sesion_id: int,
    id_profesor: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """Eliminar una sesión y sus resultados (solo para sesiones inactivas/expiradas)"""
    try:
        # Verificar que la sesión pertenezca al profesor
        sesion = db.query(modelos.SesionQuiz).filter(
            modelos.SesionQuiz.ses_id == sesion_id
        ).first()
        
        if not sesion:
            raise HTTPException(
                status_code=404,
                detail="Sesión no encontrada"
            )
        
        # Verificar que pertenezca al profesor o que sea admin (master)
        usuario = db.query(modelos.Usuario).filter(
            modelos.Usuario.usu_id == id_profesor
        ).first()
        
        es_admin = usuario and usuario.rol and usuario.rol.rol_nombre == 'master'
        
        materia = db.query(modelos.Materia).filter(
            modelos.Materia.mat_id == sesion.ses_fk_materia,
            modelos.Materia.mat_fk_profesor == id_profesor
        ).first()
        
        es_profesor_sesion = sesion.ses_fk_profesor == id_profesor
        
        if not materia and not es_profesor_sesion and not es_admin:
            raise HTTPException(
                status_code=403,
                detail="No tienes permiso para eliminar esta sesión"
            )
        
        # Solo permitir eliminar sesiones inactivas o expiradas
        if sesion.ses_activo and sesion.ses_fecha_fin > datetime.now():
            raise HTTPException(
                status_code=400,
                detail="No se pueden eliminar sesiones activas. Primero desactívalas."
            )
        
        # Guardar datos para auditoría antes de eliminar
        codigo_acceso = sesion.ses_codigo_acceso
        quiz_id = sesion.ses_id_mongo_quiz
        materia_id = sesion.ses_fk_materia
        profesor_id = materia.mat_fk_profesor if materia else (sesion.ses_fk_profesor or id_profesor)
        
        # Descontamos los puntos que los estudiantes ganaron en esta
        # sesion. Si no lo hicieramos, un profesor podria crear una
        # sesion, todos ganan puntos, y luego eliminar la sesion
        # sin consecuencias. Los puntos no pueden ser negativos.
        resultados_a_afectar = db.query(modelos.Resultado).filter(
            modelos.Resultado.res_fk_sesion == sesion_id
        ).all()
        
        for resultado in resultados_a_afectar:
            if resultado.res_puntos_ganados_app and resultado.res_puntos_ganados_app > 0:
                usuario = db.query(modelos.Usuario).filter(
                    modelos.Usuario.usu_id == resultado.res_fk_usuario
                ).first()
                if usuario:
                    usuario.usu_puntos_app = max(0, (usuario.usu_puntos_app or 0) - resultado.res_puntos_ganados_app)
        
        # Soft delete: marcar sesion como eliminada en lugar de borrarla
        sesion.ses_eliminado = True
        sesion.ses_fecha_eliminacion = datetime.now()
        sesion.ses_eliminado_por = id_profesor
        sesion.ses_activo = False
        sesion.ses_estatus = "Eliminado"
        db.commit()
        
        # Registrar en auditoría
        quiz_titulo_sesion = None
        try:
            from bson import ObjectId as _OID
            quiz_sesion = await coleccion_quices.find_one({"_id": _OID(quiz_id)}, {"metadatos.titulo": 1})
            quiz_titulo_sesion = quiz_sesion.get("metadatos", {}).get("titulo", "Quiz") if quiz_sesion else None
        except Exception:
            pass

        await registrar_auditoria_sesion_eliminacion(
            sesion_id=sesion_id,
            codigo_acceso=codigo_acceso,
            quiz_id=quiz_id,
            materia_id=materia_id,
            profesor_id=profesor_id,
            eliminado_por=id_profesor,
            bd=db,
            quiz_titulo=quiz_titulo_sesion,
            ip_address=request.client.host if request else None,
            user_agent=request.headers.get("user-agent") if request else None
        )
        
        return {
            "status": "success",
            "mensaje": "Sesión eliminada exitosamente"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error al eliminar sesión: {str(e)}"
        )

# Endpoint de proposito general que el frontend usa en varias
# pantallas: muestra la info basica de la sesion, el quiz asociado,
# los resultados, y estadisticas resumidas. Es mas ligero que
# /resultados-sesion/{id}/detallado porque no trae estudiantes
# que aun no han completado.
@router.get("/detalles/{sesion_id}", dependencies=[Depends(validar_roles([2, 3]))])
async def obtener_detalles_sesion(
    sesion_id: int,
    id_profesor: int,
    db: Session = Depends(get_db)
):
    """Obtener detalles completos de una sesión con resultados"""
    try:
        # Verificar que la sesión pertenezca al profesor
        sesion = db.query(modelos.SesionQuiz).filter(
            modelos.SesionQuiz.ses_id == sesion_id
        ).first()
        
        if not sesion:
            raise HTTPException(
                status_code=404,
                detail="Sesión no encontrada"
            )
        
        # Verificar que pertenezca al profesor o que sea admin (master)
        usuario = db.query(modelos.Usuario).filter(
            modelos.Usuario.usu_id == id_profesor
        ).first()
        
        es_admin = usuario and usuario.rol and usuario.rol.rol_nombre == 'master'
        
        materia = db.query(modelos.Materia).filter(
            modelos.Materia.mat_id == sesion.ses_fk_materia,
            modelos.Materia.mat_fk_profesor == id_profesor
        ).first()
        
        es_profesor_sesion = sesion.ses_fk_profesor == id_profesor
        
        if not materia and not es_profesor_sesion and not es_admin:
            raise HTTPException(
                status_code=403,
                detail="No tienes permisos para ver esta sesión"
            )
        
        # Obtener información del quiz
        try:
            obj_id = ObjectId(sesion.ses_id_mongo_quiz)
            quiz = await coleccion_quices.find_one({"_id": obj_id})
            quiz_data = {
                "titulo": quiz.get("metadatos", {}).get("titulo", "Quiz"),
                "tema": quiz.get("metadatos", {}).get("tema", "General"),
                "total_preguntas": len(quiz.get("preguntas", [])) if quiz else 0
            } if quiz else {"titulo": "Quiz no encontrado", "tema": "N/A", "total_preguntas": 0}
        except:
            quiz_data = {"titulo": "Quiz no encontrado", "tema": "N/A", "total_preguntas": 0}
        
        # Obtener resultados
        resultados = db.query(modelos.Resultado).filter(
            modelos.Resultado.res_fk_sesion == sesion_id
        ).all()
        
        resultados_data = []
        for resultado in resultados:
            usuario = db.query(modelos.Usuario).filter(
                modelos.Usuario.usu_id == resultado.res_fk_usuario
            ).first()
            
            resultados_data.append({
                "usuario_id": resultado.res_fk_usuario,
                "usuario_nombre": f"{usuario.usu_nombre} {usuario.usu_apellido}" if usuario else "Usuario no encontrado",
                "nota_final": float(resultado.res_nota_final),
                "puntos_ganados": resultado.res_puntos_ganados_app,
                "tiempo_total_ms": resultado.res_tiempo_total_ms,
                "hora_inicio": resultado.res_hora_inicio_real.isoformat() if resultado.res_hora_inicio_real else None,
                "hora_fin": resultado.res_hora_final_real.isoformat() if resultado.res_hora_final_real else None,
                "finalizado_offline": resultado.res_finalizado_offline
            })
        
        return {
            "status": "success",
            "sesion": {
                "ses_id": sesion.ses_id,
                "codigo_acceso": sesion.ses_codigo_acceso,
                "estatus": sesion.ses_estatus,
                "fecha_inicio": sesion.ses_fecha_inicio.isoformat(),
                "fecha_fin": sesion.ses_fecha_fin.isoformat(),
                "activo": sesion.ses_activo,
                "modo_juego": sesion.ses_puntuacion_tipo,
                "materia": materia.mat_nombre,
                "quiz": quiz_data
            },
            "resultados": resultados_data,
            "estadisticas": {
                "total_participantes": len(resultados),
                "total_finalizados": len([r for r in resultados if r.res_hora_final_real]),
                "promedio_nota": sum(float(r.res_nota_final) for r in resultados) / len(resultados) if resultados else 0,
                "promedio_puntos": sum(r.res_puntos_ganados_app for r in resultados) / len(resultados) if resultados else 0
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al obtener detalles: {str(e)}"
        )


# Los resultados generales son para mostrar en la pantalla del
# estudiante cuando termina el quiz. Tambien los usa el profesor
# para la vista resumen. La diferencia con /detallado es que aqui
# el estudiante (rol 1) tambien puede ver sus propios resultados.
@router.get("/resultados-sesion/{sesion_id}", dependencies=[Depends(obtener_usuario_actual)])
async def obtener_resultados_generales_sesion(
    sesion_id: int,
    db: Session = Depends(get_db),
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    """Obtener resultados generales de una sesión específica.
    Cada sesión tiene su propia lista independiente, incluso si usan el mismo quiz.
    """
    try:
        # VALIDACIÓN DE PERMISOS: Profesor de la sesión, Master, o estudiante con resultado
        sesion = db.query(modelos.SesionQuiz).filter(
            modelos.SesionQuiz.ses_id == sesion_id
        ).first()
        
        if not sesion:
            raise HTTPException(status_code=404, detail="Sesión no encontrada")
        
        if usuario_actual["rol_id"] != 3 and sesion.ses_fk_profesor != usuario_actual["user_id"]:
            # Si no es master ni profesor, verificar si es estudiante con resultado en esta sesión
            if usuario_actual["rol_id"] == 1:  # alumno
                tiene_resultado = db.query(modelos.Resultado).filter(
                    modelos.Resultado.res_fk_sesion == sesion_id,
                    modelos.Resultado.res_fk_usuario == usuario_actual["user_id"]
                ).first()
                if not tiene_resultado:
                    raise HTTPException(
                        status_code=403, 
                        detail="No tienes permiso para ver los resultados generales de esta sesión"
                    )
            else:
                raise HTTPException(
                    status_code=403, 
                    detail="No tienes permiso para ver los resultados generales de esta sesión"
                )

        # Obtener información del quiz
        quiz_title = "Quiz"
        quiz_tema = ""
        try:
            obj_id = ObjectId(sesion.ses_id_mongo_quiz)
            quiz = await coleccion_quices.find_one({"_id": obj_id})
            if quiz:
                quiz_title = quiz.get("metadatos", {}).get("titulo", "Quiz")
                quiz_tema = quiz.get("metadatos", {}).get("tema", "")
        except Exception:
            pass

        # Obtener resultados de la sesión (incluye tracking records para mostrar "En curso")
        resultados = db.query(
            modelos.Resultado,
            modelos.Usuario
        ).join(
            modelos.Usuario,
            modelos.Resultado.res_fk_usuario == modelos.Usuario.usu_id
        ).filter(
            modelos.Resultado.res_fk_sesion == sesion_id
        ).order_by(
            modelos.Resultado.res_nota_final.desc()
        ).all()

        resultados_data = []
        for resultado, usuario in resultados:
            en_curso = resultado.res_hora_inicio_real is not None and resultado.res_hora_final_real is None
            completado = resultado.res_hora_final_real is not None

            resultados_data.append({
                "resultado_id": resultado.res_id,
                "usuario_id": usuario.usu_id,
                "usuario_nombre": f"{usuario.usu_nombre} {usuario.usu_apellido}",
                "usuario_email": usuario.usu_email,
                "foto_perfil": usuario.usu_imagen or None,
                "nota_final": float(resultado.res_nota_final),
                "puntos_ganados": resultado.res_puntos_ganados_app or 0,
                "tiempo_total_ms": resultado.res_tiempo_total_ms or 0,
                "hora_inicio": resultado.res_hora_inicio_real.isoformat() if resultado.res_hora_inicio_real else None,
                "hora_fin": resultado.res_hora_final_real.isoformat() if resultado.res_hora_final_real else None,
                "finalizado_offline": resultado.res_finalizado_offline or False,
                "repeticiones": resultado.res_repeticiones or 0,
                "estado": "en_curso" if en_curso else "completado" if completado else "no_iniciado"
            })

        # Solo notas de resultados completados para estadísticas
        notas_completados = [
            float(r[0].res_nota_final) for r in resultados
            if r[0].res_hora_final_real is not None
        ]
        
        total = len(resultados)
        total_finalizados = len(notas_completados)

        return {
            "status": "success",
            "sesion": {
                "id": sesion_id,
                "codigo_acceso": sesion.ses_codigo_acceso,
                "fecha_inicio": sesion.ses_fecha_inicio.isoformat(),
                "fecha_fin": sesion.ses_fecha_fin.isoformat(),
                "quiz_titulo": quiz_title,
                "quiz_tema": quiz_tema,
                "total_preguntas": len(quiz.get("preguntas", [])) if quiz else 0,
                "modo_juego": sesion.ses_puntuacion_tipo or "Igual",
                "escala_puntuacion": sesion.ses_escala_puntuacion or 100
            },
            "resultados": resultados_data,
            "estadisticas": {
                "total_participantes": total,
                "total_finalizados": total_finalizados,
                "promedio_nota": round(sum(notas_completados) / total_finalizados, 2) if total_finalizados > 0 else 0,
                "promedio_puntos": round(
                    sum(r["puntos_ganados"] for r in resultados_data if r["estado"] == "completado") / total_finalizados, 2
                ) if total_finalizados > 0 else 0,
                "mejor_nota": max(notas_completados) if notas_completados else 0,
                "peor_nota": min(notas_completados) if notas_completados else 0
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener resultados de la sesión: {str(e)}")