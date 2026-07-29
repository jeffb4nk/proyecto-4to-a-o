// Contexto global de usuario que mantiene la sesión activa.
// Se encarga de cargar los datos desde SecureStore al iniciar,
// refrescarlos desde la API cuando hace falta, y limpiar todo
// al cerrar sesión. Todos los componentes pueden acceder al
// usuario sin tener que pasarlo por props.
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { router } from 'expo-router';
import { getItem, setItem, deleteItem } from '@/utils/storage';
import { API_URL, getAuthHeaders, clearCredentialsCache } from '@/utils/api';

interface Usuario {
  usu_id: number;
  usu_nombre: string;
  usu_apellido: string;
  usu_email: string;
  usu_imagen?: string;
  usu_fk_rol: number;
  rol_nombre?: string;
  usu_puntos_app?: number;
  usu_activo?: boolean;
}

interface UserContextType {
  usuario: Usuario | null;
  loading: boolean;
  cargarUsuario: (force?: boolean) => Promise<void>;
  cargarUsuarioLogin: () => Promise<void>;
  actualizarUsuario: (nuevosDatos: Partial<Usuario>) => void;
  cerrarSesion: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  const ultimoUserIdRef = useRef<number | null>(null);
  const cargandoDesdeLoginRef = useRef(false);

  // refs para el useEffect — evitan re-ejecutar el efecto
  const cargarUsuarioRef = useRef<((force?: boolean) => Promise<void>) | null>(null);

