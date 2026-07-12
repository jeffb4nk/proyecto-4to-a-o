import * as FileSystem from 'expo-file-system/legacy';
import { API_URL } from '@/utils/api';

// Las imagenes de cada quiz se guardan localmente para que el estudiante
// pueda verlas aunque pierda la conexion. Sin esto, al entrar al modo
// offline las preguntas con imagenes se verian rotas.
const DIR = FileSystem.documentDirectory + 'quiz_images/';

export async function descargarImagenesQuiz(quiz: any, sesionId: number): Promise<any> {
  const dir = DIR + sesionId + '/';
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  for (const pregunta of quiz.preguntas || []) {
    const url = pregunta.multimedia?.url;
    if (!url || url.startsWith('file://') || url.startsWith('data:')) continue;

    const filename = url.split('/').pop() || `${Date.now()}.jpg`;
    try {
      const { uri } = await FileSystem.downloadAsync(`${API_URL}${url}`, dir + filename);
      pregunta.multimedia.url = uri;
    } catch (e) {
      console.warn('No se pudo descargar imagen:', url);
    }
  }
  return quiz;
}

// Cuando la sesion se sincroniza o expira, ya no necesitamos
// las imagenes guardadas. Esto evita que el dispositivo se llene
// de archivos que ya no sirven.
export async function limpiarImagenesQuiz(sesionId: number) {
  const dir = DIR + sesionId + '/';
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) await FileSystem.deleteAsync(dir, { idempotent: true });
  } catch (e) {
    console.warn('No se pudo limpiar imágenes del quiz:', sesionId);
  }
}
