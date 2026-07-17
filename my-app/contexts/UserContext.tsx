// Contexto global de usuario que mantiene la sesión activa.
// Se encarga de cargar los datos desde SecureStore al iniciar,
// refrescarlos desde la API cuando hace falta, y limpiar todo
// al cerrar sesión. Todos los componentes pueden acceder al
// usuario sin tener que pasarlo por props.
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { router } from 'expo-router';
import { getItem, setItem, deleteItem } from '@/utils/storage';
import { API_URL, getAuthHeaders } from '@/utils/api';

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

  const cargarUsuario = useCallback(async (force = false) => {
    try {
      if (!force && cargandoDesdeLoginRef.current) return;
      setLoading(true);
        const userJson = await getItem('user');
      
      if (!userJson) {
        setUsuario(null);
        ultimoUserIdRef.current = null;
        return;
      }

      const userData = JSON.parse(userJson);
      const userId = userData.usu_id;
      
      // Si es el mismo usuario y no es force, no recargamos
      // Esto evita llamadas innecesarias a la API cuando el
      // polling de 2 segundos detecta que no hubo cambios.
      if (!force && userId === ultimoUserIdRef.current) {
        setLoading(false);
        return;
      }

      ultimoUserIdRef.current = userId;
      
      // Siempre cargar desde API para tener datos completos (imagen, etc)
      if (userId) {
        try {
          const headers = await getAuthHeaders();
          const response = await fetch(`${API_URL}/usuarios/${userId}`, { headers });
          if (response.ok) {
            const fullUserData = await response.json();
            setUsuario(fullUserData);
            // Guardar en SecureStore (sin imagen para no exceder límite)
            const { usu_imagen, ...userWithoutImage } = fullUserData;
            await setItem('user', JSON.stringify(userWithoutImage));
            return;
          }
          // On non-OK response (401, 500, etc): just use stored data, do NOT logout
        } catch (apiError) {
          // Network error: just use stored data, do NOT logout
        }
      }
      
      setUsuario(userData);
    } catch (error) {
      console.log('Error cargando usuario:', error);
      setUsuario(null);
      ultimoUserIdRef.current = null;
    } finally {
      setLoading(false);
    }
  }, []);

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
    await deleteItem('user');
    await deleteItem('token');
    setUsuario(null);
    ultimoUserIdRef.current = null;
  };

  // Detectar cambios en SecureStore cada 5 segundos
  // Esto permite que cuando el usuario se loguea desde otra
  // pantalla (login), el contexto se entere del nuevo usuario
  // sin necesidad de recargar la app manualmente.
  useEffect(() => {
    cargarUsuario();

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

        // Si cambió el usuario o no hay usuario cargado, recargar
        if (userId !== ultimoUserIdRef.current && !cargandoDesdeLoginRef.current) {
          await cargarUsuario(true);
        }
      } catch (error) {
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [cargarUsuario]);

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
