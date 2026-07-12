from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from bson import ObjectId
import asyncio
import logging
from datetime import datetime
from aplicacion.conexion_bd import get_db, coleccion_quices
from aplicacion.modelos import Usuario, Rol, Resultado, SesionQuiz, Materia, LogroUsuario
from aplicacion.esquemas import UsuarioRespuesta
from aplicacion.dependencias import validar_roles, obtener_usuario_actual
from aplicacion.servicio_auditoria import registrar_auditoria_completa

router = APIRouter(prefix="/usuarios", tags=["Gestión de Usuarios"])

# Solo los masters pueden ver la lista completa de usuarios
# Sirve para el panel de administracion donde se gestionan cuentas
@router.get("/", response_model=list[UsuarioRespuesta], dependencies=[Depends(validar_roles([3]))])
def listar_usuarios(bd: Session = Depends(get_db)):
    """Lista todos los usuarios con su información y rol"""
    resultado = bd.execute(select(Usuario).where(Usuario.usu_id != 0, Usuario.usu_eliminado == False))
    usuarios = resultado.scalars().all()
    
    usuarios_respuesta = []
    for usuario in usuarios:
        # Obtener nombre del rol
        resultado_rol = bd.execute(select(Rol).where(Rol.rol_id == usuario.usu_fk_rol))
        rol = resultado_rol.scalar_one_or_none()
        nombre_rol = rol.rol_nombre if rol else "desconocido"
        
        usuarios_respuesta.append(UsuarioRespuesta(
            usu_id=usuario.usu_id,
            usu_nombre=usuario.usu_nombre,
            usu_apellido=usuario.usu_apellido,
            usu_email=usuario.usu_email,
            usu_puntos_app=usuario.usu_puntos_app,
            usu_fk_rol=usuario.usu_fk_rol,
            usu_activo=usuario.usu_activo,
            rol_nombre=nombre_rol,
            usu_imagen=usuario.usu_imagen
        ))
    
    return usuarios_respuesta

