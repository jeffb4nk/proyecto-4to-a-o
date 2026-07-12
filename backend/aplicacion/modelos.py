# ======================================================
# Modelos ORM de las tablas en PostgreSQL
# Cada clase es una tabla, cada atributo una columna.
# SQLAlchemy se encarga de convertir esto en SQL.
# ======================================================

from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, ForeignKey, Boolean, Numeric, func
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.dialects.postgresql import JSONB

Base = declarative_base()

# ======================================================
# Esquema SEGURIDAD — roles, usuarios, bloqueos
# ======================================================

# Tabla de roles del sistema: alumno (1), profesor (2), master (3)
class Rol(Base):
    __tablename__ = 'tbl_roles'
    __table_args__ = {'schema': 'seguridad'}
    
    rol_id = Column(Integer, primary_key=True)
    rol_nombre = Column(String(50), unique=True, nullable=False)
    
    # Relación inversa para acceder a los usuarios de un rol
    usuarios = relationship("Usuario", back_populates="rol")


# Tabla principal de usuarios
# Guardamos nombre, email, contraseña hasheada y el rol.
# También soporta soft delete (eliminado lógico) por si
# un admin borra a alguien pero queremos conservar el registro.
class Usuario(Base):
    __tablename__ = 'tbl_usuarios'
    __table_args__ = {'schema': 'seguridad'}
    
    usu_id = Column(Integer, primary_key=True)
    usu_nombre = Column(String(100), nullable=False)
    usu_apellido = Column(String(100), nullable=False)
    usu_email = Column(String(150), unique=True, nullable=False)
    usu_password_hash = Column(String, nullable=False)
    usu_fk_rol = Column(Integer, ForeignKey('seguridad.tbl_roles.rol_id'), nullable=False)
    usu_puntos_app = Column(Integer, default=0)
    usu_imagen = Column(Text, nullable=True)
    usu_activo = Column(Boolean, default=True)
    usu_fecha_registro = Column(TIMESTAMP, server_default=func.now())
    usu_eliminado = Column(Boolean, default=False, nullable=True)
    usu_fecha_eliminacion = Column(TIMESTAMP, nullable=True)
    usu_eliminado_por = Column(Integer, nullable=True)

    # Relaciones con otras tablas
    rol = relationship("Rol", back_populates="usuarios")
    materias_dictadas = relationship("Materia", back_populates="profesor", foreign_keys="Materia.mat_fk_profesor")
    inscripciones = relationship("Inscripcion", back_populates="alumno")
    resultados = relationship("Resultado", back_populates="usuario")


# ======================================================
# Esquema EVALUACIÓN — materias, sesiones, resultados
# ======================================================

# Tabla de materias (Matemáticas, Física, etc.)
# Cada materia tiene un único profesor principal (mat_fk_profesor).
class Materia(Base):
    __tablename__ = 'tbl_materias'
    __table_args__ = {'schema': 'evaluacion'}
    
    mat_id = Column(Integer, primary_key=True)
    mat_nombre = Column(String(100), nullable=False)
    mat_codigo = Column(String(20), unique=True, nullable=False)
    mat_fk_profesor = Column(Integer, ForeignKey('seguridad.tbl_usuarios.usu_id'), nullable=False)
    mat_activo = Column(Boolean, default=True)
    mat_fecha_creacion = Column(TIMESTAMP, server_default=func.now())
    mat_eliminado = Column(Boolean, default=False)
    mat_fecha_eliminacion = Column(TIMESTAMP)
    mat_eliminado_por = Column(Integer, ForeignKey('seguridad.tbl_usuarios.usu_id'))

    # Relaciones
    profesor = relationship("Usuario", back_populates="materias_dictadas", foreign_keys=[mat_fk_profesor])
    sesiones = relationship("SesionQuiz", back_populates="materia")
    alumnos_inscritos = relationship("Inscripcion", back_populates="materia")
    eliminado_por = relationship("Usuario", foreign_keys=[mat_eliminado_por])


# Tabla que relaciona alumnos con materias
# Un alumno puede estar inscrito en varias materias
# y una materia tiene muchos alumnos.
class Inscripcion(Base):
    __tablename__ = 'tbl_inscripciones'
    __table_args__ = {'schema': 'evaluacion'}
    
    ins_id = Column(Integer, primary_key=True)
    ins_fk_alumno = Column(Integer, ForeignKey('seguridad.tbl_usuarios.usu_id'), nullable=False)
    ins_fk_materia = Column(Integer, ForeignKey('evaluacion.tbl_materias.mat_id'), nullable=False)
    ins_fecha_inscripcion = Column(TIMESTAMP, server_default=func.now())

    # Relaciones
    alumno = relationship("Usuario", back_populates="inscripciones")
    materia = relationship("Materia", back_populates="alumnos_inscritos")


