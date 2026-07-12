import AsyncStorage from '@react-native-async-storage/async-storage';
import { limpiarImagenesQuiz } from '@/utils/imagenesOffline';

// Quiz completo guardado localmente para modo offline
export interface QuizDescargado {
  id?: number;
  sesion_id: number;
  quiz_id: string;
  codigo_acceso: string;
  quiz_json: string; // el contenido del quiz serializado
  titulo: string;
  materia_nombre: string | null;
  modo_juego: string;
  escala_puntuacion: number;
  fecha_inicio: string;
  fecha_fin: string;
  total_preguntas: number;
  token_descarga: string;
  descargado_en: string;
  estado: string; // pendiente, sincronizado, expirado
  sincronizado_en: string | null;
}

const PREFIX = 'offline_quiz_';

// Almacena el quiz en el dispositivo para usarlo sin internet
export async function guardarQuizDescargado(data: QuizDescargado): Promise<void> {
  await AsyncStorage.setItem(PREFIX + data.sesion_id, JSON.stringify(data));
}

// Recupera un quiz especifico por el ID de la sesion
export async function obtenerQuizDescargado(sesionId: number): Promise<QuizDescargado | null> {
  const res = await AsyncStorage.getItem(PREFIX + sesionId);
  return res ? JSON.parse(res) : null;
}

// Trae todos los quizzes que aun no se han sincronizado ni expirado
export async function obtenerQuizzesPendientes(): Promise<QuizDescargado[]> {
  const allKeys = await AsyncStorage.getAllKeys();
  const quizKeys = allKeys.filter(key => key.startsWith(PREFIX));
  const quizzes: QuizDescargado[] = [];
  for (const key of quizKeys) {
    const res = await AsyncStorage.getItem(key);
    if (res) {
      const quiz = JSON.parse(res);
      if (quiz.estado === 'pendiente') {
        quizzes.push(quiz);
      }
    }
  }
  return quizzes;
}

// Cambia el estado interno del quiz (ej: de pendiente a completado)
export async function actualizarEstadoQuiz(sesionId: number, estado: string): Promise<void> {
  const key = PREFIX + sesionId;
  const res = await AsyncStorage.getItem(key);
  if (res) {
    const quiz = JSON.parse(res);
    quiz.estado = estado;
    await AsyncStorage.setItem(key, JSON.stringify(quiz));
  }
}

// Marca con timestamp cuando se logra sincronizar con el servidor
export async function marcarQuizSincronizado(sesionId: number): Promise<void> {
  const key = PREFIX + sesionId;
  const res = await AsyncStorage.getItem(key);
  if (res) {
    const quiz = JSON.parse(res);
    quiz.estado = 'sincronizado';
    quiz.sincronizado_en = new Date().toISOString();
    await AsyncStorage.setItem(key, JSON.stringify(quiz));
  }
}

// Borra el quiz local y sus imagenes asociadas
export async function eliminarQuizDescargado(sesionId: number): Promise<void> {
  await AsyncStorage.removeItem(PREFIX + sesionId);
  await limpiarImagenesQuiz(sesionId);
}

// Verifica rapidamente si ya se descargo antes (evita duplicados)
export async function quizExiste(sesionId: number): Promise<boolean> {
  return (await AsyncStorage.getItem(PREFIX + sesionId)) !== null;
}

// Busca un quiz por codigo de acceso (para cuando el estudiante escanea el codigo)
export async function obtenerQuizDescargadoPorCodigo(codigo: string): Promise<QuizDescargado | null> {
  const allKeys = await AsyncStorage.getAllKeys();
  const quizKeys = allKeys.filter(key => key.startsWith(PREFIX));
  for (const key of quizKeys) {
    const res = await AsyncStorage.getItem(key);
    if (res) {
      const quiz = JSON.parse(res);
      if (quiz.codigo_acceso === codigo) {
        return quiz;
      }
    }
  }
  return null;
}

// Limpieza periodica para no acumular quizzes expirados en el dispositivo
export async function limpiarQuizzesViejos(dias: number = 7): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const quizKeys = allKeys.filter(key => key.startsWith(PREFIX));
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - dias);
  const fechaLimiteIso = fechaLimite.toISOString();

  for (const key of quizKeys) {
    const res = await AsyncStorage.getItem(key);
    if (res) {
      const quiz = JSON.parse(res);
      if (quiz.fecha_fin < fechaLimiteIso && quiz.estado === 'pendiente') {
        await AsyncStorage.removeItem(key);
      }
    }
  }
}

// Cuando se borra una sesion del servidor, tambien se borra su copia local
export async function limpiarQuizzesHuerfanos(sessionIdsValidos: number[]): Promise<number> {
  const allKeys = await AsyncStorage.getAllKeys();
  const quizKeys = allKeys.filter(key => key.startsWith(PREFIX));
  let eliminados = 0;
  
  for (const key of quizKeys) {
    const res = await AsyncStorage.getItem(key);
    if (res) {
      const quiz = JSON.parse(res);
      if (!sessionIdsValidos.includes(quiz.sesion_id)) {
        await AsyncStorage.removeItem(key);
        eliminados++;
        console.log('🧹 [quizzesDao] Quiz huérfano eliminado, sesion_id:', quiz.sesion_id);
      }
    }
  }
  return eliminados;
}
