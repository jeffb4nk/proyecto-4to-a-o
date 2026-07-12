from fastapi import APIRouter, Depends, HTTPException, Request
import traceback
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from aplicacion.conexion_bd import get_db, coleccion_quices
from aplicacion.modelos import Materia, Usuario, SesionQuiz, Inscripcion, Rol
from aplicacion.dependencias import validar_roles, obtener_usuario_actual
from aplicacion.servicio_auditoria import (
    registrar_auditoria_materia_creacion,
    registrar_auditoria_materia_modificacion,
    registrar_auditoria_materia_eliminacion
)

router = APIRouter(prefix="/materias", tags=["Materias"])

# Esquemas Pydantic
class MateriaCreate(BaseModel):
    mat_nombre: str
    mat_codigo: str
    mat_fk_profesor: int

class MateriaUpdate(BaseModel):
    mat_nombre: Optional[str] = None
    mat_codigo: Optional[str] = None
    mat_fk_profesor: Optional[int] = None
    mat_activo: Optional[bool] = None

class MateriaAsignarProfesor(BaseModel):
    mat_fk_profesor: int

class MateriaResponse(BaseModel):
    mat_id: int
    mat_nombre: str
    mat_codigo: str
    mat_fk_profesor: int
    mat_activo: bool
    profesor: dict
    total_sesiones: int
    total_alumnos: int

# Lista todas las materias activas con su profesor principal, profesores adicionales
# y cuentas de sesiones y alumnos para dar una vista rapida al admin
@router.get("/", response_model=List[MateriaResponse])
async def obtener_materias(bd: Session = Depends(get_db)):
    """
    Obtener todas las materias activas con información adicional
    """
    try:
        materias = bd.execute(
            select(Materia, Usuario.usu_nombre, Usuario.usu_apellido)
            .join(Usuario, Materia.mat_fk_profesor == Usuario.usu_id)
            .where(Materia.mat_eliminado == False)
            .order_by(Materia.mat_nombre)
        ).all()
        
        resultado = []
        for materia, prof_nombre, prof_apellido in materias:
            # Contar sesiones de esta materia
            total_sesiones = bd.execute(
                select(func.count(SesionQuiz.ses_id))
                .where(SesionQuiz.ses_fk_materia == materia.mat_id)
                .where(SesionQuiz.ses_activo == True)
            ).scalar() or 0
            
            # Contar alumnos inscritos
            total_alumnos = bd.execute(
                select(func.count(Inscripcion.ins_id))
                .where(Inscripcion.ins_fk_materia == materia.mat_id)
            ).scalar() or 0
            
            resultado.append({
                "mat_id": materia.mat_id,
                "mat_nombre": materia.mat_nombre,
                "mat_codigo": materia.mat_codigo,
                "mat_fk_profesor": materia.mat_fk_profesor,
                "mat_activo": materia.mat_activo,
                "profesor": {
                    "id": materia.mat_fk_profesor,
                    "nombre": prof_nombre,
                    "apellido": prof_apellido
                },
                "total_sesiones": total_sesiones,
                "total_alumnos": total_alumnos
            })
        
        return resultado
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener materias: {str(e)}")

# ============================================================
# Rutas estáticas (ANTES de /{materia_id} para evitar 422)
# ============================================================

