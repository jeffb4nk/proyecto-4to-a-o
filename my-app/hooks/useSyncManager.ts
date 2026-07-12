// Hook que sincroniza resultados guardados offline cuando
// el dispositivo recupera la conexión a internet.
// Tiene dos mecanismos: un intervalo cada 30 segundos y un
// listener que reacciona inmediatamente cuando NetInfo detecta
// que volvió la señal. Al iniciar también limpia quizzes
// descargados que tengan mas de 30 días.
import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { limpiarQuizzesViejos } from '@/database/quizzesDao';
import { useOffline } from '@/contexts/OfflineContext';

/**
 * Hook que monitorea la conexión de red y sincroniza automáticamente
 * los resultados offline pendientes cuando detecta señal.
 * 
 * Se ejecuta cada 30 segundos si hay conexión, y también reacciona
 * a cambios en tiempo real de conectividad.
 */
export function useSyncManager() {
  const { sincronizando, sincronizarResultadosPendientes } = useOffline();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    const init = async () => {
      if (initializedRef.current) return;
      initializedRef.current = true;
      try {
        await limpiarQuizzesViejos(30);
      } catch (e) {
        console.error('Error limpiando quizzes viejos:', e);
      }
    };
    init();

    const ejecutarSync = async () => {
      if (sincronizando) return;
      await sincronizarResultadosPendientes();
    };

    intervalRef.current = setInterval(() => {
      ejecutarSync();
    }, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sincronizando]);

  // Sincronizar inmediatamente cuando se recupera la conexión
  // NOTA: Sin dependencia de sincronizando para evitar loop de re-suscripción.
  // El lock interno de OfflineContext evita ejecuciones concurrentes.
  // Este efecto no tiene dependencias a propósito: solo se suscribe
  // una vez al mount y se desuscribe al unmount.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        sincronizarResultadosPendientes();
      }
    });
    return () => unsubscribe();
  }, []);
}
