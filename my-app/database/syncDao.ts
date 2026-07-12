
import AsyncStorage from '@react-native-async-storage/async-storage';

// Registro de cada intento de subir datos al servidor
export interface SyncLogEntry {
  id?: number;
  sesion_id: number;
  timestamp: string;
  exitoso: number; // 1 si funciono, 0 si fallo
  detalle: string | null;
}

const STORAGE_KEY = 'offline_sync_logs';

// Guarda un intento de sincronizacion para llevar trazabilidad
export async function registrarSyncLog(sesionId: number, exitoso: boolean, detalle?: string): Promise<void> {
  const res = await AsyncStorage.getItem(STORAGE_KEY);
  const logs: SyncLogEntry[] = res ? JSON.parse(res) : [];
  logs.push({
    sesion_id: sesionId,
    timestamp: new Date().toISOString(),
    exitoso: exitoso ? 1 : 0,
    detalle: detalle || null,
  });
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
}

// Consulta si una sesion en particular ya tuvo intentos de sync
export async function obtenerUltimoSync(sesionId: number): Promise<SyncLogEntry | null> {
  const res = await AsyncStorage.getItem(STORAGE_KEY);
  if (!res) return null;
  const logs: SyncLogEntry[] = JSON.parse(res);
  const sessionLogs = logs.filter(log => log.sesion_id === sesionId);
  if (sessionLogs.length === 0) return null;
  return sessionLogs[sessionLogs.length - 1];
}

// Trae el historial completo de sincronizacion (para depuracion)
export async function obtenerTodosLosLogs(): Promise<SyncLogEntry[]> {
  const res = await AsyncStorage.getItem(STORAGE_KEY);
  return res ? JSON.parse(res) : [];
}

// Evita que el almacenamiento crezca infinitamente borrando entradas viejas
export async function limpiarLogsViejos(dias: number = 7): Promise<void> {
  const res = await AsyncStorage.getItem(STORAGE_KEY);
  if (!res) return;
  const logs: SyncLogEntry[] = JSON.parse(res);
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - dias);
  const fechaLimiteIso = fechaLimite.toISOString();
  const filteredLogs = logs.filter(log => log.timestamp >= fechaLimiteIso);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filteredLogs));
}