# Solo los masters pueden ver las materias que se eliminaron
# Es parte del modulo de auditoria para revisar que se borro y quien lo hizo
@router.get("/eliminadas", dependencies=[Depends(validar_roles([3]))])
async def obtener_materias_eliminadas(bd: Session = Depends(get_db)):
    """
    Obtener todas las materias eliminadas (auditoría)
    """
    try:
        materias = bd.execute(
            select(Materia, Usuario.usu_nombre, Usuario.usu_apellido)
            .outerjoin(Usuario, Materia.mat_eliminado_por == Usuario.usu_id)
            .where(Materia.mat_eliminado == True)
            .order_by(Materia.mat_fecha_eliminacion.desc())
        ).all()
        
        resultado = []
        for materia, elim_nombre, elim_apellido in materias:
            prof_info = bd.execute(
                select(Usuario.usu_nombre, Usuario.usu_apellido)
                .where(Usuario.usu_id == materia.mat_fk_profesor)
            ).first()
            
            resultado.append({
                "mat_id": materia.mat_id,
                "mat_nombre": materia.mat_nombre,
                "mat_codigo": materia.mat_codigo,
                "mat_fk_profesor": materia.mat_fk_profesor,
                "mat_fecha_creacion": materia.mat_fecha_creacion.isoformat() if materia.mat_fecha_creacion else None,
                "mat_fecha_eliminacion": materia.mat_fecha_eliminacion.isoformat() if materia.mat_fecha_eliminacion else None,
                "mat_eliminado_por": {
                    "id": materia.mat_eliminado_por,
                    "nombre": elim_nombre if elim_nombre else "Desconocido",
                    "apellido": elim_apellido if elim_apellido else ""
                } if materia.mat_eliminado_por else None,
                "profesor": {
                    "id": materia.mat_fk_profesor,
                    "nombre": prof_info[0] if prof_info else "",
                    "apellido": prof_info[1] if prof_info else ""
                }
            })
        
        return resultado
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener materias eliminadas: {str(e)}")

# Devuelve todos los profesores y masters activos para asignarlos a una materia
# Lo usa el frontend en el formulario de crear/editar materia
@router.get("/profesores/disponibles")
async def obtener_profesores_disponibles(bd: Session = Depends(get_db)):
    """
    Obtener lista de profesores disponibles para asignar a materias
    """
    try:
        profesores = bd.execute(
            select(Usuario.usu_id, Usuario.usu_nombre, Usuario.usu_apellido, Usuario.usu_email)
            .join(Usuario.rol)
            .where(Rol.rol_nombre.in_(['profesor', 'master']))
            .where(Usuario.usu_activo == True)
            .order_by(Usuario.usu_nombre, Usuario.usu_apellido)
        ).all()
        
        resultado = [
            {
                "id": prof[0],
                "nombre": prof[1],
                "apellido": prof[2],
                "email": prof[3],
                "nombre_completo": f"{prof[1]} {prof[2]}"
            }
            for prof in profesores
        ]
        
        return resultado

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener profesores: {str(e)}")

# Las materias que tiene asignadas un profesor, ya sea como principal o como adicional
# Si el usuario es master le devuelve todas las materias del sistema
@router.get("/profesor/{profesor_id}")
async def obtener_materias_profesor(profesor_id: int, bd: Session = Depends(get_db)):
    """
    Obtener todas las materias de un profesor específico
    Si el usuario es administrador (master), retorna todas las materias
    """
    try:
        usuario = bd.execute(
            select(Usuario)
            .join(Usuario.rol)
            .where(Usuario.usu_id == profesor_id)
            .where(Rol.rol_nombre == 'master')
        ).first()
        
        es_admin = usuario is not None
        
        if es_admin:
            materias = bd.execute(
                select(Materia)
                .where(Materia.mat_activo == True)
                .where(Materia.mat_eliminado == False)
                .order_by(Materia.mat_nombre)
            ).scalars().all()
        else:
            materias = bd.execute(
                select(Materia)
                .where(Materia.mat_fk_profesor == profesor_id)
                .where(Materia.mat_activo == True)
                .where(Materia.mat_eliminado == False)
                .order_by(Materia.mat_nombre)
            ).scalars().all()
        
        resultado = [
            {
                "mat_id": materia.mat_id,
                "mat_nombre": materia.mat_nombre,
                "mat_codigo": materia.mat_codigo,
                "mat_activo": materia.mat_activo
            }
            for materia in materias
        ]
        
        return {"materias": resultado}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener materias del profesor: {str(e)}")

