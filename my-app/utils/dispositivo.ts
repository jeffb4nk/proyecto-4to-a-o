import { getItem, setItem } from './storage';

const DEVICE_ID_KEY = 'device_id';

// Cada dispositivo necesita un ID unico que persista aunque se cierre la app.
// El backend lo usa para rastrear desde donde se conecta cada usuario
// y tambien para el sistema offline (saber que resultados pertenecen a quien).
export async function getDeviceId(): Promise<string> {
  try {
    const existing = await getItem(DEVICE_ID_KEY);
    if (existing) return existing;

    const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });

    await setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return 'unknown';
  }
}