# Cualquier usuario logueado puede ver su propia info o la de otros
# Lo usa el perfil para mostrar los datos del usuario
@router.get("/{usuario_id}", response_model=UsuarioRespuesta, dependencies=[Depends(validar_roles([1, 2, 3]))])
def obtener_usuario(usuario_id: int, bd: Session = Depends(get_db)):
    """Obtiene un usuario específico por ID"""
    resultado = bd.execute(select(Usuario).where(Usuario.usu_id == usuario_id))
    usuario = resultado.scalar_one_or_none()
    
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Obtener nombre del rol
    resultado_rol = bd.execute(select(Rol).where(Rol.rol_id == usuario.usu_fk_rol))
    rol = resultado_rol.scalar_one_or_none()
    nombre_rol = rol.rol_nombre if rol else "desconocido"
    
    return UsuarioRespuesta(
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

# Un usuario puede editar su propio perfil, un master puede editar el de cualquiera
# Guarda los cambios anteriores en auditoria para tener trazabilidad
# Protege al ultimo master del sistema para que no se pueda desactivar a si mismo
@router.put("/{usuario_id}", response_model=UsuarioRespuesta)
async def actualizar_usuario(usuario_id: int, datos: dict, bd: Session = Depends(get_db), usuario_actual: dict = Depends(obtener_usuario_actual)):
    """Actualiza datos de un usuario y registra cambios en auditoría. 
    Permite que el usuario actual actualice su propio perfil o que un Master actualice cualquier perfil.
    """
    resultado = bd.execute(select(Usuario).where(Usuario.usu_id == usuario_id))
    usuario = resultado.scalar_one_or_none()
    
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # VALIDACIÓN DE PERMISOS: Debe ser el dueño del perfil o un Master (rol 3)
    if usuario_actual["rol_id"] != 3 and usuario_actual["user_id"] != usuario_id:
        raise HTTPException(
            status_code=403, 
            detail="No tienes permisos para actualizar este perfil"
        )
    
    # Proteger al último Master
    if usuario.usu_fk_rol == 3:
        # Verificar si es el último master
        master_count = bd.query(Usuario).filter(
            Usuario.usu_fk_rol == 3,
            Usuario.usu_activo == True,
            Usuario.usu_eliminado == False
        ).count()
        if master_count <= 1:
            # Verificar si están intentando desactivarlo
            if 'usu_activo' in datos and datos['usu_activo'] == False:
                raise HTTPException(
                    status_code=400,
                    detail="No se puede desactivar al único Master del sistema"
                )
    
    # Guardar datos anteriores para auditoría
    imagen_anterior = usuario.usu_imagen
    # Sanitizar imagen: truncar si es base64 (evitar documentos enormes en MongoDB)
    if imagen_anterior and isinstance(imagen_anterior, str) and len(imagen_anterior) > 500:
        imagen_anterior = imagen_anterior[:50] + "...[truncado]"

    datos_anteriores = {
        'usu_nombre': usuario.usu_nombre,
        'usu_apellido': usuario.usu_apellido,
        'usu_email': usuario.usu_email,
        'usu_fk_rol': usuario.usu_fk_rol,
        'usu_activo': usuario.usu_activo,
        'usu_imagen': imagen_anterior
    }
    
    # Actualizar campos permitidos
    if 'usu_nombre' in datos:
        usuario.usu_nombre = datos['usu_nombre']
    if 'usu_apellido' in datos:
        usuario.usu_apellido = datos['usu_apellido']
    if 'usu_email' in datos:
        usuario.usu_email = datos['usu_email']
    if 'usu_fk_rol' in datos:
        usuario.usu_fk_rol = datos['usu_fk_rol']
    if 'usu_activo' in datos:
        usuario.usu_activo = datos['usu_activo']
    if 'usu_imagen' in datos:
        from aplicacion.rutas.rutas_quices import base64_to_file as _convertir_img
        usuario.usu_imagen = _convertir_img(datos['usu_imagen']) if datos['usu_imagen'] else None
    
    bd.commit()
    bd.refresh(usuario)
    
    # Registrar cambios en auditoría
    from aplicacion.servicio_auditoria import registrar_auditoria_usuario_modificacion
    import asyncio
    import logging
    
    # Detectar cambios significativos
    todos_los_cambios = {}
    for campo, valor_anterior in datos_anteriores.items():
        valor_nuevo = getattr(usuario, campo)
        if valor_anterior != valor_nuevo:
            todos_los_cambios[campo] = {
                'anterior': valor_anterior,
                'nuevo': valor_nuevo
            }
    
    # Separar cambios de perfil (excluyendo usu_activo) de cambios de estado
    cambios_perfil = {k: v for k, v in todos_los_cambios.items() if k != 'usu_activo'}
    cambio_estado = 'usu_activo' in todos_los_cambios
    
    # Solo registrar USUARIO_MODIFICACION si hay cambios en campos de perfil
    if cambios_perfil:
        try:
            await registrar_auditoria_usuario_modificacion(
                actor_id=usuario_actual["user_id"],
                usuario_afectado_id=usuario_id,
                bd=bd,
                datos_anteriores=datos_anteriores,
                datos_nuevos=cambios_perfil,
            )
        except Exception as e:
            logging.getLogger(__name__).warning(f"Auditoría de modificación no registrada: {str(e)}")
    
    # Registrar USUARIO_DESACTIVACION si cambió el estado
    if cambio_estado:
        try:
            from aplicacion.servicio_auditoria import registrar_auditoria_usuario_desactivacion
            await registrar_auditoria_usuario_desactivacion(
                actor_id=usuario_actual["user_id"],
                usuario_afectado_id=usuario_id,
                activar=datos['usu_activo'],
                bd=bd,
            )
        except Exception as e:
            logging.getLogger(__name__).warning(f"Auditoría de desactivación no registrada: {str(e)}")
    
    # Obtener nombre del rol
    resultado_rol = bd.execute(select(Rol).where(Rol.rol_id == usuario.usu_fk_rol))
    rol = resultado_rol.scalar_one_or_none()
    nombre_rol = rol.rol_nombre if rol else "desconocido"
    
    return UsuarioRespuesta(
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

# Solo los masters pueden eliminar usuarios, y no se puede eliminar al ultimo master
# La eliminacion es logica (soft delete) para no perder el historial
@router.delete("/{usuario_id}", dependencies=[Depends(validar_roles([3]))])
async def eliminar_usuario(usuario_id: int, bd: Session = Depends(get_db), usuario_actual: dict = Depends(obtener_usuario_actual)):
    """Elimina un usuario"""
    resultado = bd.execute(select(Usuario).where(Usuario.usu_id == usuario_id))
    usuario = resultado.scalar_one_or_none()
    
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Proteger al último Master
    if usuario.usu_fk_rol == 3:
        master_count = bd.query(Usuario).filter(
            Usuario.usu_fk_rol == 3,
            Usuario.usu_activo == True,
            Usuario.usu_eliminado == False
        ).count()
        if master_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="No se puede eliminar al único Master del sistema"
            )
    
    from datetime import datetime
    usuario.usu_eliminado = True
    usuario.usu_fecha_eliminacion = datetime.now()
    
    if usuario_actual:
        usuario.usu_eliminado_por = usuario_actual["user_id"]
    
    # Registrar auditoría de eliminación
    try:
        await registrar_auditoria_completa(
            tipo_operacion="USUARIO_ELIMINACION",
            usuario_id=usuario_actual["user_id"] if usuario_actual else None,
            bd=bd,
            exito=True,
            entidad_tipo="Usuario",
            entidad_id=str(usuario_id),
            detalles={
                "usuario_eliminado_id": usuario_id,
                "email": usuario.usu_email,
                "nombre_completo": f"{usuario.usu_nombre} {usuario.usu_apellido}",
                "rol_id": usuario.usu_fk_rol,
                "usuario_afectado": {
                    "id": usuario_id,
                    "nombre": usuario.usu_nombre,
                    "apellido": usuario.usu_apellido,
                    "email": usuario.usu_email,
                }
            }
        )
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.warning(f"Auditoría de eliminación no registrada: {str(e)}")
    
    bd.commit()
    
    return {"mensaje": "Usuario eliminado exitosamente"}

# Devuelve un reporte distinto segun el rol del usuario consultado
# Para alumnos muestra notas, quices completados y logros
# Para profesores muestra materias, sesiones y actividad
@router.get("/{usuario_id}/auditoria-completa", dependencies=[Depends(validar_roles([3]))])
async def obtener_auditoria_usuario_completa(usuario_id: int, bd: Session = Depends(get_db)):
    """Obtiene reporte completo de un usuario según su rol:
    - ALUMNO: estadísticas de quizzes, notas, logros
    - PROFESOR: materias que imparte, quices creados, actividad
    - MASTER: información básica
    """
    try:
        # Obtener usuario
        usuario = bd.execute(select(Usuario).where(Usuario.usu_id == usuario_id)).scalar_one_or_none()
        
        if not usuario:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
        # Obtener nombre del rol
        resultado_rol = bd.execute(select(Rol).where(Rol.rol_id == usuario.usu_fk_rol))
        rol = resultado_rol.scalar_one_or_none()
        nombre_rol = rol.rol_nombre if rol else "desconocido"
        rol_normalizado = nombre_rol.strip().lower()
        
        # Obtener cambios de perfil desde auditoría (MongoDB) - comunes a todos los roles
        from aplicacion.conexion_bd import coleccion_auditoria
        cambios_perfil = []
        
        if coleccion_auditoria is not None:
            try:
                cambios_auditoria_db = await coleccion_auditoria.find({
                    "tipo_operacion": "USUARIO_MODIFICACION",
                    "entidad.id": str(usuario_id)
                }).sort("fecha_operacion", -1).to_list(length=50)
                
                # Deduplicar por _id de MongoDB (seguridad contra registros duplicados en BD)
                vistos_perfil = set()
                for cambio in cambios_auditoria_db:
                    doc_id = str(cambio.get('_id', ''))
                    if doc_id in vistos_perfil:
                        continue
                    vistos_perfil.add(doc_id)
                    actor_data = cambio.get('usuario', {}) or {}
                    cambios_perfil.append({
                        'fecha': cambio.get('fecha_operacion'),
                        'campos_modificados': cambio.get('detalles', {}).get('campos_modificados', []),
                        'datos_anteriores': cambio.get('cambio', {}).get('datos_anteriores', {}),
                        'datos_nuevos': cambio.get('cambio', {}).get('datos_nuevos', {}),
                        'actor': {
                            'id': actor_data.get('id'),
                            'nombre': actor_data.get('nombre'),
                            'apellido': actor_data.get('apellido'),
                            'email': actor_data.get('email'),
                            'rol': actor_data.get('rol'),
                        } if actor_data else None
                    })
            except Exception as e:
                import traceback
                print(f"[ERROR] Error consultando auditoría MongoDB: {str(e)}")
                print(traceback.format_exc())
        
        # Obtener también registros de eliminación
        eliminaciones = []
        if coleccion_auditoria is not None:
            try:
                eliminaciones_db = await coleccion_auditoria.find({
                    "tipo_operacion": "USUARIO_ELIMINACION",
                    "entidad.id": str(usuario_id)
                }).sort("fecha_operacion", -1).to_list(length=10)
                
                # Deduplicar por _id de MongoDB
                vistos_elim = set()
                for elim in eliminaciones_db:
                    doc_id = str(elim.get('_id', ''))
                    if doc_id in vistos_elim:
                        continue
                    vistos_elim.add(doc_id)
                    actor_data = elim.get('usuario', {}) or {}
                    det = elim.get('detalles', {}) or {}
                    eliminaciones.append({
                        'fecha': elim.get('fecha_operacion'),
                        'actor': {
                            'id': actor_data.get('id'),
                            'nombre': actor_data.get('nombre'),
                            'apellido': actor_data.get('apellido'),
                            'rol': actor_data.get('rol'),
                        } if actor_data else None,
                        'detalles': det
                    })
            except Exception as e:
                print(f"[ERROR] Error consultando eliminaciones: {str(e)}")
        
        # Obtener eventos de activación/desactivación
        cambios_estado = []
        if coleccion_auditoria is not None:
            try:
                estado_db = await coleccion_auditoria.find({
                    "tipo_operacion": "USUARIO_DESACTIVACION",
                    "entidad.id": str(usuario_id)
                }).sort("fecha_operacion", -1).to_list(length=50)
                
                # Deduplicar por _id de MongoDB
                vistos_estado = set()
                for cambio in estado_db:
                    doc_id = str(cambio.get('_id', ''))
                    if doc_id in vistos_estado:
                        continue
                    vistos_estado.add(doc_id)
                    actor_data = cambio.get('usuario', {}) or {}
                    det = cambio.get('detalles', {}) or {}
                    cambio_data = cambio.get('cambio', {}) or {}
                    cambios_estado.append({
                        'fecha': cambio.get('fecha_operacion'),
                        'accion': det.get('accion', ''),
                        'activo': cambio_data.get('datos_nuevos', {}).get('activo'),
                        'usuario_afectado': det.get('usuario_afectado'),
                        'actor': {
                            'id': actor_data.get('id'),
                            'nombre': actor_data.get('nombre'),
                            'apellido': actor_data.get('apellido'),
                            'email': actor_data.get('email'),
                            'rol': actor_data.get('rol'),
                        } if actor_data else None
                    })
            except Exception as e:
                print(f"[ERROR] Error consultando cambios de estado: {str(e)}")
        
        # Datos base del usuario (comunes a todos los roles)
        datos_usuario = {
            "id": usuario.usu_id,
            "nombre": usuario.usu_nombre,
            "apellido": usuario.usu_apellido,
            "email": usuario.usu_email,
            "rol": nombre_rol,
            "rol_id": usuario.usu_fk_rol,
            "activo": usuario.usu_activo,
            "imagen": usuario.usu_imagen,
            "puntos": usuario.usu_puntos_app or 0
        }
        
        # ============================================================
        # ALUMNO: Estadísticas de quizzes, notas, logros
        # ============================================================
        if rol_normalizado == "alumno":
            # Obtener resultados del usuario (quices completados)
            resultados = []
            try:
                resultados = bd.execute(
                    select(Resultado, SesionQuiz, Materia)
                    .join(SesionQuiz, Resultado.res_fk_sesion == SesionQuiz.ses_id)
                    .outerjoin(Materia, SesionQuiz.ses_fk_materia == Materia.mat_id)
                    .where(Resultado.res_fk_usuario == usuario_id)
                    .where(Resultado.res_hora_final_real.isnot(None))
                ).all()
            except Exception as e:
                import traceback
                print(f"[ERROR] Error consultando resultados: {str(e)}")
                print(traceback.format_exc())
            
            # Calcular estadísticas
            total_quices = len(resultados)
            total_puntos = usuario.usu_puntos_app or 0
            promedio = 0
            
            if total_quices > 0:
                try:
                    # Normalizar cada nota a escala 20
                    notas_normalizadas = []
                    for res, _, _ in resultados:
                        nota = float(res.res_nota_final or 0)
                        sesion_obj = bd.query(modelos.SesionQuiz).filter(
                            modelos.SesionQuiz.ses_id == res.res_fk_sesion
                        ).first()
                        escala = sesion_obj.ses_escala_puntuacion if sesion_obj else 100
                        nota_norm = min((nota / escala) * 20, 20) if escala > 0 else 0
                        notas_normalizadas.append(nota_norm)
                    promedio = round(sum(notas_normalizadas) / len(notas_normalizadas), 2)
                except Exception as e:
                    print(f"[ERROR] Error calculando promedio: {str(e)}")
            
            # Agrupar quices por materia
            quices_por_materia = {}
            for res, sesion, materia in resultados:
                try:
                    mat_id = materia.mat_id if materia else 0
                    mat_nombre = materia.mat_nombre if materia else 'Sin materia'
                    mat_codigo = materia.mat_codigo if materia else ''
                    
                    if mat_id not in quices_por_materia:
                        quices_por_materia[mat_id] = {
                            'materia_id': mat_id,
                            'materia_nombre': mat_nombre,
                            'materia_codigo': mat_codigo,
                            'quizes': []
                        }
                    
                    quices_por_materia[mat_id]['quizes'].append({
                        'sesion_id': sesion.ses_id,
                        'codigo_acceso': sesion.ses_codigo_acceso,
                        'nota_final': float(res.res_nota_final or 0),
                        'nota_primera_vez': float(res.res_nota_primera_vez) if res.res_nota_primera_vez else float(res.res_nota_final or 0),
                        'repeticiones': res.res_repeticiones or 0,
                        'puntos_ganados': res.res_puntos_ganados_app or 0,
                        'fecha_completado': res.res_hora_final_real.isoformat() if res.res_hora_final_real else None,
                        'tiempo_total_ms': res.res_tiempo_total_ms or 0,
                        'escala_puntuacion': sesion.ses_escala_puntuacion or 100,
                        'modo_juego': sesion.ses_puntuacion_tipo or 'Igual',
                        'quiz_titulo': None,
                        'mongo_quiz_id': sesion.ses_id_mongo_quiz or None,
                        'materia_nombre': mat_nombre,
                        'materia_codigo': mat_codigo
                    })
                except Exception as e:
                    print(f"[ERROR] Error formateando resultado: {str(e)}")
                    continue
            
            # Obtener títulos de quices desde MongoDB
            if coleccion_quices is not None:
                try:
                    mongo_ids = set()
                    for mat_data in quices_por_materia.values():
                        for quiz_item in mat_data['quizes']:
                            if quiz_item.get('mongo_quiz_id'):
                                mongo_ids.add(quiz_item['mongo_quiz_id'])
                    
                    if mongo_ids:
                        object_ids = []
                        for mid in mongo_ids:
                            try:
                                object_ids.append(ObjectId(mid))
                            except Exception:
                                pass
                        
                        if object_ids:
                            cursor = coleccion_quices.find(
                                {"_id": {"$in": object_ids}},
                                {"metadatos.titulo": 1}
                            )
                            titulos_map = {}
                            async for doc in cursor:
                                titulos_map[str(doc["_id"])] = doc.get("metadatos", {}).get("titulo", "Sin título")
                            
                            for mat_data in quices_por_materia.values():
                                for quiz_item in mat_data['quizes']:
                                    mid = quiz_item.get('mongo_quiz_id')
                                    if mid and mid in titulos_map:
                                        quiz_item['quiz_titulo'] = titulos_map[mid]
                except Exception as e:
                    print(f"[ERROR] Error obteniendo títulos de quices desde MongoDB: {str(e)}")
            
            # Obtener logros del usuario
            logros_desbloqueados = []
            try:
                logros_usuario = bd.query(LogroUsuario).filter(
                    LogroUsuario.log_fk_usuario == usuario_id
                ).all()
                
                for logro in logros_usuario:
                    logros_desbloqueados.append({
                        'codigo': logro.log_codigo,
                        'fecha_desbloqueo': logro.log_fecha_desbloqueo.isoformat() if logro.log_fecha_desbloqueo else None,
                        'puntos_recompensa': logro.log_puntos_recompensa or 0
                    })
            except Exception as e:
                import traceback
                print(f"[ERROR] Error consultando logros: {str(e)}")
                print(traceback.format_exc())
            
            return {
                "tipo_usuario": "alumno",
                "usuario": datos_usuario,
                "estadisticas": {
                    "total_quices": total_quices,
                    "promedio": promedio,
                    "puntos": total_puntos
                },
                "cambios_estado": cambios_estado,
                "cambios_perfil": cambios_perfil,
                "eliminaciones": eliminaciones
            }
        
        # ============================================================
        # PROFESOR: Materias, quices creados, sesiones, actividad
        # ============================================================
        elif rol_normalizado == "profesor":
            from aplicacion.modelos import SesionQuiz as SesionModelo
            
            # 1. Materias que imparte el profesor (campo directo mat_fk_profesor)
            materias_imparte = []
            try:
                materias_profesor = bd.execute(
                    select(Materia)
                    .where(Materia.mat_fk_profesor == usuario_id)
                ).scalars().all()
                
                for materia in materias_profesor:
                    materias_imparte.append({
                        'materia_id': materia.mat_id,
                        'nombre': materia.mat_nombre,
                        'codigo': materia.mat_codigo,
                    })
            except Exception as e:
                import traceback
                print(f"[ERROR] Error consultando materias del profesor: {str(e)}")
                print(traceback.format_exc())
            
            # 2. Sesiones de quiz creadas por el profesor
            sesiones_creadas = []
            try:
                sesiones = bd.execute(
                    select(SesionQuiz, Materia)
                    .outerjoin(Materia, SesionQuiz.ses_fk_materia == Materia.mat_id)
                    .where(SesionQuiz.ses_fk_profesor == usuario_id)
                    .order_by(SesionQuiz.ses_fecha_inicio.desc())
                    .limit(20)
                ).all()
                
                for sesion, materia in sesiones:
                    # Contar cuántos alumnos completaron esta sesión
                    from aplicacion.modelos import Resultado as ResultadoModelo
                    total_completaron = bd.execute(
                        select(ResultadoModelo)
                        .where(ResultadoModelo.res_fk_sesion == sesion.ses_id)
                        .where(ResultadoModelo.res_hora_final_real.isnot(None))
                    ).all()
                    
                    total_iniciaron = bd.execute(
                        select(ResultadoModelo)
                        .where(ResultadoModelo.res_fk_sesion == sesion.ses_id)
                    ).all()
                    
                    sesiones_creadas.append({
                        'sesion_id': sesion.ses_id,
                        'codigo_acceso': sesion.ses_codigo_acceso,
                        'materia_nombre': materia.mat_nombre if materia else 'Sin materia',
                        'fecha_inicio': sesion.ses_fecha_inicio.isoformat() if sesion.ses_fecha_inicio else None,
                        'activa': sesion.ses_activa if hasattr(sesion, 'ses_activa') else True,
                        'total_iniciaron': len(total_iniciaron),
                        'total_completaron': len(total_completaron)
                    })
            except Exception as e:
                import traceback
                print(f"[ERROR] Error consultando sesiones del profesor: {str(e)}")
                print(traceback.format_exc())
            
            # 3. Estadísticas generales del profesor
            total_materias = len(materias_imparte)
            total_sesiones = len(sesiones_creadas)
            
            return {
                "tipo_usuario": "profesor",
                "usuario": datos_usuario,
                "estadisticas": {
                    "total_materias": total_materias,
                    "total_sesiones": total_sesiones,
                },
                "materias_imparte": materias_imparte,
                "sesiones_creadas": sesiones_creadas,
                "cambios_estado": cambios_estado,
                "cambios_perfil": cambios_perfil,
                "eliminaciones": eliminaciones
            }
        
        # ============================================================
        # MASTER/ADMIN: Información básica
        # ============================================================
        else:
            return {
                "tipo_usuario": "master",
                "usuario": datos_usuario,
                "cambios_estado": cambios_estado,
                "cambios_perfil": cambios_perfil,
                "eliminaciones": eliminaciones
            }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[ERROR] Error general en auditoria-completa: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error al obtener auditoría: {str(e)}")
