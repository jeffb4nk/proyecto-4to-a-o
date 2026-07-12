# ======================================================
# Esquemas Pydantic para validar datos de entrada/salida
# FastAPI usa estos modelos para generar la documentación
# automática y rechazar datos inválidos antes de llegar
# a las rutas.
# ======================================================

from pydantic import BaseModel, ConfigDict, EmailStr
from datetime import datetime
from typing import Optional, Dict, List, Any, Literal

# ======================================================
# 1. ESQUEMAS DE SEGURIDAD — login y registro
# ======================================================

# Lo que el frontend envía al iniciar sesión
class DatosLogin(BaseModel):
    email: EmailStr
    password: str
    tipo_usuario: Optional[Literal['estudiante', 'profesor', 'admin']] = None

# Lo que necesita el registro de un usuario nuevo
class DatosRegistro(BaseModel):
    nombre: str
    apellido: str
    email: EmailStr
    password: str
    tipo: Literal['estudiante', 'profesor']
    imagen: Optional[str] = None
    preguntas_seguridad: Optional[List[dict]] = None

# Datos del usuario que se devuelven al frontend
# after_attributes permite convertir el objeto ORM directo
class UsuarioRespuesta(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    usu_id: int
    usu_nombre: str
    usu_apellido: str
    usu_email: str
    usu_puntos_app: int
    usu_fk_rol: int
    usu_activo: bool
    rol_nombre: str
    usu_imagen: str | None = None

# Respuesta completa del login con el JWT incluido
class RespuestaLogin(BaseModel):
    token_acceso: str
    tipo_token: str = "bearer"
    usuario: UsuarioRespuesta

# ======================================================
# 2. ESQUEMAS ACADÉMICOS — materias e inscripciones
# ======================================================

# Campos base que toda materia tiene
class MateriaBase(BaseModel):
    mat_nombre: str
    mat_codigo: str

# Para crear una materia solo necesitamos nombre y código
class MateriaCrear(MateriaBase):
    pass

# Lo que devolvemos al listar o mostrar una materia
class MateriaRespuesta(MateriaBase):
    model_config = ConfigDict(from_attributes=True)
    mat_id: int
    mat_fk_profesor: int
    mat_activo: bool

# Para inscribirse a una materia el alumno ingresa el código
class InscripcionSolicitud(BaseModel):
    mat_codigo: str

# ======================================================
# 3. ESQUEMAS DE EVALUACIÓN — sesiones de quiz
# ======================================================

# Datos comunes de una sesión
class SesionBase(BaseModel):
    ses_nombre_grupo: str
    ses_id_mongo_quiz: str
    ses_puntuacion_tipo: str  # "Igual" o "Dificultad"
    ses_fecha_inicio: datetime
    ses_fecha_fin: datetime

# Al crear la sesión se necesita especificar la materia
class SesionCrear(SesionBase):
    ses_fk_materia: int

# Lo que se devuelve al consultar una sesión
class SesionRespuesta(SesionBase):
    model_config = ConfigDict(from_attributes=True)
    ses_id: int
    ses_codigo_acceso: str
    ses_manual_activado: bool
    ses_estatus: str
    ses_activo: bool

# ======================================================
# 4. ESQUEMAS DE RESULTADOS — pensados para offline
# ======================================================

# Recibe la nota desde el dispositivo del estudiante.
# Los campos de hora local permiten verificar si hubo
# manipulación aunque el dispositivo esté desconectado.
class ResultadoEnvio(BaseModel):
    ses_codigo_acceso: str
    nota_final: float
    puntos_ganados: int
    tiempo_total_ms: int
    informe_fallas: Dict[str, int]
    
    hora_inicio_local: datetime
    finalizado_en_local: datetime
    es_offline: bool = False

# Devuelve el resultado ya guardado en la base de datos
class ResultadoRespuesta(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    res_id: int
    res_fk_usuario: int
    res_fk_sesion: int
    res_nota_final: float
    res_puntos_ganados_app: int
    res_tiempo_total_ms: Optional[int]
    res_informe_fallas: Optional[Dict[str, Any]]
    
    # Metadatos de auditoría por si se necesita revisión
    res_hora_inicio_real: datetime
    res_hora_final_real: Optional[datetime]
    res_fecha_sincronizacion: datetime
    res_finalizado_offline: bool


# ======================================================
# 5. ESQUEMAS DE RECUPERACIÓN DE CONTRASEÑA
# ======================================================

# Devuelve la lista de preguntas disponibles
class PreguntaSeguridadResponse(BaseModel):
    id: int
    pregunta: str

# Primer paso: el usuario ingresa su email
class SolicitarRecuperacionRequest(BaseModel):
    email: str

# Le devolvemos sus preguntas de seguridad para que responda
class SolicitarRecuperacionResponse(BaseModel):
    usuario_id: int
    preguntas: List[PreguntaSeguridadResponse]

# Una respuesta individual a una pregunta de seguridad
class RespuestaVerificar(BaseModel):
    pregunta_id: int
    respuesta: str

# Lista de respuestas que envía el usuario
class VerificarRespuestasRequest(BaseModel):
    usuario_id: int
    respuestas: List[RespuestaVerificar]

# Si acertó todas, le devolvemos un token para cambiar la clave
class VerificarRespuestasResponse(BaseModel):
    token_reset: str
    expiracion: int

# Paso final: usa el token para poner una nueva contraseña
class CambiarPasswordRequest(BaseModel):
    token_reset: str
    nueva_password: str

# Para que el usuario configure sus preguntas de seguridad
class ConfigurarPreguntasRequest(BaseModel):
    preguntas: List[dict]

# ======================================================
# 6. ESQUEMAS DE DESCARGA OFFLINE — sin internet
# ======================================================

# El estudiante pide descargar un quiz para hacerlo sin conexión
class DescargaOfflineRequest(BaseModel):
    codigo_acceso: str

# Le devolvemos el quiz completo más un token de descarga
# para que al sincronizar sepamos que lo descargó legalmente
class DescargaOfflineResponse(BaseModel):
    sesion_id: int
    quiz_id: str
    titulo: str
    materia_nombre: Optional[str] = None
    modo_juego: str
    escala_puntuacion: int
    fecha_inicio: str
    fecha_fin: str
    total_preguntas: int
    quiz_completo: dict
    token_descarga: str
    descargado_en: str


# Cuando recupera conexión, envía el resultado con el token
class SincronizarOfflineRequest(BaseModel):
    token_descarga: str
    nota_final: float
    puntos_ganados: int
    tiempo_total_ms: int
    informe_fallas: Optional[dict] = None
    hora_inicio_local: str
    finalizado_en_local: str


# Confirmación de que el resultado offline se guardó
class SincronizarOfflineResponse(BaseModel):
    mensaje: str
    resultado_id: int
    primera_nota: bool