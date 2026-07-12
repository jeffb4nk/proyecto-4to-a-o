
"""
Endpoints para auditoría y estadísticas del sistema
Diseñados para el rol de administrador/master
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
import io
from sqlalchemy.orm import Session
from sqlalchemy import select, func, desc
from datetime import datetime, timedelta
from typing import List, Dict, Any
from bson import ObjectId
import logging
import traceback

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from aplicacion.conexion_bd import get_db, coleccion_quices, coleccion_auditoria
from aplicacion.modelos import Usuario, Materia, SesionQuiz, Resultado, Rol, Inscripcion
from aplicacion.dependencias import validar_roles

router = APIRouter(prefix="/auditoria", tags=["Auditoría"])


# Genera un PDF con los ultimos 50 eventos de auditoria para descargar
# Necesita la libreria reportlab instalada, si no esta devuelve error 501
@router.get("/descargar-pdf", dependencies=[Depends(validar_roles([3]))])
async def descargar_pdf_auditoria(bd: Session = Depends(get_db)):
    """
    Genera un PDF con el resumen de auditoría de quices y lo devuelve como archivo descargable.
    Requiere la librería `reportlab`. Si no está instalada, devuelve un 501 con instrucción.
    """
    # Importar reportlab de forma perezosa para evitar fallos si no está instalado
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
    except Exception as e:
        logger.error("reportlab no está disponible: %s", str(e))
        raise HTTPException(status_code=501, detail="Módulo 'reportlab' no instalado. Instálalo: pip install reportlab")

    # Obtener datos de auditoría (reutiliza lógica del endpoint de quices-creados)
    limite = 50
    pipeline = [
        {"$sort": {"fecha_operacion": -1}},
        {"$limit": limite}
    ]
    registros = []
    if coleccion_auditoria is not None:
        import asyncio
        try:
            registros = await asyncio.wait_for(
                coleccion_auditoria.aggregate(pipeline).to_list(length=limite),
                timeout=5.0
            )
        except Exception as e:
            print(f"[ERROR] Auditoría PDF: {e}")
            registros = []
    else:
        print("[ERROR] Auditoría PDF: coleccion_auditoria no inicializada")
        registros = []

    # Crear PDF en memoria
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    p.setFont("Helvetica-Bold", 16)
    p.drawString(40, height - 40, "Reporte de Auditoría de Quices")
    p.setFont("Helvetica", 10)
    p.drawString(40, height - 60, f"Total de registros: {len(registros)}")
    y = height - 80
    for i, registro in enumerate(registros):
        detalles = registro.get("detalles", {}) or {}
        materia = detalles.get("materia", {}) or {}
        quiz_titulo = detalles.get("quiz_titulo", registro.get("quiz_titulo", "Sin título"))
        cantidad_preguntas = detalles.get("cantidad_preguntas", registro.get("cantidad_preguntas", 0))
        usuario = registro.get("usuario", registro.get("usuario_responsable", {})) or {}
        if y < 80:
            p.showPage()
            y = height - 40
        p.setFont("Helvetica-Bold", 10)
        p.drawString(40, y, f"{i+1}. {quiz_titulo}")
        p.setFont("Helvetica", 9)
        y -= 14
        p.drawString(60, y, f"Operación: {registro.get('tipo_operacion', '')} | Fecha: {registro.get('fecha_operacion', '')}")
        y -= 12
        p.drawString(60, y, f"Preguntas: {cantidad_preguntas} | Profesor: {usuario.get('nombre', '')} {usuario.get('apellido', '')}")
        y -= 12
        p.drawString(60, y, f"Materia: {materia.get('nombre', '')} | Código: {materia.get('codigo', '')}")
        y -= 18
    p.save()
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=auditoria_quices.pdf"})

# Revisa que las conexiones a PostgreSQL y MongoDB esten funcionando
# Sirve para diagnosticar problemas cuando el sistema no responde
@router.get("/test", dependencies=[Depends(validar_roles([3]))])
async def test_endpoint(bd: Session = Depends(get_db)):
    """Endpoint de prueba para depurar conexiones"""
    try:
        logger.info("🧪 Iniciando endpoint de prueba")
        
        # Test conexión básica a PostgreSQL
        try:
            total_usuarios = bd.execute(
                select(func.count(Usuario.usu_id))
            ).scalar()
            logger.info(f"✅ Test PostgreSQL: {total_usuarios} usuarios encontrados")
        except Exception as e:
            logger.error(f"❌ Error PostgreSQL test: {str(e)}")
            return {"error": "PostgreSQL connection failed", "details": str(e)}
        
        # Test conexión básica a MongoDB
        try:
            if coleccion_quices is not None:
                total_quizes = await coleccion_quices.count_documents({})
                logger.info(f"✅ Test MongoDB: {total_quizes} quizes encontrados")
            else:
                logger.warning("⚠️ MongoDB no disponible")
                total_quizes = 0
        except Exception as e:
            logger.error(f"❌ Error MongoDB test: {str(e)}")
            return {"error": "MongoDB connection failed", "details": str(e)}
        
        return {
            "status": "success",
            "postgres_users": total_usuarios,
            "mongo_quizes": total_quizes,
            "message": "Conexiones funcionando correctamente"
        }
        
    except Exception as e:
        logger.error(f"❌ Error en test endpoint: {str(e)}")
        return {"error": "Test failed", "details": str(e)}

# Cuenta usuarios por rol, total de quices, materias, sesiones activas
# Es la informacion que se muestra en el dashboard principal del admin
@router.get("/estadisticas-generales", dependencies=[Depends(validar_roles([3]))])
async def obtener_estadisticas_generales(bd: Session = Depends(get_db)):
    """
    Estadísticas generales del sistema basadas en datos reales - Versión optimizada
    """
    import time
    start_time = time.time()
    
    try:
        logger.info("🔍 Iniciando consulta de estadísticas generales")
        
        # Verificar conexión a MongoDB
        mongo_disponible = coleccion_quices is not None
        logger.info(f"📊 MongoDB disponible: {mongo_disponible}")
        
        # Estadísticas de usuarios por rol - optimizada
        usuarios_por_rol = []
        try:
            query_start = time.time()
            usuarios_por_rol = bd.execute(
                select(Rol.rol_nombre, func.count(Usuario.usu_id))
                .join(Usuario, Rol.rol_id == Usuario.usu_fk_rol)
                .group_by(Rol.rol_id, Rol.rol_nombre)
            ).all()
            query_time = time.time() - query_start
            logger.info(f"👥 Usuarios por rol: {len(usuarios_por_rol)} resultados ({query_time:.2f}s)")
        except Exception as e:
            logger.error(f"❌ Error en consulta usuarios por rol: {str(e)}")
            usuarios_por_rol = []
        
        # Total de quizes en MongoDB - con timeout y fallback
        total_quizes = 0
        if mongo_disponible:
            try:
                mongo_start = time.time()
                # Agregar timeout manual para MongoDB
                import asyncio
                try:
                    total_quizes = await asyncio.wait_for(
                        coleccion_quices.count_documents({}),
                        timeout=3.0  # 3 segundos timeout
                    )
                    mongo_time = time.time() - mongo_start
                    logger.info(f"📝 Total de quizes: {total_quizes} ({mongo_time:.2f}s)")
                except asyncio.TimeoutError:
                    logger.warning("⏰ MongoDB timeout (3s), usando fallback")
                    total_quizes = 0
            except Exception as e:
                logger.warning(f"⚠️ MongoDB no disponible: {str(e)[:50]}...")
                total_quizes = 0
        
        # Consultas SQL optimizadas con índices
        try:
            sql_start = time.time()
            
            # Usar consultas más específicas y optimizadas
            # Estas consultas deberían usar índices en usu_activo, mat_activo, ses_activo
            total_materias = bd.execute(
                select(func.count(Materia.mat_id))
                .where(Materia.mat_activo == True)
            ).scalar() or 0
            
            total_usuarios_activos = bd.execute(
                select(func.count(Usuario.usu_id))
                .where(Usuario.usu_activo == True)
                .where(Usuario.usu_eliminado == False)
            ).scalar() or 0
            
            sesiones_activas = bd.execute(
                select(func.count(SesionQuiz.ses_id))
                .where(SesionQuiz.ses_activo == True)
                .where(SesionQuiz.ses_estatus.in_(['Activa', 'En curso', 'Espera']))
            ).scalar() or 0
            
            sql_time = time.time() - sql_start
            logger.info(f"📚 SQL optimizado: materias={total_materias}, usuarios={total_usuarios_activos}, sesiones={sesiones_activas} ({sql_time:.2f}s)")
            
        except Exception as e:
            logger.error(f"❌ Error en consultas SQL: {str(e)}")
            total_materias = 0
            total_usuarios_activos = 0
            sesiones_activas = 0
        
        resultado = {
            "usuarios_por_rol": [
                {"rol": rol, "cantidad": count} 
                for rol, count in usuarios_por_rol
            ],
            "total_quizes": total_quizes,
            "total_materias": total_materias,
            "total_usuarios_activos": total_usuarios_activos,
            "sesiones_activas": sesiones_activas,
            "fecha_consulta": datetime.utcnow().isoformat()
        }
        
        total_time = time.time() - start_time
        logger.info(f"✅ Estadísticas generales completadas ({total_time:.2f}s)")
        return resultado
        
    except Exception as e:
        total_time = time.time() - start_time
        logger.error(f"❌ Error general en estadísticas generales ({total_time:.2f}s): {str(e)}")
        raise HTTPException(status_code=500, detail="Error al obtener estadísticas generales")

# Trae los quices directamente de MongoDB con info del creador y la materia
# Es la vista principal del modulo de auditoria de quices
@router.get("/quices-creados", dependencies=[Depends(validar_roles([3]))])
async def obtener_quices_creados(
    limite: int = 50,
    tipo_operacion: str = None,
    bd: Session = Depends(get_db)
):
    """
    Lista de quices creados con información completa de materia, creador y preguntas
    Obtiene los datos directamente de MongoDB para asegurar información actualizada
    """
    try:
        logger.info("🔍 Iniciando consulta de auditoría de quizes")
        
        if coleccion_quices is None:
            logger.warning("⚠️ Colección quices no disponible, retornando datos vacíos")
            return {
                "quizes": [],
                "total": 0,
                "fecha_consulta": datetime.utcnow().isoformat(),
                "mongo_disponible": False
            }
        
        logger.info(f"📊 Colección quices disponible, consultando {limite} registros")
        
        # Obtener quices directamente de MongoDB ordenados por fecha de creación
        import asyncio
        try:
            quices = await asyncio.wait_for(
                coleccion_quices.find({})
                .sort("metadatos.fecha_creacion", -1)
                .limit(limite)
                .to_list(length=limite),
                timeout=5.0  # 5 segundos timeout
            )
            logger.info(f"📝 Quices encontrados: {len(quices)}")
        except asyncio.TimeoutError:
            logger.warning("⏰ MongoDB timeout en quices (5s), usando fallback")
            quices = []
        
        # Enriquecer con información del creador y materia
        resultado = []
        for i, quiz in enumerate(quices):
            try:
                metadatos = quiz.get("metadatos", {})
                creador_id = metadatos.get("autor_id") or quiz.get("autor_id") or quiz.get("creador_id")
                materia_id = metadatos.get("materia_id") or quiz.get("materia_id")
                
                # Obtener información del creador
                creador = None
                if creador_id:
                    try:
                        creador_result = bd.execute(
                            select(Usuario).where(Usuario.usu_id == creador_id)
                        )
                        creador_obj = creador_result.scalar_one_or_none()
                        if creador_obj:
                            creador = {
                                "id": creador_obj.usu_id,
                                "nombre": creador_obj.usu_nombre,
                                "apellido": creador_obj.usu_apellido,
                                "email": creador_obj.usu_email
                            }
                    except Exception as e:
                        logger.warning(f"Error al obtener creador {creador_id}: {str(e)}")
                
                # Si no se encontró creador por ID, intentar obtener por email
                if not creador:
                    creador_email = metadatos.get("autor_email") or quiz.get("autor_email") or metadatos.get("email")
                    if creador_email:
                        try:
                            creador_result = bd.execute(
                                select(Usuario).where(Usuario.usu_email == creador_email)
                            )
                            creador_obj = creador_result.scalar_one_or_none()
                            if creador_obj:
                                creador = {
                                    "id": creador_obj.usu_id,
                                    "nombre": creador_obj.usu_nombre,
                                    "apellido": creador_obj.usu_apellido,
                                    "email": creador_obj.usu_email
                                }
                        except Exception as e:
                            logger.warning(f"Error al obtener creador por email {creador_email}: {str(e)}")
                
                # Si no se encontró creador, usar nombre del metadatos
                if not creador:
                    autor_nombre = metadatos.get("autor_nombre") or metadatos.get("nombre_autor") or quiz.get("autor_nombre")
                    autor_apellido = metadatos.get("autor_apellido") or quiz.get("autor_apellido")
                    if autor_nombre:
                        creador = {
                            "id": 0,
                            "nombre": autor_nombre,
                            "apellido": autor_apellido or "",
                            "email": ""
                        }
                
                # Obtener información de la materia
                materia = None
                tema_quiz = metadatos.get("tema", "")
                quiz_id_str = str(quiz.get("_id", ""))
                materia_id = metadatos.get("materia_id") or metadatos.get("id_materia") or quiz.get("materia_id")

                # 1. Buscar materia directamente por materia_id en los metadatos
                if materia_id:
                    try:
                        materia_obj = bd.execute(
                            select(Materia).where(Materia.mat_id == int(materia_id))
                        ).scalar_one_or_none()
                        if materia_obj:
                            materia = {
                                "id": materia_obj.mat_id,
                                "nombre": materia_obj.mat_nombre,
                                "codigo": materia_obj.mat_codigo
                            }
                            logger.info(f"✅ Materia encontrada por metadatos para quiz {quiz_id_str}: {materia_obj.mat_nombre}")
                    except Exception as e:
                        logger.warning(f"Error al obtener materia por metadatos para quiz {quiz_id_str}: {str(e)}")

                # 2. Buscar la materia a través de las sesiones asociadas a este quiz
                if not materia:
                    try:
                        sesion_result = bd.execute(
                            select(SesionQuiz, Materia)
                            .join(Materia, SesionQuiz.ses_fk_materia == Materia.mat_id)
                            .where(SesionQuiz.ses_id_mongo_quiz == quiz_id_str)
                            .order_by(desc(SesionQuiz.ses_fecha_inicio))
                            .limit(1)
                        ).first()

                        if sesion_result:
                            sesion, materia_obj = sesion_result
                            materia = {
                                "id": materia_obj.mat_id,
                                "nombre": materia_obj.mat_nombre,
                                "codigo": materia_obj.mat_codigo
                            }
                            logger.info(f"✅ Materia encontrada por sesión para quiz {quiz_id_str}: {materia_obj.mat_nombre}")
                    except Exception as e:
                        logger.warning(f"Error al obtener materia por sesión para quiz {quiz_id_str}: {str(e)}")
                
                # Obtener cantidad de preguntas
                preguntas = quiz.get("preguntas", [])
                cantidad_preguntas = len(preguntas)
                
                resultado.append({
                    "quiz_id": str(quiz.get("_id", "")),
                    "titulo": metadatos.get("titulo", "Sin título"),
                    "tema": tema_quiz,
                    "cantidad_preguntas": cantidad_preguntas,
                    "fecha_creacion": metadatos.get("fecha_creacion"),
                    "creador": creador,
                    "profesor": creador,
                    "tipo_operacion": "creacion",
                    "materia": materia or {
                        "id": 0,
                        "nombre": "Sin materia",
                        "codigo": ""
                    }
                })
                
                if i == 0:
                    logger.info(f"📝 Primer quiz procesado: {metadatos.get('titulo')} - {cantidad_preguntas} preguntas - creador: {creador}")
                    
            except Exception as e:
                logger.error(f"❌ Error procesando quiz {i}: {str(e)}")
                continue
        
        logger.info(f"✅ Auditoría de quices completada: {len(resultado)} resultados")
        return {
            "quices": resultado,
            "total": len(resultado),
            "fecha_consulta": datetime.utcnow().isoformat(),
            "mongo_disponible": True
        }
        
    except Exception as e:
        logger.error(f"❌ Error general en auditoría de quizes: {str(e)}")
        raise HTTPException(status_code=500, detail="Error al obtener auditoría de quizes")

# Muestra el historial de cambios sobre quices con filtros por tipo, profesor, materia y fechas
# Los datos vienen de la coleccion de auditoria en MongoDB
# Tiene paginacion para no cargar todo de golpe
@router.get("/quices-historial", dependencies=[Depends(validar_roles([3]))])
async def obtener_quices_historial(
    limite: int = 50,
    tipo_operacion: str = None,
    profesor_id: int = None,
    materia_id: int = None,
    search: str = None,
    fecha_desde: str = None,
    fecha_hasta: str = None,
    pagina: int = 1,
    por_pagina: int = 50,
    bd: Session = Depends(get_db)
):
    """
    Historial de operaciones sobre quices (creación, modificación, eliminación)
    Obtiene los datos de MongoDB (coleccion_auditoria).
    Soporta filtros: tipo_operacion, profesor_id, materia_id, search, fecha_desde, fecha_hasta
    """
    try:
        logger.info("🔍 Iniciando consulta de historial de quices")

        if coleccion_auditoria is None:
            logger.warning("⚠️ Colección auditoría no disponible, retornando datos vacíos")
            return {
                "operaciones": [],
                "total": 0,
                "fecha_consulta": datetime.utcnow().isoformat(),
                "mongo_disponible": False
            }

        logger.info(f"📊 Colección auditoría disponible, consultando hasta {limite} registros")

        # Construir filtro base para operaciones de quices
        filtro = {
            "tipo_operacion": {"$in": ["QUIZ_CREACION", "QUIZ_MODIFICACION", "QUIZ_ELIMINACION"]}
        }

        # Filtrar por tipo de operación
        if tipo_operacion:
            tipo_map = {
                "creacion": "QUIZ_CREACION",
                "modificacion": "QUIZ_MODIFICACION",
                "eliminacion": "QUIZ_ELIMINACION"
            }
            if tipo_operacion in tipo_map:
                filtro["tipo_operacion"] = tipo_map[tipo_operacion]

        # Filtrar por profesor (usuario.id dentro del subdocumento usuario)
        if profesor_id is not None:
            filtro["usuario.id"] = profesor_id

        # Filtrar por materia (detalles.materia.id)
        if materia_id is not None:
            filtro["detalles.materia.id"] = materia_id

        # Filtrar por rango de fechas
        if fecha_desde or fecha_hasta:
            filtro_fecha = {}
            if fecha_desde:
                try:
                    filtro_fecha["$gte"] = datetime.fromisoformat(fecha_desde)
                except ValueError:
                    pass
            if fecha_hasta:
                try:
                    filtro_fecha["$lte"] = datetime.fromisoformat(fecha_hasta)
                except ValueError:
                    pass
            if filtro_fecha:
                filtro["fecha_operacion"] = filtro_fecha

        # Búsqueda por texto (título del quiz)
        if search:
            filtro["$or"] = [
                {"detalles.quiz_titulo": {"$regex": search, "$options": "i"}},
                {"detalles.materia.nombre": {"$regex": search, "$options": "i"}},
                {"usuario.nombre": {"$regex": search, "$options": "i"}},
                {"usuario.apellido": {"$regex": search, "$options": "i"}}
            ]

        # Paginación
        skip = (pagina - 1) * por_pagina
        limit_count = min(por_pagina, limite)

        # Obtener operaciones de auditoría
        import asyncio
        try:
            cursor = coleccion_auditoria.find(filtro).sort("fecha_operacion", -1)
            total_count = await asyncio.wait_for(
                coleccion_auditoria.count_documents(filtro),
                timeout=5.0
            )
            operaciones = await asyncio.wait_for(
                cursor.skip(skip).limit(limit_count).to_list(length=limit_count),
                timeout=5.0
            )
            logger.info(f"📝 Operaciones encontradas: {len(operaciones)} de {total_count}")
        except asyncio.TimeoutError:
            logger.warning("⏰ MongoDB timeout en historial (5s), usando fallback")
            operaciones = []
            total_count = 0

        # Enriquecer con información del usuario
        resultado = []
        for i, operacion in enumerate(operaciones):
            try:
                if operacion is None:
                    continue

                usuario_data = operacion.get("usuario")
                usuario_id = usuario_data.get("id") if isinstance(usuario_data, dict) else None

                # Obtener información del usuario desde PostgreSQL
                usuario = None
                if usuario_id:
                    try:
                        usuario_result = bd.execute(
                            select(Usuario).where(Usuario.usu_id == usuario_id)
                        )
                        usuario_obj = usuario_result.scalar_one_or_none()
                        if usuario_obj:
                            usuario = {
                                "id": usuario_obj.usu_id,
                                "nombre": usuario_obj.usu_nombre,
                                "apellido": usuario_obj.usu_apellido,
                                "email": usuario_obj.usu_email
                            }
                    except Exception as e:
                        logger.warning(f"Error al obtener usuario {usuario_id}: {str(e)}")

                # Fallback: usar datos de usuario guardados en MongoDB
                if usuario is None and isinstance(usuario_data, dict) and usuario_data.get("nombre"):
                    usuario = {
                        "id": usuario_data.get("id"),
                        "nombre": usuario_data.get("nombre"),
                        "apellido": usuario_data.get("apellido"),
                        "email": usuario_data.get("email")
                    }

                entidad = operacion.get("entidad") or {}
                detalles = operacion.get("detalles") or {}
                cambio = operacion.get("cambio") or {}

                resultado.append({
                    "tipo_operacion": operacion.get("tipo_operacion"),
                    "nombre_operacion": operacion.get("nombre_operacion"),
                    "fecha_operacion": operacion.get("fecha_operacion"),
                    "usuario": usuario,
                    "entidad": entidad,
                    "detalles": detalles,
                    "cambio": {
                        "datos_anteriores": cambio.get("datos_anteriores"),
                        "datos_nuevos": cambio.get("datos_nuevos")
                    },
                    "contexto": operacion.get("contexto"),
                    "quiz_id": detalles.get("quiz_id") or entidad.get("id"),
                    "quiz_titulo": detalles.get("quiz_titulo") or entidad.get("nombre"),
                    "materia": detalles.get("materia"),
                    "cantidad_preguntas": detalles.get("cantidad_preguntas")
                })

            except Exception as e:
                logger.error(f"❌ Error procesando operación {i}: {str(e)}")
                continue

        logger.info(f"✅ Historial de quices completado: {len(resultado)} resultados")
        return {
            "operaciones": resultado,
            "total": total_count,
            "pagina": pagina,
            "por_pagina": por_pagina,
            "fecha_consulta": datetime.utcnow().isoformat(),
            "mongo_disponible": True
        }

    except Exception as e:
        logger.error(f"❌ Error general en historial de quices: {str(e)}")
        raise HTTPException(status_code=500, detail="Error al obtener historial de quices")



# Las sesiones mas recientes con el listado de participantes y sus notas
# Tambien trae el titulo del quiz desde MongoDB y el estado actual de cada sesion
@router.get("/sesiones-recientes", dependencies=[Depends(validar_roles([3]))])
async def obtener_sesiones_recientes(
    limite: int = 20,
    bd: Session = Depends(get_db)
):
    """
    Sesiones de quiz recientes con datos completos: profesor, participantes, código, estado y listado de usuarios
    """
    try:
        logger.info(f"🔍 Buscando sesiones recientes (limite={limite})")
        sesiones = bd.execute(
            select(
                SesionQuiz.ses_id,
                SesionQuiz.ses_codigo_acceso,
                SesionQuiz.ses_nombre_grupo,
                SesionQuiz.ses_estatus,
                SesionQuiz.ses_activo,
                SesionQuiz.ses_eliminado,
                SesionQuiz.ses_fecha_inicio,
                SesionQuiz.ses_fecha_fin,
                Materia.mat_nombre,
                Materia.mat_codigo,
                Usuario.usu_id,
                Usuario.usu_nombre,
                Usuario.usu_apellido,
                Usuario.usu_email,
                SesionQuiz.ses_id_mongo_quiz,
                SesionQuiz.ses_tipo
            )
            .join(Materia, SesionQuiz.ses_fk_materia == Materia.mat_id)
            .outerjoin(Usuario, Materia.mat_fk_profesor == Usuario.usu_id)
            .order_by(desc(SesionQuiz.ses_fecha_inicio))
            .limit(limite)
        ).all()
        resultado = []
        for sesion in sesiones:
            # Obtener participantes reales con información de usuarios
            participantes_query = bd.execute(
                select(Resultado, Usuario)
                .join(Usuario, Resultado.res_fk_usuario == Usuario.usu_id)
                .where(Resultado.res_fk_sesion == sesion[0])
            )
            participantes = participantes_query.all()
            
            # Formatear participantes
            participantes_lista = []
            for res, usu in participantes:
                participantes_lista.append({
                    "usuario": {
                        "id": usu.usu_id,
                        "nombre": usu.usu_nombre,
                        "apellido": usu.usu_apellido,
                        "email": usu.usu_email
                    },
                    "nota_final": float(res.res_nota_final) if res.res_nota_final else 0,
                    "fecha_completado": res.res_hora_final_real.isoformat() if res.res_hora_final_real else None,
                    "estado": "completado" if res.res_hora_final_real else "en curso"
                })
            
            # Determinar estado de la sesión
            ahora = datetime.utcnow()
            fecha_inicio = sesion[6]
            fecha_fin = sesion[7]
            estado_sesion = "en curso"
            if ahora < fecha_inicio:
                estado_sesion = "programada"
            elif ahora > fecha_fin:
                estado_sesion = "finalizada"
            
            # Obtener datos del quiz desde MongoDB (título y tema/materia)
            nombre_sesion = sesion[2] or "Sin nombre"
            tema_materia = sesion[8] or "Sin materia"
            mat_codigo = sesion[9] or ""
            quiz_id_str = sesion[14]
            tipo_sesion_db = sesion[15] or 'normal'
            
            if quiz_id_str:
                try:
                    obj_id = ObjectId(quiz_id_str)
                    quiz = await coleccion_quices.find_one({"_id": obj_id})
                    if quiz and quiz.get("metadatos"):
                        metadatos = quiz["metadatos"]
                        titulo_quiz = metadatos.get("titulo")
                        if titulo_quiz:
                            nombre_sesion = titulo_quiz
                        tema_quiz = metadatos.get("tema")
                        if tema_quiz:
                            tema_materia = tema_quiz
                except Exception as e:
                    logger.warning(f"⚠️ Error obteniendo quiz {quiz_id_str}: {str(e)}")
            
            resultado.append({
                "sesion_id": sesion[0],
                "codigo_acceso": sesion[1],
                "nombre_grupo": nombre_sesion,
                "estatus": sesion[3],
                "activo": sesion[4],
                "eliminado": sesion[5] or False,
                "estado": estado_sesion,
                "tipo_sesion": tipo_sesion_db,
                "fecha_creacion": sesion[6].isoformat() if isinstance(sesion[6], datetime) else str(sesion[6]),
                "fecha_inicio": sesion[6].isoformat() if isinstance(sesion[6], datetime) else str(sesion[6]),
                "fecha_fin": sesion[7].isoformat() if isinstance(sesion[7], datetime) else str(sesion[7]),
                "materia": {
                    "nombre": tema_materia,
                    "codigo": mat_codigo
                },
                "profesor": {
                    "id": sesion[10],
                    "nombre": sesion[11],
                    "apellido": sesion[12],
                    "email": sesion[13]
                },
                "creador": {
                    "id": sesion[10],
                    "nombre": sesion[11],
                    "apellido": sesion[12],
                    "email": sesion[13]
                },
                "participantes_count": len(participantes_lista),
                "participantes": participantes_lista
            })
        
        logger.info(f"✅ Retornando {len(resultado)} sesiones recientes")
        return {
            "sesiones": resultado,
            "total": len(resultado),
            "fecha_consulta": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error en sesiones recientes: {str(e)}")
        raise HTTPException(status_code=500, detail="Error al obtener sesiones recientes")


# Lista las materias con cuantas personas presentaron quices (no cuantas estan inscritas)
# Sirve para ver que materias tienen actividad real
@router.get("/materias-auditoria", dependencies=[Depends(validar_roles([3]))])
async def obtener_materias_auditoria(limite: int = 100, bd: Session = Depends(get_db)):
    """
    Endpoint que devuelve listado de materias con estadísticas para auditoría.
    Muestra personas que presentan quizes de esa materia en lugar de alumnos inscritos.
    """
    try:
        materias = bd.execute(
            select(
                Materia.mat_id,
                Materia.mat_nombre,
                Materia.mat_codigo,
                Materia.mat_activo,
                Materia.mat_eliminado,
                Materia.mat_fecha_eliminacion,
                Materia.mat_eliminado_por,
                Materia.mat_fecha_creacion,
                Usuario.usu_id,
                Usuario.usu_nombre,
                Usuario.usu_apellido,
                Usuario.usu_email
            )
            .join(Usuario, Materia.mat_fk_profesor == Usuario.usu_id)
            .where(Materia.mat_eliminado == False)
            .limit(limite)
        ).all()

        resultado = []
        for m in materias:
            mat_id = m[0]
            # Contar sesiones activas para la materia
            sesiones_activas = bd.execute(
                select(func.count(SesionQuiz.ses_id)).where(
                    SesionQuiz.ses_fk_materia == mat_id,
                    SesionQuiz.ses_activo == True
                )
            ).scalar() or 0

            # Contar personas que presentan quizes de esta materia (a través de sesiones)
            personas_presentan_quizes = bd.execute(
                select(func.count(Resultado.res_id.distinct()))
                .join(SesionQuiz, Resultado.res_fk_sesion == SesionQuiz.ses_id)
                .where(SesionQuiz.ses_fk_materia == mat_id)
            ).scalar() or 0

            eliminado_por = None
            if m[6]:
                usuario_elim = bd.execute(
                    select(Usuario.usu_id, Usuario.usu_nombre, Usuario.usu_apellido).where(Usuario.usu_id == m[6])
                ).first()
                if usuario_elim:
                    eliminado_por = {"id": usuario_elim[0], "nombre": usuario_elim[1], "apellido": usuario_elim[2]}

            resultado.append({
                "materia_id": mat_id,
                "nombre": m[1],
                "codigo": m[2],
                "activo": bool(m[3]),
                "eliminado": bool(m[4]),
                "fecha_eliminacion": m[5].isoformat() if m[5] else None,
                "eliminado_por": eliminado_por,
                "fecha_creacion": m[7].isoformat() if m[7] else None,
                "profesor_actual": {"id": m[8], "nombre": m[9], "apellido": m[10], "email": m[11]},
                "estadisticas": {
                    "sesiones_activas": sesiones_activas,
                    "personas_presentan_quizes": personas_presentan_quizes
                }
            })

        return {"materias": resultado, "total": len(resultado), "fecha_consulta": datetime.utcnow().isoformat()}
    except Exception as e:
        logger.error(f"Error en materias-auditoria: {str(e)}")
        raise HTTPException(status_code=500, detail="Error al obtener materias para auditoría")





# Muestra todos los elementos que se eliminaron logicamente y se pueden restaurar
# Se puede filtrar por tipo: usuarios, materias, sesiones o resultados
@router.get("/papelera-reciclaje", dependencies=[Depends(validar_roles([3]))])
async def obtener_papelera_reciclaje(
    tipo: str = None,
    limite: int = 50,
    bd: Session = Depends(get_db)
):
    """
    Endpoint que devuelve los elementos eliminados lógicamente (papelera de reciclaje)
    Se puede filtrar por tipo: usuarios, materias, sesiones, resultados
    """
    try:
        logger.info(f"🗑️ Obteniendo papelera de reciclaje (tipo={tipo}, limite={limite})")
        
        resultado = {
            "usuarios": [],
            "materias": [],
            "sesiones": [],
            "resultados": [],
            "total": 0,
            "fecha_consulta": datetime.utcnow().isoformat()
        }
        
        # Usuarios eliminados
        if tipo is None or tipo == "usuarios":
            usuarios_eliminados = bd.execute(
                select(Usuario.usu_id, Usuario.usu_nombre, Usuario.usu_apellido, Usuario.usu_email, Usuario.usu_fecha_eliminacion, Usuario.usu_eliminado_por)
                .where(Usuario.usu_eliminado == True)
                .limit(limite)
            ).all()
            
            for u in usuarios_eliminados:
                eliminado_por = None
                if u[5]:
                    usuario_elim = bd.execute(
                        select(Usuario.usu_nombre, Usuario.usu_apellido).where(Usuario.usu_id == u[5])
                    ).first()
                    if usuario_elim:
                        eliminado_por = f"{usuario_elim[0]} {usuario_elim[1]}"
                
                resultado["usuarios"].append({
                    "id": u[0],
                    "nombre": u[1],
                    "apellido": u[2],
                    "email": u[3],
                    "fecha_eliminacion": u[4].isoformat() if u[4] else None,
                    "eliminado_por": eliminado_por
                })
        
        # Materias eliminadas
        if tipo is None or tipo == "materias":
            materias_eliminadas = bd.execute(
                select(Materia.mat_id, Materia.mat_nombre, Materia.mat_codigo, Materia.mat_fecha_eliminacion, Materia.mat_eliminado_por)
                .where(Materia.mat_eliminado == True)
                .limit(limite)
            ).all()
            
            for m in materias_eliminadas:
                eliminado_por = None
                if m[4]:
                    usuario_elim = bd.execute(
                        select(Usuario.usu_nombre, Usuario.usu_apellido).where(Usuario.usu_id == m[4])
                    ).first()
                    if usuario_elim:
                        eliminado_por = f"{usuario_elim[0]} {usuario_elim[1]}"
                
                resultado["materias"].append({
                    "id": m[0],
                    "nombre": m[1],
                    "codigo": m[2],
                    "fecha_eliminacion": m[3].isoformat() if m[3] else None,
                    "eliminado_por": eliminado_por
                })
        
        # Sesiones eliminadas
        if tipo is None or tipo == "sesiones":
            sesiones_eliminadas = bd.execute(
                select(SesionQuiz.ses_id, SesionQuiz.ses_codigo_acceso, SesionQuiz.ses_nombre_grupo, SesionQuiz.ses_fecha_eliminacion, SesionQuiz.ses_eliminado_por)
                .where(SesionQuiz.ses_eliminado == True)
                .limit(limite)
            ).all()
            
            for s in sesiones_eliminadas:
                eliminado_por = None
                if s[4]:
                    usuario_elim = bd.execute(
                        select(Usuario.usu_nombre, Usuario.usu_apellido).where(Usuario.usu_id == s[4])
                    ).first()
                    if usuario_elim:
                        eliminado_por = f"{usuario_elim[0]} {usuario_elim[1]}"
                
                resultado["sesiones"].append({
                    "id": s[0],
                    "codigo_acceso": s[1],
                    "nombre_grupo": s[2],
                    "fecha_eliminacion": s[3].isoformat() if s[3] else None,
                    "eliminado_por": eliminado_por
                })
        
        # Resultados eliminados
        if tipo is None or tipo == "resultados":
            resultados_eliminados = bd.execute(
                select(Resultado.res_id, Resultado.res_nota_final, Resultado.res_fecha_eliminacion, Resultado.res_eliminado_por)
                .where(Resultado.res_eliminado == True)
                .limit(limite)
            ).all()
            
            for r in resultados_eliminados:
                eliminado_por = None
                if r[3]:
                    usuario_elim = bd.execute(
                        select(Usuario.usu_nombre, Usuario.usu_apellido).where(Usuario.usu_id == r[3])
                    ).first()
                    if usuario_elim:
                        eliminado_por = f"{usuario_elim[0]} {usuario_elim[1]}"
                
                resultado["resultados"].append({
                    "id": r[0],
                    "nota_final": float(r[1]) if r[1] else 0,
                    "fecha_eliminacion": r[2].isoformat() if r[2] else None,
                    "eliminado_por": eliminado_por
                })
        
        resultado["total"] = len(resultado["usuarios"]) + len(resultado["materias"]) + len(resultado["sesiones"]) + len(resultado["resultados"])
        
        logger.info(f"✅ Papelera de reciclaje obtenida: {resultado['total']} elementos")
        return resultado
        
    except Exception as e:
        logger.error(f"Error en papelera-reciclaje: {str(e)}")
        raise HTTPException(status_code=500, detail="Error al obtener papelera de reciclaje")


# Restaura un elemento que estaba en la papelera: le quita la marca de eliminado
# Valida que el tipo sea uno de los permitidos: usuario, materia, sesion, resultado
@router.post("/restaurar-elemento", dependencies=[Depends(validar_roles([3]))])
async def restaurar_elemento(
    tipo: str,
    elemento_id: int,
    usuario_id: int,
    bd: Session = Depends(get_db)
):
    """
    Endpoint para restaurar un elemento de la papelera de reciclaje
    Tipos: usuario, materia, sesion, resultado
    """
    try:
        logger.info(f"♻️ Restaurando elemento: tipo={tipo}, id={elemento_id}, usuario={usuario_id}")
        
        if tipo == "usuario":
            usuario = bd.execute(
                select(Usuario).where(Usuario.usu_id == elemento_id)
            ).first()
            if not usuario:
                raise HTTPException(status_code=404, detail="Usuario no encontrado")
            
            usuario.usu_eliminado = False
            usuario.usu_fecha_eliminacion = None
            usuario.usu_eliminado_por = None
            usuario.usu_activo = True
            bd.commit()
            
            logger.info(f"✅ Usuario {elemento_id} restaurado")
            return {"mensaje": "Usuario restaurado exitosamente", "tipo": "usuario", "id": elemento_id}
        
        elif tipo == "materia":
            materia = bd.execute(
                select(Materia).where(Materia.mat_id == elemento_id)
            ).first()
            if not materia:
                raise HTTPException(status_code=404, detail="Materia no encontrada")
            
            materia.mat_eliminado = False
            materia.mat_fecha_eliminacion = None
            materia.mat_eliminado_por = None
            materia.mat_activo = True
            bd.commit()
            
            logger.info(f"✅ Materia {elemento_id} restaurada")
            return {"mensaje": "Materia restaurada exitosamente", "tipo": "materia", "id": elemento_id}
        
        elif tipo == "sesion":
            sesion = bd.execute(
                select(SesionQuiz).where(SesionQuiz.ses_id == elemento_id)
            ).first()
            if not sesion:
                raise HTTPException(status_code=404, detail="Sesión no encontrada")
            
            sesion.ses_eliminado = False
            sesion.ses_fecha_eliminacion = None
            sesion.ses_eliminado_por = None
            sesion.ses_activo = True
            bd.commit()
            
            logger.info(f"✅ Sesión {elemento_id} restaurada")
            return {"mensaje": "Sesión restaurada exitosamente", "tipo": "sesion", "id": elemento_id}
        
        elif tipo == "resultado":
            resultado = bd.execute(
                select(Resultado).where(Resultado.res_id == elemento_id)
            ).first()
            if not resultado:
                raise HTTPException(status_code=404, detail="Resultado no encontrado")
            
            resultado.res_eliminado = False
            resultado.res_fecha_eliminacion = None
            resultado.res_eliminado_por = None
            bd.commit()
            
            logger.info(f"✅ Resultado {elemento_id} restaurado")
            return {"mensaje": "Resultado restaurado exitosamente", "tipo": "resultado", "id": elemento_id}
        
        else:
            raise HTTPException(status_code=400, detail="Tipo de elemento no válido")
        
    except Exception as e:
        logger.error(f"Error al restaurar elemento: {str(e)}")
        raise HTTPException(status_code=500, detail="Error al restaurar elemento")


# Trae el historial de creacion, modificacion y eliminacion de materias desde MongoDB
# Sirve para que el master vea quien cambio que y cuando
@router.get("/materias-historial", dependencies=[Depends(validar_roles([3]))])
async def obtener_materias_historial(
    limite: int = 50,
    tipo_operacion: str = None,
    bd: Session = Depends(get_db)
):
    """
    Lista de operaciones de auditoría de materias (creación, modificación, eliminación)
    Se puede filtrar por tipo_operacion: MATERIA_CREACION, MATERIA_MODIFICACION, MATERIA_ELIMINACION
    """
    try:
        logger.info("🔍 Iniciando consulta de auditoría de materias")
        
        if coleccion_auditoria is None:
            logger.warning("⚠️ Colección auditoría no disponible, retornando datos vacíos")
            return {
                "materias": [],
                "total": 0,
                "fecha_consulta": datetime.utcnow().isoformat(),
                "mongo_disponible": False
            }
        
        logger.info(f"📊 Colección auditoría disponible, consultando {limite} registros")
        
        # Construir filtro para operaciones de materia
        filtro = {"entidad.tipo": "Materia"}
        if tipo_operacion:
            filtro["tipo_operacion"] = tipo_operacion
        
        # Obtener registros de auditoría ordenados por fecha de operación
        pipeline = [
            {"$match": filtro},
            {"$sort": {"fecha_operacion": -1}},
            {"$limit": limite}
        ]
        
        # Agregar timeout para MongoDB
        import asyncio
        try:
            registros = await asyncio.wait_for(
                coleccion_auditoria.aggregate(pipeline).to_list(length=limite),
                timeout=5.0  # 5 segundos timeout
            )
            logger.info(f"📝 Registros de auditoría encontrados: {len(registros)}")
        except asyncio.TimeoutError:
            logger.warning("⏰ MongoDB timeout en auditoría (5s), usando fallback")
            registros = []
        
        # Enriquecer con información del usuario
        resultado = []
        for i, registro in enumerate(registros):
            try:
                usuario = registro.get("usuario") or {}
                entidad = registro.get("entidad") or {}
                cambio = registro.get("cambio") or {}
                detalles = registro.get("detalles") or {}
                
                resultado.append({
                    "materia_id": entidad.get("id", ""),
                    "nombre": detalles.get("materia_nombre", "Sin nombre"),
                    "codigo": detalles.get("materia_codigo", ""),
                    "fecha_operacion": registro.get("fecha_operacion").isoformat() if isinstance(registro.get("fecha_operacion"), datetime) else str(registro.get("fecha_operacion") or ""),
                    "tipo_operacion": registro.get("tipo_operacion", ""),
                    "nombre_operacion": registro.get("nombre_operacion", ""),
                    "usuario": {
                        "id": usuario.get("id", 0),
                        "nombre": usuario.get("nombre", "Desconocido"),
                        "apellido": usuario.get("apellido", ""),
                        "email": usuario.get("email", ""),
                        "rol": usuario.get("rol", "")
                    },
                    "datos_nuevos": cambio.get("datos_nuevos"),
                    "datos_anteriores": cambio.get("datos_anteriores")
                })
                
                if i == 0:
                    logger.info(f"📝 Primer registro procesado: {detalles.get('materia_nombre')} - {registro.get('tipo_operacion')}")
                    
            except Exception as e:
                logger.error(f"❌ Error procesando registro {i}: {str(e)}")
                continue
        
        logger.info(f"✅ Auditoría de materias completada: {len(resultado)} resultados")
        return {
            "materias": resultado,
            "total": len(resultado),
            "fecha_consulta": datetime.utcnow().isoformat(),
            "mongo_disponible": True
        }
        
    except Exception as e:
        logger.error(f"❌ Error general en auditoría de materias: {str(e)}")
        raise HTTPException(status_code=500, detail="Error al obtener auditoría de materias")


def _sanificar_mongo(obj):
    """Convierte tipos no-JSON-serializables de MongoDB a tipos nativos de Python."""
    if isinstance(obj, dict):
        return {k: _sanificar_mongo(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_sanificar_mongo(item) for item in obj]
    elif hasattr(obj, 'isoformat'):
        return obj.isoformat()
    elif hasattr(obj, '__str__') and not isinstance(obj, (str, int, float, bool, type(None))):
        return str(obj)
    return obj


# Agrupa todos los eventos de una sesion (creacion, inicio, resultados, modificacion, eliminacion)
# Enriquece cada sesion con datos del quiz, la materia y los participantes
@router.get("/sesiones-historial", dependencies=[Depends(validar_roles([3]))])
async def obtener_sesiones_historial(
    limite: int = 200,
    tipo_operacion: str = None,
    bd: Session = Depends(get_db)
):
    """
    Historial de auditoria de sesiones: creacion, inicio, resultado, modificacion, eliminacion.
    Agrupa eventos por sesion y enriquece con datos de quiz, materia y participantes.
    """
    try:
        logger.info("Iniciando consulta de auditoria de sesiones")
        
        if coleccion_auditoria is None:
            logger.warning("Coleccion auditoria no disponible, retornando datos vacios")
            return {
                "sesiones": [],
                "total": 0,
                "total_eventos": 0,
                "fecha_consulta": datetime.utcnow().isoformat(),
                "mongo_disponible": False
            }
        
        filtro = {"entidad.tipo": "SesionQuiz"}
        if tipo_operacion:
            filtro["tipo_operacion"] = tipo_operacion
        
        pipeline = [
            {"$match": filtro},
            {"$sort": {"fecha_operacion": -1}},
            {"$limit": limite}
        ]
        
        import asyncio
        try:
            registros = await asyncio.wait_for(
                coleccion_auditoria.aggregate(pipeline).to_list(length=limite),
                timeout=5.0
            )
            logger.info(f"Registros de auditoria encontrados: {len(registros)}")
        except asyncio.TimeoutError:
            logger.warning("MongoDB timeout en auditoria (5s), usando fallback")
            registros = []
        
        quiz_ids = set()
        materia_ids = set()
        session_ids = set()
        usuario_ids = set()
        
        for registro in registros:
            try:
                detalles = registro.get("detalles", {})
                entidad = registro.get("entidad", {})
                usuario = registro.get("usuario", {})
                
                if detalles.get("quiz_id"):
                    quiz_ids.add(detalles["quiz_id"])
                if detalles.get("materia_id"):
                    try:
                        materia_ids.add(int(detalles["materia_id"]))
                    except (ValueError, TypeError):
                        pass
                if entidad.get("id"):
                    try:
                        session_ids.add(int(entidad["id"]))
                    except (ValueError, TypeError):
                        pass
                if usuario.get("id"):
                    usuario_ids.add(usuario["id"])
            except Exception:
                continue
        
        quiz_titles = {}
        if quiz_ids and coleccion_quices is not None:
            try:
                object_ids = []
                for qid in quiz_ids:
                    try:
                        object_ids.append(ObjectId(qid))
                    except Exception:
                        pass
                if object_ids:
                    quices_cursor = coleccion_quices.find(
                        {"_id": {"$in": object_ids}},
                        {"metadatos.titulo": 1, "metadatos.tema": 1, "metadatos.ponderacion": 1, "metadatos.modo_juego": 1, "preguntas": 1}
                    )
                    quices_list = await asyncio.wait_for(quices_cursor.to_list(length=200), timeout=5.0)
                    for q in quices_list:
                        qid = str(q["_id"])
                        metadatos = q.get("metadatos", {})
                        preguntas = q.get("preguntas", [])
                        quiz_titles[qid] = {
                            "titulo": metadatos.get("titulo", "Sin titulo"),
                            "tema": metadatos.get("tema", ""),
                            "ponderacion": metadatos.get("ponderacion", 100),
                            "modo_juego": metadatos.get("modo_juego", "Igual"),
                            "cantidad_preguntas": len(preguntas),
                        }
            except Exception as e:
                logger.warning(f"Error obteniendo quices: {str(e)}")
        
        materias_info = {}
        if materia_ids:
            try:
                materias_query = bd.execute(
                    select(Materia.mat_id, Materia.mat_nombre, Materia.mat_codigo)
                    .where(Materia.mat_id.in_(materia_ids))
                ).all()
                for m in materias_query:
                    materias_info[m[0]] = {"nombre": m[1], "codigo": m[2]}
            except Exception as e:
                logger.warning(f"Error obteniendo materias: {str(e)}")
        
        sesiones_info = {}
        if session_ids:
            try:
                sesiones_query = bd.execute(
                    select(
                        SesionQuiz.ses_id,
                        SesionQuiz.ses_codigo_acceso,
                        SesionQuiz.ses_nombre_grupo,
                        SesionQuiz.ses_estatus,
                        SesionQuiz.ses_activo,
                        SesionQuiz.ses_eliminado,
                        SesionQuiz.ses_fecha_inicio,
                        SesionQuiz.ses_fecha_fin,
                        SesionQuiz.ses_fk_materia,
                        SesionQuiz.ses_id_mongo_quiz,
                        SesionQuiz.ses_fk_profesor,
                        SesionQuiz.ses_tipo,
                        SesionQuiz.ses_escala_puntuacion
                    )
                    .where(SesionQuiz.ses_id.in_(session_ids))
                ).all()
                for s in sesiones_query:
                    sesiones_info[s[0]] = {
                        "codigo_acceso": s[1],
                        "nombre_grupo": s[2],
                        "estatus": s[3],
                        "activo": s[4],
                        "eliminado": s[5],
                        "fecha_inicio": s[6].isoformat() if s[6] else None,
                        "fecha_fin": s[7].isoformat() if s[7] else None,
                        "materia_id": s[8],
                        "id_mongo_quiz": s[9],
                        "profesor_id": s[10],
                        "tipo_sesion": s[11] or 'normal',
                        "escala_puntuacion": s[12] or 100,
                    }
            except Exception as e:
                logger.warning(f"Error obteniendo sesiones: {str(e)}")
        
        usuarios_info = {}
        if usuario_ids:
            try:
                usuarios_query = bd.execute(
                    select(Usuario.usu_id, Usuario.usu_nombre, Usuario.usu_apellido, Usuario.usu_email, Usuario.usu_fk_rol)
                    .where(Usuario.usu_id.in_(usuario_ids))
                ).all()
                for u in usuarios_query:
                    rol_nombre = "Alumno"
                    if u[4] == 2:
                        rol_nombre = "Profesor"
                    elif u[4] == 3:
                        rol_nombre = "Admin"
                    usuarios_info[u[0]] = {
                        "nombre": u[1],
                        "apellido": u[2],
                        "email": u[3],
                        "rol": rol_nombre,
                    }
            except Exception as e:
                logger.warning(f"Error obteniendo usuarios: {str(e)}")
        
        participantes_por_sesion = {}
        if session_ids:
            try:
                for sid in session_ids:
                    participantes_query = bd.execute(
                        select(
                            Resultado.res_fk_usuario,
                            Resultado.res_nota_final,
                            Resultado.res_puntos_ganados_app,
                            Resultado.res_tiempo_total_ms,
                            Resultado.res_hora_inicio_real,
                            Resultado.res_hora_final_real,
                            Resultado.res_repeticiones,
                            Resultado.res_fecha_primera_vez,
                            Usuario.usu_nombre,
                            Usuario.usu_apellido,
                            Usuario.usu_email
                        )
                        .join(Usuario, Resultado.res_fk_usuario == Usuario.usu_id)
                        .where(Resultado.res_fk_sesion == sid)
                        .where(Resultado.res_eliminado == False)
                        .order_by(desc(Resultado.res_nota_final))
                    ).all()
                    
                    participantes = []
                    for p in participantes_query:
                        participantes.append({
                            "usuario_id": p[0],
                            "nombre": p[8],
                            "apellido": p[9],
                            "email": p[10],
                            "nota_final": float(p[1]) if p[1] else 0,
                            "puntos_ganados": p[2] or 0,
                            "tiempo_total_ms": p[3] or 0,
                            "hora_inicio": p[4].isoformat() if p[4] else None,
                            "hora_fin": p[5].isoformat() if p[5] else None,
                            "repeticiones": p[6] or 0,
                            "fecha_primera_vez": p[7].isoformat() if p[7] else None,
                        })
                    participantes_por_sesion[sid] = participantes
            except Exception as e:
                logger.warning(f"Error obteniendo participantes: {str(e)}")
        
        sesiones_agrupadas = {}
        orden_sesiones = []
        
        for registro in registros:
            try:
                usuario_mongo = registro.get("usuario", {})
                entidad = registro.get("entidad", {})
                cambio = registro.get("cambio", {})
                detalles = registro.get("detalles", {})
                
                sesion_id_raw = entidad.get("id", "")
                try:
                    sesion_id = int(sesion_id_raw)
                except (ValueError, TypeError):
                    sesion_id = sesion_id_raw
                
                tipo_op = registro.get("tipo_operacion", "")
                fecha_op = registro.get("fecha_operacion", "")
                fecha_op_str = fecha_op.isoformat() if isinstance(fecha_op, datetime) else str(fecha_op)
                
                usuario_id = usuario_mongo.get("id", 0)
                usuario_enriquecido = usuarios_info.get(usuario_id, {
                    "nombre": usuario_mongo.get("nombre", "Desconocido"),
                    "apellido": usuario_mongo.get("apellido", ""),
                    "email": usuario_mongo.get("email", ""),
                    "rol": usuario_mongo.get("rol", ""),
                })
                
                quiz_id = detalles.get("quiz_id", "")
                quiz_info = quiz_titles.get(quiz_id, {})
                quiz_titulo = quiz_info.get("titulo", "Quiz desconocido")
                quiz_tema = quiz_info.get("tema", "")
                quiz_ponderacion = sesiones_info.get(sesion_id, {}).get("escala_puntuacion", 100) or quiz_info.get("ponderacion", 100)
                quiz_modo = quiz_info.get("modo_juego", "Igual")
                quiz_cantidad_preguntas = quiz_info.get("cantidad_preguntas", 0)
                
                materia_id_raw = detalles.get("materia_id", "")
                try:
                    materia_id = int(materia_id_raw)
                except (ValueError, TypeError):
                    materia_id = None
                materia_info = materias_info.get(materia_id, {}) if materia_id else {}
                materia_nombre = materia_info.get("nombre", "Sin materia")
                materia_codigo = materia_info.get("codigo", "")
                
                sesion_info = sesiones_info.get(sesion_id, {})
                codigo_acceso = detalles.get("codigo_acceso", "") or sesion_info.get("codigo_acceso", "")
                nombre_grupo = sesion_info.get("nombre_grupo", "") or quiz_titulo
                sesion_estatus = sesion_info.get("estatus", "")
                sesion_activo = sesion_info.get("activo", True)
                sesion_eliminado = sesion_info.get("eliminado", False)
                sesion_fecha_inicio = sesion_info.get("fecha_inicio")
                sesion_fecha_fin = sesion_info.get("fecha_fin")
                sesion_tipo = sesion_info.get("tipo_sesion", "normal")
                
                # Fix: si la sesion no existe en PostgreSQL (hard-eliminada antes del soft delete)
                # inferir estado desde los eventos de MongoDB
                if not sesion_info:
                    eventos_existentes = sesiones_agrupadas.get(sesion_id, {}).get("eventos", [])
                    tipos_eventos = {e.get("tipo_operacion") for e in eventos_existentes}
                    tipos_eventos.add(tipo_op)
                    if "SESION_ELIMINACION" in tipos_eventos:
                        sesion_eliminado = True
                        sesion_activo = False
                        sesion_estatus = "Eliminado"
                
                evento = {
                    "fecha_operacion": fecha_op_str,
                    "tipo_operacion": tipo_op,
                    "nombre_operacion": registro.get("nombre_operacion", ""),
                    "usuario": usuario_enriquecido,
                    "datos_nuevos": _sanificar_mongo(cambio.get("datos_nuevos")),
                    "datos_anteriores": _sanificar_mongo(cambio.get("datos_anteriores")),
                    "detalles_mongo": _sanificar_mongo(detalles),
                }
                
                if tipo_op == "SESION_RESULTADO":
                    evento["nota_final"] = detalles.get("nota_final", 0)
                    evento["puntos_ganados"] = detalles.get("puntos_ganados", 0)
                    evento["es_repeticion"] = detalles.get("es_repeticion", False)
                
                if sesion_id not in sesiones_agrupadas:
                    if sesion_id not in orden_sesiones:
                        orden_sesiones.append(sesion_id)
                    sesiones_agrupadas[sesion_id] = {
                        "sesion_id": sesion_id,
                        "codigo_acceso": codigo_acceso,
                        "nombre_grupo": nombre_grupo,
                        "quiz_id": quiz_id,
                        "quiz_titulo": quiz_titulo,
                        "quiz_tema": quiz_tema,
                        "quiz_ponderacion": quiz_ponderacion,
                        "quiz_modo_juego": quiz_modo,
                        "quiz_cantidad_preguntas": quiz_cantidad_preguntas,
                        "materia": {
                            "id": materia_id,
                            "nombre": materia_nombre,
                            "codigo": materia_codigo,
                        },
                        "estatus": sesion_estatus,
                        "activo": sesion_activo,
                        "eliminado": sesion_eliminado,
                        "tipo_sesion": sesion_tipo,
                        "fecha_inicio": sesion_fecha_inicio,
                        "fecha_fin": sesion_fecha_fin,
                        "eventos": [],
                        "participantes": participantes_por_sesion.get(sesion_id, []),
                        "total_participantes": len(participantes_por_sesion.get(sesion_id, [])),
                    }
                
                sesiones_agrupadas[sesion_id]["eventos"].append(evento)
                
            except Exception as e:
                logger.error(f"Error procesando registro: {str(e)}")
                continue
        
        resultado = [sesiones_agrupadas[sid] for sid in orden_sesiones if sid in sesiones_agrupadas]
        
        logger.info(f"Auditoria de sesiones completada: {len(resultado)} sesiones, {len(registros)} eventos")
        return {
            "sesiones": resultado,
            "total": len(resultado),
            "total_eventos": len(registros),
            "fecha_consulta": datetime.utcnow().isoformat(),
            "mongo_disponible": True
        }
        
    except Exception as e:
        logger.error(f"Error general en auditoria de sesiones: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error al obtener auditoria de sesiones: {str(e)}")


# Datos completos de un quiz: preguntas, creador, materia y los resultados de los estudiantes
# Los resultados se pueden ordenar por nota, fecha o nombre
@router.get("/quiz-detalle/{quiz_id}", dependencies=[Depends(validar_roles([3]))])
async def obtener_detalle_quiz(
    quiz_id: str,
    ordenar_por: str = "nota",
    orden: str = "desc",
    bd: Session = Depends(get_db)
):
    """Obtener detalles completos de un quiz incluyendo resultados de estudiantes"""
    try:
        logger.info(f"📝 Obteniendo detalle del quiz: {quiz_id}")
        
        # Verificar que la colección de quices esté disponible
        if coleccion_quices is None:
            raise HTTPException(status_code=500, detail="Colección de quices no disponible")
        
        # Obtener el quiz desde MongoDB
        try:
            obj_id = ObjectId(quiz_id)
            quiz = await coleccion_quices.find_one({"_id": obj_id})
        except:
            raise HTTPException(status_code=404, detail="Quiz no encontrado")
        
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz no encontrado")
        
        # Obtener información del creador
        creador_id = quiz.get("metadatos", {}).get("autor_id")
        creador = None
        if creador_id:
            try:
                creador_result = bd.execute(
                    select(Usuario).where(Usuario.usu_id == creador_id)
                )
                creador_obj = creador_result.scalar_one_or_none()
                if creador_obj:
                    creador = {
                        "id": creador_obj.usu_id,
                        "nombre": creador_obj.usu_nombre,
                        "apellido": creador_obj.usu_apellido,
                        "email": creador_obj.usu_email
                    }
            except Exception as e:
                logger.warning(f"Error al obtener creador: {str(e)}")
        
        # Obtener sesiones asociadas a este quiz para encontrar resultados y materia
        sesiones_ids = []
        materia = None
        try:
            sesiones_query = bd.execute(
                select(SesionQuiz, Materia)
                .join(Materia, SesionQuiz.ses_fk_materia == Materia.mat_id)
                .where(SesionQuiz.ses_id_mongo_quiz == quiz_id)
                .where(SesionQuiz.ses_activo == True)
            )
            sesiones_resultados = sesiones_query.all()
            sesiones_ids = [sesion.ses_id for sesion, _ in sesiones_resultados]
            if sesiones_resultados:
                _, materia_obj = sesiones_resultados[0]
                materia = {
                    "id": materia_obj.mat_id,
                    "nombre": materia_obj.mat_nombre,
                    "codigo": materia_obj.mat_codigo
                }
        except Exception as e:
            logger.warning(f"Error al obtener sesiones del quiz: {str(e)}")
            sesiones_resultados = []
        
        # Obtener todos los resultados del quiz desde PostgreSQL (participantes y finalizados)
        try:
            if sesiones_ids:
                # Obtener todos los participantes (incluso los que no han finalizado)
                todos_resultados_query = bd.execute(
                    select(Resultado, Usuario)
                    .join(Usuario, Resultado.res_fk_usuario == Usuario.usu_id)
                    .where(Resultado.res_fk_sesion.in_(sesiones_ids))
                )
                todos_resultados = todos_resultados_query.all()
                
                # Obtener solo los finalizados
                resultados_finalizados_query = bd.execute(
                    select(Resultado, Usuario)
                    .join(Usuario, Resultado.res_fk_usuario == Usuario.usu_id)
                    .where(Resultado.res_fk_sesion.in_(sesiones_ids))
                    .where(Resultado.res_hora_final_real.isnot(None))
                )
                resultados_finalizados = resultados_finalizados_query.all()
            else:
                todos_resultados = []
                resultados_finalizados = []
        except Exception as e:
            logger.warning(f"Error al obtener resultados: {str(e)}")
            todos_resultados = []
            resultados_finalizados = []
        
        # Calcular estadísticas
        participantes_total = len(todos_resultados)
        participantes_finalizados = len(resultados_finalizados)
        
        # Formatear resultados (solo finalizados para mostrar en detalle)
        resultados_formateados = []
        for res, usu in resultados_finalizados:
            resultados_formateados.append({
                "usuario": {
                    "id": usu.usu_id,
                    "nombre": usu.usu_nombre,
                    "apellido": usu.usu_apellido,
                    "email": usu.usu_email
                },
                "nota_final": float(res.res_nota_final) if res.res_nota_final else 0,
                "fecha_completado": res.res_hora_final_real.isoformat() if res.res_hora_final_real else None,
                "puntos_ganados": res.res_puntos_ganados_app or 0,
                "tiempo_total_ms": res.res_tiempo_total_ms or 0
            })
        
        # Ordenar resultados según el parámetro
        if ordenar_por == "nota":
            resultados_formateados.sort(
                key=lambda x: x["nota_final"], 
                reverse=(orden == "desc")
            )
        elif ordenar_por == "fecha":
            resultados_formateados.sort(
                key=lambda x: x["fecha_completado"] or "", 
                reverse=(orden == "desc")
            )
        elif ordenar_por == "nombre":
            resultados_formateados.sort(
                key=lambda x: f"{x['usuario']['nombre']} {x['usuario']['apellido']}", 
                reverse=(orden == "desc")
            )
        
        return {
            "quiz": {
                "id": str(quiz["_id"]),
                "titulo": quiz.get("metadatos", {}).get("titulo", "Sin título"),
                "tema": quiz.get("metadatos", {}).get("tema", ""),
                "fecha_creacion": quiz.get("metadatos", {}).get("fecha_creacion"),
                "cantidad_preguntas": len(quiz.get("preguntas", [])),
                "creador": creador,
                "materia": materia or {
                    "id": 0,
                    "nombre": "Sin materia",
                    "codigo": ""
                }
            },
            "estadisticas": {
                "participantes_total": participantes_total,
                "participantes_finalizados": participantes_finalizados
            },
            "resultados": resultados_formateados
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error al obtener detalle del quiz: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener detalle del quiz: {str(e)}")


# Lista completa de usuarios con sus ultimas acciones en el sistema
# Incluye estadisticas distintas segun el rol: quices hechos para alumnos, sesiones para profesores
# Tiene busqueda y filtros por rol y estado
@router.get("/usuarios-auditoria", dependencies=[Depends(validar_roles([3]))])
async def obtener_usuarios_auditoria(
    rol_id: int = None,
    search: str = None,
    activo: bool = None,
    bd: Session = Depends(get_db)
):
    """
    Lista unificada de todos los usuarios con información de auditoría.
    Cada usuario incluye: datos básicos, últimas acciones (MongoDB),
    y estadísticas según su rol.
    """
    try:
        logger.info("🔍 Iniciando consulta de usuarios para auditoría")

        # 1. Obtener todos los usuarios (incluyendo eliminados para auditoría)
        query = select(Usuario, Rol.rol_nombre).join(Rol, Usuario.usu_fk_rol == Rol.rol_id).where(
            Usuario.usu_id != 0
        )
        if rol_id is not None:
            query = query.where(Usuario.usu_fk_rol == rol_id)
        if activo is not None:
            query = query.where(Usuario.usu_activo == activo)
        if search:
            busqueda = f"%{search}%"
            query = query.where(
                Usuario.usu_nombre.ilike(busqueda) |
                Usuario.usu_apellido.ilike(busqueda) |
                Usuario.usu_email.ilike(busqueda)
            )
        query = query.order_by(Usuario.usu_nombre, Usuario.usu_apellido)

        usuarios_rows = bd.execute(query).all()
        logger.info(f"📊 Usuarios encontrados: {len(usuarios_rows)}")

        # 2. Obtener acciones recientes de MongoDB en batch
        usuario_ids = [str(u[0].usu_id) for u in usuarios_rows]
        acciones_por_usuario: Dict[str, list] = {}
        todos_quizes_usuario: Dict[int, int] = {}

        if coleccion_auditoria is not None and usuario_ids:
            import asyncio
            try:
                # Buscar acciones donde el usuario fue ACTOR
                pipeline_actor = [
                    {"$match": {"usuario.id": {"$in": [int(uid) for uid in usuario_ids]}}},
                    {"$sort": {"fecha_operacion": -1}},
                    {"$group": {
                        "_id": "$usuario.id",
                        "acciones": {"$push": {
                            "_id": {"$toString": "$_id"},
                            "tipo_operacion": "$tipo_operacion",
                            "nombre_operacion": "$nombre_operacion",
                            "fecha_operacion": "$fecha_operacion",
                            "usuario": "$usuario",
                            "detalles": "$detalles",
                            "entidad_tipo": "$entidad.tipo",
                            "entidad_id": "$entidad.id",
                            "cambio": "$cambio"
                        }}
                    }}
                ]

                # Buscar acciones donde el usuario fue AFECTADO (por otros)
                pipeline_afectado = [
                    {"$match": {
                        "entidad.id": {"$in": usuario_ids},
                        "entidad.tipo": "Usuario",
                        "tipo_operacion": {"$in": ["USUARIO_MODIFICACION", "USUARIO_ELIMINACION", "USUARIO_DESACTIVACION"]}
                    }},
                    {"$sort": {"fecha_operacion": -1}},
                    {"$group": {
                        "_id": {"$toLong": "$entidad.id"},
                        "acciones": {"$push": {
                            "_id": {"$toString": "$_id"},
                            "tipo_operacion": "$tipo_operacion",
                            "nombre_operacion": "$nombre_operacion",
                            "fecha_operacion": "$fecha_operacion",
                            "usuario": "$usuario",
                            "detalles": "$detalles",
                            "entidad_tipo": "$entidad.tipo",
                            "entidad_id": "$entidad.id",
                            "cambio": "$cambio"
                        }}
                    }}
                ]

                # Buscar materia asignadas al usuario (evento donde el profesor fue asignado)
                usuario_ids_enteros = [int(uid) for uid in usuario_ids if uid.isdigit()]
                pipeline_materias = [
                    {"$match": {
                        "detalles.profesor_asignado_id": {"$in": usuario_ids_enteros},
                        "tipo_operacion": {"$in": ["MATERIA_CREACION"]}
                    }},
                    {"$sort": {"fecha_operacion": -1}},
                    {"$group": {
                        "_id": "$detalles.profesor_asignado_id",
                        "acciones": {"$push": {
                            "_id": {"$toString": "$_id"},
                            "tipo_operacion": "$tipo_operacion",
                            "nombre_operacion": "$nombre_operacion",
                            "fecha_operacion": "$fecha_operacion",
                            "usuario": "$usuario",
                            "detalles": "$detalles",
                            "entidad_tipo": "$entidad.tipo",
                            "entidad_id": "$entidad.id",
                            "cambio": "$cambio"
                        }}
                    }}
                ]

                resultados_actor, resultados_afectado, resultados_materias = await asyncio.wait_for(
                    asyncio.gather(
                        coleccion_auditoria.aggregate(pipeline_actor).to_list(length=None),
                        coleccion_auditoria.aggregate(pipeline_afectado).to_list(length=None),
                        coleccion_auditoria.aggregate(pipeline_materias).to_list(length=None)
                    ),
                    timeout=8.0
                )

                # Combinar resultados: actor + afectados + materias
                for r in resultados_actor:
                    uid = str(r["_id"])
                    acciones_por_usuario.setdefault(uid, []).extend(r["acciones"])

                for r in resultados_afectado:
                    uid = str(r["_id"])
                    acciones_por_usuario.setdefault(uid, []).extend(r["acciones"])

                for r in resultados_materias:
                    uid = str(r["_id"])
                    acciones_por_usuario.setdefault(uid, []).extend(r["acciones"])

                # Deduplicar por _id: cuando un usuario modifica su propio perfil,
                # el mismo registro de MongoDB matchea tanto en pipeline_actor
                # (usuario.id) como en pipeline_afectado (entidad.id), causando duplicados.
                for uid in acciones_por_usuario:
                    vistos = set()
                    unicos = []
                    for acc in acciones_por_usuario[uid]:
                        acc_id = acc.get("_id")
                        if acc_id not in vistos:
                            vistos.add(acc_id)
                            unicos.append(acc)
                    acciones_por_usuario[uid] = unicos

                # Ordenar por fecha y limitar a 200 por usuario
                for uid in acciones_por_usuario:
                    acciones_por_usuario[uid].sort(
                        key=lambda x: x.get("fecha_operacion", ""), reverse=True
                    )
                    acciones_por_usuario[uid] = acciones_por_usuario[uid][:200]

                # Enriquecer acciones con quiz_titulo si falta (datos antiguos)
                if coleccion_quices is not None:
                    try:
                        quiz_ids_necesarios = set()
                        for acciones in acciones_por_usuario.values():
                            for acc in acciones:
                                detalles = acc.get("detalles", {})
                                if not detalles.get("quiz_titulo") and detalles.get("quiz_id"):
                                    quiz_ids_necesarios.add(detalles["quiz_id"])

                        if quiz_ids_necesarios:
                            from bson import ObjectId
                            object_ids = []
                            for qid in quiz_ids_necesarios:
                                try:
                                    object_ids.append(ObjectId(qid))
                                except Exception:
                                    pass

                            if object_ids:
                                titulos_cursor = coleccion_quices.find(
                                    {"_id": {"$in": object_ids}},
                                    {"metadatos.titulo": 1}
                                )
                                titulos_map = {}
                                async for doc in titulos_cursor:
                                    titulos_map[str(doc["_id"])] = doc.get("metadatos", {}).get("titulo", "Quiz")

                                for acciones in acciones_por_usuario.values():
                                    for acc in acciones:
                                        detalles = acc.get("detalles", {})
                                        if not detalles.get("quiz_titulo") and detalles.get("quiz_id"):
                                            titulo = titulos_map.get(detalles["quiz_id"])
                                            if titulo:
                                                acc["detalles"]["quiz_titulo"] = titulo
                    except Exception as e:
                        logger.warning(f"⚠️ Error enriqueciendo quiz_titulos: {str(e)[:50]}")

            except Exception as e:
                logger.warning(f"⚠️ Error obteniendo acciones batch: {str(e)[:50]}")

        # 3. Contar quizzes por autor en MongoDB (para profesores/admins)
        if coleccion_quices is not None and usuario_ids:
            import asyncio
            try:
                pipeline_quices = [
                    {"$match": {"metadatos.autor_id": {"$in": [int(uid) for uid in usuario_ids]}}},
                    {"$group": {"_id": "$metadatos.autor_id", "total": {"$sum": 1}}}
                ]
                resultados_quices = await asyncio.wait_for(
                    coleccion_quices.aggregate(pipeline_quices).to_list(length=None),
                    timeout=3.0
                )
                for r in resultados_quices:
                    todos_quizes_usuario[int(r["_id"])] = r["total"]
            except Exception as e:
                logger.warning(f"⚠️ Error contando quizzes: {str(e)[:50]}")

        # 4. Obtener estadísticas de resultados para alumnos
        alumno_ids = [str(u[0].usu_id) for u in usuarios_rows if u[0].usu_fk_rol == 1]
        stats_alumnos = {}
        if alumno_ids:
            try:
                # Obtener count y total_puntos por alumno
                stats_rows = bd.execute(
                    select(
                        Resultado.res_fk_usuario,
                        func.count(Resultado.res_id),
                        func.coalesce(func.sum(Resultado.res_puntos_ganados_app), 0)
                    ).where(
                        Resultado.res_fk_usuario.in_([int(a) for a in alumno_ids]),
                        Resultado.res_eliminado == False
                    ).group_by(Resultado.res_fk_usuario)
                ).all()
                
                for row in stats_rows:
                    usuario_id_alumno = int(row[0])
                    total_quices = row[1]
                    puntos_totales = row[2]
                    
                    # Calcular promedio normalizando cada nota a escala 20
                    promedio = 0.0
                    if total_quices > 0:
                        resultados_alumno = bd.execute(
                            select(Resultado.res_nota_final, Resultado.res_fk_sesion).where(
                                Resultado.res_fk_usuario == usuario_id_alumno,
                                Resultado.res_eliminado == False
                            )
                        ).all()
                        notas_normalizadas = []
                        for res_nota, res_sesion in resultados_alumno:
                            if res_nota is not None:
                                sesion_obj = bd.query(SesionQuiz).filter(
                                    SesionQuiz.ses_id == res_sesion
                                ).first()
                                escala = sesion_obj.ses_escala_puntuacion if sesion_obj else 100
                                nota_norm = min((float(res_nota) / escala) * 20, 20) if escala > 0 else 0
                                notas_normalizadas.append(nota_norm)
                        if notas_normalizadas:
                            promedio = round(sum(notas_normalizadas) / len(notas_normalizadas), 1)
                    
                    stats_alumnos[str(usuario_id_alumno)] = {
                        "total_quices_realizados": total_quices,
                        "promedio_nota": promedio,
                        "puntos_totales": puntos_totales
                    }
            except Exception as e:
                logger.warning(f"⚠️ Error stats alumnos: {str(e)[:50]}")

        # 5. Obtener sesiones por profesor
        profe_ids = [str(u[0].usu_id) for u in usuarios_rows if u[0].usu_fk_rol == 2]
        stats_profesores = {}
        if profe_ids:
            try:
                ses_rows = bd.execute(
                    select(
                        SesionQuiz.ses_fk_profesor,
                        func.count(SesionQuiz.ses_id),
                        func.coalesce(func.sum(
                            select(func.count(Resultado.res_id)).where(
                                Resultado.res_fk_sesion == SesionQuiz.ses_id,
                                Resultado.res_eliminado == False
                            ).scalar_subquery()
                        ), 0)
                    ).where(
                        SesionQuiz.ses_fk_profesor.in_([int(p) for p in profe_ids]),
                        SesionQuiz.ses_eliminado == False
                    ).group_by(SesionQuiz.ses_fk_profesor)
                ).all()
                for row in ses_rows:
                    stats_profesores[str(row[0])] = {
                        "total_sesiones": row[1],
                        "total_participantes": row[2]
                    }
            except Exception as e:
                logger.warning(f"⚠️ Error stats profesores: {str(e)[:50]}")

        # 6. Construir respuesta
        resultado = []
        for usuario_obj, rol_nombre in usuarios_rows:
            uid_str = str(usuario_obj.usu_id)
            acciones = acciones_por_usuario.get(uid_str, [])
            ultima_fecha = acciones[0].get("fecha_operacion") if acciones else None

            stats_rol = {}
            materias_usuario = []
            if usuario_obj.usu_fk_rol == 1:
                stats_rol = stats_alumnos.get(uid_str, {
                    "total_quices_realizados": 0,
                    "promedio_nota": 0,
                    "puntos_totales": usuario_obj.usu_puntos_app or 0
                })
            elif usuario_obj.usu_fk_rol == 2:
                stats_rol = stats_profesores.get(uid_str, {
                    "total_sesiones": 0,
                    "total_participantes": 0
                })
                stats_rol["total_quizes_creados"] = todos_quizes_usuario.get(usuario_obj.usu_id, 0)
                try:
                    materias_rows = bd.execute(
                        select(Materia).where(
                            Materia.mat_fk_profesor == usuario_obj.usu_id,
                            Materia.mat_activo == True,
                            Materia.mat_eliminado == False
                        ).order_by(Materia.mat_nombre)
                    ).scalars().all()
                    materias_usuario = [{"id": m.mat_id, "nombre": m.mat_nombre, "codigo": m.mat_codigo} for m in materias_rows]
                except Exception:
                    materias_usuario = []
            elif usuario_obj.usu_fk_rol == 3:
                stats_rol["total_quizes_creados"] = todos_quizes_usuario.get(usuario_obj.usu_id, 0)

            resultado.append({
                "usuario": {
                    "id": usuario_obj.usu_id,
                    "nombre": usuario_obj.usu_nombre,
                    "apellido": usuario_obj.usu_apellido,
                    "email": usuario_obj.usu_email,
                    "rol": rol_nombre,
                    "rol_id": usuario_obj.usu_fk_rol,
                    "activo": usuario_obj.usu_activo,
                    "imagen": usuario_obj.usu_imagen,
                    "fecha_registro": usuario_obj.usu_fecha_registro.isoformat() if hasattr(usuario_obj, 'usu_fecha_registro') and usuario_obj.usu_fecha_registro else None,
                    "puntos_app": usuario_obj.usu_puntos_app or 0,
                    "eliminado": usuario_obj.usu_eliminado,
                    "fecha_eliminacion": usuario_obj.usu_fecha_eliminacion.isoformat() if usuario_obj.usu_fecha_eliminacion else None,
                    "eliminado_por": usuario_obj.usu_eliminado_por
                },
                "estadisticas": stats_rol,
                "materias": materias_usuario,
                "acciones_recientes": acciones[:5],
                "historial_completo": acciones,
                "ultima_actividad": ultima_fecha
            })

        return {
            "usuarios": resultado,
            "total": len(resultado),
            "fecha_consulta": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"❌ Error en usuarios-auditoria: {str(e)}")
        raise HTTPException(status_code=500, detail="Error al obtener auditoría de usuarios")

