"""
Aquí están todos los endpoints para los quices en MongoDB
POST, GET, PUT, DELETE - todo el CRUD básico
"""
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
import logging
from sqlalchemy.orm import Session

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from aplicacion.conexion_bd import coleccion_quices, coleccion_auditoria, get_db
from aplicacion.esquemas_quiz import QuizCrear, QuizRespuesta
from aplicacion import modelos
from aplicacion.modelos import Usuario, SesionQuiz, Resultado
from sqlalchemy import delete as sql_delete, update as sql_update
from aplicacion.servicio_auditoria import registrar_auditoria_completa
from aplicacion.dependencias import validar_roles, obtener_usuario_actual

router = APIRouter(prefix="/quices", tags=["Quices MongoDB"])

# Verificar que la colección esté disponible
if coleccion_quices is None:
    logger.error("❌ ERROR: coleccion_quices es None - MongoDB no inicializado")
else:
    logger.info("✅ coleccion_quices inicializada correctamente")


# Convierte el documento tal cual viene de MongoDB a un dict que el frontend entienda
# El _id de MongoDB es un ObjectId y hay que pasarlo a string
def quiz_helper(quiz) -> dict:
    """Convierte un documento MongoDB a dict con ID string"""
    return {
        "_id": str(quiz["_id"]),
        "metadatos": quiz.get("metadatos", {}),
        "preguntas": quiz.get("preguntas", [])
    }


# Cada vez que alguien crea, modifica o borra un quiz guardamos el evento en auditoria
# Esto permite al master ver el historial completo de cambios
async def registrar_auditoria(
    tipo_operacion: str,
    quiz_id: str,
    quiz_titulo: str,
    cantidad_preguntas: int,
    autor_id: int,
    bd: Session,
    materia_info: dict = None,
    datos_nuevos: dict = None,
    datos_anteriores: dict = None
):
    """Registra una operación en la colección de auditoría usando el servicio centralizado"""
    try:
        # Mapear tipos de operación antiguos a nuevos
        tipo_operacion_nuevo = {
            "creacion": "QUIZ_CREACION",
            "modificacion": "QUIZ_MODIFICACION",
            "eliminacion": "QUIZ_ELIMINACION"
        }.get(tipo_operacion, tipo_operacion)
        
        # Materia por defecto
        materia_data = {
            "id": 0,
            "nombre": "Sin materia",
            "codigo": ""
        }
        
        # Si se proporciona información de materia, usarla
        if materia_info:
            materia_data = materia_info
        
        # Si hay materia_id, buscar datos completos en PostgreSQL
        if materia_data.get("id"):
            try:
                materia = bd.query(modelos.Materia).filter(
                    modelos.Materia.mat_id == materia_data["id"]
                ).first()
                if materia:
                    materia_data = {
                        "id": materia.mat_id,
                        "nombre": materia.mat_nombre,
                        "codigo": materia.mat_codigo or ""
                    }
            except Exception as e:
                logger.warning(f"⚠️ No se pudo obtener materia por ID: {str(e)}")
        
        # Construir mensaje descriptivo para el historial
        mensaje_descriptivo = ""
        if tipo_operacion == "creacion":
            mensaje_descriptivo = f"Creó el quiz '{quiz_titulo}' en la materia '{materia_data['nombre']}'"
        elif tipo_operacion == "modificacion":
            mensaje_descriptivo = f"Modificó el quiz '{quiz_titulo}' en la materia '{materia_data['nombre']}'"
        elif tipo_operacion == "eliminacion":
            mensaje_descriptivo = f"Eliminó el quiz '{quiz_titulo}' de la materia '{materia_data['nombre']}'"
        
        # Usar el servicio centralizado de auditoría
        await registrar_auditoria_completa(
            tipo_operacion=tipo_operacion_nuevo,
            usuario_id=autor_id,
            bd=bd,
            entidad_tipo="Quiz",
            entidad_id=quiz_id,
            datos_anteriores=datos_anteriores,
            datos_nuevos=datos_nuevos,
            detalles={
                "quiz_titulo": quiz_titulo,
                "cantidad_preguntas": cantidad_preguntas,
                "materia": materia_data,
                "mensaje_descriptivo": mensaje_descriptivo,
                "accion": mensaje_descriptivo
            }
        )
        
        logger.info(f"✅ Auditoría registrada: {tipo_operacion} - {quiz_titulo}")
    except Exception as e:
        logger.error(f"❌ Error al registrar auditoría: {str(e)}")


