-- ============================================================
-- PLANTILLA POSTGRESQL — QUIZIMA
-- ============================================================
-- Crea toda la base de datos relacional del proyecto.
--
-- Esquemas: seguridad (usuarios, roles, auth) y evaluacion (materias, sesiones, resultados)
--
-- Cómo usar:
--   1. Conéctate a PostgreSQL:  psql -U postgres -h localhost
--   2. Crea la base:            CREATE DATABASE quizima_db;
--   3. Conectate:               \c quizima_db
--   4. Ejecuta:                 \i ruta/a/esta/plantilla_postgresql.sql
--
-- O desde pgAdmin: pega todo el script y ejecuta.
-- ============================================================

-- ============================================================
-- 1. ESQUEMAS
-- ============================================================
CREATE SCHEMA IF NOT EXISTS seguridad;
CREATE SCHEMA IF NOT EXISTS evaluacion;

-- ============================================================
-- 2. TABLAS — ESQUEMA seguridad (autenticación, usuarios, roles)
-- ============================================================

-- 2.1 Roles del sistema
--     1 = alumno, 2 = profesor, 3 = master (admin)
CREATE TABLE IF NOT EXISTS seguridad.tbl_roles (
    rol_id SERIAL PRIMARY KEY,
    rol_nombre VARCHAR(50) UNIQUE NOT NULL
);

INSERT INTO seguridad.tbl_roles (rol_nombre) VALUES
    ('alumno'),
    ('profesor'),
    ('master')
ON CONFLICT (rol_nombre) DO NOTHING;

-- 2.2 Usuarios
--     Tabla principal de personas del sistema.
--     Soporta eliminación lógica (soft delete).
CREATE TABLE IF NOT EXISTS seguridad.tbl_usuarios (
    usu_id SERIAL PRIMARY KEY,
    usu_nombre VARCHAR(100) NOT NULL,
    usu_apellido VARCHAR(100) NOT NULL,
    usu_email VARCHAR(150) UNIQUE NOT NULL,
    usu_password_hash TEXT NOT NULL,
    usu_fk_rol INTEGER NOT NULL REFERENCES seguridad.tbl_roles(rol_id),
    usu_puntos_app INTEGER DEFAULT 0,
    usu_imagen TEXT,
    usu_activo BOOLEAN DEFAULT TRUE,
    usu_fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usu_eliminado BOOLEAN DEFAULT FALSE,
    usu_fecha_eliminacion TIMESTAMP,
    usu_eliminado_por INTEGER,
    CONSTRAINT fk_usu_eliminado_por FOREIGN KEY (usu_eliminado_por) REFERENCES seguridad.tbl_usuarios(usu_id)
);

-- 2.3 Pool de preguntas de seguridad (recuperación de contraseña)
CREATE TABLE IF NOT EXISTS seguridad.tbl_preguntas_seguridad (
    pse_id SERIAL PRIMARY KEY,
    pse_pregunta VARCHAR(200) NOT NULL
);

INSERT INTO seguridad.tbl_preguntas_seguridad (pse_pregunta) VALUES
    ('¿Cuál es el nombre de tu primera mascota?'),
    ('¿En qué ciudad naciste?'),
    ('¿Cuál es tu color favorito?'),
    ('¿Cuál es el nombre de tu mejor amigo de la infancia?'),
    ('¿Cuál es tu comida favorita?'),
    ('¿En qué escuela primaria estudiaste?'),
    ('¿Cuál es tu ciudad favorita para vacacionar?'),
    ('¿Cuál es tu hobby favorito?')
ON CONFLICT DO NOTHING;

-- 2.4 Respuestas de seguridad de cada usuario
CREATE TABLE IF NOT EXISTS seguridad.tbl_respuestas_usuario (
    rsu_id SERIAL PRIMARY KEY,
    rsu_fk_usuario INTEGER NOT NULL REFERENCES seguridad.tbl_usuarios(usu_id) ON DELETE CASCADE,
    rsu_fk_pregunta INTEGER NOT NULL REFERENCES seguridad.tbl_preguntas_seguridad(pse_id),
    rsu_respuesta_hash VARCHAR(255) NOT NULL,
    rsu_orden INTEGER DEFAULT 1
);

