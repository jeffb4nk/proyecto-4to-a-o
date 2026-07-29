// Contexto que gestiona toda la funcionalidad offline de la app.
// Detecta cambios de conexión, guarda resultados pendientes cuando
// no hay internet, y los sincroniza automáticamente cuando se
// recupera la señal. También valida el token JWT antes de sincronizar
// para evitar enviar datos al servidor con un token expirado.
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, getAuthHeaders, reautenticar } from '@/utils/api';
import { getItem, setItem } from '@/utils/storage';

interface ResultadoPendiente {
  id_usuario: number;
  sesion_id: number;
  nota_final: number;
  puntos_ganados: number;
  tiempo_total_ms: number;
  informe_fallas: {};
  hora_inicio_local: string;
  finalizado_en_local: string;
  es_offline: boolean;
}

interface OfflineContextType {
  isConnected: boolean;
  sincronizando: boolean;
  resultadosPendientes: ResultadoPendiente[];
  enviarResultado: (resultado: ResultadoPendiente) => Promise<{ success: boolean; data?: any; offline: boolean; error?: string }>;
  sincronizarResultadosPendientes: () => Promise<void>;
  refreshPendientes: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [resultadosPendientes, setResultadosPendientes] = useState<ResultadoPendiente[]>([]);
  const resultadosPendientesRef = useRef<ResultadoPendiente[]>([]);
  const sincronizandoRef = useRef(false);
  const ultimaSincronizacionRef = useRef<number>(0);
  const isConnectedRef = useRef(true);

  // Mantener ref actualizada con los pendientes para evitar dependencias en listeners
  // Las refs no disparan re-renders, así que los listeners de red pueden
  // acceder al estado actual sin causar bucles infinitos.
  useEffect(() => {
    resultadosPendientesRef.current = resultadosPendientes;
  }, [resultadosPendientes]);

  // Cargar resultados pendientes al iniciar
  useEffect(() => {
    cargarResultadosPendientes();
  }, []);