# Guarda un quiz completo en MongoDB con todas sus preguntas
# El frontend envia los metadatos (titulo, materia, autor) y las preguntas
# Tambien convierte las imagenes base64 a archivos antes de guardar
@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED, dependencies=[Depends(validar_roles([2, 3]))])
async def crear_quiz(quiz: QuizCrear, bd: Session = Depends(get_db)):
    """
    Guarda un quiz nuevo en MongoDB
    Le llega el título, tema, autor y las preguntas desde el frontend
    """
    logger.info(f"📝 POST /quices/ - Creando quiz: {quiz.metadatos.titulo}")
    logger.info(f"📝 Autor ID: {quiz.metadatos.autor_id}")
    logger.info(f"📝 Cantidad de preguntas: {len(quiz.preguntas)}")
    
    # Verificar que la colección esté disponible
    if coleccion_quices is None:
        logger.error("❌ coleccion_quices is None - No se puede guardar")
        raise HTTPException(status_code=500, detail="Error de conexión con MongoDB")
    
    try:
        quiz_dict = quiz.model_dump()
        quiz_dict["metadatos"]["fecha_creacion"] = datetime.utcnow()
        
        # Convertir imágenes base64 a archivos antes de guardar
        from aplicacion.rutas.rutas_quices import procesar_imagenes_quiz
        quiz_dict = procesar_imagenes_quiz(quiz_dict, es_guardar=True)
        
        logger.info(f"📝 Insertando en MongoDB...")
        result = await coleccion_quices.insert_one(quiz_dict)
        
        quiz_id = str(result.inserted_id)
        logger.info(f"✅ Quiz creado con ID: {quiz_id}")
        
        # Registrar en auditoría
        # Usar el materia_id del quiz si está disponible
        materia_id = quiz.metadatos.materia_id
        materia_nombre = quiz.metadatos.tema or "Sin materia"

        # Preparar datos del quiz creado para auditoría
        datos_nuevos = {
            "titulo": quiz.metadatos.titulo,
            "tema": quiz.metadatos.tema,
            "imagen_portada": quiz.metadatos.imagen_portada,
            "modo_juego": quiz.metadatos.modo_juego,
            "ponderacion": quiz.metadatos.ponderacion,
            "cantidad_preguntas": len(quiz.preguntas),
            "preguntas": [{
                "nro_orden": p.nro_orden,
                "tipo": p.tipo,
                "categoria": p.categoria,
                "enunciado": p.enunciado,
                "multimedia": p.multimedia,
                "tiempo_limite_segundos": p.tiempo_limite_segundos,
                "puntos_si_es_dificultad": p.puntos_si_es_dificultad,
                "opciones": [{"texto": o.texto, "es_correcta": o.es_correcta} for o in p.opciones]
            } for p in quiz.preguntas]
        }

        await registrar_auditoria(
            tipo_operacion="creacion",
            quiz_id=quiz_id,
            quiz_titulo=quiz.metadatos.titulo,
            cantidad_preguntas=len(quiz.preguntas),
            autor_id=quiz.metadatos.autor_id,
            bd=bd,
            materia_info={"id": materia_id or 0, "nombre": materia_nombre, "codigo": ""},
            datos_nuevos=datos_nuevos
        )
        
        return {
            "status": "success",
            "mensaje": "Quiz creado exitosamente",
            "quiz_id": quiz_id
        }
    except Exception as e:
        logger.error(f"❌ ERROR al crear quiz: {str(e)}")
        logger.error(f"❌ Tipo de error: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Error al guardar quiz: {str(e)}")


