/**
 * Tipos que coinciden EXACTAMENTE con la estructura de MongoDB
 * Basado en: backend/aplicacion/esquemas_quiz.py
 */

export interface OpcionRespuesta {
  texto: string;
  es_correcta: boolean;
}

export interface Multimedia {
  url?: string;
  tipo?: string;
  public_id?: string;
}

export interface PreguntaMongo {
  nro_orden: number;
  tipo: 'opcion_multiple' | 'verdadero_falso' | 'seleccion_multiple' | 'completacion';
  categoria?: string;
  enunciado: string;
  multimedia?: Multimedia | null;
  puntos_si_es_dificultad: number;
  tiempo_limite_segundos: number;
  opciones: OpcionRespuesta[];
}

export interface MetadatosQuiz {
  titulo: string;
  tema?: string;
  recompensa_puntos_app: number;
  imagen_portada?: string;
  autor_id: number;
  fecha_creacion: string;
  modo_juego?: 'Igual' | 'Dificultad';
  materia_id?: number;
  ponderacion?: number;
}

export interface QuizCompleto {
  _id: string;
  metadatos: MetadatosQuiz;
  preguntas: PreguntaMongo[];
}

// Helper para validar que los datos del quiz estén completos
export function validarQuizCompleto(quiz: any): quiz is QuizCompleto {
  if (!quiz || typeof quiz !== 'object') return false;
  if (!quiz._id) return false;
  if (!quiz.metadatos || typeof quiz.metadatos !== 'object') return false;
  if (!Array.isArray(quiz.preguntas)) return false;
  if (quiz.preguntas.length === 0) return false;
  
  // Validar que cada pregunta tenga la estructura mínima necesaria
  return quiz.preguntas.every((pregunta: any) => {
    if (!pregunta || typeof pregunta !== 'object') return false;
    if (!pregunta.enunciado || typeof pregunta.enunciado !== 'string') return false;
    if (!Array.isArray(pregunta.opciones)) return false;
    return true;
  });
}

// Helper para obtener el texto de la pregunta (con fallback)
export function getEnunciado(pregunta: PreguntaMongo | any): string {
  if (!pregunta) return '';
  return pregunta.enunciado || pregunta.pregunta || 'Pregunta sin enunciado';
}

// Helper para verificar si es selección múltiple
export function esSeleccionMultiple(pregunta: PreguntaMongo | any): boolean {
  if (!pregunta) return false;
  return pregunta.tipo === 'seleccion_multiple' || pregunta.tipo === 'multiple_choice';
}

// Helper para verificar si es completación
export function esCompletacion(pregunta: PreguntaMongo | any): boolean {
  if (!pregunta) return false;
  return pregunta.tipo === 'completacion' || pregunta.tipo === 'text';
}

// Helper para verificar si es opción múltiple simple
export function esOpcionMultiple(pregunta: PreguntaMongo | any): boolean {
  if (!pregunta) return false;
  return pregunta.tipo === 'opcion_multiple' || pregunta.tipo === 'quiz' || pregunta.tipo === 'single';
}

// Helper para obtener las respuestas correctas (índices)
export function getIndicesCorrectos(pregunta: PreguntaMongo): number[] {
  if (!pregunta?.opciones) return [];
  return pregunta.opciones
    .map((opcion, index) => opcion.es_correcta ? index : -1)
    .filter(i => i !== -1);
}

// Helper para verificar si una respuesta es correcta (selección simple)
export function esRespuestaCorrectaSimple(pregunta: PreguntaMongo, indiceSeleccionado: number): boolean {
  const correctas = getIndicesCorrectos(pregunta);
  return correctas.length > 0 && correctas[0] === indiceSeleccionado;
}

// Helper para verificar respuestas múltiples
export function esRespuestaCorrectaMultiple(
  pregunta: PreguntaMongo, 
  indicesSeleccionados: number[]
): boolean {
  const correctas = getIndicesCorrectos(pregunta);
  if (correctas.length === 0 || indicesSeleccionados.length === 0) return false;
  
  // Debe tener exactamente las mismas respuestas correctas
  const todasSeleccionadasSonCorrectas = indicesSeleccionados.every(i => correctas.includes(i));
  const todasCorrectasFueronSeleccionadas = correctas.every(i => indicesSeleccionados.includes(i));
  
  return todasSeleccionadasSonCorrectas && todasCorrectasFueronSeleccionadas;
}