-- ============================================================
-- 3. TABLAS — ESQUEMA evaluacion (materias, sesiones, resultados)
-- ============================================================

-- 3.1 Materias
--     Cada materia tiene un profesor "dueño" (mat_fk_profesor)
--     y puede tener varios profesores adicionales (tabla intermedia)
CREATE TABLE IF NOT EXISTS evaluacion.tbl_materias (
    mat_id SERIAL PRIMARY KEY,
    mat_nombre VARCHAR(100) NOT NULL,
    mat_codigo VARCHAR(20) UNIQUE NOT NULL,
    mat_fk_profesor INTEGER NOT NULL REFERENCES seguridad.tbl_usuarios(usu_id),
    mat_activo BOOLEAN DEFAULT TRUE,
    mat_fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    mat_eliminado BOOLEAN DEFAULT FALSE,
    mat_fecha_eliminacion TIMESTAMP,
    mat_eliminado_por INTEGER,
    CONSTRAINT fk_mat_eliminado_por FOREIGN KEY (mat_eliminado_por) REFERENCES seguridad.tbl_usuarios(usu_id)
);

-- 3.2 Inscripciones (alumnos en materias)
CREATE TABLE IF NOT EXISTS evaluacion.tbl_inscripciones (
    ins_id SERIAL PRIMARY KEY,
    ins_fk_alumno INTEGER NOT NULL REFERENCES seguridad.tbl_usuarios(usu_id),
    ins_fk_materia INTEGER NOT NULL REFERENCES evaluacion.tbl_materias(mat_id),
    ins_fecha_inscripcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_alumno_materia UNIQUE (ins_fk_alumno, ins_fk_materia)
);

-- 3.4 Sesiones de quiz
--     Una sesión es la "publicación" de un quiz existente.
--     ses_id_mongo_quiz = ObjectId del documento en MongoDB.
--     ses_codigo_acceso = código de 6 dígitos que usan los estudiantes para unirse.
--     ses_puntuacion_tipo = 'Igual' (clásico) o 'Dificultad' (por pregunta).
--     ses_escala_puntuacion = 100 | 20 | 10.
--     ses_estatus = 'Espera' | 'En curso' | 'Finalizado'.
CREATE TABLE IF NOT EXISTS evaluacion.tbl_sesiones (
    ses_id SERIAL PRIMARY KEY,
    ses_codigo_acceso VARCHAR(10) UNIQUE NOT NULL,
    ses_id_mongo_quiz VARCHAR(50) NOT NULL,
    ses_fk_materia INTEGER NOT NULL REFERENCES evaluacion.tbl_materias(mat_id),
    ses_nombre_grupo VARCHAR(100),
    ses_puntuacion_tipo VARCHAR(20) CHECK (ses_puntuacion_tipo IN ('Igual', 'Dificultad')),
    ses_escala_puntuacion INTEGER DEFAULT 100,
    ses_manual_activado BOOLEAN DEFAULT TRUE,
    ses_estatus VARCHAR(20) DEFAULT 'Espera',
    ses_fecha_inicio TIMESTAMP NOT NULL,
    ses_fecha_fin TIMESTAMP NOT NULL,
    ses_activo BOOLEAN DEFAULT TRUE,
    ses_eliminado BOOLEAN DEFAULT FALSE,
    ses_fecha_eliminacion TIMESTAMP,
    ses_eliminado_por INTEGER,
    ses_fk_profesor INTEGER,
    ses_tipo VARCHAR(20) DEFAULT 'normal'
);

