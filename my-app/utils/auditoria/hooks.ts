import { useState, useRef, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { API_URL, getAuthHeaders } from '@/utils/api';
import type { EstadisticasGenerales, QuizCreado, UsuarioAuditoria, SesionReciente, MateriaAuditoria, MateriaHistorialItem, SesionHistorial } from './types';

// Hook principal que orquesta la carga de datos de auditoria
export const useAuditoriaData = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [estadisticas, setEstadisticas] = useState<EstadisticasGenerales | null>(null);
  const [quicesRecientes, setQuicesRecientes] = useState<QuizCreado[]>([]);
  const [quicesHistorial, setQuicesHistorial] = useState<any[]>([]);
  const [quicesMongo, setQuicesMongo] = useState<any[]>([]);
  const [sesionesRecientes, setSesionesRecientes] = useState<SesionReciente[]>([]);
  const [sesionesHistorial, setSesionesHistorial] = useState<SesionHistorial[]>([]);
  const [materiasAuditoria, setMateriasAuditoria] = useState<MateriaAuditoria[]>([]);
  const [materiasHistorial, setMateriasHistorial] = useState<MateriaHistorialItem[]>([]);
  const [materiasEliminadas, setMateriasEliminadas] = useState<any[]>([]);
  const [usuariosAuditoria, setUsuariosAuditoria] = useState<UsuarioAuditoria[]>([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);

  // Cache en memoria para no relanzar peticiones si el usuario vuelve rapido
  const cacheRef = useRef<{
    stats?: any;
    quices?: any;
    quicesHistorial?: any;
    sesiones?: any;
    sesionesHistorial?: any;
    materias?: any;
    materiasHistorial?: any;
    materiasEliminadas?: any;
    quicesFromMongo?: any;
    timestamp: number;
  }>({ timestamp: 0 });

  // Trae toda la data de las 5 pestanas en paralelo con cache y timeouts
  const cargarDatosAuditoria = useCallback(async (forceRefresh: boolean = false) => {
    const now = Date.now();
    const CACHE_DURATION = 5000; // 5 segundos de cache
    
    // Si los datos estan frescos, los reutiliza sin molestar al servidor
    if (!forceRefresh && cacheRef.current.timestamp > now - CACHE_DURATION) {
      setEstadisticas(cacheRef.current.stats || null);
      setQuicesRecientes(cacheRef.current.quices?.quices || []);
      setQuicesHistorial((cacheRef.current.quicesHistorial && cacheRef.current.quicesHistorial.operaciones) || []);
      setQuicesMongo((cacheRef.current.quicesFromMongo && cacheRef.current.quicesFromMongo.quices) || []);
      setSesionesRecientes(cacheRef.current.sesiones?.sesiones || []);
      setSesionesHistorial(cacheRef.current.sesionesHistorial?.sesiones || []);
      setMateriasAuditoria(cacheRef.current.materias?.materias || []);
      setMateriasHistorial(cacheRef.current.materiasHistorial?.materias || []);
      setMateriasEliminadas(cacheRef.current.materiasEliminadas || []);
      return;
    }

    try {
      // Muestra el spinner solo la primera vez, no en refrescos silenciosos
      if (!cacheRef.current.timestamp) {
        setLoading(true);
      }
      
      // Helper que maneja timeouts por si el servidor tarda mucho
      const cargarSeccion = async (url: string, defaultValue: any, timeoutMs: number = 5000) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
          
          const headers = await getAuthHeaders();
          const response = await fetch(`${API_URL}${url}`, {
            signal: controller.signal,
            headers
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) return defaultValue;
          return await response.json();
          
        } catch (error: any) {
          return defaultValue;
        }
      };

      // Dispara los 9 endpoints simultaneamente para no bloquear la UI
      const [stats, quices, quicesHistorial, sesiones, sesionesHistorialData, materias, materiasHistorialData, materiasEliminadasData, quicesFromMongo] = await Promise.all([
        cargarSeccion('/auditoria/estadisticas-generales', {
          usuarios_por_rol: [],
          total_quizes: 0,
          total_materias: 0,
          total_usuarios_activos: 0,
          sesiones_activas: 0
        }, 8000),
        cargarSeccion('/auditoria/quices-creados?limite=200', { quices: [] }, 8000),
        cargarSeccion('/auditoria/quices-historial?limite=200', { operaciones: [] }, 8000),
        cargarSeccion('/auditoria/sesiones-recientes?limite=200', { sesiones: [] }, 6000),
        cargarSeccion('/auditoria/sesiones-historial?limite=200', { sesiones: [] }, 8000),
        cargarSeccion('/auditoria/materias-auditoria', { materias: [] }, 6000),
        cargarSeccion('/auditoria/materias-historial?limite=200', { materias: [] }, 6000),
        cargarSeccion('/materias/eliminadas', [], 6000),
        cargarSeccion('/quices', { quices: [] }, 8000)
      ]);

      // Guarda en cache para la proxima visita
      cacheRef.current = {
        stats,
        quices,
        quicesHistorial,
        sesiones,
        sesionesHistorial: sesionesHistorialData,
        materias,
        materiasHistorial: materiasHistorialData,
        materiasEliminadas: materiasEliminadasData,
        quicesFromMongo,
        timestamp: now
      };

      // Actualiza los estados con los datos frescos
      setEstadisticas(stats);
      setQuicesRecientes(quices.quices || []);
      setQuicesHistorial(quicesHistorial.operaciones || []);
      setQuicesMongo((quicesFromMongo && quicesFromMongo.quices) || []);
      setSesionesRecientes(sesiones.sesiones || []);
      setSesionesHistorial(sesionesHistorialData.sesiones || []);
      setMateriasAuditoria(materias.materias || []);
      setMateriasHistorial(materiasHistorialData.materias || []);
      setMateriasEliminadas(Array.isArray(materiasEliminadasData) ? materiasEliminadasData : []);
      
      
    } catch (error) {
      // Si falla todo, simplemente no actualiza y deja los datos anteriores
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Carga los datos de usuarios separadamente porque se usa bajo demanda
  const cargarUsuariosAuditoria = useCallback(async (mostrarLoading: boolean = false) => {
    try {
      if (mostrarLoading) setLoadingUsuarios(true);
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/auditoria/usuarios-auditoria`, { headers });
      if (response.ok) {
        const data = await response.json();
        const nuevos = data.usuarios || [];
        setUsuariosAuditoria((prev) => {
          // Solo actualiza si realmente cambio algo (evita re-renders inecesarios)
          if (JSON.stringify(prev) === JSON.stringify(nuevos)) return prev;
          return nuevos;
        });
      }
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
    } finally {
      if (mostrarLoading) setLoadingUsuarios(false);
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    cargarDatosAuditoria(true);
  }, [cargarDatosAuditoria]);

  return {
    loading,
    refreshing,
    estadisticas,
    quicesRecientes,
    quicesHistorial,
    quicesMongo,
    sesionesRecientes,
    sesionesHistorial,
    materiasAuditoria,
    materiasHistorial,
    materiasEliminadas,
    usuariosAuditoria,
    loadingUsuarios,
    cargarDatosAuditoria,
    cargarUsuariosAuditoria,
    onRefresh,
  };
};

// Evitar que expo-router trate a este archivo como ruta
export default null;

// Resuelve la ruta donde se guardaran los PDFs en el dispositivo
export const usePDFDirectory = () => {
  const obtenerDirectorioPDF = () => {
    const fileSystem = FileSystem as any;
    const directory = fileSystem.documentDirectory ?? fileSystem.cacheDirectory ?? '';
    if (!directory) {
      throw new Error('No se encontró un directorio válido para guardar el PDF');
    }
    return directory as string;
  };

  return { obtenerDirectorioPDF };
};

// Gestiona el modal de detalle de un quiz con sus resultados
export const useQuizDetalle = () => {
  const [quizDetalleVisible, setQuizDetalleVisible] = useState(false);
  const [quizDetalleData, setQuizDetalleData] = useState<any>(null);
  const [loadingQuizDetalle, setLoadingQuizDetalle] = useState(false);
  const [ordenarPor, setOrdenarPor] = useState<'nota' | 'fecha' | 'nombre'>('nota');
  const [orden, setOrden] = useState<'asc' | 'desc'>('desc');

  // Trae del backend el detalle completo de un quiz (preguntas, respuestas, etc)
  const cargarDetalleQuiz = async (quizId: string) => {
    try {
      setLoadingQuizDetalle(true);
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/auditoria/quiz-detalle/${quizId}?ordenar_por=${ordenarPor}&orden=${orden}`, {
        headers
      });
      const data = await response.json();
      setQuizDetalleData(data);
      setQuizDetalleVisible(true);
    } catch (error) {
      console.error('Error al cargar detalle del quiz:', error);
      alert('Error al cargar detalle del quiz');
    } finally {
      setLoadingQuizDetalle(false);
    }
  };

  // Muestra las operaciones de auditoria de un quiz en el modal
  const mostrarDetalleAuditoria = (operaciones: any[], titulo: string) => {
    setQuizDetalleData({ operaciones, titulo });
    setQuizDetalleVisible(true);
  };

  // Alterna entre orden ascendente y descendente segun el campo
  const cambiarOrdenamiento = (campo: 'nota' | 'fecha' | 'nombre') => {
    if (ordenarPor === campo) {
      setOrden(orden === 'asc' ? 'desc' : 'asc');
    } else {
      setOrdenarPor(campo);
      setOrden('desc');
    }
  };

  return {
    quizDetalleVisible,
    setQuizDetalleVisible,
    quizDetalleData,
    setQuizDetalleData,
    loadingQuizDetalle,
    ordenarPor,
    orden,
    cargarDetalleQuiz,
    mostrarDetalleAuditoria,
    cambiarOrdenamiento,
  };
};

// Estado de todos los filtros de las 5 pestanas de auditoria
export const useFiltros = () => {
  const [searchText, setSearchText] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'creacion' | 'modificacion' | 'eliminacion'>('todos');
  const [filtroProfesor, setFiltroProfesor] = useState<number | null>(null);
  const [filtroMateria, setFiltroMateria] = useState<number | null>(null);
  const [filtroTiempo, setFiltroTiempo] = useState<'todos' | 'dia' | 'semana' | 'mes' | 'anio'>('todos');
  
  const [dropdownTipoVisible, setDropdownTipoVisible] = useState(false);
  const [dropdownTiempoVisible, setDropdownTiempoVisible] = useState(false);
  const [dropdownProfesorVisible, setDropdownProfesorVisible] = useState(false);
  const [dropdownMateriaVisible, setDropdownMateriaVisible] = useState(false);

  // Filtros especificos de la pestana de usuarios
  const [filtroRolUsuario, setFiltroRolUsuario] = useState<'todos' | 'profesor' | 'alumno' | 'admin'>('todos');
  const [filtroEstadoUsuario, setFiltroEstadoUsuario] = useState<'todos' | 'activo' | 'inactivo' | 'eliminados'>('todos');
  const [dropdownRolUsuarioVisible, setDropdownRolUsuarioVisible] = useState(false);
  const [dropdownEstadoUsuarioVisible, setDropdownEstadoUsuarioVisible] = useState(false);

  // Filtros de la pestana de sesiones
  const [filtroEstatusSesion, setFiltroEstatusSesion] = useState<'todos' | 'activa' | 'finalizada' | 'agendada' | 'eliminada' | 'expirada'>('todos');
  const [dropdownEstatusSesionVisible, setDropdownEstatusSesionVisible] = useState(false);

  // Filtros de la pestana de materias
  const [filtroEstatusMateria, setFiltroEstatusMateria] = useState<'todos' | 'activa' | 'desactivada' | 'eliminada'>('todos');
  const [dropdownEstatusMateriaVisible, setDropdownEstatusMateriaVisible] = useState(false);

  return {
    searchText,
    setSearchText,
    filtroTipo,
    setFiltroTipo,
    filtroProfesor,
    setFiltroProfesor,
    filtroMateria,
    setFiltroMateria,
    filtroTiempo,
    setFiltroTiempo,
    dropdownTipoVisible,
    setDropdownTipoVisible,
    dropdownTiempoVisible,
    setDropdownTiempoVisible,
    dropdownProfesorVisible,
    setDropdownProfesorVisible,
    dropdownMateriaVisible,
    setDropdownMateriaVisible,
    filtroRolUsuario,
    setFiltroRolUsuario,
    filtroEstadoUsuario,
    setFiltroEstadoUsuario,
    dropdownRolUsuarioVisible,
    setDropdownRolUsuarioVisible,
    dropdownEstadoUsuarioVisible,
    setDropdownEstadoUsuarioVisible,
    filtroEstatusSesion,
    setFiltroEstatusSesion,
    dropdownEstatusSesionVisible,
    setDropdownEstatusSesionVisible,
    filtroEstatusMateria,
    setFiltroEstatusMateria,
    dropdownEstatusMateriaVisible,
    setDropdownEstatusMateriaVisible,
  };
};