  // Escuchar cambios de conexión
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const connected = state.isConnected ?? false;
      setIsConnected(connected);
      isConnectedRef.current = connected;
      // NOTE: Sync is handled by useSyncManager — NOT here (prevents double-sync race condition)
    });

    return () => unsubscribe();
  }, []);

  const cargarResultadosPendientes = async () => {
    try {
      // Read from resultadosDao (unified storage)
      const { obtenerResultadosPendientes } = await import('@/database/resultadosDao');
      const pendientesDB = await obtenerResultadosPendientes();
      
      // Convert from resultadosDao format to OfflineContext format
      const pendientes: ResultadoPendiente[] = pendientesDB.map((p: any) => ({
        id_usuario: p.usuario_id,
        sesion_id: p.sesion_id,
        nota_final: p.nota_final,
        puntos_ganados: p.puntos_ganados,
        tiempo_total_ms: p.tiempo_total_ms,
        informe_fallas: (() => {
          try {
            if (!p.informe_fallas) return {};
            if (typeof p.informe_fallas === 'object') return p.informe_fallas;
            if (typeof p.informe_fallas === 'string') {
              const parsed = JSON.parse(p.informe_fallas);
              return typeof parsed === 'object' && parsed !== null ? parsed : {};
            }
            return {};
          } catch {
            return {};
          }
        })(),
        hora_inicio_local: p.hora_inicio_local,
        finalizado_en_local: p.finalizado_en_local,
        es_offline: true,
      }));

      
      if (pendientes.length > 0) {
        setResultadosPendientes(pendientes);
        resultadosPendientesRef.current = pendientes;

        // NOTE: Sync is handled by useSyncManager — NOT here
      }
    } catch (error) {
    }
  };

  const guardarResultadoPendiente = async (resultado: ResultadoPendiente) => {
    try {
      // Write to resultadosDao (unified storage — same place useSyncManager reads from)
      const { guardarResultadoPendiente: guardarEnDB } = await import('@/database/resultadosDao');
      await guardarEnDB({
        sesion_id: resultado.sesion_id,
        usuario_id: resultado.id_usuario,
        nota_final: resultado.nota_final,
        puntos_ganados: resultado.puntos_ganados,
        tiempo_total_ms: resultado.tiempo_total_ms,
        informe_fallas: typeof resultado.informe_fallas === 'string'
          ? resultado.informe_fallas
          : JSON.stringify(resultado.informe_fallas || {}),
        hora_inicio_local: resultado.hora_inicio_local,
        finalizado_en_local: resultado.finalizado_en_local,
        es_offline: 1,
      });

      // Also update local state for UI display
      const nuevosPendientes = [...resultadosPendientes, resultado];
      setResultadosPendientes(nuevosPendientes);
      resultadosPendientesRef.current = nuevosPendientes;
      return true;
    } catch (error) {
      // Fallback: save to AsyncStorage if resultadosDao fails
      try {
        const nuevosPendientes = [...resultadosPendientes, resultado];
        setResultadosPendientes(nuevosPendientes);
        resultadosPendientesRef.current = nuevosPendientes;
        await AsyncStorage.setItem('resultados_pendientes', JSON.stringify(nuevosPendientes));
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  const sincronizarResultadosPendientes = async () => {
    if (!isConnectedRef.current || sincronizandoRef.current) {
      return;
    }

    // ★ Lock INMEDIATO antes de cualquier await para prevenir syncs concurrentes.
    sincronizandoRef.current = true;
    setSincronizando(true);

    try {
      // ★ Validar token JWT localmente antes de intentar sync
      try {
        const tk = await getItem('token');
        if (tk) {
          const payload = JSON.parse(atob(tk.split('.')[1]));
          if (Date.now() >= payload.exp * 1000) {
            console.warn('[Sync] Token expirado. Intentando renovar...');
            const renovado = await reautenticar();
            if (renovado === true) {
              console.log('[Sync] Token renovado exitosamente. Continuando sync...');
            } else if (renovado === 'network_error') {
              console.warn('[Sync] Error de red al renovar token. Conservando pendientes.');
              return;
            } else {
              console.warn('[Sync] Credenciales inválidas. Conservando pendientes.');
              return;
            }
          }
        }
      } catch (e) {
        // Si falla decodificar el token, continuar de todas formas
      }

      // Load current pending results from resultadosDao
      let pendientesActuales: ResultadoPendiente[] = [];
      try {
        const { obtenerResultadosPendientes } = await import('@/database/resultadosDao');
        const pendientesDB = await obtenerResultadosPendientes();
        pendientesActuales = pendientesDB.map((p: any) => ({
          id_usuario: p.usuario_id,
          sesion_id: p.sesion_id,
          nota_final: p.nota_final,
          puntos_ganados: p.puntos_ganados,
          tiempo_total_ms: p.tiempo_total_ms,
          informe_fallas: (() => {
            try {
              if (!p.informe_fallas) return {};
              if (typeof p.informe_fallas === 'object') return p.informe_fallas;
              if (typeof p.informe_fallas === 'string') {
                const parsed = JSON.parse(p.informe_fallas);
                return typeof parsed === 'object' && parsed !== null ? parsed : {};
              }
              return {};
            } catch {
              return {};
            }
          })(),
          hora_inicio_local: p.hora_inicio_local,
          finalizado_en_local: p.finalizado_en_local,
          es_offline: true,
        }));
      } catch (e) {
        return;
      }

      if (pendientesActuales.length === 0) {
        return;
      }

      ultimaSincronizacionRef.current = Date.now();

      const resultadosFallidos: ResultadoPendiente[] = [];
      let exitosos = 0;

      for (const resultado of pendientesActuales) {
        try {
          let tokenDescarga: string | null = null;
          try {
            const { obtenerQuizDescargado } = await import('@/database/quizzesDao');
            const quiz = await obtenerQuizDescargado(resultado.sesion_id);
            if (quiz) {
              tokenDescarga = quiz.token_descarga;
            }
          } catch (e) {
          }

          console.log(`[Sync] Processing ${pendientesActuales.length} pending results. Token has descarga: ${!!tokenDescarga}`);

          const payload: any = {
            nota_final: resultado.nota_final,
            puntos_ganados: resultado.puntos_ganados,
            tiempo_total_ms: resultado.tiempo_total_ms,
            informe_fallas: (() => {
              try {
                if (!resultado.informe_fallas) return {};
                if (typeof resultado.informe_fallas === 'object') return resultado.informe_fallas;
                if (typeof resultado.informe_fallas === 'string') {
                  const parsed = JSON.parse(resultado.informe_fallas);
                  return typeof parsed === 'object' && parsed !== null ? parsed : {};
                }
                return {};
              } catch {
                return {};
              }
            })(),
            hora_inicio_local: resultado.hora_inicio_local,
            finalizado_en_local: resultado.finalizado_en_local,
          };

          let url: string;
          let body: string;
          
          if (tokenDescarga) {
            url = `${API_URL}/sesiones/sincronizar-offline`;
            body = JSON.stringify({ token_descarga: tokenDescarga, ...payload });
          } else {
            url = `${API_URL}/sesiones/resultado`;
            body = JSON.stringify({ ...payload, sesion_id: resultado.sesion_id, id_usuario: resultado.id_usuario, es_offline: true });
          }

          const headers = await getAuthHeaders();
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body,
          });

          console.log(`[Sync] Response: status=${response.status}, url=${url.split('/').pop()}`);

          if (response.ok) {
            exitosos++;
            console.log(`[Sync] ✅ Sync SUCCESS for session ${resultado.sesion_id}`);
            try {
              const { marcarSincronizado: marcarResSync } = await import('@/database/resultadosDao');
              await marcarResSync(resultado.sesion_id);
            } catch (e) {
              console.error(`[Sync] Error marcando como sincronizado sesión ${resultado.sesion_id}:`, e);
            }
            try {
              const { eliminarQuizDescargado: eliminarQuiz } = await import('@/database/quizzesDao');
              await eliminarQuiz(resultado.sesion_id);
            } catch (e) {
            }
          } else if (response.status === 401) {
            console.warn(`[Sync] 401 para sesión ${resultado.sesion_id}. Reintentando en el próximo ciclo.`);
            resultadosFallidos.push(resultado);
            try {
              await reautenticar();
            } catch {}
          } else if (response.status === 422) {
            const errorText = await response.text();
            resultadosFallidos.push(resultado);
          } else {
            let detail = '';
            try {
              const errorBody = await response.json().catch(() => ({}));
              detail = errorBody?.detail || '';
              if (response.status === 400 && 
                  (detail.toLowerCase().includes('ya tienes') || 
                   detail.toLowerCase().includes('ya existe') ||
                   detail.toLowerCase().includes('ya registrado') ||
                   detail.toLowerCase().includes('primera nota'))) {
                console.log(`[Sync] 🔄 400 "already registered" detected for session ${resultado.sesion_id}. Detail: "${detail}"`);
                try {
                  const { marcarSincronizado: marcarResSync } = await import('@/database/resultadosDao');
                  await marcarResSync(resultado.sesion_id);
                } catch (e) {
                  console.error(`[Sync] Error marcando como sincronizado sesión ${resultado.sesion_id}:`, e);
                }
                try {
                  const { eliminarQuizDescargado: eliminarQuiz } = await import('@/database/quizzesDao');
                  await eliminarQuiz(resultado.sesion_id);
                } catch (e) {}
                exitosos++;
                continue;
              }
            } catch {}
            console.log(`[Sync] ❌ Sync FAILED for session ${resultado.sesion_id}: status=${response.status}, detail="${detail || 'no detail'}"`);
            resultadosFallidos.push(resultado);
          }
        } catch (error: any) {
          resultadosFallidos.push(resultado);
        }
      }

      setResultadosPendientes(resultadosFallidos);
      resultadosPendientesRef.current = resultadosFallidos;

      if (exitosos > 0) {
        try {
          const storedUser = await getItem('user');
          if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            await setItem('user', JSON.stringify(parsedUser));
          }
        } catch (error) {
        }
      }

      if (exitosos > 0) {
        Alert.alert('Sincronización', `${exitosos} resultado(s) sincronizado(s) correctamente.`);
      }
    } finally {
      setSincronizando(false);
      sincronizandoRef.current = false;
    }
  };

  const enviarResultado = async (resultado: ResultadoPendiente) => {
    // Si no hay conexión, guardar localmente para sincronizar después
    if (!isConnectedRef.current) {
      const guardado = await guardarResultadoPendiente(resultado);
      return { success: guardado, offline: true };
    }

    try {
      const response = await fetch(`${API_URL}/sesiones/resultado`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(resultado)
      });


      if (response.ok) {
        const data = await response.json();
        return { success: true, data, offline: false };
      } else if (response.status === 422) {
        const errorText = await response.text();
        return { success: false, offline: false, error: errorText };
      } else {
        const guardado = await guardarResultadoPendiente(resultado);
        return { success: guardado, offline: true };
      }
    } catch (error) {
      const guardado = await guardarResultadoPendiente(resultado);
      return { success: guardado, offline: true };
    }
  };

  const refreshPendientes = useCallback(async () => {
    await cargarResultadosPendientes();
  }, []);

  return (
    <OfflineContext.Provider value={{ isConnected, sincronizando, resultadosPendientes, enviarResultado, sincronizarResultadosPendientes, refreshPendientes }}>
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = () => {
  const context = useContext(OfflineContext);
  if (context === undefined) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
};
