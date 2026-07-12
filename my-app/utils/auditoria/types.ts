// Datos del dashboard de auditoria (tarjetas de resumen)
interface EstadisticasGenerales {
  usuarios_por_rol: Array<{ rol: string; cantidad: number }>;
  total_quizes: number;
  total_materias: number;
  total_usuarios_activos: number;
  sesiones_activas: number;
}

// Quiz creado por un profesor, con detalle completo de preguntas
interface QuizCreado {
  quiz_id: string;
  titulo: string;
  cantidad_preguntas: number;
  fecha_creacion: string;
  tipo_operacion: string;
  materia: {
    id: number;
    nombre: string;
    codigo: string;
  };
  profesor: {
    id: number;
    nombre: string;
    apellido: string;
    email: string;
  };
  datos_nuevos?: {
    titulo?: string;
    tema?: string;
    imagen_portada?: string;
    cantidad_preguntas?: number;
    preguntas?: Array<{
      nro_orden: number;
      tipo: string;
      categoria?: string;
      enunciado: string;
      multimedia?: {url?: string; tipo?: string} | null;
      tiempo_limite_segundos?: number;
      puntos_si_es_dificultad?: number;
      opciones?: Array<{texto: string; es_correcta: boolean}>;
    }>;
  };
  // Snapshot del estado anterior (para comparar cambios)
  datos_anteriores?: {
    titulo?: string;
    tema?: string;
    imagen_portada?: string;
    cantidad_preguntas?: number;
    preguntas?: Array<{
      nro_orden: number;
      tipo: string;
      categoria?: string;
      enunciado: string;
      multimedia?: {url?: string; tipo?: string} | null;
      tiempo_limite_segundos?: number;
      puntos_si_es_dificultad?: number;
      opciones?: Array<{texto: string; es_correcta: boolean}>;
    }>;
  };
}

// Cada operacion registrada en la coleccion de auditoria de MongoDB
interface OperacionQuiz {
  tipo_operacion: string;
  nombre_operacion?: string;
  fecha_operacion: string;
  usuario: {
    id: number;
    nombre: string;
    apellido: string;
    email: string;
  } | null;
  entidad: {
    tipo?: string;
    id?: string;
    nombre?: string;
  };
  detalles: {
    quiz_titulo?: string;
    quiz_id?: string;
    cantidad_preguntas?: number;
    materia?: {
      id: number;
      nombre: string;
      codigo: string;
    };
    mensaje_descriptivo?: string;
    accion?: string;
  };
  cambio: {
    datos_anteriores: Record<string, any> | null;
    datos_nuevos: Record<string, any> | null;
  };
  contexto?: {
    ip_address?: string;
    user_agent?: string;
  };
  quiz_id: string;
  quiz_titulo: string;
  materia: {
    id: number;
    nombre: string;
    codigo: string;
  } | null;
  cantidad_preguntas: number;
}

// Cualquier accion reciente en el sistema, sin importar la entidad
interface AccionReciente {
  tipo_operacion: string;
  nombre_operacion: string;
  fecha_operacion: string;
  usuario?: { id: number; nombre: string; apellido: string; email: string; rol: string };
  entidad?: { tipo?: string; id?: string; nombre?: string };
  detalles?: {
    quiz_titulo?: string;
    materia?: { id: number; nombre: string; codigo: string };
    materia_nombre?: string;
    cantidad_preguntas?: number;
    mensaje_descriptivo?: string;
    accion?: string;
    sesion_nombre?: string;
    codigo_acceso?: string;
    profesor_nombre?: string;
    nota_final?: number;
    puntos_ganados?: number;
    escala_puntuacion?: number;
    modo_juego?: string;
    es_repeticion?: boolean;
    logro_codigo?: string;
    logro_nombre?: string;
    puntos_recompensa?: number;
    usuario_afectado?: { id: number; nombre: string; apellido: string; email: string };
    campos_modificados?: string[];
    tipo_pdf?: string;
    [key: string]: any;
  };
  cambio?: {
    datos_anteriores?: Record<string, any>;
    datos_nuevos?: Record<string, { anterior: any; nuevo: any }>;
  } | null;
}