// Normalizar texto para comparación flexible
function normalizarTexto(texto: string): string {
  if (!texto) return '';
  
  // Paso 1: Trim inicial para espacios al inicio/final
  let resultado = texto.trim();
  
  // Paso 2: Minúsculas
  resultado = resultado.toLowerCase();
  
  // Paso 3: Normalizar acentos (NFD + quitar diacríticos)
  resultado = resultado.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Paso 4: Quitar signos de puntuación
  resultado = resultado.replace(/[.,;:!?¡¿'"()[\]{}\-]/g, '');
  
  // Paso 5: Normalizar espacios múltiples
  resultado = resultado.replace(/\s+/g, ' ');
  
  // Paso 6: Trim final
  resultado = resultado.trim();
  
  return resultado;
}

// Helper para verificar completación
export function esRespuestaCorrectaCompletacion(
  pregunta: PreguntaMongo,
  respuestaUsuario: string
): boolean {
  if (!respuestaUsuario.trim()) return false;
  const respuestaCorrecta = pregunta.opciones.find(o => o.es_correcta);
  if (!respuestaCorrecta) return false;
  
  const normalizadaUsuario = normalizarTexto(respuestaUsuario);
  const normalizadaCorrecta = normalizarTexto(respuestaCorrecta.texto);
  
  return normalizadaUsuario === normalizadaCorrecta;
}

// ============================================
// INTERFACES PARA EL PROFESOR (Legacy support)
// ============================================

export type TipoPregunta = 'quiz' | 'verdadero_falso' | 'seleccion_multiple' | 'completacion';

// Interfaz simplificada para listar quices (usada en biblioteca/index)
export interface QuizMongoSimplificado {
  _id: string;
  titulo: string;
  tema: string;
  cantidad_preguntas: number;
  fecha_creacion: string;
  imagen_portada?: string | null;
}

// Interfaz para crear/editar preguntas (usada en crear.tsx)
export interface Pregunta {
  id: number;
  tipo: TipoPregunta;
  pregunta: string;  // mapeado a enunciado en el backend
  respuestas: string[];  // mapeado a opciones[].texto
  respuestaCorrecta: number;
  tiempo: number;  // mapeado a tiempo_limite_segundos
  puntos: number;  // mapeado a puntos_si_es_dificultad
}

// Interfaz extendida para datos de pregunta con múltiples respuestas
export interface PreguntaData {
  id: number;
  tipo: TipoPregunta;
  pregunta: string;
  respuestas: string[];
  respuestaCorrecta: number;
  respuestasCorrectas?: number[]; // Para selección múltiple
  tiempo: number;
  imagen: string | null;
  puntos?: number; // Puntuación específica para modo Exactitud
}

// Interfaz para informes/resúmenes
export interface InformeResumen {
  titulo: string;
  descripcion: string;
  valor: string;
  icono: string;
  color: string;
}

// Interfaz para reportes
export interface Reporte {
  titulo: string;
  descripcion: string;
  valor: string;
  icono: string;
}

// ============================================
// FUNCIONES DE CONVERSIÓN (Frontend ↔ Backend)
// ============================================

// Convertir pregunta del profesor al formato MongoDB
export function convertirPreguntaAFormatoMongo(pregunta: Pregunta | PreguntaData, nroOrden: number): PreguntaMongo {
  const opciones: OpcionRespuesta[] = pregunta.respuestas.map((texto, index) => ({
    texto,
    es_correcta: 
      Array.isArray((pregunta as PreguntaData).respuestasCorrectas)
        ? (pregunta as PreguntaData).respuestasCorrectas!.includes(index)
        : index === pregunta.respuestaCorrecta
  }));

  return {
    nro_orden: nroOrden,
    tipo: mapearTipoPregunta(pregunta.tipo),
    enunciado: pregunta.pregunta,
    multimedia: (pregunta as PreguntaData).imagen ? { url: (pregunta as PreguntaData).imagen || undefined, tipo: 'imagen' } : null,
    puntos_si_es_dificultad: (pregunta as Pregunta).puntos || 10,
    tiempo_limite_segundos: pregunta.tiempo || 20,
    opciones
  };
}

// Mapear tipos de pregunta del profesor a tipos de MongoDB
function mapearTipoPregunta(tipo: TipoPregunta): PreguntaMongo['tipo'] {
  const mapeo: Record<TipoPregunta, PreguntaMongo['tipo']> = {
    'quiz': 'opcion_multiple',
    'verdadero_falso': 'opcion_multiple',
    'seleccion_multiple': 'seleccion_multiple',
    'completacion': 'completacion'
  };
  return mapeo[tipo] || 'opcion_multiple';
}

// Convertir quiz completo del formato MongoDB a formato simplificado
export function simplificarQuizMongo(quiz: QuizCompleto): QuizMongoSimplificado {
  return {
    _id: quiz._id,
    titulo: quiz.metadatos.titulo,
    tema: quiz.metadatos.tema || '',
    cantidad_preguntas: quiz.preguntas.length,
    fecha_creacion: quiz.metadatos.fecha_creacion,
    imagen_portada: quiz.metadatos.imagen_portada || null
  };
}