# Cuenta cuantos quices y materias tiene un profesor
# Se usa en el dashboard del profesor para mostrar un resumen rapido
@router.get("/estadisticas/profesor/{profesor_id}")
async def obtener_estadisticas_profesor(profesor_id: int, bd: Session = Depends(get_db)):
    """
    Obtener estadísticas de un profesor (número de quizes y materias)
    """
    try:
        total_quizes = 0
        if coleccion_quices is not None:
            quices = await coleccion_quices.find({"metadatos.autor_id": profesor_id}).to_list(length=1000)
            total_quizes = len(quices)
        
        total_materias = bd.execute(
            select(func.count(Materia.mat_id))
            .where(Materia.mat_fk_profesor == profesor_id)
            .where(Materia.mat_activo == True)
            .where(Materia.mat_eliminado == False)
        ).scalar() or 0
        
        return {
            "total_quizes": total_quizes,
            "total_materias": total_materias
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener estadísticas del profesor: {str(e)}")

# ============================================================
# Rutas con parámetros
# ============================================================

# Trae los datos de una materia en particular con su profesor
# Lo usa la pantalla de detalle de materia
@router.get("/{materia_id}", response_model=MateriaResponse)
async def obtener_materia(materia_id: int, bd: Session = Depends(get_db)):
    """
    Obtener una materia específica
    """
    try:
        materia = bd.execute(
            select(Materia, Usuario.usu_nombre, Usuario.usu_apellido)
            .join(Usuario, Materia.mat_fk_profesor == Usuario.usu_id)
            .where(Materia.mat_id == materia_id)
            .where(Materia.mat_activo == True)
            .where(Materia.mat_eliminado == False)
        ).first()
        
        if not materia:
            raise HTTPException(status_code=404, detail="Materia no encontrada")
        
        materia_obj, prof_nombre, prof_apellido = materia
        
        return {
            "mat_id": materia_obj.mat_id,
            "mat_nombre": materia_obj.mat_nombre,
            "mat_codigo": materia_obj.mat_codigo,
            "mat_fk_profesor": materia_obj.mat_fk_profesor,
            "mat_activo": materia_obj.mat_activo,
            "profesor": {
                "id": materia_obj.mat_fk_profesor,
                "nombre": prof_nombre,
                "apellido": prof_apellido
            },
            "total_sesiones": 0,  # Se puede calcular si es necesario
            "total_alumnos": 0   # Se puede calcular si es necesario
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener materia: {str(e)}")

# Solo los masters pueden crear materias nuevas
# Valida que el codigo no se repita y que el profesor asignado exista y este activo
@router.post("/", response_model=MateriaResponse, dependencies=[Depends(validar_roles([3]))])
async def crear_materia(materia: MateriaCreate, request: Request, bd: Session = Depends(get_db), usuario_actual: dict = Depends(obtener_usuario_actual)):
    """
    Crear una nueva materia
    """
    try:
        # Verificar si el código ya existe
        existente = bd.execute(
            select(Materia).where(Materia.mat_codigo == materia.mat_codigo)
        ).first()
        
        if existente:
            raise HTTPException(status_code=400, detail="El código de materia ya existe")
        
        # Verificar si el profesor existe y está activo
        profesor = bd.execute(
            select(Usuario)
            .join(Usuario.rol)
            .where(Usuario.usu_id == materia.mat_fk_profesor)
            .where(Rol.rol_nombre.in_(['profesor', 'master']))
            .where(Usuario.usu_activo == True)
        ).first()
        
        if not profesor:
            raise HTTPException(status_code=400, detail="Profesor no encontrado o inactivo")
        
        # Crear nueva materia
        nueva_materia = Materia(
            mat_nombre=materia.mat_nombre,
            mat_codigo=materia.mat_codigo,
            mat_fk_profesor=materia.mat_fk_profesor,
            mat_activo=True,
            mat_eliminado=False
        )
        
        bd.add(nueva_materia)
        try:
            bd.commit()
            bd.refresh(nueva_materia)
        except Exception as e:
            bd.rollback()
            raise HTTPException(status_code=500, detail=f"Error al guardar en BD: {str(e)}")
        
        # Registrar en auditoría
        try:
            await registrar_auditoria_materia_creacion(
                materia_id=nueva_materia.mat_id,
                nombre=nueva_materia.mat_nombre,
                codigo=nueva_materia.mat_codigo,
                profesor_id=materia.mat_fk_profesor,
                bd=bd,
                actor_id=usuario_actual["user_id"],
                ip_address=request.client.host if request else None,
                user_agent=request.headers.get("user-agent") if request else None
            )
        except Exception as e:
            print(f"[ERROR] Auditoría materia: {str(e)}")


        
        # Obtener información del profesor para la respuesta
        prof_info = bd.execute(
            select(Usuario.usu_nombre, Usuario.usu_apellido)
            .where(Usuario.usu_id == materia.mat_fk_profesor)
        ).first()
        
        return {
            "mat_id": nueva_materia.mat_id,
            "mat_nombre": nueva_materia.mat_nombre,
            "mat_codigo": nueva_materia.mat_codigo,
            "mat_fk_profesor": nueva_materia.mat_fk_profesor,
            "mat_activo": nueva_materia.mat_activo,
            "profesor": {
                "id": nueva_materia.mat_fk_profesor,
                "nombre": prof_info[0] if prof_info else "",
                "apellido": prof_info[1] if prof_info else ""
            },
            "total_sesiones": 0,
            "total_alumnos": 0
        }
        
    except HTTPException:
        raise
    except Exception as e:
        bd.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear materia: {str(e)}")

# Los masters pueden cambiar el nombre, codigo, profesor o estado de una materia
# Registra cada tipo de cambio por separado en auditoria para tener detalle fino
@router.put("/{materia_id}", response_model=MateriaResponse, dependencies=[Depends(validar_roles([3]))])
async def actualizar_materia(materia_id: int, materia: MateriaUpdate, request: Request, bd: Session = Depends(get_db), usuario_actual: dict = Depends(obtener_usuario_actual)):
    """
    Actualizar nombre y código de una materia existente (no profesor)
    """
    try:
        # Buscar materia existente
        materia_existente = bd.execute(
            select(Materia).where(Materia.mat_id == materia_id)
        ).scalars().first()
        
        if not materia_existente:
            raise HTTPException(status_code=404, detail="Materia no encontrada")
        
        # Obtener nombre del profesor actual
        prof_anterior_info = bd.execute(
            select(Usuario.usu_nombre, Usuario.usu_apellido)
            .where(Usuario.usu_id == materia_existente.mat_fk_profesor)
        ).first()
        prof_anterior_nombre = f"{prof_anterior_info[0]} {prof_anterior_info[1]}" if prof_anterior_info else None
        
        # Guardar datos anteriores para auditoría
        nombre_anterior = materia_existente.mat_nombre
        codigo_anterior = materia_existente.mat_codigo
        profesor_anterior_id = materia_existente.mat_fk_profesor
        activo_anterior = materia_existente.mat_activo
        
        # Si se actualiza el código, verificar que no exista (incluyendo eliminadas)
        if materia.mat_codigo and materia.mat_codigo != materia_existente.mat_codigo:
            codigo_existente = bd.execute(
                select(Materia).where(Materia.mat_codigo == materia.mat_codigo)
                .where(Materia.mat_id != materia_id)
            ).first()
            
            if codigo_existente:
                raise HTTPException(status_code=400, detail="El código de materia ya existe")
        
        # Actualizar campos
        if materia.mat_nombre is not None and materia.mat_nombre.strip():
            materia_existente.mat_nombre = materia.mat_nombre.strip()
        
        if materia.mat_codigo is not None and materia.mat_codigo.strip():
            materia_existente.mat_codigo = materia.mat_codigo.strip()

        if materia.mat_fk_profesor is not None:
            materia_existente.mat_fk_profesor = materia.mat_fk_profesor

        if materia.mat_activo is not None:
            materia_existente.mat_activo = materia.mat_activo
        
        bd.commit()
        bd.refresh(materia_existente)
        
        # Obtener nombre del profesor nuevo si cambió
        prof_nuevo_nombre = prof_anterior_nombre
        if materia_existente.mat_fk_profesor != profesor_anterior_id:
            prof_nuevo_info = bd.execute(
                select(Usuario.usu_nombre, Usuario.usu_apellido)
                .where(Usuario.usu_id == materia_existente.mat_fk_profesor)
            ).first()
            prof_nuevo_nombre = f"{prof_nuevo_info[0]} {prof_nuevo_info[1]}" if prof_nuevo_info else None
        
        # Registrar en auditoría — eventos separados por tipo de cambio
        ip = request.client.host if request else None
        ua = request.headers.get("user-agent") if request else None
        
        # 1. Cambios de nombre/codigo
        nombre_cambio = materia_existente.mat_nombre != nombre_anterior
        codigo_cambio = materia_existente.mat_codigo != codigo_anterior
        if nombre_cambio or codigo_cambio:
            await registrar_auditoria_materia_modificacion(
                materia_id=materia_id,
                profesor_id=materia_existente.mat_fk_profesor,
                bd=bd,
                datos_anteriores={"nombre": nombre_anterior, "codigo": codigo_anterior},
                datos_nuevos={"nombre": materia_existente.mat_nombre, "codigo": materia_existente.mat_codigo},
                nombre=materia_existente.mat_nombre,
                codigo=materia_existente.mat_codigo,
                actor_id=usuario_actual["user_id"],
                ip_address=ip, user_agent=ua
            )
        
        # 2. Cambio de profesor
        if materia_existente.mat_fk_profesor != profesor_anterior_id:
            await registrar_auditoria_materia_modificacion(
                materia_id=materia_id,
                profesor_id=materia_existente.mat_fk_profesor,
                bd=bd,
                datos_anteriores={"profesor_id": profesor_anterior_id, "profesor_nombre": prof_anterior_nombre},
                datos_nuevos={"profesor_id": materia_existente.mat_fk_profesor, "profesor_nombre": prof_nuevo_nombre},
                nombre=materia_existente.mat_nombre,
                codigo=materia_existente.mat_codigo,
                actor_id=usuario_actual["user_id"],
                ip_address=ip, user_agent=ua
            )
        
        # 3. Cambio de activo
        if materia_existente.mat_activo != activo_anterior:
            await registrar_auditoria_materia_modificacion(
                materia_id=materia_id,
                profesor_id=materia_existente.mat_fk_profesor,
                bd=bd,
                datos_anteriores={"activo": activo_anterior},
                datos_nuevos={"activo": materia_existente.mat_activo},
                nombre=materia_existente.mat_nombre,
                codigo=materia_existente.mat_codigo,
                actor_id=usuario_actual["user_id"],
                ip_address=ip, user_agent=ua
            )
        
        # Obtener información del profesor para la respuesta
        prof_info = bd.execute(
            select(Usuario.usu_nombre, Usuario.usu_apellido)
            .where(Usuario.usu_id == materia_existente.mat_fk_profesor)
        ).first()
        
        return {
            "mat_id": materia_existente.mat_id,
            "mat_nombre": materia_existente.mat_nombre,
            "mat_codigo": materia_existente.mat_codigo,
            "mat_fk_profesor": materia_existente.mat_fk_profesor,
            "mat_activo": materia_existente.mat_activo,
            "profesor": {
                "id": materia_existente.mat_fk_profesor,
                "nombre": prof_info[0] if prof_info else "",
                "apellido": prof_info[1] if prof_info else ""
            },
            "total_sesiones": 0,
            "total_alumnos": 0
        }
        
    except HTTPException:
        raise
    except Exception as e:
        bd.rollback()
        raise HTTPException(status_code=500, detail=f"Error al actualizar materia: {str(e)}")

# Cambia el profesor principal de una materia
# Registra el cambio en auditoria para saber quien era el anterior y quien es el nuevo
@router.put("/{materia_id}/asignar-profesor", dependencies=[Depends(validar_roles([3]))])
async def asignar_profesor_materia(materia_id: int, asignacion: MateriaAsignarProfesor, bd: Session = Depends(get_db), usuario_actual: dict = Depends(obtener_usuario_actual)):
    """
    Asignar un profesor a una materia existente
    """
    try:
        # Buscar materia existente
        materia_existente = bd.execute(
            select(Materia).where(Materia.mat_id == materia_id)
        ).scalars().first()
        
        if not materia_existente:
            raise HTTPException(status_code=404, detail="Materia no encontrada")
        
        # Verificar que el profesor exista y esté activo
        profesor = bd.execute(
            select(Usuario)
            .join(Usuario.rol)
            .where(Usuario.usu_id == asignacion.mat_fk_profesor)
            .where(Rol.rol_nombre.in_(['profesor', 'master']))
            .where(Usuario.usu_activo == True)
        ).first()
        
        if not profesor:
            raise HTTPException(status_code=400, detail="Profesor no encontrado o inactivo")
        
        # Asignar profesor
        profesor_anterior_id = materia_existente.mat_fk_profesor
        
        # Obtener nombre del profesor anterior
        prof_ant_info = bd.execute(
            select(Usuario.usu_nombre, Usuario.usu_apellido)
            .where(Usuario.usu_id == profesor_anterior_id)
        ).first()
        prof_anterior_nombre = f"{prof_ant_info[0]} {prof_ant_info[1]}" if prof_ant_info else None
        
        materia_existente.mat_fk_profesor = asignacion.mat_fk_profesor
        bd.commit()
        bd.refresh(materia_existente)

        # Obtener nombre del profesor nuevo
        prof_nue_info = bd.execute(
            select(Usuario.usu_nombre, Usuario.usu_apellido)
            .where(Usuario.usu_id == asignacion.mat_fk_profesor)
        ).first()
        prof_nuevo_nombre = f"{prof_nue_info[0]} {prof_nue_info[1]}" if prof_nue_info else None

        try:
            await registrar_auditoria_materia_modificacion(
                materia_id=materia_id,
                profesor_id=asignacion.mat_fk_profesor,
                bd=bd,
                datos_anteriores={"profesor_id": profesor_anterior_id, "profesor_nombre": prof_anterior_nombre},
                datos_nuevos={"profesor_id": asignacion.mat_fk_profesor, "profesor_nombre": prof_nuevo_nombre},
                nombre=materia_existente.mat_nombre,
                codigo=materia_existente.mat_codigo,
                actor_id=usuario_actual["user_id"]
            )
        except Exception:
            pass
        
        return {"message": "Profesor asignado correctamente"}
        
    except HTTPException:
        raise
    except Exception as e:
        bd.rollback()
        raise HTTPException(status_code=500, detail=f"Error al asignar profesor: {str(e)}")

# No borra la materia de la base de datos, solo la marca como eliminada
# Esto mantiene el historial de sesiones y resultados que usaron esa materia
@router.delete("/{materia_id}", dependencies=[Depends(validar_roles([3]))])
async def eliminar_materia(materia_id: int, request: Request, bd: Session = Depends(get_db), usuario: dict = Depends(obtener_usuario_actual)):
    """
    Elimina lógicamente una materia (Soft Delete) para mantener la integridad de los datos
    """
    try:
        # 1. Verificar que la materia existe
        materia = bd.execute(
            select(Materia).where(Materia.mat_id == materia_id)
        ).scalars().first()
        
        if not materia:
            raise HTTPException(status_code=404, detail="Materia no encontrada")
        
        # 2. Soft Delete: Marcar como eliminada
        from datetime import datetime
        materia.mat_eliminado = True
        materia.mat_fecha_eliminacion = datetime.now()
        
        if usuario:
            materia.mat_eliminado_por = usuario["user_id"]
        
        bd.commit()

        try:
            ip = request.client.host if request and request.client else None
            ua = request.headers.get("user-agent", None) if request else None
            await registrar_auditoria_materia_eliminacion(
                materia_id=materia_id,
                nombre=materia.mat_nombre,
                codigo=materia.mat_codigo,
                profesor_id=materia.mat_fk_profesor,
                eliminado_por=usuario["user_id"] if usuario else 0,
                bd=bd,
                ip_address=ip,
                user_agent=ua
            )
        except Exception:
            pass
        
        return {"message": "Materia eliminada exitosamente (borrado lógico)"}
        
    except HTTPException:
        raise
    except Exception as e:
        bd.rollback()
        raise HTTPException(status_code=500, detail=f"Error interno del servidor: {str(e)}")

