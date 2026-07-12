import AsyncStorage from '@react-native-async-storage/async-storage';

// Resultado de un quiz presentado sin conexion, pendiente de subir
export interface ResultadoPendiente {
  id?: number;
  sesion_id: number;
  usuario_id: number;
  nota_final: number;
  puntos_ganados: number;
  tiempo_total_ms: number;
  informe_fallas: string | null;
  hora_inicio_local: string;
  finalizado_en_local: string;
  es_offline: number;
  sincronizado: number; // 0 = pendiente, 1 = ya subio
  intentos_sync: number; // cuantas veces se intento subir
  ultimo_error: string | null;
}

const PREFIX = 'offline_res_';

// Almacena localmente el resultado cuando el estudiante esta offline
export async function guardarResultadoPendiente(data: Omit<ResultadoPendiente, 'id' | 'sincronizado' | 'intentos_sync' | 'ultimo_error'>): Promise<void> {
  const fullData: ResultadoPendiente = {
    ...data,
    sincronizado: 0,
    intentos_sync: 0,
    ultimo_error: null,
  };
  await AsyncStorage.setItem(PREFIX + data.sesion_id, JSON.stringify(fullData));
}

// Recolecta todos los resultados que aun no se han sincronizado
export async function obtenerResultadosPendientes(): Promise<ResultadoPendiente[]> {
  const allKeys = await AsyncStorage.getAllKeys();
  const resKeys = allKeys.filter(key => key.startsWith(PREFIX));
  const pendientes: ResultadoPendiente[] = [];
  for (const key of resKeys) {
    const res = await AsyncStorage.getItem(key);
    if (res) {
      const resultado = JSON.parse(res);
      if (resultado.sincronizado === 0) {
        pendientes.push(resultado);
      }
    }
  }
  return pendientes;
}

// Cambia el estado a sincronizado despues de subirlo exitosamente
export async function marcarSincronizado(sesionId: number): Promise<void> {
  const key = PREFIX + sesionId;
  const res = await AsyncStorage.getItem(key);
  if (res) {
    const resultado = JSON.parse(res);
    resultado.sincronizado = 1;
    await AsyncStorage.setItem(key, JSON.stringify(resultado));
  }
}

// Lleva la cuenta de los reintentos fallidos para no perder el rastro
export async function incrementarIntentosSync(sesionId: number, error: string): Promise<void> {
  const key = PREFIX + sesionId;
  const res = await AsyncStorage.getItem(key);
  if (res) {
    const resultado = JSON.parse(res);
    resultado.intentos_sync += 1;
    resultado.ultimo_error = error;
    await AsyncStorage.setItem(key, JSON.stringify(resultado));
  }
}

// Evita duplicados al verificar si ya hay un resultado guardado
export async function resultadoPendienteExiste(sesionId: number): Promise<boolean> {
  return (await AsyncStorage.getItem(PREFIX + sesionId)) !== null;
}

// Lista los IDs de sesiones con datos locales (util para el manager de sincronizacion)
export async function obtenerSesionesConResultadoLocal(): Promise<number[]> {
  const allKeys = await AsyncStorage.getAllKeys();
  const resKeys = allKeys.filter(key => key.startsWith(PREFIX));
  return resKeys.map(key => parseInt(key.replace(PREFIX, '')));
}