  const cargarUsuario = useCallback(async (force = false) => {
    try {
      if (!force && cargandoDesdeLoginRef.current) return;
      if (force) {
        console.log(`[UserContext] cargarUsuario called (force=${force}, ultimoUserId=${ultimoUserIdRef.current})`);
        console.trace(`[UserContext] TRACE force=${force}`);
      } else {
        console.log(`[UserContext] cargarUsuario called (force=${force}, ultimoUserId=${ultimoUserIdRef.current})`);
      }
      setLoading(true);

      let userJson: string | null = null;
      try {
        userJson = await getItem('user');
      } catch (storageError) {
        // SecureStore puede fallar temporalmente post-background.
        // No es un error fatal — conservamos el usuario actual.
        console.log('[UserContext] Error leyendo SecureStore:', storageError);
        setLoading(false);
        return;
      }

      if (!userJson) {
        console.log('[UserContext] No user in SecureStore → setting usuario=null');
        setUsuario(null);
        ultimoUserIdRef.current = null;
        setLoading(false);
        return;
      }

      let userData: any;
      try {
        userData = JSON.parse(userJson);
      } catch (parseError) {
        console.log('[UserContext] Error parseando datos de usuario:', parseError);
        setLoading(false);
        return;
      }

      let userId = userData.usu_id;

      // ★ Fix: Validar que el JWT sub coincide con SecureStore userId.
      // Si no coinciden, SecureStore está corrupto — usar el JWT como fuente de verdad.
      const token = await getItem('token');
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const tokenUserId = Number(payload.sub);
          if (tokenUserId && tokenUserId !== userId) {
            console.warn(`[UserContext] ⚠️ CORRUPTION: JWT sub=${tokenUserId} != SecureStore id=${userId}. Using JWT as truth.`);
            userId = tokenUserId;
            // Corregir SecureStore con el id correcto del JWT
            await setItem('user', JSON.stringify({ ...userData, usu_id: tokenUserId }));
          }
        } catch {}
      }

      // Si es el mismo usuario y no es force, no recargamos
      if (!force && userId === ultimoUserIdRef.current) {
        setLoading(false);
        return;
      }

      ultimoUserIdRef.current = userId;

      // Intentar cargar datos frescos desde la API
      if (userId) {
        try {
          const headers = await getAuthHeaders();
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(`${API_URL}/usuarios/${userId}`, {
            headers,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (response.ok) {
            const fullUserData = await response.json();
            
            // VERIFICAR que el API retorno el usuario correcto.
            // Si el JWT pertenece a otro usuario, el backend retorna
            // los datos de ese otro usuario en vez del que pedimos.
            if (fullUserData.usu_id !== userId) {
              console.error(`[UserContext] ⚠️ USER MISMATCH! Requested /usuarios/${userId} but got id=${fullUserData.usu_id}. Token pertenece a otro usuario. Limpiando sesión...`);
              // El token JWT pertenece a otro usuario — limpiar todo
              await deleteItem('token');
              await deleteItem('user');
              ultimoUserIdRef.current = null;
              setUsuario(null);
              setLoading(false);
              return;
            }
            
            setUsuario(fullUserData);
            console.log(`[UserContext] User loaded from API: ${fullUserData.usu_nombre} (id=${fullUserData.usu_id})`);
            const { usu_imagen, ...userWithoutImage } = fullUserData;
            await setItem('user', JSON.stringify(userWithoutImage));
            setLoading(false);
            return;
          }
          // Non-OK: usar datos cacheados, no cerrar sesión
        } catch (apiError) {
          // Network error: usar datos cacheados, no cerrar sesión
          console.log('[UserContext] API call failed, using cached data:', apiError?.message || apiError);
        }
      }

      // Fallback: usar datos de SecureStore
      setUsuario(userData);
      console.log('[UserContext] Using cached user data from SecureStore');
    } catch (error) {
      console.log('[UserContext] Error cargando usuario:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Mantener ref actualizada para que el useEffect no necesite re-ejecutarse
  cargarUsuarioRef.current = cargarUsuario;

  const cargarUsuarioLogin = useCallback(async () => {
    cargandoDesdeLoginRef.current = true;
    try {
      await cargarUsuario(true);
    } finally {
      cargandoDesdeLoginRef.current = false;
    }
  }, [cargarUsuario]);

  const actualizarUsuario = (nuevosDatos: Partial<Usuario>) => {
    setUsuario(prev => prev ? { ...prev, ...nuevosDatos } : null);
  };

  const cerrarSesion = async () => {
    console.log('[UserContext] cerrarSesion called!');
    console.trace('[UserContext] cerrarSesion stack trace');
    clearCredentialsCache();
    await deleteItem('user');
    await deleteItem('token');
    await deleteItem('email');
    await deleteItem('password');
    setUsuario(null);
    ultimoUserIdRef.current = null;
  };

  // Cargar usuario al montar y configurar polling + AppState listener.
  // NO depende de cargarUsuario para evitar re-ejecuciones del efecto.
  useEffect(() => {
    cargarUsuarioRef.current?.();

    const interval = setInterval(async () => {
      try {
        const userJson = await getItem('user');
        if (!userJson) {
          const currentUser = ultimoUserIdRef.current;
          if (currentUser !== null) {
            setUsuario(null);
            ultimoUserIdRef.current = null;
          }
          return;
        }

        const userData = JSON.parse(userJson);
        const userId = userData.usu_id;

        console.log(`[UserContext] Polling: userId=${userId}, ultimoUserId=${ultimoUserIdRef.current}`);
        if (userId !== ultimoUserIdRef.current && !cargandoDesdeLoginRef.current) {

          // ★ Fix: Validar que el JWT pertenece al mismo usuario de SecureStore.
          // Si no coinciden, SecureStore está corrupto — el JWT es la verdad.
          const token = await getItem('token');
          if (token) {
            try {
              const payload = JSON.parse(atob(token.split('.')[1]));
              const tokenUserId = Number(payload.sub);
              if (tokenUserId && tokenUserId !== userId) {
                console.warn(`[UserContext] ⚠️ POLLING CORRUPTION: JWT sub=${tokenUserId} != SecureStore id=${userId}. Using JWT as truth.`);
                // SecureStore está corrupto. Usar el id del JWT para recargar datos correctos.
                ultimoUserIdRef.current = tokenUserId;
                await cargarUsuarioRef.current?.(true);
                return;
              }
            } catch {}
          }

          await cargarUsuarioRef.current?.(true);
        }
      } catch (error) {
        // Silenciar errores del polling
      }
    }, 5000);

    // Cuando la app vuelve del background, validar token y refrescar datos.
    const handleAppState = async (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;

      console.log('[UserContext] AppState → active');

      try {
        const token = await getItem('token');
        if (!token) return;

        console.log('[UserContext] AppState: token found, checking connectivity...');

        // Verificar conectividad ANTES de intentar reautenticar.
        try {
          const NetInfoModule = await import('@react-native-community/netinfo');
          const netState = await NetInfoModule.default.fetch();
          if (!netState.isConnected) return;
          console.log('[UserContext] AppState: online, checking token expiry...');
        } catch {
          // Si falla NetInfo, asumir offline por seguridad
          return;
        }

        // Validar si el token expiro
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const exp = payload.exp * 1000;
          if (Date.now() >= exp) {
            console.log('[UserContext] AppState: TOKEN EXPIRED! Attempting reauth...');
            const { reautenticar } = await import('@/utils/api');
            const resultado = await reautenticar();
            if (resultado === true) {
              console.log('[UserContext] AppState: Reauth SUCCESS → refreshing user data');
              await cargarUsuarioRef.current?.(true);
            }
            // Si es 'network_error' o false: no borrar token, salir silenciosamente
            console.log(`[UserContext] AppState: Reauth result=${resultado} → NOT deleting token`);
          }
        } catch {
          // Token corrupto o no decodificable — no cerrar sesión
          console.log('[UserContext] AppState: Token decode error → keeping session');
        }
      } catch (e) {
        // Silenciar errores del AppState handler
      }
    };

    const appStateSubscription = AppState.addEventListener('change', handleAppState);

    return () => {
      clearInterval(interval);
      appStateSubscription?.remove();
    };
  }, []); // Sin dependencias — solo se ejecuta una vez al montar

  return (
    <UserContext.Provider value={{ usuario, loading, cargarUsuario, cargarUsuarioLogin, actualizarUsuario, cerrarSesion }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser debe usarse dentro de UserProvider');
  }
  return context;
}