# Lista los quices de un profesor para mostrarlos en su biblioteca
# Filtra por autor_id para que cada profesor vea solo sus quices
@router.get("/", dependencies=[Depends(validar_roles([2, 3]))])
async def listar_quices(autor_id: int = None):
    """
    Devuelve todos los quices de un autor
    Lo usa la biblioteca para mostrar los quices del profesor logueado
    """
    logger.info(f"📋 GET /quices/ - autor_id: {autor_id}")
    
    if coleccion_quices is None:
        logger.error("❌ coleccion_quices es None")
        raise HTTPException(status_code=500, detail="Error de conexión con MongoDB")
    
    try:
        query = {}
        if autor_id:
            query["metadatos.autor_id"] = autor_id
        
        quices = await coleccion_quices.find(query).to_list(length=100)
        logger.info(f"📋 Encontrados {len(quices)} quices")
        
        resultado = []
        for quiz in quices:
            metadatos = quiz.get("metadatos", {})
            resultado.append({
                "_id": str(quiz["_id"]),
                "titulo": metadatos.get("titulo", "Sin título"),
                "tema": metadatos.get("tema"),
                "imagen_portada": metadatos.get("imagen_portada"),
                "fecha_creacion": metadatos.get("fecha_creacion"),
                "cantidad_preguntas": len(quiz.get("preguntas", []))
            })
        
        return {"quices": resultado}
    except Exception as e:
        logger.error(f"❌ ERROR listando quices: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al listar quices: {str(e)}")


# Trae el quiz completo con todas las preguntas para que el estudiante lo presente
# Cualquier usuario logueado puede ver un quiz si tiene el ID
@router.get("/{quiz_id}", dependencies=[Depends(obtener_usuario_actual)])
async def obtener_quiz(quiz_id: str):
    """Obtener un quiz completo por su ID"""
    try:
        obj_id = ObjectId(quiz_id)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    quiz = await coleccion_quices.find_one({"_id": obj_id})
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz no encontrado")
    
    return quiz_helper(quiz)


