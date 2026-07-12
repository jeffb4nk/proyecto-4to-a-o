import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Expo Go desde SDK 53 dejo de soportar notificaciones locales.
// Si estamos ahi, este modulo no hace nada. Solo funciona en
// builds nativas o desarrollo con dev-client.
let Notifications: any = null;
const isExpoGo = Constants.appOwnership === 'expo';

if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.error('ℹ️ expo-notifications no disponible:', e);
  }
}

// IDs únicos para cada tipo de notificación
const getNotifIds = (resultadoId: number) => ({
  unaHora: `pendiente-${resultadoId}-1h`,
  quinceMin: `pendiente-${resultadoId}-15m`,
  alInicio: `pendiente-${resultadoId}-inicio`,
});

/**
 * Pide permiso al usuario para mostrar notificaciones
 */
export async function pedirPermisoNotificaciones(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return false;
    }
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('quiz-pendientes', {
        name: 'Quizzes pendientes',
        importance: Notifications.AndroidImportance?.HIGH || 4,
        sound: 'default',
      });
    }
    return true;
  } catch (e) {
    console.error('ℹ️ Error al pedir permiso de notificaciones:', e);
    return false;
  }
}

/**
 * Programa las 3 notificaciones para una sesión pendiente
 */
// Mandamos tres avisos para que el estudiante no se olvide:
// una hora antes, 15 minutos antes y justo cuando empieza.
// Asi cubrimos tanto a los que necesitan tiempo para prepararse
// como a los que se distraen y lo dejan para el ultimo minuto.
export async function programarNotificaciones(
  resultadoId: number,
  tituloQuiz: string,
  fechaInicio: Date
) {
  if (!Notifications) return;
  try {
    const permiso = await pedirPermisoNotificaciones();
    if (!permiso) return;

    const ids = getNotifIds(resultadoId);
    const ahora = new Date();
    const diffMs = fechaInicio.getTime() - ahora.getTime();

    if (diffMs > 3600000) {
      await Notifications.scheduleNotificationAsync({
        identifier: ids.unaHora,
        content: {
          title: '⏰ Quiz pronto',
          body: `"${tituloQuiz}" comienza en 1 hora`,
          sound: true,
          data: { resultadoId, tipo: '1hora' },
        },
        trigger: { date: new Date(fechaInicio.getTime() - 3600000) },
      });
    }

    if (diffMs > 900000) {
      await Notifications.scheduleNotificationAsync({
        identifier: ids.quinceMin,
        content: {
          title: '⏰ Quiz pronto',
          body: `"${tituloQuiz}" comienza en 15 minutos`,
          sound: true,
          data: { resultadoId, tipo: '15min' },
        },
        trigger: { date: new Date(fechaInicio.getTime() - 900000) },
      });
    }

    await Notifications.scheduleNotificationAsync({
      identifier: ids.alInicio,
      content: {
        title: '🔔 ¡Ya está disponible!',
        body: `"${tituloQuiz}" ya puedes presentarlo`,
        sound: true,
        data: { resultadoId, tipo: 'inicio' },
      },
      trigger: { date: fechaInicio },
    });
  } catch (e) {
    console.error('ℹ️ Error al programar notificaciones:', e);
  }
}

/**
 * Cancela las 3 notificaciones de una sesión pendiente
 */
// Si el estudiante ya presento el quiz o la sesion se cancelo,
// limpiamos las notificaciones pendientes para no saturar.
export async function cancelarNotificaciones(resultadoId: number) {
  if (!Notifications) return;
  try {
    const ids = getNotifIds(resultadoId);
    await Notifications.cancelScheduledNotificationAsync(ids.unaHora);
    await Notifications.cancelScheduledNotificationAsync(ids.quinceMin);
    await Notifications.cancelScheduledNotificationAsync(ids.alInicio);
  } catch (e) {
    console.error('ℹ️ Error al cancelar notificaciones:', e);
  }
}