# Tabla de sesiones de quiz
# Una sesión es la "publicación" de un quiz en una fecha.
# El código de acceso es lo que usan los estudiantes para unirse.
class SesionQuiz(Base):
    __tablename__ = 'tbl_sesiones'
    __table_args__ = {'schema': 'evaluacion'}
    
    ses_id = Column(Integer, primary_key=True)
    ses_codigo_acceso = Column(String(10), unique=True, nullable=False)
    ses_id_mongo_quiz = Column(String(50), nullable=False)
    ses_fk_materia = Column(Integer, ForeignKey('evaluacion.tbl_materias.mat_id'), nullable=False)
    ses_nombre_grupo = Column(String(100))
    ses_puntuacion_tipo = Column(String(20)) 
    ses_escala_puntuacion = Column(Integer, default=100)
    ses_manual_activado = Column(Boolean, default=True) 
    ses_estatus = Column(String(20), default='Espera')
    ses_fecha_inicio = Column(TIMESTAMP, nullable=False)
    ses_fecha_fin = Column(TIMESTAMP, nullable=False)
    ses_activo = Column(Boolean, default=True)
    ses_eliminado = Column(Boolean, default=False, nullable=True)
    ses_fecha_eliminacion = Column(TIMESTAMP, nullable=True)
    ses_eliminado_por = Column(Integer, nullable=True)
    ses_fk_profesor = Column(Integer, nullable=True)
    ses_tipo = Column(String(20), default='normal')

    # Relaciones
    materia = relationship("Materia", back_populates="sesiones")
    resultados = relationship("Resultado", back_populates="sesion")


# Resultados de los estudiantes en cada sesión.
# Esta es la tabla mas completa porque maneja:
# - Control offline (cortes de luz, sincronización)
# - Repeticiones de quiz (primera nota vs reintentos)
# - Eliminación lógica
# - Bloqueo por dispositivo
class Resultado(Base):
    __tablename__ = 'tbl_resultados'
    __table_args__ = {'schema': 'evaluacion'}
    
    res_id = Column(Integer, primary_key=True)
    res_fk_usuario = Column(Integer, ForeignKey('seguridad.tbl_usuarios.usu_id'), nullable=False)
    res_fk_sesion = Column(Integer, ForeignKey('evaluacion.tbl_sesiones.ses_id'), nullable=False)
    res_nota_final = Column(Numeric(5, 2), nullable=False)
    res_puntos_ganados_app = Column(Integer, nullable=False)
    res_tiempo_total_ms = Column(Integer)
    res_informe_fallas = Column(JSONB)
    
    # Control offline — pensando en cortes de luz (Venezuela)
    res_hora_inicio_real = Column(TIMESTAMP, server_default=func.now())
    res_hora_final_real = Column(TIMESTAMP)
    res_finalizado_offline = Column(Boolean, default=False)
    res_fecha_sincronizacion = Column(TIMESTAMP, server_default=func.now())

    # Repeticiones — el estudiante puede repetir un quiz
    # pero la primera nota es la que cuenta.
    res_nota_primera_vez = Column(Numeric(5, 2))
    res_repeticiones = Column(Integer, default=0)
    res_fecha_primera_vez = Column(TIMESTAMP)
    res_fecha_ultima_repeticion = Column(TIMESTAMP)

    # Bloqueo por dispositivo para evitar trampas
    res_device_id = Column(String(100), nullable=True)

    # Soft delete por si un admin necesita borrar un resultado
    res_eliminado = Column(Boolean, default=False, nullable=True)
    res_fecha_eliminacion = Column(TIMESTAMP, nullable=True)
    res_eliminado_por = Column(Integer, nullable=True)

    # Relaciones
    usuario = relationship("Usuario", back_populates="resultados")
    sesion = relationship("SesionQuiz", back_populates="resultados")


# Logros automáticos que se desbloquean al cumplir condiciones:
# primer_quiz, perfect_score, speed_demon, quiz_master, five_quizes
class LogroUsuario(Base):
    __tablename__ = 'tbl_logros_usuario'
    __table_args__ = {'schema': 'evaluacion'}
    
    log_id = Column(Integer, primary_key=True)
    log_fk_usuario = Column(Integer, ForeignKey('seguridad.tbl_usuarios.usu_id'), nullable=False)
    log_codigo = Column(String(50), nullable=False)
    log_fecha_desbloqueo = Column(TIMESTAMP, server_default=func.now())
    log_puntos_recompensa = Column(Integer, default=0)
    
    # Relaciones
    usuario = relationship("Usuario")


# Banco de preguntas de seguridad para recuperar contraseña
class PreguntaSeguridad(Base):
    __tablename__ = 'tbl_preguntas_seguridad'
    __table_args__ = {'schema': 'seguridad'}
    
    pse_id = Column(Integer, primary_key=True)
    pse_pregunta = Column(String(200), nullable=False)


# Respuestas que cada usuario dio a sus preguntas de seguridad
class RespuestaSeguridad(Base):
    __tablename__ = 'tbl_respuestas_usuario'
    __table_args__ = {'schema': 'seguridad'}
    
    rsu_id = Column(Integer, primary_key=True)
    rsu_fk_usuario = Column(Integer, ForeignKey('seguridad.tbl_usuarios.usu_id'), nullable=False)
    rsu_fk_pregunta = Column(Integer, ForeignKey('seguridad.tbl_preguntas_seguridad.pse_id'), nullable=False)
    rsu_respuesta_hash = Column(String(255), nullable=False)
    rsu_orden = Column(Integer, default=1)