# Reemplaza todo el contenido del quiz con los datos nuevos
# Solo el autor del quiz o un master pueden editarlo
# Guarda el estado anterior en auditoria para poder revertir si hace falta
@router.put("/{quiz_id}", dependencies=[Depends(validar_roles([2, 3]))])
async def actualizar_quiz(quiz_id: str, quiz: QuizCrear, bd: Session = Depends(get_db), usuario: dict = Depends(obtener_usuario_actual)):
    """Actualizar un quiz existente"""
    try:
        obj_id = ObjectId(quiz_id)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    # Obtener el quiz antes de actualizar para registrar en auditoría
    quiz_anterior = await coleccion_quices.find_one({"_id": obj_id})
    if not quiz_anterior:
        raise HTTPException(status_code=404, detail="Quiz no encontrado")

    # Validar propiedad del quiz (solo autor o master pueden editar)
    autor_id = quiz_anterior.get("metadatos", {}).get("autor_id")
    if usuario['rol_id'] != 3 and autor_id != usuario['user_id']:
        raise HTTPException(status_code=403, detail="No tienes permiso para editar este quiz")

    quiz_dict = quiz.model_dump()
    quiz_dict["metadatos"]["fecha_actualizacion"] = datetime.utcnow()
    
    # Convertir imágenes base64 a archivos antes de guardar
    from aplicacion.rutas.rutas_quices import procesar_imagenes_quiz
    quiz_dict = procesar_imagenes_quiz(quiz_dict, es_guardar=True)
    
    result = await coleccion_quices.update_one(
        {"_id": obj_id},
        {"$set": quiz_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quiz no encontrado")
    
    # Registrar en auditoría
    # Usar el materia_id del quiz si está disponible
    materia_id = quiz.metadatos.materia_id
    materia_nombre = quiz.metadatos.tema or "Sin materia"

    # Preparar datos anteriores y nuevos para auditoría (con detalle completo de preguntas)
    metadatos_anterior = quiz_anterior.get("metadatos", {})
    preguntas_anterior = quiz_anterior.get("preguntas", [])
    
    # Función auxiliar para serializar una pregunta completa
    def serializar_pregunta(p, is_dict=True):
        if is_dict:
            return {
                "nro_orden": p.get("nro_orden"),
                "tipo": p.get("tipo"),
                "categoria": p.get("categoria"),
                "enunciado": p.get("enunciado"),
                "multimedia": p.get("multimedia"),
                "tiempo_limite_segundos": p.get("tiempo_limite_segundos"),
                "puntos_si_es_dificultad": p.get("puntos_si_es_dificultad"),
                "opciones": [{"texto": o.get("texto"), "es_correcta": o.get("es_correcta")} for o in p.get("opciones", [])]
            }
        else:
            return {
                "nro_orden": p.nro_orden,
                "tipo": p.tipo,
                "categoria": p.categoria,
                "enunciado": p.enunciado,
                "multimedia": p.multimedia,
                "tiempo_limite_segundos": p.tiempo_limite_segundos,
                "puntos_si_es_dificultad": p.puntos_si_es_dificultad,
                "opciones": [{"texto": o.texto, "es_correcta": o.es_correcta} for o in p.opciones]
            }
    
    datos_anteriores = {
        "titulo": metadatos_anterior.get("titulo"),
        "tema": metadatos_anterior.get("tema"),
        "imagen_portada": metadatos_anterior.get("imagen_portada"),
        "modo_juego": metadatos_anterior.get("modo_juego"),
        "ponderacion": metadatos_anterior.get("ponderacion"),
        "cantidad_preguntas": len(preguntas_anterior),
        "preguntas": [serializar_pregunta(p, True) for p in preguntas_anterior]
    }
    
    datos_nuevos = {
        "titulo": quiz.metadatos.titulo,
        "tema": quiz.metadatos.tema,
        "imagen_portada": quiz.metadatos.imagen_portada,
        "modo_juego": quiz.metadatos.modo_juego,
        "ponderacion": quiz.metadatos.ponderacion,
        "cantidad_preguntas": len(quiz.preguntas),
        "preguntas": [serializar_pregunta(p, False) for p in quiz.preguntas]
    }

    await registrar_auditoria(
        tipo_operacion="modificacion",
        quiz_id=quiz_id,
        quiz_titulo=quiz.metadatos.titulo,
        cantidad_preguntas=len(quiz.preguntas),
        autor_id=quiz.metadatos.autor_id,
        bd=bd,
        materia_info={"id": materia_id or 0, "nombre": materia_nombre, "codigo": ""},
        datos_nuevos=datos_nuevos,
        datos_anteriores=datos_anteriores
    )
    
    return {"status": "success", "mensaje": "Quiz actualizado"}


# Borra el quiz de MongoDB y tambien limpia las sesiones y resultados asociados en PostgreSQL
# Si un estudiante gano puntos con ese quiz, se los restamos para que no haya inconsistencias
@router.delete("/{quiz_id}", dependencies=[Depends(validar_roles([2, 3]))])
async def eliminar_quiz(quiz_id: str, bd: Session = Depends(get_db), usuario: dict = Depends(obtener_usuario_actual)):
    """Borra un quiz por ID - esto lo llamo desde el frontend cuando el profe confirma"""
    try:
        obj_id = ObjectId(quiz_id)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    # Obtener el quiz antes de eliminar para registrar en auditoría
    quiz = await coleccion_quices.find_one({"_id": obj_id})
    
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz no encontrado")

    # Validar propiedad del quiz (solo autor o master pueden eliminar)
    autor_id = quiz.get("metadatos", {}).get("autor_id")
    if usuario['rol_id'] != 3 and autor_id != usuario['user_id']:
        raise HTTPException(status_code=403, detail="No tienes permiso para eliminar este quiz")
    
    metadatos = quiz.get("metadatos", {})
    
    # Registrar en auditoría antes de eliminar
    # Usar el materia_id del quiz si está disponible
    materia_id = metadatos.get("materia_id")
    materia_nombre = metadatos.get("tema") or "Sin materia"

    # Preparar datos del quiz eliminado para auditoría
    preguntas_quiz = quiz.get("preguntas", [])
    
    # Función auxiliar para serializar pregunta completa
    def serializar_pregunta_eliminada(p):
        return {
            "nro_orden": p.get("nro_orden"),
            "tipo": p.get("tipo"),
            "categoria": p.get("categoria"),
            "enunciado": p.get("enunciado"),
            "multimedia": p.get("multimedia"),
            "tiempo_limite_segundos": p.get("tiempo_limite_segundos"),
            "puntos_si_es_dificultad": p.get("puntos_si_es_dificultad"),
            "opciones": [{"texto": o.get("texto"), "es_correcta": o.get("es_correcta")} for o in p.get("opciones", [])]
        }
    
    datos_anteriores = {
        "titulo": metadatos.get("titulo"),
        "tema": metadatos.get("tema"),
        "cantidad_preguntas": len(preguntas_quiz),
        "preguntas": [serializar_pregunta_eliminada(p) for p in preguntas_quiz]
    }

    await registrar_auditoria(
        tipo_operacion="eliminacion",
        quiz_id=quiz_id,
        quiz_titulo=metadatos.get("titulo", "Sin título"),
        cantidad_preguntas=len(preguntas_quiz),
        autor_id=metadatos.get("autor_id", 0),
        bd=bd,
        materia_info={"id": materia_id or 0, "nombre": materia_nombre, "codigo": ""},
        datos_anteriores=datos_anteriores
    )
    
    # Eliminar sesiones y resultados asociados en PostgreSQL (transacción atómica)
    try:
        # 1. Buscar sesiones asociadas al quiz
        sesiones = bd.query(SesionQuiz).filter(
            SesionQuiz.ses_id_mongo_quiz == quiz_id
        ).all()

        sesion_ids = [s.ses_id for s in sesiones]

        if sesion_ids:
            # 2. Obtener resultados afectados y sumar puntos por estudiante
            resultados_afectados = bd.query(Resultado).filter(
                Resultado.res_fk_sesion.in_(sesion_ids)
            ).all()

            puntos_por_usuario = {}
            for r in resultados_afectados:
                uid = r.res_fk_usuario
                pts = r.res_puntos_ganados_app or 0
                puntos_por_usuario[uid] = puntos_por_usuario.get(uid, 0) + pts

            # 3. Restar puntos de cada estudiante
            for usu_id, pts_a_restar in puntos_por_usuario.items():
                usuario = bd.query(Usuario).filter(Usuario.usu_id == usu_id).first()
                if usuario:
                    usuario.usu_puntos_app = max(0, (usuario.usu_puntos_app or 0) - pts_a_restar)

            # 4. Eliminar resultados
            bd.execute(
                sql_delete(Resultado).where(Resultado.res_fk_sesion.in_(sesion_ids))
            )
            # 5. Soft delete de sesiones (marcar como eliminadas)
            bd.execute(
                sql_update(SesionQuiz)
                .where(SesionQuiz.ses_id.in_(sesion_ids))
                .values(
                    ses_eliminado=True,
                    ses_fecha_eliminacion=datetime.now(),
                    ses_eliminado_por=usuario['user_id'],
                    ses_activo=False,
                    ses_estatus="Eliminado"
                )
            )

        # 6. Eliminar quiz de MongoDB (después de validar PostgreSQL)
        result = await coleccion_quices.delete_one({"_id": obj_id})
        if result.deleted_count == 0:
            bd.rollback()
            raise HTTPException(status_code=404, detail="Quiz no encontrado")

        bd.commit()
    except HTTPException:
        raise
    except Exception as e:
        bd.rollback()
        print(f"[ERROR] Eliminación quiz: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error al eliminar el quiz y sus datos asociados: {str(e)}"
        )
    
    return {"status": "success", "mensaje": "Quiz eliminado"}


# Agrupa los resultados de todas las sesiones que usaron este quiz
# Sirve para que el profesor vea el rendimiento global de su quiz a traves del tiempo
@router.get("/resultados-generales/{quiz_id}", dependencies=[Depends(validar_roles([2, 3]))])
async def obtener_resultados_generales_quiz(quiz_id: str, db: Session = Depends(get_db)):
    """Devuelve resultados globales de un quiz (todas las sesiones)"""
    try:
        # Obtener el quiz de MongoDB
        try:
            obj_id = ObjectId(quiz_id)
            quiz = await coleccion_quices.find_one({"_id": obj_id})
        except Exception:
            raise HTTPException(status_code=400, detail="ID de quiz inválido")

        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz no encontrado")

        # Buscar todas las sesiones asociadas a este quiz
        sesiones = db.query(modelos.SesionQuiz).filter(
            modelos.SesionQuiz.ses_id_mongo_quiz == quiz_id
        ).all()

        sesion_ids = [s.ses_id for s in sesiones]
        sesion_escala_map = {s.ses_id: s.ses_escala_puntuacion or 100 for s in sesiones}

        if not sesion_ids:
            return {
                "status": "success",
                "quiz": {
                    "titulo": quiz.get("metadatos", {}).get("titulo", ""),
                    "tema": quiz.get("metadatos", {}).get("tema", "")
                },
                "estadisticas": None,
                "resultados": []
            }

        # Obtener todos los resultados de esas sesiones (solo completados)
        resultados = db.query(
            modelos.Resultado, modelos.Usuario
        ).join(
            modelos.Usuario,
            modelos.Resultado.res_fk_usuario == modelos.Usuario.usu_id
        ).filter(
            modelos.Resultado.res_fk_sesion.in_(sesion_ids),
            modelos.Resultado.res_hora_final_real.isnot(None)
        ).order_by(
            modelos.Resultado.res_nota_final.desc()
        ).all()

        # Calcular estadísticas
        notas = [float(r.res_nota_final) for r, u in resultados if r.res_nota_final]
        total_participantes = len(set(r.res_fk_usuario for r, u in resultados))

        estadisticas = {
            "total_participantes": total_participantes,
            "total_finalizados": len(resultados),
            "promedio_nota": round(sum(notas) / len(notas), 1) if notas else 0,
            "promedio_puntos": round(sum(r.res_puntos_ganados_app or 0 for r, u in resultados) / len(resultados), 1) if resultados else 0,
            "mejor_nota": max(notas) if notas else 0,
            "peor_nota": min(notas) if notas else 0
        }

        return {
            "status": "success",
            "quiz": {
                "titulo": quiz.get("metadatos", {}).get("titulo", ""),
                "tema": quiz.get("metadatos", {}).get("tema", "")
            },
            "estadisticas": estadisticas,
            "resultados": [{
                "resultado_id": r.res_id,
                "sesion_id": r.res_fk_sesion,
                "usuario_id": u.usu_id,
                "usuario_nombre": f"{u.usu_nombre} {u.usu_apellido}",
                "usuario_email": u.usu_email,
                "escala_puntuacion": sesion_escala_map.get(r.res_fk_sesion, 100),
                "nota_final": float(r.res_nota_final) if r.res_nota_final else 0,
                "puntos_ganados": r.res_puntos_ganados_app or 0,
                "tiempo_total_ms": r.res_tiempo_total_ms or 0,
                "hora_inicio": r.res_hora_inicio_real.isoformat() if r.res_hora_inicio_real else None,
                "hora_fin": r.res_hora_final_real.isoformat() if r.res_hora_final_real else None,
                "finalizado_offline": r.res_finalizado_offline or False,
                "repeticiones": r.res_repeticiones or 0
            } for r, u in resultados]
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Resultados generales quiz: {e}")
        raise HTTPException(status_code=500, detail=str(e))