// Sesion agrupada con sus datos basicos para la lista del dashboard
interface SesionReciente {
  sesion_id: number;
  codigo_acceso: string;
  nombre_grupo?: string;
  estatus: string;
  activo: boolean;
  eliminado: boolean;
  estado?: string;
  tipo_sesion?: string;
  estado_determinado?: string;
  fecha_creacion: string;
  fecha_inicio: string;
  fecha_fin: string;
  duracion_horas?: number;
  materia: {
    nombre: string;
    codigo: string;
  };
  creador?: {
    id: number;
    nombre: string;
    apellido: string;
    email: string;
  };
  profesor?: {
    id: number;
    nombre: string;
    apellido: string;
  };
  participantes?: Array<{
    usuario_id: number;
    nombre: string;
    apellido: string;
    email: string;
    nota_final?: number;
    fecha_inicio?: string;
    fecha_fin?: string;
    estado: string;
  }>;
  total_participantes: number;
  participantes_count?: number;
}

interface MateriaAuditoria {
  materia_id: number;
  nombre: string;
  codigo: string;
  activo: boolean;
  eliminado: boolean;
  fecha_creacion?: string;
  fecha_eliminacion?: string;
  eliminado_por?: {
    nombre: string;
    apellido: string;
    email: string;
  };
  profesor_actual: {
    id: number;
    nombre: string;
    apellido: string;
    email: string;
  };
  estadisticas: {
    sesiones_activas: number;
    personas_presentan_quizes: number;
  };
}


// Usuario con sus estadisticas agregadas y el historial de acciones
interface UsuarioAuditoria {
  usuario: {
    id: number;
    nombre: string;
    apellido: string;
    email: string;
    rol: string;
    rol_id: number;
    activo: boolean;
    imagen?: string | null;
    fecha_registro?: string | null;
    puntos_app: number;
    eliminado?: boolean;
    fecha_eliminacion?: string | null;
    eliminado_por?: number | null;
  };
  estadisticas: {
    total_quices_realizados?: number;
    promedio_nota?: number;
    puntos_totales?: number;
    total_sesiones?: number;
    total_participantes?: number;
    total_quizes_creados?: number;
  };
  acciones_recientes: AccionReciente[];
  historial_completo: AccionReciente[];
  ultima_actividad?: string | null;
}

// Un evento dentro de la linea de tiempo de una sesion
interface OperacionSesionEvento {
  fecha_operacion: string;
  tipo_operacion: string;
  nombre_operacion: string;
  usuario: {
    id: number;
    nombre: string;
    apellido: string;
    email: string;
    rol: string;
  };
  datos_nuevos?: Record<string, any>;
  datos_anteriores?: Record<string, any>;
  detalles_mongo?: Record<string, any>;
  nota_final?: number;
  puntos_ganados?: number;
  es_repeticion?: boolean;
}

// Historial completo de una sesion con todos sus eventos y participantes
interface SesionHistorial {
  sesion_id: number;
  codigo_acceso: string;
  nombre_grupo: string;
  quiz_id: string;
  quiz_titulo: string;
  quiz_tema: string;
  quiz_ponderacion: number;
  quiz_modo_juego: string;
  quiz_cantidad_preguntas: number;
  materia: {
    id: number | null;
    nombre: string;
    codigo: string;
  };
  estatus: string;
  activo: boolean;
  eliminado: boolean;
  tipo_sesion?: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  participantes: Array<{
    usuario_id: number;
    nombre: string;
    apellido: string;
    email: string;
    nota_final: number;
    puntos_ganados: number;
    tiempo_total_ms: number;
    hora_fin: string | null;
    repeticiones: number;
    fecha_primera_vez: string | null;
  }>;
  total_participantes: number;
  eventos: OperacionSesionEvento[];
}

// Item individual de la linea de tiempo de una materia
interface MateriaHistorialItem {
  materia_id: string;
  nombre: string;
  codigo: string;
  fecha_operacion: string;
  tipo_operacion: string;
  nombre_operacion: string;
  usuario: {
    id: number;
    nombre: string;
    apellido: string;
    email: string;
    rol: string;
  };
  datos_nuevos: Record<string, any> | null;
  datos_anteriores: Record<string, any> | null;
}

export type {
  EstadisticasGenerales,
  QuizCreado,
  OperacionQuiz,
  AccionReciente,
  UsuarioAuditoria,
  SesionReciente,
  MateriaAuditoria,
  MateriaHistorialItem,
  OperacionSesionEvento,
  SesionHistorial,
};

// Evitar que expo-router trate a este archivo como ruta
export default null;
