import { obtenerResultadosPendientes, marcarSincronizado, incrementarIntentosSync } from '@/database/resultadosDao';
import { obtenerQuizDescargado, marcarQuizSincronizado, eliminarQuizDescargado, actualizarEstadoQuiz } from '@/database/quizzesDao';
import { registrarSyncLog } from '@/database/syncDao';
import { API_URL, getAuthHeaders } from './api';
import NetInfo from '@react-native-community/netinfo';

/**
 * Sincroniza todos los resultados pendientes con el backend.
 * Se llama automáticamente cuando hay conexión.
 */
// Esta funcion es el corazon del sistema offline. Cada vez que la
// app detecta conexion a internet, recorre los resultados que se
// guardaron localmente y los manda al backend uno por uno.
export async function syncPendientes(): Promise<{ exitosos: number; fallidos: number }> {
  const pendientes = await obtenerResultadosPendientes();
  
  if (pendientes.length === 0) {
    return { exitosos: 0, fallidos: 0 };
  }

  // Antes de arrancar la sincronizacion verificamos que haya
  // conexion a internet. Si no, mejor no intentarlo.
  const netState = await NetInfo.fetch();
  if (!netState.isConnected || !netState.isInternetReachable) {
    return { exitosos: 0, fallidos: 0 };
  }

  let exitosos = 0;
  let fallidos = 0;

  for (const resultado of pendientes) {
    // Si ya fallo 5 veces, algo anda mal con ese resultado.
    // Mejor lo marcamos como expirado y seguimos con los demas,
    // en lugar de quedarnos trabados ahi para siempre.
    if (resultado.intentos_sync >= 5) {
      await actualizarEstadoQuiz(resultado.sesion_id, 'expirado');
      continue;
    }

    try {
      // Obtener el token de descarga del quiz correspondiente
      const quiz = await obtenerQuizDescargado(resultado.sesion_id);
      if (!quiz) {
        continue;
      }

      const headers = await getAuthHeaders();

      // La conexion se cayo? Mejor revisar otra vez antes de mandar cada
      // resultado. Si el usuario se metio a un tunel mientras sincronizabamos,
      // evitar una peticion fallida ahorra tiempo.
      const currentNetState = await NetInfo.fetch();
      if (!currentNetState.isConnected) {
        fallidos++;
        continue;
      }

      const response = await fetch(`${API_URL}/sesiones/sincronizar-offline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          token_descarga: quiz.token_descarga,
          nota_final: resultado.nota_final,
          puntos_ganados: resultado.puntos_ganados,
          tiempo_total_ms: resultado.tiempo_total_ms,
          informe_fallas: (() => {
            try {
              if (!resultado.informe_fallas) return null;
              if (typeof resultado.informe_fallas === 'object') return resultado.informe_fallas;
              return JSON.parse(resultado.informe_fallas);
            } catch {
              return null;
            }
          })(),
          hora_inicio_local: resultado.hora_inicio_local,
          finalizado_en_local: resultado.finalizado_en_local,
        }),
      });

      if (response.ok) {
        await marcarSincronizado(resultado.sesion_id);
        await marcarQuizSincronizado(resultado.sesion_id);
        await eliminarQuizDescargado(resultado.sesion_id);
        await registrarSyncLog(resultado.sesion_id, true, 'Sincronizado exitosamente');
        exitosos++;
      } else {
        const err = await response.json().catch(() => ({ detail: 'Error desconocido' }));
        const detail = err.detail || 'Error del servidor';
        
        if (response.status === 404) {
          // Si el backend dice que la sesion no existe, no tiene sentido
          // seguir reintentando. Algo la borraron o nunca existio.
          await marcarSincronizado(resultado.sesion_id);
          await registrarSyncLog(resultado.sesion_id, false, `Limpiado: ${detail}`);
        } else if (response.status === 400) {
          // Error de validacion: a veces el token de descarga expiro
          // o el servidor rechazo la peticion por formato. Intentamos
          // de nuevo por el endpoint normal de resultados pero con
          // la bandera es_offline=true para que el backend sepa que
          // viene del mecanismo de sincronizacion.
          try {
            const fallbackBody = {
              sesion_id: resultado.sesion_id,
              id_usuario: resultado.usuario_id,
              nota_final: resultado.nota_final,
              puntos_ganados: resultado.puntos_ganados,
              tiempo_total_ms: resultado.tiempo_total_ms,
              informe_fallas: (() => {
                try {
                  if (!resultado.informe_fallas) return {};
                  if (typeof resultado.informe_fallas === 'object') return resultado.informe_fallas;
                  return JSON.parse(resultado.informe_fallas);
                } catch { return {}; }
              })(),
              hora_inicio_local: resultado.hora_inicio_local,
              finalizado_en_local: resultado.finalizado_en_local,
              es_offline: true,
            };
            const fbResponse = await fetch(`${API_URL}/sesiones/resultado`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...await getAuthHeaders(),
              },
              body: JSON.stringify(fallbackBody),
            });
            if (fbResponse.ok) {
              await marcarSincronizado(resultado.sesion_id);
              await marcarQuizSincronizado(resultado.sesion_id);
              await eliminarQuizDescargado(resultado.sesion_id);
              await registrarSyncLog(resultado.sesion_id, true, 'Sincronizado vía fallback');
              exitosos++;
            } else {
              const fbErr = await fbResponse.json().catch(() => ({ detail: 'Error fallback' }));
              // Fallback también falló → retry más tarde
              await incrementarIntentosSync(resultado.sesion_id, `Fallback: ${fbErr.detail || fbResponse.status}`);
              await registrarSyncLog(resultado.sesion_id, false, `Fallback fallido: ${fbErr.detail || fbResponse.status}`);
              fallidos++;
            }
          } catch (fbError: any) {
            await incrementarIntentosSync(resultado.sesion_id, `Fallback error: ${fbError.message}`);
            await registrarSyncLog(resultado.sesion_id, false, `Fallback error: ${fbError.message}`);
            fallidos++;
          }
        } else {
          // Error del servidor o de red: cosas pasajeras que pueden
          // resolverse solas en el proximo ciclo de sincronizacion.
          await incrementarIntentosSync(resultado.sesion_id, detail);
          await registrarSyncLog(resultado.sesion_id, false, detail);
          fallidos++;
        }
      }
    } catch (error: any) {
      // Si falla la peticion por completo (sin respuesta del servidor),
      // contamos el intento y lo dejamos para la proxima ronda.
      await incrementarIntentosSync(resultado.sesion_id, error.message || 'Sin conexión');
      await registrarSyncLog(resultado.sesion_id, false, error.message || 'Sin conexión');
      fallidos++;
    }
  }

  return { exitosos, fallidos };
}