-- 3.5 Resultados de estudiantes en sesiones
--     Maneja control offline, repeticiones y eliminación lógica.
--     res_informe_fallas = JSONB con detalle de preguntas correctas/incorrectas.
CREATE TABLE IF NOT EXISTS evaluacion.tbl_resultados (
    res_id SERIAL PRIMARY KEY,
    res_fk_usuario INTEGER NOT NULL REFERENCES seguridad.tbl_usuarios(usu_id),
    res_fk_sesion INTEGER NOT NULL REFERENCES evaluacion.tbl_sesiones(ses_id),
    res_nota_final NUMERIC(5,2) NOT NULL,
    res_puntos_ganados_app INTEGER NOT NULL,
    res_tiempo_total_ms INTEGER,
    res_informe_fallas JSONB,
    res_hora_inicio_real TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    res_hora_final_real TIMESTAMP,
    res_finalizado_offline BOOLEAN DEFAULT FALSE,
    res_fecha_sincronizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    res_nota_primera_vez NUMERIC(5,2),
    res_repeticiones INTEGER DEFAULT 0,
    res_fecha_primera_vez TIMESTAMP,
    res_fecha_ultima_repeticion TIMESTAMP,
    res_device_id VARCHAR(100),
    res_eliminado BOOLEAN DEFAULT FALSE,
    res_fecha_eliminacion TIMESTAMP,
    res_eliminado_por INTEGER
);

-- 3.6 Logros de usuarios
--     Códigos disponibles: primer_quiz, perfect_score, speed_demon, quiz_master, five_quizes
CREATE TABLE IF NOT EXISTS evaluacion.tbl_logros_usuario (
    log_id SERIAL PRIMARY KEY,
    log_fk_usuario INTEGER NOT NULL REFERENCES seguridad.tbl_usuarios(usu_id) ON DELETE CASCADE,
    log_codigo VARCHAR(50) NOT NULL,
    log_fecha_desbloqueo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    log_puntos_recompensa INTEGER DEFAULT 0,
    CONSTRAINT uq_usuario_logro UNIQUE (log_fk_usuario, log_codigo)
);

-- ============================================================
-- 4. ÍNDICES ADICIONALES (optimización de consultas)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_logros_usuario_codigo ON evaluacion.tbl_logros_usuario(log_codigo);
CREATE INDEX IF NOT EXISTS idx_logros_usuario_usuario ON evaluacion.tbl_logros_usuario(log_fk_usuario);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON seguridad.tbl_usuarios(usu_email);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON seguridad.tbl_usuarios(usu_fk_rol);
CREATE INDEX IF NOT EXISTS idx_sesiones_codigo ON evaluacion.tbl_sesiones(ses_codigo_acceso);
CREATE INDEX IF NOT EXISTS idx_sesiones_profesor ON evaluacion.tbl_sesiones(ses_fk_profesor);
CREATE INDEX IF NOT EXISTS idx_resultados_usuario ON evaluacion.tbl_resultados(res_fk_usuario);
CREATE INDEX IF NOT EXISTS idx_resultados_sesion ON evaluacion.tbl_resultados(res_fk_sesion);
CREATE INDEX IF NOT EXISTS idx_inscripciones_alumno ON evaluacion.tbl_inscripciones(ins_fk_alumno);
CREATE INDEX IF NOT EXISTS idx_materias_profesor ON evaluacion.tbl_materias(mat_fk_profesor);

-- ============================================================
-- 5. VERIFICACIÓN
-- ============================================================
-- Ejecuta esto después de crear todo para confirmar:
--
-- SELECT 'Tablas creadas correctamente' AS resultado;
--
-- SELECT table_schema, table_name
-- FROM information_schema.tables
-- WHERE table_schema IN ('seguridad', 'evaluacion')
-- ORDER BY table_schema, table_name;
--
-- SELECT 'Roles:' AS info, count(*) FROM seguridad.tbl_roles;
-- SELECT 'Preguntas seguridad:' AS info, count(*) FROM seguridad.tbl_preguntas_seguridad;
