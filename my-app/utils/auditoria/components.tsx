import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, TextInput, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { AppImage } from '@/components/AppImage';
import { API_URL } from '@/utils/api';
import type { EstadisticasGenerales, QuizCreado, AccionReciente, UsuarioAuditoria, SesionReciente, MateriaAuditoria, MateriaHistorialItem, SesionHistorial } from './types';
import { generarPDFQuices, generarPDFSesiones, generarPDFMaterias, generarPDFAuditoriaCompleta, generarPDFUsuarios } from './pdfGenerators';

// Props que recibe el componente de auditoria, hereda toda la logica de los hooks
interface ComponentsProps {
  activeTab: 'general' | 'quices' | 'usuarios' | 'sesiones' | 'materias';
  setActiveTab: (tab: any) => void;
  estadisticas: EstadisticasGenerales | null;
  quicesRecientes: QuizCreado[];
  quicesHistorial: any[];
  sesionesRecientes: SesionReciente[];
  sesionesHistorial: SesionHistorial[];
  materiasAuditoria: MateriaAuditoria[];
  materiasHistorial: MateriaHistorialItem[];
  materiasEliminadas: any[];
  usuariosAuditoria: UsuarioAuditoria[];
  loadingUsuarios: boolean;
  quicesMongo?: any[];
  searchText: string;
  setSearchText: (text: string) => void;
  filtroTipo: 'todos' | 'creacion' | 'modificacion' | 'eliminacion';
  setFiltroTipo: (tipo: any) => void;
  filtroProfesor: number | null;
  setFiltroProfesor: (id: number | null) => void;
  filtroMateria: number | null;
  setFiltroMateria: (id: number | null) => void;
  filtroTiempo: 'todos' | 'dia' | 'semana' | 'mes' | 'anio';
  setFiltroTiempo: (tiempo: any) => void;
  dropdownTipoVisible: boolean;
  setDropdownTipoVisible: (visible: boolean) => void;
  dropdownTiempoVisible: boolean;
  setDropdownTiempoVisible: (visible: boolean) => void;
  dropdownProfesorVisible: boolean;
  setDropdownProfesorVisible: (visible: boolean) => void;
  dropdownMateriaVisible: boolean;
  setDropdownMateriaVisible: (visible: boolean) => void;
  filtroRolUsuario: 'todos' | 'profesor' | 'alumno' | 'admin';
  setFiltroRolUsuario: (rol: any) => void;
  filtroEstadoUsuario: 'todos' | 'activo' | 'inactivo' | 'eliminados';
  setFiltroEstadoUsuario: (estado: any) => void;
  dropdownRolUsuarioVisible: boolean;
  setDropdownRolUsuarioVisible: (visible: boolean) => void;
  dropdownEstadoUsuarioVisible: boolean;
  setDropdownEstadoUsuarioVisible: (visible: boolean) => void;
  filtroEstatusSesion: 'todos' | 'activa' | 'finalizada' | 'agendada' | 'eliminada' | 'expirada';
  setFiltroEstatusSesion: (estatus: any) => void;
  dropdownEstatusSesionVisible: boolean;
  setDropdownEstatusSesionVisible: (visible: boolean) => void;
  filtroEstatusMateria: 'todos' | 'activa' | 'desactivada' | 'eliminada';
  setFiltroEstatusMateria: (estatus: any) => void;
  dropdownEstatusMateriaVisible: boolean;
  setDropdownEstatusMateriaVisible: (visible: boolean) => void;
  quizDetalleVisible: boolean;
  setQuizDetalleVisible: (visible: boolean) => void;
  quizDetalleData: any;
  loadingQuizDetalle: boolean;
  ordenarPor: 'nota' | 'fecha' | 'nombre';
  orden: 'asc' | 'desc';
  cambiarOrdenamiento: (campo: 'nota' | 'fecha' | 'nombre') => void;
  cargarDetalleQuiz: (quizId: string) => void;
  mostrarDetalleAuditoria: (operaciones: any[], titulo: string) => void;
  cargarUsuariosAuditoria: () => void;
  styles: any;
  formatearFecha: (fecha: string) => string;
}

// Componente que unifica todas las pestanas de auditoria
export const AuditoriaComponents = (props: ComponentsProps) => {
  const router = useRouter();

  const {
    activeTab,
    setActiveTab,
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
    searchText,
    filtroTipo,
    filtroProfesor,
    filtroMateria,
    filtroTiempo,
    setSearchText,
    setFiltroTipo,
    setFiltroProfesor,
    setFiltroMateria,
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
    quizDetalleVisible,
    setQuizDetalleVisible,
    quizDetalleData,
    loadingQuizDetalle,
    ordenarPor,
    orden,
    cambiarOrdenamiento,
    cargarDetalleQuiz,
    cargarUsuariosAuditoria,
    mostrarDetalleAuditoria,
    styles,
    formatearFecha,
  } = props;

  // Traduce nombres de campos a etiquetas legibles para humanos
  const formatearCampoAuditoria = (campo: string): string => {
    const campos: { [key: string]: string } = {
      'usu_nombre': 'Nombre', 'usu_apellido': 'Apellido', 'usu_email': 'Email',
      'usu_activo': 'Estado', 'usu_fk_rol': 'Rol', 'usu_imagen': 'Foto',
    };
    return campos[campo] || campo;
  };

  // Vuelve legibles los valores de campos como rol y estado
  const formatearValorAuditoria = (campo: string, valor: any): string => {
    if (campo === 'usu_activo') return valor ? 'Activo' : 'Inactivo';
    if (campo === 'usu_fk_rol') {
      const roles: { [key: number]: string } = { 1: 'Alumno', 2: 'Profesor', 3: 'Admin' };
      return roles[Number(valor)] || `Rol ${valor}`;
    }
    return String(valor ?? 'N/A');
  };

  // Convierte fechas UTC de MongoDB a formato legible en Venezuela
  const formatearFechaUTC = (fecha: string | undefined | null): string => {
    if (!fecha) return 'N/A';
    const f = typeof fecha === 'string' ? fecha : String(fecha);
    const fUtc = (f.includes('+') || f.endsWith('Z')) ? f : f + 'Z';
    const date = new Date(fUtc);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' });
  };

  const [cambiosModalVisible, setCambiosModalVisible] = React.useState(false);
  const [cambiosModalData, setCambiosModalData] = React.useState<{ant: any; nue: any; titulo: string; prof: string; materia: string} | null>(null);

  const [sesionesExpandidas, setSesionesExpandidas] = React.useState<Set<number>>(new Set());
  const [materiasExpandidas, setMateriasExpandidas] = React.useState<Set<string>>(new Set());
  const [detalleSesionModalVisible, setDetalleSesionModalVisible] = React.useState(false);
  const [detalleSesionData, setDetalleSesionData] = React.useState<SesionHistorial | null>(null);

  const toggleSesionExpandida = (sesionId: number) => {
    setSesionesExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(sesionId)) next.delete(sesionId);
      else next.add(sesionId);
      return next;
    });
  };

  const toggleMateriaExpandida = (materiaId: string) => {
    setMateriasExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(materiaId)) next.delete(materiaId);
      else next.add(materiaId);
      return next;
    });
  };

  const colorEventoMateria = (tipo: string) => {
    if (tipo === 'MATERIA_CREACION') return '#22c55e';
    if (tipo === 'MATERIA_MODIFICACION') return '#3b82f6';
    if (tipo === 'MATERIA_ELIMINACION') return '#ef4444';
    return '#6b7280';
  };

  const iconoEventoMateria = (tipo: string): string => {
    if (tipo === 'MATERIA_CREACION') return 'add-circle-outline';
    if (tipo === 'MATERIA_MODIFICACION') return 'create-outline';
    if (tipo === 'MATERIA_ELIMINACION') return 'trash-outline';
    return 'ellipse-outline';
  };

  const labelEventoMateria = (tipo: string, datosAnteriores?: Record<string, any> | null, datosNuevos?: Record<string, any> | null): string => {
    if (tipo === 'MATERIA_CREACION') return 'Creada';
    if (tipo === 'MATERIA_ELIMINACION') return 'Eliminada';
    if (tipo === 'MATERIA_MODIFICACION') {
      if (datosAnteriores?.activo !== undefined && datosNuevos?.activo !== undefined) {
        if (datosAnteriores.activo === true && datosNuevos.activo === false) return 'Desactivada';
        if (datosAnteriores.activo === false && datosNuevos.activo === true) return 'Activada';
      }
      return 'Modificada';
    }
    return tipo;
  };

  const colorEventoMateriaDetallado = (tipo: string, datosAnteriores?: Record<string, any> | null, datosNuevos?: Record<string, any> | null) => {
    if (tipo === 'MATERIA_CREACION') return '#22c55e';
    if (tipo === 'MATERIA_ELIMINACION') return '#ef4444';
    if (tipo === 'MATERIA_MODIFICACION') {
      if (datosAnteriores?.activo !== undefined && datosNuevos?.activo !== undefined) {
        if (datosAnteriores.activo === true && datosNuevos.activo === false) return '#f97316';
        if (datosAnteriores.activo === false && datosNuevos.activo === true) return '#06b6d4';
      }
      return '#3b82f6';
    }
    return '#6b7280';
  };

  const iconoEventoMateriaDetallado = (tipo: string, datosAnteriores?: Record<string, any> | null, datosNuevos?: Record<string, any> | null): string => {
    if (tipo === 'MATERIA_CREACION') return 'add-circle-outline';
    if (tipo === 'MATERIA_ELIMINACION') return 'trash-outline';
    if (tipo === 'MATERIA_MODIFICACION') {
      if (datosAnteriores?.activo !== undefined && datosNuevos?.activo !== undefined) {
        if (datosAnteriores.activo === true && datosNuevos.activo === false) return 'pause-circle-outline';
        if (datosAnteriores.activo === false && datosNuevos.activo === true) return 'play-circle-outline';
      }
      return 'create-outline';
    }
    return 'ellipse-outline';
  };

  const colorEventoSesion = (tipo: string) => {
    if (tipo === 'SESION_CREACION') return '#22c55e';
    if (tipo === 'SESION_INICIO') return '#3b82f6';
    if (tipo === 'SESION_RESULTADO') return '#8b5cf6';
    if (tipo === 'SESION_MODIFICACION') return '#f59e0b';
    if (tipo === 'SESION_ELIMINACION') return '#ef4444';
    return '#6b7280';
  };

  const iconoEventoSesion = (tipo: string): string => {
    if (tipo === 'SESION_CREACION') return 'add-circle';
    if (tipo === 'SESION_INICIO') return 'log-in';
    if (tipo === 'SESION_RESULTADO') return 'checkmark-circle';
    if (tipo === 'SESION_MODIFICACION') return 'pause-circle';
    if (tipo === 'SESION_ELIMINACION') return 'trash';
    return 'ellipse';
  };

  const labelEventoSesion = (tipo: string) => {
    if (tipo === 'SESION_CREACION') return 'SESION CREADA';
    if (tipo === 'SESION_INICIO') return 'INICIO';
    if (tipo === 'SESION_RESULTADO') return 'RESULTADO';
    if (tipo === 'SESION_MODIFICACION') return 'DESACTIVADA';
    if (tipo === 'SESION_ELIMINACION') return 'ELIMINADA';
    return tipo;
  };

  const colorEstatusSesion = (sesion: SesionHistorial) => {
    if (sesion.eliminado) return '#FF3B30';
    if (!sesion.activo) return '#999999';
    const ahora = new Date();
    if (sesion.fecha_inicio && new Date(sesion.fecha_inicio) > ahora) return '#007AFF';
    if (sesion.fecha_fin && new Date(sesion.fecha_fin) < ahora) return '#FF9500';
    return '#34C759';
  };

  const labelEstatusSesion = (sesion: SesionHistorial) => {
    if (sesion.eliminado) return 'Eliminada';
    if (!sesion.activo) return 'Inactiva';
    const ahora = new Date();
    if (sesion.fecha_inicio && new Date(sesion.fecha_inicio) > ahora) return 'Agendada';
    if (sesion.fecha_fin && new Date(sesion.fecha_fin) < ahora) return 'Expirada';
    return 'Activa';
  };

  const formatearTiempo = (ms: number) => {
    if (!ms) return 'N/A';
    const seg = Math.floor(ms / 1000);
    const min = Math.floor(seg / 60);
    const segRest = seg % 60;
    return `${min}:${segRest.toString().padStart(2, '0')}`;
  };

  const renderTabButton = (tab: typeof activeTab, title: string) => (
    <TouchableOpacity
      style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
      onPress={() => setActiveTab(tab)}
    >
      <Text style={[styles.tabButtonText, activeTab === tab && styles.tabButtonTextActive]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  // Tarjetas de resumen con los numeros principales del sistema
  const renderEstadisticasGenerales = () => {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📊 Estadísticas Generales</Text>
        </View>
        
        <View style={styles.statsGrid}>
          <Card style={styles.statCard}>
            <Text style={styles.statNumber}>{estadisticas?.total_quizes || 0}</Text>
            <Text style={styles.statLabel}>Total Quizes</Text>
          </Card>
          
          <Card style={styles.statCard}>
            <Text style={styles.statNumber}>{estadisticas?.total_materias || 0}</Text>
            <Text style={styles.statLabel}>Total Materias</Text>
          </Card>
          
          <Card style={styles.statCard}>
            <Text style={styles.statNumber}>{estadisticas?.total_usuarios_activos || 0}</Text>
            <Text style={styles.statLabel}>Usuarios Activos</Text>
          </Card>
          
          <Card style={styles.statCard}>
            <Text style={styles.statNumber}>{estadisticas?.sesiones_activas || 0}</Text>
            <Text style={styles.statLabel}>Sesiones Activas</Text>
          </Card>
        </View>

        <View style={styles.rolesSection}>
          <Text style={styles.subsectionTitle}>Usuarios por Rol</Text>
          {(estadisticas?.usuarios_por_rol || []).map((rol, index) => (
            <View key={index} style={styles.rolItem}>
              <Text style={styles.rolNombre}>{rol?.rol || 'Desconocido'}</Text>
              <Badge text={(rol?.cantidad || 0).toString()} variant="info" />
            </View>
          ))}
          {(!estadisticas?.usuarios_por_rol || estadisticas.usuarios_por_rol.length === 0) && (
            <Text style={styles.noDataText}>No hay datos disponibles</Text>
          )}
        </View>

        <View style={styles.pdfButtonContainer}>
          <TouchableOpacity 
            style={styles.pdfButton}
            onPress={() => estadisticas && generarPDFAuditoriaCompleta(
              estadisticas,
              quicesRecientes,
              sesionesRecientes,
              materiasAuditoria
            )}
            disabled={!estadisticas}
          >
            <Text style={styles.pdfButtonText}>📄 Reporte Completo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Barra de filtros compartida para buscar por tipo, materia y tiempo
  const renderFiltrosAuditoria = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>🔍 Filtros</Text>
      <Card style={styles.filtroCardCompact}>
        <TextInput
          style={styles.searchInputCompact}
          placeholder="Buscar por título, profesor o materia..."
          value={searchText}
          onChangeText={setSearchText}
        />
        
        <View style={styles.dropdownsRow}>
          <TouchableOpacity
            style={styles.dropdownSelector}
            onPress={() => setDropdownTipoVisible(true)}
          >
            <Text style={styles.dropdownLabel}>Tipo</Text>
            <View style={styles.dropdownValue}>
              <Text style={styles.dropdownText}>
                {filtroTipo === 'todos' ? 'Todos' : 
                 filtroTipo === 'creacion' ? 'Creación' :
                 filtroTipo === 'modificacion' ? 'Modificación' : 'Eliminación'}
              </Text>
              <Text style={styles.dropdownArrow}>▼</Text>
            </View>
          </TouchableOpacity>



          <TouchableOpacity
            style={styles.dropdownSelector}
            onPress={() => setDropdownMateriaVisible(true)}
          >
            <Text style={styles.dropdownLabel}>Materia</Text>
            <View style={styles.dropdownValue}>
              <Text style={styles.dropdownText}>
                {filtroMateria === null ? 'Todos' :
                 (materiasAuditoria.find(m => m.materia_id === filtroMateria)?.nombre || `ID ${filtroMateria}`)}
              </Text>
              <Text style={styles.dropdownArrow}>▼</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dropdownSelector}
            onPress={() => setDropdownTiempoVisible(true)}
          >
            <Text style={styles.dropdownLabel}>Tiempo</Text>
            <View style={styles.dropdownValue}>
              <Text style={styles.dropdownText}>
                {filtroTiempo === 'todos' ? 'Todos' : 
                 filtroTiempo === 'dia' ? 'Último día' :
                 filtroTiempo === 'semana' ? 'Última semana' :
                 filtroTiempo === 'mes' ? 'Último mes' : 'Último año'}
              </Text>
              <Text style={styles.dropdownArrow}>▼</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Card>
      
      <Modal
        visible={dropdownTipoVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDropdownTipoVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDropdownTipoVisible(false)}
        >
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownModalTitle}>Seleccionar Tipo</Text>
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'creacion', label: 'Creación' },
              { key: 'modificacion', label: 'Modificación' },
              { key: 'eliminacion', label: 'Eliminación' }
            ].map((tipo) => (
              <TouchableOpacity
                key={tipo.key}
                style={[styles.modalOption, filtroTipo === tipo.key && styles.modalOptionActive]}
                onPress={() => {
                  setFiltroTipo(tipo.key as any);
                  setDropdownTipoVisible(false);
                }}
              >
                <Text style={[styles.modalOptionText, filtroTipo === tipo.key && styles.modalOptionTextActive]}>
                  {tipo.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
      
      <Modal
        visible={dropdownTiempoVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDropdownTiempoVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDropdownTiempoVisible(false)}
        >
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownModalTitle}>Seleccionar Tiempo</Text>
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'dia', label: 'Último día' },
              { key: 'semana', label: 'Última semana' },
              { key: 'mes', label: 'Último mes' },
              { key: 'anio', label: 'Último año' }
            ].map((tiempo) => (
              <TouchableOpacity
                key={tiempo.key}
                style={[styles.modalOption, filtroTiempo === tiempo.key && styles.modalOptionActive]}
                onPress={() => {
                  setFiltroTiempo(tiempo.key as any);
                  setDropdownTiempoVisible(false);
                }}
              >
                <Text style={[styles.modalOptionText, filtroTiempo === tiempo.key && styles.modalOptionTextActive]}>
                  {tiempo.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>



      <Modal
        visible={dropdownMateriaVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDropdownMateriaVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDropdownMateriaVisible(false)}
        >
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownModalTitle}>Seleccionar Materia</Text>
            <TouchableOpacity
              style={[styles.modalOption, filtroMateria === null && styles.modalOptionActive]}
              onPress={() => { setFiltroMateria(null); setDropdownMateriaVisible(false); }}
            >
              <Text style={[styles.modalOptionText, filtroMateria === null && styles.modalOptionTextActive]}>Todos</Text>
            </TouchableOpacity>
            {(materiasAuditoria || []).map((m) => (
              <TouchableOpacity
                key={m.materia_id}
                style={[styles.modalOption, filtroMateria === m.materia_id && styles.modalOptionActive]}
                onPress={() => { setFiltroMateria(m.materia_id); setDropdownMateriaVisible(false); }}
              >
                <Text style={[styles.modalOptionText, filtroMateria === m.materia_id && styles.modalOptionTextActive]}>
                  {m.nombre} ({m.codigo})
                </Text>
              </TouchableOpacity>
            ))}
            {(!materiasAuditoria || materiasAuditoria.length === 0) && (
              <Text style={styles.noDataText}>No hay materias disponibles</Text>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );

  const esOperacion = (tipo: string, busca: string) =>
    String(tipo).toLowerCase().includes(busca);

  const iconoOperacion = (tipo: string) => {
    if (esOperacion(tipo, 'crea')) return 'add-circle';
    if (esOperacion(tipo, 'mod')) return 'create';
    if (esOperacion(tipo, 'elim')) return 'trash-bin';
    return 'ellipse';
  };

  const colorOperacion = (tipo: string) => {
    if (esOperacion(tipo, 'crea')) return '#22c55e';
    if (esOperacion(tipo, 'mod')) return '#3b82f6';
    if (esOperacion(tipo, 'elim')) return '#ef4444';
    return '#6b7280';
  };

  const labelIconoAccion = (tipo: string) => {
    const t = tipo.toLowerCase();
    if (t.includes('crea')) return { icon: 'add-circle-outline' as const, color: '#16a34a' };
    if (t.includes('mod')) return { icon: 'create-outline' as const, color: '#d97706' };
    if (t.includes('elim')) return { icon: 'trash-outline' as const, color: '#dc2626' };
    if (t.includes('sesion') || t.includes('inicio')) return { icon: 'play-circle-outline' as const, color: '#3b82f6' };
    return { icon: 'ellipse-outline' as const, color: '#6b7280' };
  };

  const labelOperacion = (tipo: string) => {
    if (esOperacion(tipo, 'crea')) return 'CREACIÓN';
    if (esOperacion(tipo, 'mod')) return 'MODIFICACIÓN';
    if (esOperacion(tipo, 'elim')) return 'ELIMINACIÓN';
    return String(tipo || '').replace('QUIZ_', '').replace(/_/g, ' ');
  };

  // Lista de operaciones de auditoria sobre quices con filtros aplicados
  const renderQuicesRecientes = () => {
    const getFechaLimite = () => {
      const ahora = new Date();
      switch (filtroTiempo) {
        case 'dia': return new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
        case 'semana': return new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
        case 'mes': return new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
        case 'anio': return new Date(ahora.getTime() - 365 * 24 * 60 * 60 * 1000);
        default: return null;
      }
    };

    const fechaLimite = getFechaLimite();

    // Fuente ÚNICA: quicesHistorial (coleccion_auditoria)
    const quicesAMostrar = (quicesHistorial && quicesHistorial.length > 0) ? quicesHistorial : [];

    const quicesFiltrados = quicesAMostrar.filter((quiz: any) => {
      if (!quiz.tipo_operacion) return false;
      if (/^USUARIO_|^SEGURIDAD_/.test(String(quiz.tipo_operacion))) return false;

      const fechaQuiz = new Date(quiz.fecha_operacion || Date.now());
      if (fechaLimite && fechaQuiz < fechaLimite) return false;

      if (filtroTipo !== 'todos' && quiz.tipo_operacion) {
        const tipo = String(quiz.tipo_operacion || '').toLowerCase();
        if (filtroTipo === 'creacion' && !tipo.includes('crea')) return false;
        if (filtroTipo === 'modificacion' && !tipo.includes('mod')) return false;
        if (filtroTipo === 'eliminacion' && !tipo.includes('elim')) return false;
      }

      if (filtroProfesor !== null && quiz.usuario?.id !== filtroProfesor) return false;

      if (filtroMateria !== null && quiz.materia?.id !== filtroMateria) return false;

      if (searchText) {
        const busqueda = searchText.toLowerCase();
        return (
          String(quiz.quiz_titulo || '').toLowerCase().includes(busqueda) ||
          String(quiz.usuario?.nombre || '').toLowerCase().includes(busqueda) ||
          String(quiz.usuario?.apellido || '').toLowerCase().includes(busqueda) ||
          String(quiz.materia?.nombre || '').toLowerCase().includes(busqueda)
        );
      }
      return true;
    });

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📋 Historial de Auditoría de Quices</Text>
          <Text style={styles.resultCount}>{quicesFiltrados.length} de {quicesAMostrar.length}</Text>
        </View>

        <View style={styles.pdfButtonContainer}>
          <TouchableOpacity
            style={styles.pdfButton}
            onPress={() => generarPDFQuices(quicesFiltrados, filtroTipo, filtroTiempo, searchText, filtroProfesor, filtroMateria, materiasAuditoria)}
            disabled={quicesFiltrados.length === 0}
          >
            <Text style={styles.pdfButtonText}>📄 Generar PDF</Text>
          </TouchableOpacity>
        </View>

        {quicesFiltrados.length === 0 ? (
          <Text style={styles.noDataText}>No hay operaciones registradas en el historial de auditoría</Text>
        ) : (
          quicesFiltrados.map((quiz: any, idx: number) => {
            const titulo = quiz.quiz_titulo || 'Sin título';
            const materiaNombre = quiz.materia?.nombre || 'Sin materia';
            const materiaId = quiz.materia?.id;
            const profNombre = quiz.usuario?.nombre || 'Desconocido';
            const profApellido = quiz.usuario?.apellido || '';
            const profId = quiz.usuario?.id;
            const cantidadPreguntas = quiz.cantidad_preguntas ?? quiz.detalles?.cantidad_preguntas ?? 0;
            const fechaOperacion = quiz.fecha_operacion;
            const quizId = quiz.quiz_id || quiz.entidad?.id;
            const tipoOp = quiz.tipo_operacion || '';
            const color = colorOperacion(tipoOp);
            const icono = iconoOperacion(tipoOp);
            const label = labelOperacion(tipoOp);
            const esModificacion = esOperacion(tipoOp, 'mod');

            let mensajeDescriptivo = quiz.detalles?.mensaje_descriptivo || quiz.detalles?.accion;
            if (!mensajeDescriptivo) {
              if (esOperacion(tipoOp, 'crea')) {
                mensajeDescriptivo = `Creó el quiz '${titulo}' en la materia '${materiaNombre}'`;
              } else if (esOperacion(tipoOp, 'mod')) {
                mensajeDescriptivo = `Modificó el quiz '${titulo}' en la materia '${materiaNombre}'`;
              } else if (esOperacion(tipoOp, 'elim')) {
                mensajeDescriptivo = `Eliminó el quiz '${titulo}' de la materia '${materiaNombre}'`;
              }
            }

            const datosAnteriores = quiz.cambio?.datos_anteriores;
            const datosNuevos = quiz.cambio?.datos_nuevos;

            return (
              <Card key={`${quizId || idx}-${idx}`} style={styles.itemCard}>
                <View style={[styles.itemHeader, { borderLeftWidth: 4, borderLeftColor: color, paddingLeft: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Ionicons name={icono as any} size={18} color={color} style={{ marginRight: 6 }} />
                      <Text style={[styles.itemTitle, { color }]}>{label}</Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#1e293b' }}>{titulo}</Text>
                  </View>
                </View>

                {mensajeDescriptivo && (
                  <Text style={[styles.itemDescription, { marginTop: 8 }]}>{mensajeDescriptivo}</Text>
                )}

                <View style={styles.itemMeta}>
                  <Text style={styles.itemMetaText}>👨‍🏫 {profNombre} {profApellido}</Text>
                  <Text style={styles.itemMetaText}>📚 {materiaNombre}</Text>
                  {cantidadPreguntas > 0 && (
                    <Text style={styles.itemMetaText}>📝 {cantidadPreguntas} preguntas</Text>
                  )}
                </View>
                <Text style={styles.itemDate}>{formatearFecha(fechaOperacion)}</Text>

                {esModificacion && datosAnteriores && datosNuevos && (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingVertical: 4 }}
                    onPress={() => {
                      setCambiosModalData({
                        ant: datosAnteriores,
                        nue: datosNuevos,
                        titulo,
                        prof: `${profNombre} ${profApellido}`,
                        materia: materiaNombre
                      });
                      setCambiosModalVisible(true);
                    }}
                  >
                    <Ionicons name="create-outline" size={14} color="#3b82f6" style={{ marginRight: 4 }} />
                    <Text style={{ fontSize: 13, color: '#3b82f6', fontWeight: '500' }}>Ver cambios realizados</Text>
                  </TouchableOpacity>
                )}

                {!esModificacion && datosNuevos && (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingVertical: 4 }}
                    onPress={() => {
                      setCambiosModalData({
                        ant: null,
                        nue: datosNuevos,
                        titulo,
                        prof: `${profNombre} ${profApellido}`,
                        materia: materiaNombre
                      });
                      setCambiosModalVisible(true);
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={14} color="#16a34a" style={{ marginRight: 4 }} />
                    <Text style={{ fontSize: 13, color: '#16a34a', fontWeight: '500' }}>Ver contenido creado</Text>
                  </TouchableOpacity>
                )}
              </Card>
            );
          })
        )}
      </View>
    );
  };



  // Filtros especificos para la pestana de usuarios (rol, estado, tiempo)
  const renderFiltrosUsuarios = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>🔍 Filtros</Text>
      <Card style={styles.filtroCardCompact}>
        <TextInput
          style={styles.searchInputCompact}
          placeholder="Buscar por nombre o email..."
          value={searchText}
          onChangeText={setSearchText}
        />
        <View style={styles.dropdownsRow}>
          <TouchableOpacity style={styles.dropdownSelector} onPress={() => setDropdownRolUsuarioVisible(true)}>
            <Text style={styles.dropdownLabel}>Rol</Text>
            <View style={styles.dropdownValue}>
              <Text style={styles.dropdownText}>
                {filtroRolUsuario === 'todos' ? 'Todos' :
                 filtroRolUsuario === 'profesor' ? 'Profesor' :
                 filtroRolUsuario === 'alumno' ? 'Alumno' : 'Admin'}
              </Text>
              <Text style={styles.dropdownArrow}>▼</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dropdownSelector} onPress={() => setDropdownEstadoUsuarioVisible(true)}>
            <Text style={styles.dropdownLabel}>Estado</Text>
            <View style={styles.dropdownValue}>
              <Text style={styles.dropdownText}>
                {filtroEstadoUsuario === 'todos' ? 'Todos' :
                 filtroEstadoUsuario === 'activo' ? 'Activo' :
                 filtroEstadoUsuario === 'inactivo' ? 'Inactivo' : 'Eliminados'}
              </Text>
              <Text style={styles.dropdownArrow}>▼</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dropdownSelector} onPress={() => setDropdownTiempoVisible(true)}>
            <Text style={styles.dropdownLabel}>Tiempo</Text>
            <View style={styles.dropdownValue}>
              <Text style={styles.dropdownText}>
                {filtroTiempo === 'todos' ? 'Todos' :
                 filtroTiempo === 'dia' ? 'Día' :
                 filtroTiempo === 'semana' ? 'Semana' :
                 filtroTiempo === 'mes' ? 'Mes' : 'Año'}
              </Text>
              <Text style={styles.dropdownArrow}>▼</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Card>

      <Modal visible={dropdownRolUsuarioVisible} transparent animationType="fade"
        onRequestClose={() => setDropdownRolUsuarioVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDropdownRolUsuarioVisible(false)}>
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownModalTitle}>Rol de usuario</Text>
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'profesor', label: 'Profesor' },
              { key: 'alumno', label: 'Alumno' },
              { key: 'admin', label: 'Admin' }
            ].map((op) => (
              <TouchableOpacity key={op.key}
                style={[styles.modalOption, filtroRolUsuario === op.key && styles.modalOptionActive]}
                onPress={() => { setFiltroRolUsuario(op.key as any); setDropdownRolUsuarioVisible(false); }}>
                <Text style={[styles.modalOptionText, filtroRolUsuario === op.key && styles.modalOptionTextActive]}>{op.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={dropdownEstadoUsuarioVisible} transparent animationType="fade"
        onRequestClose={() => setDropdownEstadoUsuarioVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDropdownEstadoUsuarioVisible(false)}>
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownModalTitle}>Estado</Text>
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'activo', label: 'Activo' },
              { key: 'inactivo', label: 'Inactivo' },
              { key: 'eliminados', label: '🗑️ Eliminados' }
            ].map((op) => (
              <TouchableOpacity key={op.key}
                style={[styles.modalOption, filtroEstadoUsuario === op.key && styles.modalOptionActive]}
                onPress={() => { setFiltroEstadoUsuario(op.key as any); setDropdownEstadoUsuarioVisible(false); }}>
                <Text style={[styles.modalOptionText, filtroEstadoUsuario === op.key && styles.modalOptionTextActive]}>{op.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={dropdownTiempoVisible} transparent animationType="fade"
        onRequestClose={() => setDropdownTiempoVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDropdownTiempoVisible(false)}>
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownModalTitle}>Tiempo</Text>
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'dia', label: 'Día' },
              { key: 'semana', label: 'Semana' },
              { key: 'mes', label: 'Mes' },
              { key: 'anio', label: 'Año' }
            ].map((op) => (
              <TouchableOpacity key={op.key}
                style={[styles.modalOption, filtroTiempo === op.key && styles.modalOptionActive]}
                onPress={() => { setFiltroTiempo(op.key as any); setDropdownTiempoVisible(false); }}>
                <Text style={[styles.modalOptionText, filtroTiempo === op.key && styles.modalOptionTextActive]}>{op.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );

  // Filtros para la pestana de sesiones (estatus y tiempo)
  const renderFiltrosSesiones = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Filtros</Text>
      <Card style={styles.filtroCardCompact}>
        <TextInput
          style={styles.searchInputCompact}
          placeholder="Buscar por codigo, quiz, profesor..."
          value={searchText}
          onChangeText={setSearchText}
        />
        <View style={styles.dropdownsRow}>
          <TouchableOpacity style={styles.dropdownSelector} onPress={() => setDropdownEstatusSesionVisible(true)}>
            <Text style={styles.dropdownLabel}>Estatus</Text>
            <View style={styles.dropdownValue}>
              <Text style={styles.dropdownText}>
                {filtroEstatusSesion === 'todos' ? 'Todos' :
                 filtroEstatusSesion === 'activa' ? 'Activa' :
                 filtroEstatusSesion === 'agendada' ? 'Agendada' :
                 filtroEstatusSesion === 'finalizada' ? 'Finalizada' :
                 filtroEstatusSesion === 'expirada' ? 'Expirada' : 'Eliminada'}
              </Text>
              <Text style={styles.dropdownArrow}>▼</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dropdownSelector} onPress={() => setDropdownTiempoVisible(true)}>
            <Text style={styles.dropdownLabel}>Tiempo</Text>
            <View style={styles.dropdownValue}>
              <Text style={styles.dropdownText}>
                {filtroTiempo === 'todos' ? 'Todos' :
                 filtroTiempo === 'dia' ? 'Ultimo dia' :
                 filtroTiempo === 'semana' ? 'Ultima semana' :
                 filtroTiempo === 'mes' ? 'Ultimo mes' : 'Ultimo anio'}
              </Text>
              <Text style={styles.dropdownArrow}>▼</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Card>

      <Modal visible={dropdownEstatusSesionVisible} transparent animationType="fade"
        onRequestClose={() => setDropdownEstatusSesionVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDropdownEstatusSesionVisible(false)}>
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownModalTitle}>Estatus</Text>
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'activa', label: 'Activa' },
              { key: 'agendada', label: 'Agendada' },
              { key: 'finalizada', label: 'Finalizada' },
              { key: 'expirada', label: 'Expirada' },
              { key: 'eliminada', label: 'Eliminada' }
            ].map((op) => (
              <TouchableOpacity key={op.key}
                style={[styles.modalOption, filtroEstatusSesion === op.key && styles.modalOptionActive]}
                onPress={() => { setFiltroEstatusSesion(op.key as any); setDropdownEstatusSesionVisible(false); }}>
                <Text style={[styles.modalOptionText, filtroEstatusSesion === op.key && styles.modalOptionTextActive]}>{op.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={dropdownTiempoVisible} transparent animationType="fade"
        onRequestClose={() => setDropdownTiempoVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDropdownTiempoVisible(false)}>
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownModalTitle}>Tiempo</Text>
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'dia', label: 'Ultimo dia' },
              { key: 'semana', label: 'Ultima semana' },
              { key: 'mes', label: 'Ultimo mes' },
              { key: 'anio', label: 'Ultimo anio' }
            ].map((op) => (
              <TouchableOpacity key={op.key}
                style={[styles.modalOption, filtroTiempo === op.key && styles.modalOptionActive]}
                onPress={() => { setFiltroTiempo(op.key as any); setDropdownTiempoVisible(false); }}>
                <Text style={[styles.modalOptionText, filtroTiempo === op.key && styles.modalOptionTextActive]}>{op.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );

  // Filtros para la pestana de materias (profesor, estatus, tiempo)
  const renderFiltrosMaterias = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Filtros</Text>
      <Card style={styles.filtroCardCompact}>
        <TextInput
          style={styles.searchInputCompact}
          placeholder="Buscar por nombre o codigo..."
          value={searchText}
          onChangeText={setSearchText}
        />
        <View style={styles.dropdownsRow}>
          <TouchableOpacity style={styles.dropdownSelector} onPress={() => setDropdownProfesorVisible(true)}>
            <Text style={styles.dropdownLabel}>Profesor</Text>
            <View style={styles.dropdownValue}>
              <Text style={styles.dropdownText}>
                {filtroProfesor === null ? 'Todos' : `Profesor #${filtroProfesor}`}
              </Text>
              <Text style={styles.dropdownArrow}>▼</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dropdownSelector} onPress={() => setDropdownEstatusMateriaVisible(true)}>
            <Text style={styles.dropdownLabel}>Estatus</Text>
            <View style={styles.dropdownValue}>
              <Text style={styles.dropdownText}>
                {filtroEstatusMateria === 'todos' ? 'Todos' :
                 filtroEstatusMateria === 'activa' ? 'Activa' :
                 filtroEstatusMateria === 'desactivada' ? 'Desactivada' : 'Eliminada'}
              </Text>
              <Text style={styles.dropdownArrow}>▼</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dropdownSelector} onPress={() => setDropdownTiempoVisible(true)}>
            <Text style={styles.dropdownLabel}>Tiempo</Text>
            <View style={styles.dropdownValue}>
              <Text style={styles.dropdownText}>
                {filtroTiempo === 'todos' ? 'Todos' :
                 filtroTiempo === 'dia' ? 'Ultimo dia' :
                 filtroTiempo === 'semana' ? 'Ultima semana' :
                 filtroTiempo === 'mes' ? 'Ultimo mes' : 'Ultimo anio'}
              </Text>
              <Text style={styles.dropdownArrow}>▼</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Card>

      <Modal visible={dropdownProfesorVisible} transparent animationType="fade"
        onRequestClose={() => setDropdownProfesorVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDropdownProfesorVisible(false)}>
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownModalTitle}>Profesor</Text>
            <TouchableOpacity
              style={[styles.modalOption, filtroProfesor === null && styles.modalOptionActive]}
              onPress={() => { setFiltroProfesor(null); setDropdownProfesorVisible(false); }}>
              <Text style={[styles.modalOptionText, filtroProfesor === null && styles.modalOptionTextActive]}>Todos</Text>
            </TouchableOpacity>
            {materiasAuditoria.reduce((acc: Array<{id: number; nombre: string; apellido: string}>, m) => {
              const prof = m.profesor_actual;
              if (prof && !acc.find(p => p.id === prof.id)) {
                acc.push({ id: prof.id, nombre: prof.nombre, apellido: prof.apellido });
              }
              return acc;
            }, []).map((prof) => (
              <TouchableOpacity key={prof.id}
                style={[styles.modalOption, filtroProfesor === prof.id && styles.modalOptionActive]}
                onPress={() => { setFiltroProfesor(prof.id); setDropdownProfesorVisible(false); }}>
                <Text style={[styles.modalOptionText, filtroProfesor === prof.id && styles.modalOptionTextActive]}>
                  {prof.nombre} {prof.apellido}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={dropdownEstatusMateriaVisible} transparent animationType="fade"
        onRequestClose={() => setDropdownEstatusMateriaVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDropdownEstatusMateriaVisible(false)}>
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownModalTitle}>Estatus</Text>
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'activa', label: 'Activa' },
              { key: 'desactivada', label: 'Desactivada' },
              { key: 'eliminada', label: 'Eliminada' }
            ].map((op) => (
              <TouchableOpacity key={op.key}
                style={[styles.modalOption, filtroEstatusMateria === op.key && styles.modalOptionActive]}
                onPress={() => { setFiltroEstatusMateria(op.key as any); setDropdownEstatusMateriaVisible(false); }}>
                <Text style={[styles.modalOptionText, filtroEstatusMateria === op.key && styles.modalOptionTextActive]}>{op.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={dropdownTiempoVisible} transparent animationType="fade"
        onRequestClose={() => setDropdownTiempoVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDropdownTiempoVisible(false)}>
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownModalTitle}>Tiempo</Text>
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'dia', label: 'Ultimo dia' },
              { key: 'semana', label: 'Ultima semana' },
              { key: 'mes', label: 'Ultimo mes' },
              { key: 'anio', label: 'Ultimo anio' }
            ].map((op) => (
              <TouchableOpacity key={op.key}
                style={[styles.modalOption, filtroTiempo === op.key && styles.modalOptionActive]}
                onPress={() => { setFiltroTiempo(op.key as any); setDropdownTiempoVisible(false); }}>
                <Text style={[styles.modalOptionText, filtroTiempo === op.key && styles.modalOptionTextActive]}>{op.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );

  // Lista de sesiones con su linea de tiempo y ranking de participantes
  const renderSesionesHistorial = () => {
    const getFechaLimite = () => {
      const ahora = new Date();
      switch (filtroTiempo) {
        case 'dia': return new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
        case 'semana': return new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
        case 'mes': return new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
        case 'anio': return new Date(ahora.getTime() - 365 * 24 * 60 * 60 * 1000);
        default: return null;
      }
    };
    const fechaLimite = getFechaLimite();

    const sesionesFiltradas = (sesionesHistorial || []).filter((sesion: SesionHistorial) => {
      if (filtroEstatusSesion !== 'todos') {
        if (filtroEstatusSesion === 'activa' && (sesion.eliminado || !sesion.activo || sesion.estatus === 'Inactivo')) return false;
        if (filtroEstatusSesion === 'eliminada' && !sesion.eliminado) return false;
        if (filtroEstatusSesion === 'finalizada' && sesion.estatus !== 'Inactivo') return false;
        if (filtroEstatusSesion === 'agendada') {
          const ahora = new Date();
          if (!sesion.fecha_inicio || new Date(sesion.fecha_inicio) <= ahora) return false;
        }
        if (filtroEstatusSesion === 'expirada') {
          const ahora = new Date();
          if (sesion.eliminado || sesion.estatus === 'Inactivo') return false;
          if (!sesion.fecha_fin || new Date(sesion.fecha_fin) >= ahora) return false;
        }
      }

      if (fechaLimite && sesion.eventos.length > 0) {
        const primerEvento = sesion.eventos[sesion.eventos.length - 1];
        if (primerEvento && new Date(primerEvento.fecha_operacion) < fechaLimite) return false;
      }

      if (searchText) {
        const busqueda = searchText.toLowerCase();
        return (
          String(sesion.codigo_acceso || '').toLowerCase().includes(busqueda) ||
          String(sesion.quiz_titulo || '').toLowerCase().includes(busqueda) ||
          String(sesion.materia?.nombre || '').toLowerCase().includes(busqueda) ||
          String(sesion.nombre_grupo || '').toLowerCase().includes(busqueda) ||
          sesion.eventos.some(e =>
            `${e.usuario?.nombre || ''} ${e.usuario?.apellido || ''}`.toLowerCase().includes(busqueda)
          )
        );
      }
      return true;
    });

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Historial de Auditoria de Sesiones</Text>
          <Text style={styles.resultCount}>{sesionesFiltradas.length} de {sesionesHistorial.length}</Text>
        </View>

        <View style={styles.pdfButtonContainer}>
          <TouchableOpacity
            style={styles.pdfButton}
            disabled={sesionesFiltradas.length === 0}
            onPress={() => generarPDFSesiones(
              sesionesFiltradas,
              {
                busqueda: searchText,
                estatus: filtroEstatusSesion,
                tiempo: filtroTiempo,
              }
            )}
          >
            <Text style={styles.pdfButtonText}>Generar PDF</Text>
          </TouchableOpacity>
        </View>

        {sesionesFiltradas.length === 0 ? (
          <View style={styles.sesionesEmptyContainer}>
            <Ionicons name="folder-open-outline" size={48} color="#cbd5e1" />
            <Text style={styles.sesionesEmptyText}>No hay sesiones en el historial de auditoria</Text>
          </View>
        ) : (
          sesionesFiltradas.map((sesion: SesionHistorial) => {
            const expandida = sesionesExpandidas.has(sesion.sesion_id);
            const colorEst = colorEstatusSesion(sesion);
            const labelEst = labelEstatusSesion(sesion);
            const topRanking = sesion.participantes
              .filter(p => p.nota_final > 0)
              .sort((a, b) => b.nota_final - a.nota_final)
              .slice(0, 3);
            const eventosOrdenados = [...sesion.eventos].sort((a, b) =>
              new Date(a.fecha_operacion).getTime() - new Date(b.fecha_operacion).getTime()
            );
            const profesorEvento = sesion.eventos.find(e => e.usuario?.rol === 'Profesor');
            const profesorNombre = profesorEvento ? `${profesorEvento.usuario.nombre} ${profesorEvento.usuario.apellido}` : 'N/A';

            return (
              <Card key={sesion.sesion_id} style={styles.itemCard as any}>
                <View style={{ borderLeftWidth: 4, borderLeftColor: colorEst, paddingLeft: 8 }}>
                <TouchableOpacity onPress={() => toggleSesionExpandida(sesion.sesion_id)} activeOpacity={0.7}>
                  <View style={styles.sesionCardHeader}>
                    <View style={[styles.sesionCodigoBadge]}>
                      <Text style={styles.sesionCodigoText}>{sesion.codigo_acceso}</Text>
                    </View>
                    <View style={[styles.badgeRow, { marginLeft: 8 }]}>
                      <Badge text={labelEst} variant={
                        labelEst === 'Activa' ? 'success' :
                        labelEst === 'Agendada' ? 'info' :
                        labelEst === 'Eliminada' ? 'danger' :
                        labelEst === 'Inactiva' ? 'gray' :
                        labelEst === 'Expirada' ? 'warning' : 'info'
                      } />
                    </View>
                  </View>

                  <Text style={styles.sesionCardTitle}>{sesion.quiz_titulo}</Text>

                  <View style={styles.sesionCardMeta}>
                    <View style={styles.sesionCardMetaRow}>
                      <Ionicons name="book-outline" size={14} color="#64748b" />
                      <Text style={styles.sesionCardMetaText}>{sesion.materia.nombre} ({sesion.materia.codigo})</Text>
                    </View>
                    <View style={styles.sesionCardMetaRow}>
                      <Ionicons name="school-outline" size={14} color="#64748b" />
                      <Text style={styles.sesionCardMetaText}>{profesorNombre}</Text>
                    </View>
                    <View style={styles.sesionCardMetaRow}>
                      <Ionicons name="people-outline" size={14} color="#64748b" />
                      <Text style={styles.sesionCardMetaText}>{sesion.total_participantes} participantes</Text>
                    </View>
                    <View style={styles.sesionCardMetaRow}>
                      <Ionicons name="calendar-outline" size={14} color="#64748b" />
                      <Text style={styles.sesionCardMetaText}>
                        {formatearFecha(sesion.fecha_inicio || '')} - {formatearFecha(sesion.fecha_fin || '')}
                      </Text>
                    </View>
                  </View>

                  {topRanking.length > 0 && (
                    <View style={styles.sesionCardTopRanking}>
                      {topRanking.map((p, idx) => (
                        <View key={p.usuario_id} style={styles.sesionTopBadge}>
                          <Text style={styles.sesionTopText}>
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} {p.nombre} ({p.nota_final}/{sesion.quiz_ponderacion})
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.sesionExpandButton} onPress={() => toggleSesionExpandida(sesion.sesion_id)}>
                  <Text style={styles.sesionExpandText}>
                    {expandida ? 'Ocultar eventos' : `Ver ${sesion.eventos.length} eventos`}
                  </Text>
                  <Ionicons name={expandida ? 'chevron-up' : 'chevron-down'} size={16} color="#6366f1" />
                </TouchableOpacity>

                {expandida && (
                  <View style={styles.timelineContainer}>
                    {eventosOrdenados.map((evento, idx) => {
                      const color = colorEventoSesion(evento.tipo_operacion);
                      const icono = iconoEventoSesion(evento.tipo_operacion);
                      const label = labelEventoSesion(evento.tipo_operacion);
                      const esUltimo = idx === eventosOrdenados.length - 1;

                      return (
                        <View key={idx} style={styles.timelineEvent}>
                          <View style={[styles.timelineDot, { backgroundColor: color }]} />
                          {!esUltimo && <View style={styles.timelineLine} />}
                          <View style={styles.timelineContent}>
                            <Text style={[styles.timelineLabel, { color }]}>{label}</Text>
                            <Text style={styles.timelineUsuario}>
                              {evento.usuario?.nombre} {evento.usuario?.apellido}
                            </Text>
                            {evento.tipo_operacion === 'SESION_RESULTADO' && evento.nota_final !== undefined && (
                              <Text style={styles.timelineNota}>
                                Nota: {evento.nota_final}/{sesion.quiz_ponderacion}{evento.es_repeticion ? ' (repeticion)' : ''}
                              </Text>
                            )}
                            <Text style={styles.timelineFecha}>{formatearFecha(evento.fecha_operacion)}</Text>
                          </View>
                        </View>
                      );
                    })}

                    <TouchableOpacity
                      style={[styles.resultsButton, { marginTop: 8 }]}
                      onPress={() => {
                        setDetalleSesionData(sesion);
                        setDetalleSesionModalVisible(true);
                      }}
                    >
                      <Ionicons name="eye-outline" size={16} color="#fff" />
                      <Text style={styles.resultsButtonText}>Ver detalle completo</Text>
                    </TouchableOpacity>
                  </View>
                )}
                </View>
              </Card>
            );
          })
        )}
      </View>
    );
  };

  // Modal con informacion completa de una sesion, ranking y eventos
  const renderDetalleSesionModal = () => {
    if (!detalleSesionData) return null;
    const sesion = detalleSesionData;
    const colorEst = colorEstatusSesion(sesion);
    const labelEst = labelEstatusSesion(sesion);
    const participantesOrdenados = [...sesion.participantes].sort((a, b) => b.nota_final - a.nota_final);
    const promedio = participantesOrdenados.length > 0
      ? participantesOrdenados.reduce((sum, p) => sum + p.nota_final, 0) / participantesOrdenados.length
      : 0;
    const mejorNota = participantesOrdenados.length > 0 ? participantesOrdenados[0].nota_final : 0;
    const peorNota = participantesOrdenados.length > 0 ? participantesOrdenados[participantesOrdenados.length - 1].nota_final : 0;
    const eventosOrdenados = [...sesion.eventos].sort((a, b) =>
      new Date(a.fecha_operacion).getTime() - new Date(b.fecha_operacion).getTime()
    );
    const profesorEvento = sesion.eventos.find(e => e.usuario?.rol === 'Profesor');
    const profesorNombre = profesorEvento ? `${profesorEvento.usuario.nombre} ${profesorEvento.usuario.apellido}` : 'N/A';

    return (
      <Modal visible={detalleSesionModalVisible} transparent animationType="fade"
        onRequestClose={() => setDetalleSesionModalVisible(false)}>
        <TouchableOpacity style={styles.detalleModalOverlay} activeOpacity={1}
          onPress={() => setDetalleSesionModalVisible(false)}>
          <View style={styles.detalleModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.detalleModalHeader}>
              <View style={[styles.sesionCodigoBadge, { marginRight: 10 }]}>
                <Text style={styles.sesionCodigoText}>{sesion.codigo_acceso}</Text>
              </View>
              <View>
                <Badge text={labelEst} variant={
                  labelEst === 'Activa' ? 'success' :
                  labelEst === 'Eliminada' ? 'danger' :
                  labelEst === 'Inactiva' ? 'gray' :
                  labelEst === 'Agendada' ? 'info' :
                  labelEst === 'Expirada' ? 'warning' : 'info'
                } />
              </View>
              <TouchableOpacity style={styles.detalleModalClose}
                onPress={() => setDetalleSesionModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.detalleModalBody}>
              <View style={styles.detalleSection}>
                <Text style={styles.detalleSectionTitle}>Quiz</Text>
                <View style={styles.detalleInfoRow}>
                  <Text style={styles.detalleInfoLabel}>Titulo</Text>
                  <Text style={styles.detalleInfoValue}>{sesion.quiz_titulo}</Text>
                </View>
                <View style={styles.detalleInfoRow}>
                  <Text style={styles.detalleInfoLabel}>Tema</Text>
                  <Text style={styles.detalleInfoValue}>{sesion.quiz_tema || 'N/A'}</Text>
                </View>
                <View style={styles.detalleInfoRow}>
                  <Text style={styles.detalleInfoLabel}>Modo</Text>
                  <Text style={styles.detalleInfoValue}>{sesion.quiz_modo_juego}</Text>
                </View>
                <View style={styles.detalleInfoRow}>
                  <Text style={styles.detalleInfoLabel}>Ponderacion</Text>
                  <Text style={styles.detalleInfoValue}>{sesion.quiz_ponderacion}</Text>
                </View>
                <View style={styles.detalleInfoRow}>
                  <Text style={styles.detalleInfoLabel}>Preguntas</Text>
                  <Text style={styles.detalleInfoValue}>{sesion.quiz_cantidad_preguntas}</Text>
                </View>
              </View>

              <View style={styles.detalleSection}>
                <Text style={styles.detalleSectionTitle}>Sesion</Text>
                <View style={styles.detalleInfoRow}>
                  <Text style={styles.detalleInfoLabel}>Materia</Text>
                  <Text style={styles.detalleInfoValue}>{sesion.materia.nombre} ({sesion.materia.codigo})</Text>
                </View>
                <View style={styles.detalleInfoRow}>
                  <Text style={styles.detalleInfoLabel}>Profesor</Text>
                  <Text style={styles.detalleInfoValue}>{profesorNombre}</Text>
                </View>
                <View style={styles.detalleInfoRow}>
                  <Text style={styles.detalleInfoLabel}>Inicio</Text>
                  <Text style={styles.detalleInfoValue}>{formatearFecha(sesion.fecha_inicio || '')}</Text>
                </View>
                <View style={styles.detalleInfoRow}>
                  <Text style={styles.detalleInfoLabel}>Fin</Text>
                  <Text style={styles.detalleInfoValue}>{formatearFecha(sesion.fecha_fin || '')}</Text>
                </View>
              </View>

              {participantesOrdenados.length > 0 && (
                <View style={styles.detalleSection}>
                  <Text style={styles.detalleSectionTitle}>Ranking ({participantesOrdenados.length})</Text>
                  <View style={[styles.detalleInfoRow, { marginBottom: 4 }]}>
                    <Text style={styles.detalleInfoLabel}>Promedio</Text>
                    <Text style={[styles.detalleInfoValue, { color: '#6366f1' }]}>{promedio.toFixed(1)}/{sesion.quiz_ponderacion}</Text>
                  </View>
                  <View style={[styles.detalleInfoRow, { marginBottom: 8 }]}>
                    <Text style={styles.detalleInfoLabel}>Mejor</Text>
                    <Text style={[styles.detalleInfoValue, { color: '#22c55e' }]}>{mejorNota}/{sesion.quiz_ponderacion}</Text>
                    <Text style={[styles.detalleInfoLabel, { marginLeft: 16 }]}>Peor</Text>
                    <Text style={[styles.detalleInfoValue, { color: '#ef4444' }]}>{peorNota}/{sesion.quiz_ponderacion}</Text>
                  </View>

                  <View style={styles.rankingHeader}>
                    <Text style={[styles.rankingHeaderText, { width: 30 }]}>#</Text>
                    <Text style={[styles.rankingHeaderText, { flex: 1 }]}>Nombre</Text>
                    <Text style={[styles.rankingHeaderText, { minWidth: 50, textAlign: 'right' }]}>Nota</Text>
                    <Text style={[styles.rankingHeaderText, { minWidth: 60, textAlign: 'right' }]}>Tiempo</Text>
                  </View>

                  {participantesOrdenados.map((p, idx) => (
                    <View key={p.usuario_id} style={styles.rankingRow}>
                      <View style={[styles.rankingPosition, {
                        backgroundColor: idx === 0 ? '#fbbf24' : idx === 1 ? '#94a3b8' : idx === 2 ? '#d97706' : '#e2e8f0'
                      }]}>
                        <Text style={[styles.rankingPositionText, { color: idx < 3 ? '#fff' : '#64748b' }]}>
                          {idx + 1}
                        </Text>
                      </View>
                      <Text style={styles.rankingName}>{p.nombre} {p.apellido}</Text>
                      <Text style={[styles.rankingNota, {
                        color: p.nota_final >= 70 ? '#22c55e' : p.nota_final >= 50 ? '#f59e0b' : '#ef4444'
                      }]}>{p.nota_final}/{sesion.quiz_ponderacion}</Text>
                      <Text style={styles.rankingTiempo}>{formatearTiempo(p.tiempo_total_ms)}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.detalleSection}>
                <Text style={styles.detalleSectionTitle}>Eventos ({sesion.eventos.length})</Text>
                {eventosOrdenados.map((evento, idx) => {
                  const color = colorEventoSesion(evento.tipo_operacion);
                  const icono = iconoEventoSesion(evento.tipo_operacion);
                  const label = labelEventoSesion(evento.tipo_operacion);
                  const esUltimo = idx === eventosOrdenados.length - 1;

                  return (
                    <View key={idx} style={styles.timelineEvent}>
                      <View style={[styles.timelineDot, { backgroundColor: color }]} />
                      {!esUltimo && <View style={styles.timelineLine} />}
                      <View style={styles.timelineContent}>
                        <Text style={[styles.timelineLabel, { color }]}>{label}</Text>
                        <Text style={styles.timelineUsuario}>
                          {evento.usuario?.nombre} {evento.usuario?.apellido}
                        </Text>
                        {evento.tipo_operacion === 'SESION_RESULTADO' && evento.nota_final !== undefined && (
                          <Text style={styles.timelineNota}>
                            Nota: {evento.nota_final}/{sesion.quiz_ponderacion}
                          </Text>
                        )}
                        <Text style={styles.timelineFecha}>{formatearFecha(evento.fecha_operacion)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.detalleModalFooter}>
              <TouchableOpacity
                style={[styles.detalleFooterButton, { backgroundColor: '#6366f1' }]}
                onPress={() => {
                  setDetalleSesionModalVisible(false);
                  router.push(`/resultados/sesion/${sesion.sesion_id}` as any);
                }}
              >
                <Ionicons name="bar-chart-outline" size={16} color="#fff" />
                <Text style={[styles.detalleFooterButtonText, { color: '#fff' }]}>Ver resultados completos</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  // Lista combinada de materias activas, inactivas y eliminadas con su historial
  const renderMateriasAuditoria = () => {
    const getFechaLimite = () => {
      const ahora = new Date();
      switch (filtroTiempo) {
        case 'dia': return new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
        case 'semana': return new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
        case 'mes': return new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
        case 'anio': return new Date(ahora.getTime() - 365 * 24 * 60 * 60 * 1000);
        default: return null;
      }
    };
    const fechaLimite = getFechaLimite();

    // Combinar materias activas/inactivas + eliminadas en una sola lista
    const todasLasMaterias: Array<{
      materia_id: string;
      nombre: string;
      codigo: string;
      activo: boolean;
      eliminada: boolean;
      fecha_creacion?: string;
      fecha_eliminacion?: string;
      eliminado_por?: any;
      profesor_actual: { id: number; nombre: string; apellido: string; email: string };
    }> = [];

    materiasAuditoria.forEach(m => {
      todasLasMaterias.push({
        materia_id: String(m.materia_id),
        nombre: m.nombre,
        codigo: m.codigo,
        activo: m.activo,
        eliminada: false,
        fecha_creacion: m.fecha_creacion,
        profesor_actual: m.profesor_actual,
      });
    });

    materiasEliminadas.forEach((m: any) => {
      todasLasMaterias.push({
        materia_id: String(m.mat_id),
        nombre: m.mat_nombre,
        codigo: m.mat_codigo,
        activo: false,
        eliminada: true,
        fecha_creacion: m.mat_fecha_creacion,
        fecha_eliminacion: m.mat_fecha_eliminacion,
        eliminado_por: m.mat_eliminado_por,
        profesor_actual: m.profesor || { id: 0, nombre: 'N/A', apellido: '', email: '' },
      });
    });

    // Construir un mapa de historial por materia_id
    const historialPorMateria: Record<string, MateriaHistorialItem[]> = {};
    (materiasHistorial || []).forEach(item => {
      const key = String(item.materia_id);
      if (!historialPorMateria[key]) historialPorMateria[key] = [];
      historialPorMateria[key].push(item);
    });

    // Filtrar materias
    const materiasFiltradas = todasLasMaterias.filter(materia => {
      // Filtro por búsqueda
      if (searchText) {
        const busqueda = searchText.toLowerCase();
        const coincide = (
          String(materia.nombre || '').toLowerCase().includes(busqueda) ||
          String(materia.codigo || '').toLowerCase().includes(busqueda) ||
          String(materia.profesor_actual?.nombre || '').toLowerCase().includes(busqueda) ||
          String(materia.profesor_actual?.apellido || '').toLowerCase().includes(busqueda)
        );
        if (!coincide) return false;
      }

      // Filtro por profesor
      if (filtroProfesor !== null) {
        if (materia.profesor_actual?.id !== filtroProfesor) return false;
      }

      // Filtro por estatus
      if (filtroEstatusMateria !== 'todos') {
        if (filtroEstatusMateria === 'activa' && (!materia.activo || materia.eliminada)) return false;
        if (filtroEstatusMateria === 'desactivada' && (materia.activo || materia.eliminada)) return false;
        if (filtroEstatusMateria === 'eliminada' && !materia.eliminada) return false;
      }

      // Filtro por tiempo (basado en historial de creación o fecha de eliminación)
      if (fechaLimite) {
        const historial = historialPorMateria[materia.materia_id] || [];
        const eventoCreacion = historial.find(h => h.tipo_operacion === 'MATERIA_CREACION');
        if (eventoCreacion) {
          const fechaCreacion = new Date(eventoCreacion.fecha_operacion);
          if (fechaCreacion < fechaLimite) return false;
        } else if (materia.eliminada && materia.fecha_eliminacion) {
          const fechaElim = new Date(materia.fecha_eliminacion);
          if (fechaElim < fechaLimite) return false;
        }
      }

      return true;
    });

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Reporte de Materias</Text>
          <Text style={styles.resultCount}>{materiasFiltradas.length} de {todasLasMaterias.length}</Text>
        </View>

        <View style={styles.pdfButtonContainer}>
          <TouchableOpacity
            style={styles.pdfButton}
            onPress={() => generarPDFMaterias(
              materiasFiltradas as any,
              historialPorMateria,
              {
                busqueda: searchText,
                profesor: filtroProfesor !== null ? `Profesor #${filtroProfesor}` : '',
                estatus: filtroEstatusMateria,
                tiempo: filtroTiempo
              }
            )}
            disabled={materiasFiltradas.length === 0}
          >
            <Text style={styles.pdfButtonText}>Generar PDF</Text>
          </TouchableOpacity>
        </View>

        {materiasFiltradas.length === 0 ? (
          <View style={styles.sesionesEmptyContainer}>
            <Ionicons name="book-outline" size={48} color="#cbd5e1" />
            <Text style={styles.sesionesEmptyText}>No hay materias que mostrar</Text>
          </View>
        ) : (
          materiasFiltradas.map((materia) => {
            const expandida = materiasExpandidas.has(materia.materia_id);
            const historial = historialPorMateria[materia.materia_id] || [];
            const historialOrdenado = [...historial].sort((a, b) => {
              const diff = new Date(a.fecha_operacion).getTime() - new Date(b.fecha_operacion).getTime();
              if (diff !== 0) return diff;
              const order: Record<string, number> = { MATERIA_CREACION: 0, MATERIA_MODIFICACION: 1, MATERIA_ELIMINACION: 2 };
              return (order[a.tipo_operacion] ?? 1) - (order[b.tipo_operacion] ?? 1);
            });

            const colorBadge = materia.eliminada ? '#ef4444' : materia.activo ? '#22c55e' : '#f97316';
            const labelBadge = materia.eliminada ? 'Eliminada' : materia.activo ? 'Activa' : 'Desactivada';
            const variantBadge = materia.eliminada ? 'danger' : materia.activo ? 'success' : 'warning';

            return (
              <Card key={materia.materia_id} style={styles.itemCard as any}>
                <View style={{ borderLeftWidth: 4, borderLeftColor: colorBadge, paddingLeft: 8 }}>
                  <TouchableOpacity onPress={() => toggleMateriaExpandida(materia.materia_id)} activeOpacity={0.7}>
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemTitle}>{materia.nombre}</Text>
                      <Badge text={labelBadge} variant={variantBadge as any} />
                    </View>
                    <View style={styles.itemMeta}>
                      <View style={styles.sesionCardMetaRow}>
                        <Ionicons name="code-outline" size={14} color="#64748b" />
                        <Text style={styles.sesionCardMetaText}>{materia.codigo}</Text>
                      </View>
                      <View style={styles.sesionCardMetaRow}>
                        <Ionicons name="calendar-outline" size={14} color="#64748b" />
                        <Text style={styles.sesionCardMetaText}>Fecha Creación: {formatearFechaUTC(materia.fecha_creacion || '')}</Text>
                      </View>
                      <View style={styles.sesionCardMetaRow}>
                        <Ionicons name="school-outline" size={14} color="#64748b" />
                        <Text style={styles.sesionCardMetaText}>Dictada por: {materia.profesor_actual?.nombre} {materia.profesor_actual?.apellido}</Text>
                      </View>
                    </View>

                    {materia.eliminada && materia.eliminado_por && (
                      <View style={[styles.itemMeta, { marginTop: 4 }]}>
                        <View style={styles.sesionCardMetaRow}>
                          <Ionicons name="trash-outline" size={14} color="#ef4444" />
                          <Text style={[styles.sesionCardMetaText, { color: '#ef4444' }]}>
                            Eliminado por: {materia.eliminado_por.nombre} {materia.eliminado_por.apellido}
                          </Text>
                        </View>
                        {materia.fecha_eliminacion && (
                          <View style={styles.sesionCardMetaRow}>
                            <Ionicons name="calendar-outline" size={14} color="#ef4444" />
                            <Text style={[styles.sesionCardMetaText, { color: '#ef4444' }]}>
                              {formatearFechaUTC(materia.fecha_eliminacion)}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.sesionExpandButton} onPress={() => toggleMateriaExpandida(materia.materia_id)}>
                    <Text style={styles.sesionExpandText}>
                      {expandida ? 'Ocultar historial' : 'Ver historial'}
                    </Text>
                    <Ionicons name={expandida ? 'chevron-up' : 'chevron-down'} size={16} color="#6366f1" />
                  </TouchableOpacity>

                  {expandida && historialOrdenado.length === 0 && (
                    <View style={styles.timelineContainer}>
                      <Text style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 12 }}>
                        Sin eventos registrados
                      </Text>
                    </View>
                  )}

                  {expandida && historialOrdenado.length > 0 && (
                    <View style={styles.timelineContainer}>
                      {historialOrdenado.map((evento, idx) => {
                        const label = labelEventoMateria(evento.tipo_operacion, evento.datos_anteriores, evento.datos_nuevos);
                        const color = colorEventoMateriaDetallado(evento.tipo_operacion, evento.datos_anteriores, evento.datos_nuevos);
                        const icono = iconoEventoMateriaDetallado(evento.tipo_operacion, evento.datos_anteriores, evento.datos_nuevos);
                        const esUltimo = idx === historialOrdenado.length - 1;

                        // Calcular qué cambió en modificaciones
                        let cambiosResumen: string[] = [];
                        if (evento.tipo_operacion === 'MATERIA_MODIFICACION' && evento.datos_anteriores && evento.datos_nuevos) {
                          const camposAMostrar = ['nombre', 'codigo', 'profesor_id'];
                          camposAMostrar.forEach(campo => {
                            const anterior = evento.datos_anteriores![campo];
                            const nuevo = evento.datos_nuevos![campo];
                            if (anterior !== undefined && nuevo !== undefined && String(anterior) !== String(nuevo)) {
                              let labelCampo = campo;
                              if (campo === 'nombre') labelCampo = 'nombre';
                              else if (campo === 'codigo') labelCampo = 'código';
                              else if (campo === 'profesor_id') {
                                labelCampo = 'profesor';
                                const nombreAnt = evento.datos_anteriores?.profesor_nombre || `ID: ${anterior}`;
                                const nombreNue = evento.datos_nuevos?.profesor_nombre || `ID: ${nuevo}`;
                                cambiosResumen.push(`${labelCampo}: ${nombreAnt} → ${nombreNue}`);
                                return;
                              }
                              else if (campo === 'activo') labelCampo = 'estado';
                              cambiosResumen.push(`${labelCampo}: ${anterior} → ${nuevo}`);
                            }
                          });
                        }

                        return (
                          <View key={idx} style={styles.timelineEvent}>
                            <View style={[styles.timelineDot, { backgroundColor: color }]} />
                            {!esUltimo && <View style={styles.timelineLine} />}
                            <View style={styles.timelineContent}>
                              <Text style={[styles.timelineLabel, { color }]}>{label}</Text>
                              {evento.tipo_operacion === 'MATERIA_CREACION' && (
                                <Text style={styles.timelineUsuario}>
                                  Profesor: {evento.usuario?.nombre} {evento.usuario?.apellido}
                                </Text>
                              )}
                              {cambiosResumen.length > 0 && (
                                <View style={{ marginTop: 4 }}>
                                  {cambiosResumen.map((cambio, i) => (
                                    <Text key={i} style={{ fontSize: 12, color: '#475569', marginLeft: 8 }}>· {cambio}</Text>
                                  ))}
                                </View>
                              )}
                              <Text style={styles.timelineFecha}>{formatearFechaUTC(evento.fecha_operacion)}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </Card>
            );
          })
        )}
      </View>
    );
  };

  // Modal que muestra el detalle de un quiz o su historial de auditoria
  const renderQuizDetalleModal = () => (
    <Modal
      visible={quizDetalleVisible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.quizDetalleModalContainer}>
        <View style={styles.quizDetalleModalHeader}>
          <Text style={styles.quizDetalleModalTitle}>
            {quizDetalleData?.operaciones ? 'Detalle de Auditoría' : 'Detalle del Quiz'}
          </Text>
          <TouchableOpacity onPress={() => setQuizDetalleVisible(false)}>
            <Text style={styles.quizDetalleModalCloseButton}>✕</Text>
          </TouchableOpacity>
        </View>

        {loadingQuizDetalle ? (
          <View style={styles.quizDetalleModalContent}>
            <Text>Cargando...</Text>
          </View>
        ) : quizDetalleData?.operaciones ? (
          // --- MODO AUDITORÍA: Timeline de operaciones ---
          <ScrollView style={styles.quizDetalleModalContent}>
            <Text style={styles.sectionTitle}>{quizDetalleData.titulo}</Text>
            <Text style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              {quizDetalleData.operaciones.length} operación(es) en el historial de auditoría
            </Text>

            {(quizDetalleData.operaciones as any[]).map((op: any, idx: number) => {
              const tipoOp = op.tipo_operacion || '';
              const color = colorOperacion(tipoOp);
              const icono = iconoOperacion(tipoOp);
              const label = labelOperacion(tipoOp);
              const profNombre = op.usuario?.nombre || 'Desconocido';
              const profApellido = op.usuario?.apellido || '';
              const materiaNombre = op.materia?.nombre || op.detalles?.materia?.nombre || 'Sin materia';
              const fechaOp = formatearFecha(op.fecha_operacion);
              const mensaje = op.detalles?.mensaje_descriptivo || op.detalles?.accion || '';

              const ant = op.cambio?.datos_anteriores;
              const nue = op.cambio?.datos_nuevos;
              const esMod = esOperacion(tipoOp, 'mod');

              return (
                <Card key={idx} style={{ marginBottom: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: color }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name={icono as any} size={20} color={color} style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 15, fontWeight: 'bold', color }}>{label}</Text>
                  </View>

                  {mensaje ? (
                    <Text style={{ fontSize: 13, color: '#555', fontStyle: 'italic', marginBottom: 8 }}>{mensaje}</Text>
                  ) : null}

                  <View style={{ marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: '#666' }}>👨‍🏫 {profNombre} {profApellido}</Text>
                    <Text style={{ fontSize: 12, color: '#666' }}>📚 {materiaNombre}</Text>
                    <Text style={{ fontSize: 12, color: '#666' }}>
                      📝 {op.cantidad_preguntas ?? op.detalles?.cantidad_preguntas ?? 0} preguntas
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#999', fontStyle: 'italic' }}>{fechaOp}</Text>

                  {ant && nue && esMod ? (
                    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee' }}>
                      <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#333', marginBottom: 6 }}>📊 Cambios realizados:</Text>
                      {(() => {
                        const cambios: string[] = [];
                        const oldD = ant.metadatos || ant;
                        const newD = nue.metadatos || nue;
                        if (oldD.titulo !== newD.titulo) cambios.push(`Título: "${oldD.titulo || 'N/A'}" → "${newD.titulo || 'N/A'}"`);
                        const oldCount = oldD.cantidad_preguntas ?? oldD.preguntas?.length ?? 0;
                        const newCount = newD.cantidad_preguntas ?? newD.preguntas?.length ?? 0;
                        if (oldCount !== newCount) cambios.push(`Preguntas: ${oldCount} → ${newCount}`);
                        if (oldD.tema !== newD.tema) cambios.push(`Tema: "${oldD.tema || 'N/A'}" → "${newD.tema || 'N/A'}"`);
                        return cambios.length > 0
                          ? cambios.map((c, i) => <Text key={i} style={{ fontSize: 12, color: '#333', marginBottom: 2 }}>• {c}</Text>)
                          : <Text style={{ fontSize: 12, color: '#666' }}>• Cambios en preguntas u otros detalles</Text>;
                      })()}
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </ScrollView>
        ) : quizDetalleData ? (
          // --- MODO API: Detalle original del quiz ---
          <ScrollView style={styles.quizDetalleModalContent}>
            <Text style={styles.sectionTitle}>{quizDetalleData.quiz?.titulo}</Text>
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>Información del Quiz:</Text>
              <Text style={styles.subItemText}>👨‍🏫 Creado por: {quizDetalleData.quiz?.creador?.nombre} {quizDetalleData.quiz?.creador?.apellido}</Text>
              <Text style={styles.subItemText}>📚 Materia: {quizDetalleData.quiz?.materia?.nombre || 'Sin materia'}</Text>
              <Text style={styles.subItemText}>📅 Fecha: {formatearFechaUTC(quizDetalleData.quiz?.fecha_creacion)}</Text>
              <Text style={styles.subItemText}>❓ Preguntas: {quizDetalleData.quiz?.cantidad_preguntas || 0}</Text>
            </View>
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>📊 Estadísticas:</Text>
              <Text style={styles.subItemText}>👥 Participantes: {quizDetalleData.estadisticas?.participantes_total || 0}</Text>
              <Text style={styles.subItemText}>✅ Finalizados: {quizDetalleData.estadisticas?.participantes_finalizados || 0}</Text>
            </View>
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>📋 Estudiantes que presentaron el quiz:</Text>
              {quizDetalleData.resultados?.length > 0 ? (
                quizDetalleData.resultados.map((resultado: any, idx: number) => (
                  <View key={idx} style={styles.subItem}>
                    <Text style={styles.subItemText}>👤 {resultado.usuario?.nombre} {resultado.usuario?.apellido}</Text>
                    <Text style={styles.subItemDate}>📝 Nota: {resultado.nota_final} |  {formatearFechaUTC(resultado.fecha_completado)}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.noDataText}>No hay estudiantes que hayan presentado este quiz</Text>
              )}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.quizDetalleModalContent}>
            <Text style={styles.emptyText}>No hay datos disponibles</Text>
          </View>
        )}
      </View>
    </Modal>
  );



  const [usuarioModalVisible, setUsuarioModalVisible] = React.useState(false);
  const [usuarioModalData, setUsuarioModalData] = React.useState<UsuarioAuditoria | null>(null);

  // Mapea tipos de operacion de usuario a icono y color
  const labelIconoAccionUsuario = (tipo: string) => {
    const t = tipo.toLowerCase();
    if (t === 'usuario_login') return { icon: 'log-in-outline' as const, color: '#3b82f6' };
    if (t === 'usuario_logout') return { icon: 'log-out-outline' as const, color: '#6366f1' };
    if (t === 'usuario_creacion') return { icon: 'person-add-outline' as const, color: '#16a34a' };
    if (t === 'usuario_modificacion') return { icon: 'create-outline' as const, color: '#d97706' };
    if (t === 'usuario_desactivacion') return { icon: 'ban-outline' as const, color: '#f97316' };
    if (t === 'usuario_eliminacion') return { icon: 'trash-outline' as const, color: '#dc2626' };
    if (t === 'logro_obtenido') return { icon: 'trophy-outline' as const, color: '#eab308' };
    if (t === 'sesion_inicio') return { icon: 'play-circle-outline' as const, color: '#8b5cf6' };
    if (t === 'sesion_resultado') return { icon: 'checkmark-circle-outline' as const, color: '#22c55e' };
    if (t === 'sesion_creacion') return { icon: 'add-circle-outline' as const, color: '#16a34a' };
    if (t === 'sesion_modificacion') return { icon: 'pause-circle-outline' as const, color: '#f97316' };
    if (t === 'sesion_eliminacion') return { icon: 'close-circle-outline' as const, color: '#dc2626' };
    if (t === 'quiz_creacion') return { icon: 'document-text-outline' as const, color: '#16a34a' };
    if (t === 'quiz_modificacion') return { icon: 'document-text-outline' as const, color: '#d97706' };
    if (t === 'quiz_eliminacion') return { icon: 'document-text-outline' as const, color: '#dc2626' };
    if (t.includes('materia')) return { icon: 'book-outline' as const, color: '#0ea5e9' };
    if (t.includes('seguridad') || t.includes('intento')) return { icon: 'shield-outline' as const, color: '#ef4444' };
    if (t.includes('pdf')) return { icon: 'document-outline' as const, color: '#0ea5e9' };
    return { icon: 'ellipse-outline' as const, color: '#6b7280' };
  };

  // Genera texto descriptivo de cada accion segun su tipo y contexto
  const descripcionAccion = (acc: AccionReciente, usuarioIdActual?: number) => {
    const t = acc.tipo_operacion;
    const d = acc.detalles || {};
    const actorId = acc.usuario?.id;
    const esActor = usuarioIdActual !== undefined && actorId === usuarioIdActual;
    const esTarget = usuarioIdActual !== undefined && acc.entidad?.id === String(usuarioIdActual);

    if (t === 'USUARIO_CREACION') return 'Se registró en la plataforma';
    if (t === 'USUARIO_LOGIN') return 'Inició sesión';
    if (t === 'USUARIO_LOGOUT') return 'Cerró sesión';

    if (t === 'USUARIO_MODIFICACION') {
      if (esActor && !esTarget) {
        const target = d.usuario_afectado;
        return target ? `Modificó el perfil de ${target.nombre} ${target.apellido || ''}` : 'Modificó un perfil';
      }
      if (esTarget && !esActor) {
        const actor = acc.usuario;
        return actor ? `Su perfil fue modificado por ${actor.nombre} ${actor.apellido || ''}` : 'Su perfil fue modificado';
      }
      if (esActor && esTarget) return 'Modificó su propio perfil';
      return 'Perfil modificado';
    }

    if (t === 'USUARIO_DESACTIVACION') {
      const activar = acc.cambio?.datos_nuevos?.activo === true;
      if (esActor && !esTarget) {
        const target = d.usuario_afectado;
        const nombre = target ? `${target.nombre} ${target.apellido || ''}` : 'un usuario';
        return activar ? `Activó la cuenta de ${nombre}` : `Desactivó la cuenta de ${nombre}`;
      }
      if (esTarget && !esActor) {
        const actor = acc.usuario;
        const por = actor ? ` por ${actor.nombre} ${actor.apellido || ''}` : '';
        return activar ? `Su cuenta fue activada${por}` : `Su cuenta fue desactivada${por}`;
      }
      return activar ? 'Cuenta activada' : 'Cuenta desactivada';
    }

    if (t === 'USUARIO_ELIMINACION') {
      if (esActor && !esTarget) {
        const target = d.usuario_afectado;
        return target ? `Eliminó a ${target.nombre} ${target.apellido || ''}` : 'Eliminó un usuario';
      }
      if (esTarget && !esActor) {
        const actor = acc.usuario;
        return actor ? `Su cuenta fue eliminada por ${actor.nombre} ${actor.apellido || ''}` : 'Su cuenta fue eliminada';
      }
      return 'Usuario eliminado';
    }

    if (t === 'LOGRO_OBTENIDO') {
      const nombre = d.logro_nombre || d.logro_codigo || 'Logro';
      return `Obtuvo el logro "${nombre}"`;
    }
    if (t === 'SESION_INICIO') {
      const quiz = d.quiz_titulo || 'Quiz';
      const codigo = d.codigo_acceso ? ` (Código: ${d.codigo_acceso})` : '';
      const materia = d.materia_nombre ? ` — ${d.materia_nombre}` : '';
      const prof = d.profesor_nombre ? ` · Prof: ${d.profesor_nombre}` : '';
      return `Ingresó a "${quiz}"${codigo}${materia}${prof}`;
    }
    if (t === 'SESION_RESULTADO') {
      const quiz = d.quiz_titulo || 'Quiz';
      const nota = d.nota_final;
      const escala = d.escala_puntuacion || 100;
      const repeticion = d.es_repeticion ? ' (repetición)' : '';
      if (nota !== undefined && nota !== null) {
        return `Completó "${quiz}" — Nota: ${nota}/${escala}${repeticion}`;
      }
      return `Completó "${quiz}"${repeticion}`;
    }
    if (t === 'SESION_CREACION') {
      const codigo = d.codigo_acceso || '';
      const quiz = d.quiz_titulo || '';
      return `Creó sesión${quiz ? ` "${quiz}"` : ''}${codigo ? ` (Código: ${codigo})` : ''}`;
    }
    if (t === 'SESION_MODIFICACION') {
      const codigo = d.codigo_acceso || acc.cambio?.datos_nuevos?.codigo_acceso || '';
      const quiz = d.quiz_titulo || '';
      return `Desactivó sesión${quiz ? ` "${quiz}"` : ''}${codigo ? ` (Código: ${codigo})` : ''}`;
    }
    if (t === 'SESION_ELIMINACION') {
      const codigo = d.codigo_acceso || '';
      const quiz = d.quiz_titulo || '';
      return `Eliminó sesión${quiz ? ` "${quiz}"` : ''}${codigo ? ` (Código: ${codigo})` : ''}`;
    }
    if (t === 'QUIZ_CREACION') {
      const quiz = d.quiz_titulo || 'Quiz';
      const mat = d.materia_nombre || d.materia?.nombre || '';
      return `Creó quiz "${quiz}"${mat ? ` — ${mat}` : ''}`;
    }
    if (t === 'QUIZ_MODIFICACION') {
      const quiz = d.quiz_titulo || 'Quiz';
      return `Modificó quiz "${quiz}"`;
    }
    if (t === 'QUIZ_ELIMINACION') {
      const quiz = d.quiz_titulo || 'Quiz';
      return `Eliminó quiz "${quiz}"`;
    }
    if (t === 'MATERIA_CREACION') {
      const mat = d.materia_nombre || '';
      const cod = d.materia_codigo ? ` (${d.materia_codigo})` : '';
      if (esActor) return `Creó materia: ${mat}${cod}`;
      return `Le fue asignada la materia: ${mat}${cod}`;
    }
    if (t === 'MATERIA_MODIFICACION') {
      const mat = d.materia_nombre || '';
      if (esActor) return `Modificó materia: ${mat}`;
      return `Su materia "${mat}" fue modificada`;
    }
    if (t === 'MATERIA_ELIMINACION') {
      const mat = d.materia_nombre || '';
      return `Eliminó materia: ${mat}`;
    }
    if (t === 'PDF_GENERACION') {
      const tipo = d.tipo_pdf || 'reporte';
      return `Generó PDF: ${tipo}`;
    }

    return d.mensaje_descriptivo || acc.nombre_operacion || acc.tipo_operacion;
  };

  // Lista de usuarios con filtros, estadisticas y acciones recientes
  const renderUsuariosAuditoria = () => {
    const usuariosFiltrados = usuariosAuditoria.filter(u => {
      if (filtroRolUsuario !== 'todos') {
        const roles = { profesor: 2, alumno: 1, admin: 3 };
        if (u.usuario.rol_id !== roles[filtroRolUsuario]) return false;
      }
      if (filtroEstadoUsuario !== 'todos') {
        if (filtroEstadoUsuario === 'activo' && (u.usuario.eliminado || !u.usuario.activo)) return false;
        if (filtroEstadoUsuario === 'inactivo' && (u.usuario.eliminado || u.usuario.activo)) return false;
        if (filtroEstadoUsuario === 'eliminados' && !u.usuario.eliminado) return false;
      }
      const fechaLimite = (() => {
        if (filtroTiempo === 'todos') return null;
        const ahora = new Date();
        switch (filtroTiempo) {
          case 'dia': return new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
          case 'semana': return new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
          case 'mes': return new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
          case 'anio': return new Date(ahora.getTime() - 365 * 24 * 60 * 60 * 1000);
          default: return null;
        }
      })();
      if (fechaLimite && u.ultima_actividad && new Date(u.ultima_actividad) < fechaLimite) return false;
      if (searchText) {
        const busqueda = searchText.toLowerCase();
        const p = u.usuario;
        if (!p.nombre.toLowerCase().includes(busqueda) &&
            !(p.apellido || '').toLowerCase().includes(busqueda) &&
            !p.email.toLowerCase().includes(busqueda)) return false;
      }
      return true;
    });

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>👥 Auditoría de Usuarios</Text>
          <Text style={styles.resultCount}>{usuariosFiltrados.length} de {usuariosAuditoria.length}</Text>
        </View>

        <View style={styles.pdfButtonContainer}>
          <TouchableOpacity
            style={styles.pdfButton}
            disabled={usuariosFiltrados.length === 0}
            onPress={() => generarPDFUsuarios(usuariosFiltrados, { busqueda: searchText, rol: filtroRolUsuario, estado: filtroEstadoUsuario, tiempo: filtroTiempo })}
          >
            <Text style={styles.pdfButtonText}>Generar PDF</Text>
          </TouchableOpacity>
        </View>

        {loadingUsuarios ? (
          <Text style={styles.loadingText}>Cargando usuarios...</Text>
        ) : usuariosFiltrados.length === 0 ? (
          <Text style={styles.noDataText}>No hay usuarios que coincidan con los filtros</Text>
        ) : (
          usuariosFiltrados.map((user) => {
            const ultAct = user.ultima_actividad;
            const ultAcciones = (user.acciones_recientes || []).slice(0, 3);
            const rolColor = user.usuario.rol_id === 3 ? '#7c3aed' :
                            user.usuario.rol_id === 2 ? '#2563eb' : '#059669';
            const rolLabel = user.usuario.rol_id === 3 ? '🛡️ Admin' :
                            user.usuario.rol_id === 2 ? '🎓 Prof' : '📖 Alum';
            const materias = (user as any).materias || [];

            return (
              <Card key={user.usuario.id} style={{
                marginBottom: 12, padding: 16,
                opacity: user.usuario.eliminado ? 0.65 : 1,
                borderLeftWidth: 3,
                borderLeftColor: user.usuario.eliminado ? '#dc2626' : '#e2e8f0',
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12, overflow: 'hidden', backgroundColor: '#e2e8f0', flexShrink: 0 }}>
                      {user.usuario.imagen ? (
                        <AppImage uri={user.usuario.imagen} style={{ width: 48, height: 48 }} />
                      ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: rolColor + '20' }}>
                          <Text style={{ fontSize: 18, fontWeight: 'bold', color: rolColor }}>
                            {user.usuario.nombre?.[0]}{user.usuario.apellido?.[0] || ''}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#1e293b' }}>
                          {user.usuario.nombre} {user.usuario.apellido}
                        </Text>
                        <View style={{ backgroundColor: `${rolColor}15`, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 }}>
                          <Text style={{ fontSize: 10, color: rolColor, fontWeight: '600' }}>{rolLabel}</Text>
                        </View>
                        {user.usuario.eliminado && (
                          <View style={{ backgroundColor: '#fef2f2', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 4, borderWidth: 1, borderColor: '#fecaca' }}>
                            <Text style={{ fontSize: 10, color: '#dc2626', fontWeight: '600' }}>🗑️ Eliminado</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 12, color: '#666' }}>{user.usuario.email}</Text>
                    </View>
                  </View>
                  {!user.usuario.eliminado && (
                    <Badge text={user.usuario.activo ? 'Activo' : 'Inactivo'}
                      variant={user.usuario.activo ? 'success' : 'danger'} />
                  )}
                </View>

                {/* Profesor stats */}
                {user.usuario.rol_id === 2 && (
                  <>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                      <View style={{ backgroundColor: '#eff6ff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 11, color: '#1d4ed8' }}>📝 {user.estadisticas.total_quizes_creados || 0} quices</Text>
                      </View>
                      <View style={{ backgroundColor: '#f5f3ff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 11, color: '#6b21a8' }}>🎯 {user.estadisticas.total_sesiones || 0} sesiones</Text>
                      </View>
                      <View style={{ backgroundColor: '#f0fdf4', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 11, color: '#166534' }}>👥 {user.estadisticas.total_participantes || 0} eval.</Text>
                      </View>
                    </View>
                    {materias.length > 0 && (
                      <Text style={{ fontSize: 11, color: '#92400e', marginBottom: 6 }}>
                        📚 {materias.map((m: any) => m.nombre).join(', ')}
                      </Text>
                    )}
                  </>
                )}

                {/* Alumno stats */}
                {user.usuario.rol_id === 1 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                    <View style={{ backgroundColor: '#f0fdf4', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 11, color: '#166534' }}>📝 {user.estadisticas.total_quices_realizados || 0} quizzes</Text>
                    </View>
                    <View style={{ backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 11, color: '#92400e' }}>⭐ {user.usuario.puntos_app} pts</Text>
                    </View>
                    <View style={{ backgroundColor: '#eff6ff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 11, color: '#1d4ed8' }}>📊 {user.estadisticas.promedio_nota || 0}/20</Text>
                    </View>
                  </View>
                )}

                {/* Admin */}
                {user.usuario.rol_id === 3 && (
                  <View style={{ marginBottom: 6 }}>
                    <View style={{ backgroundColor: '#f0f9ff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' }}>
                      <Text style={{ fontSize: 11, color: '#1e40af' }}>🛡️ Administrador del sistema</Text>
                    </View>
                  </View>
                )}

                {ultAct && (
                  <Text style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
                    🕐 Última actividad: {formatearFecha(ultAct)}
                  </Text>
                )}

                {ultAcciones.length > 0 && (
                  <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 6, marginBottom: 6 }}>
                    {ultAcciones.map((acc, idx) => {
                      const estilo = labelIconoAccionUsuario(acc.tipo_operacion);
                      const desc = descripcionAccion(acc, user.usuario.id);
                      return (
                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                          <Ionicons name={estilo.icon} size={11} color={estilo.color} style={{ marginRight: 4 }} />
                          <Text style={{ fontSize: 11, color: '#475569', flex: 1 }} numberOfLines={1}>
                            {desc || acc.nombre_operacion || acc.tipo_operacion}
                          </Text>
                          <Text style={{ fontSize: 10, color: '#94a3b8' }}>{formatearFecha(acc.fecha_operacion)}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center' }}
                  onPress={() => {
                    setUsuarioModalData(user);
                    setUsuarioModalVisible(true);
                  }}
                >
                  <Ionicons name="search-outline" size={13} color="#3b82f6" style={{ marginRight: 4 }} />
                  <Text style={{ fontSize: 12, color: '#3b82f6', fontWeight: '500' }}>Ver historial completo →</Text>
                </TouchableOpacity>
              </Card>
            );
          })
        )}
      </View>
    );
  };

  // Modal con la linea de tiempo completa de un usuario
  const renderHistorialUsuarioModal = () => (
    <Modal visible={usuarioModalVisible} animationType="slide" presentationStyle="pageSheet"
      onRequestClose={() => setUsuarioModalVisible(false)}>
      <View style={styles.quizDetalleModalContainer}>
        <View style={styles.quizDetalleModalHeader}>
          <Text style={styles.quizDetalleModalTitle}>Historial completo</Text>
          <TouchableOpacity onPress={() => setUsuarioModalVisible(false)}>
            <Text style={styles.quizDetalleModalCloseButton}>✕</Text>
          </TouchableOpacity>
        </View>
        {usuarioModalData ? (
          <ScrollView style={styles.quizDetalleModalContent}>
            <Text style={{ fontSize: 17, fontWeight: 'bold', color: '#1e293b', marginBottom: 2 }}>
              {usuarioModalData.usuario.nombre} {usuarioModalData.usuario.apellido}
            </Text>
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>{usuarioModalData.usuario.email}</Text>
            {usuarioModalData.usuario.eliminado && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef2f2', borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#fecaca' }}>
                <Ionicons name="trash-outline" size={16} color="#dc2626" style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: '#991b1b', fontWeight: '600' }}>Usuario eliminado</Text>
                  {usuarioModalData.usuario.fecha_eliminacion && (
                    <Text style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                      Eliminado el {formatearFecha(usuarioModalData.usuario.fecha_eliminacion)}
                    </Text>
                  )}
                </View>
              </View>
            )}
            <View style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#1e3a8a', marginBottom: 8 }}>📊 Resumen</Text>
              {usuarioModalData.usuario.rol_id === 2 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                  <View><Text style={{ fontSize: 11, color: '#666' }}>Quices creados</Text><Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1e293b' }}>{usuarioModalData.estadisticas.total_quizes_creados || 0}</Text></View>
                  <View><Text style={{ fontSize: 11, color: '#666' }}>Sesiones</Text><Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1e293b' }}>{usuarioModalData.estadisticas.total_sesiones || 0}</Text></View>
                  <View><Text style={{ fontSize: 11, color: '#666' }}>Participantes</Text><Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1e293b' }}>{usuarioModalData.estadisticas.total_participantes || 0}</Text></View>
                </View>
              )}
              {usuarioModalData.usuario.rol_id === 1 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                  <View><Text style={{ fontSize: 11, color: '#666' }}>Quices realizados</Text><Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1e293b' }}>{usuarioModalData.estadisticas.total_quices_realizados || 0}</Text></View>
                  <View><Text style={{ fontSize: 11, color: '#666' }}>Promedio</Text><Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1e293b' }}>{usuarioModalData.estadisticas.promedio_nota || 0}/20</Text></View>
                  <View><Text style={{ fontSize: 11, color: '#666' }}>Puntos</Text><Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1e293b' }}>{usuarioModalData.usuario.puntos_app}</Text></View>
                </View>
              )}
              {usuarioModalData.usuario.rol_id === 3 && (
                <Text style={{ fontSize: 13, color: '#666' }}>🛡️ Administrador del sistema</Text>
              )}
            </View>
            {((usuarioModalData.historial_completo || usuarioModalData.acciones_recientes || [])).length > 0 && (
              <>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1e3a8a', marginBottom: 8 }}>
                  🕐 Línea de tiempo ({(usuarioModalData.historial_completo || usuarioModalData.acciones_recientes || []).length})
                </Text>
                <ScrollView style={{ maxHeight: 320, borderRadius: 8 }} nestedScrollEnabled={true}>
                  {(usuarioModalData.historial_completo || usuarioModalData.acciones_recientes || []).map((acc, idx) => {
                    const estilo = labelIconoAccionUsuario(acc.tipo_operacion);
                    const desc = descripcionAccion(acc, usuarioModalData.usuario.id);
                    const campos = acc.detalles?.campos_modificados;
                    const notaFinal = acc.detalles?.nota_final;
                    const escala = acc.detalles?.escala_puntuacion;
                    const logroNombre = acc.detalles?.logro_nombre;
                    const codigoAcceso = acc.detalles?.codigo_acceso;
                    const quizTitulo = acc.detalles?.quiz_titulo;
                    const materiaNombre = acc.detalles?.materia_nombre;
                    return (
                      <View key={idx} style={{ backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 8,
                        borderLeftWidth: 3, borderLeftColor: estilo.color }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                          <Ionicons name={estilo.icon} size={14} color={estilo.color} style={{ marginRight: 6 }} />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: estilo.color, flex: 1 }}>
                            {acc.tipo_operacion === 'USUARIO_DESACTIVACION'
                              ? (acc.cambio?.datos_nuevos?.activo === true ? 'Activación de usuario' : 'Desactivación de usuario')
                              : (acc.nombre_operacion || acc.tipo_operacion)}
                          </Text>
                          <Text style={{ fontSize: 10, color: '#94a3b8' }}>{formatearFecha(acc.fecha_operacion)}</Text>
                        </View>
                        {desc && (
                          <Text style={{ fontSize: 11, color: '#475569', marginLeft: 20, marginTop: 2 }}>
                            {desc}
                          </Text>
                        )}
                        {notaFinal !== undefined && notaFinal !== null && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 20, marginTop: 4, gap: 6 }}>
                            <View style={{ backgroundColor: (notaFinal / (escala || 100)) >= 0.75 ? '#dcfce7' : (notaFinal / (escala || 100)) >= 0.5 ? '#fef9c3' : '#fee2e2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: (notaFinal / (escala || 100)) >= 0.75 ? '#166534' : (notaFinal / (escala || 100)) >= 0.5 ? '#854d0e' : '#991b1b' }}>
                                Nota: {notaFinal}/{escala || 100}
                              </Text>
                            </View>
                            {acc.detalles?.es_repeticion && (
                              <View style={{ backgroundColor: '#f3e8ff', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 10, color: '#6b21a8' }}>Repetición</Text>
                              </View>
                            )}
                          </View>
                        )}
                        {logroNombre && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 20, marginTop: 4, backgroundColor: '#fef9c7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                            <Ionicons name="trophy-outline" size={12} color="#ca8a04" style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 11, color: '#854d0e', fontWeight: '500' }}>{logroNombre}</Text>
                            {acc.detalles?.puntos_recompensa && (
                              <Text style={{ fontSize: 10, color: '#a16207', marginLeft: 6 }}>+{acc.detalles.puntos_recompensa} pts</Text>
                            )}
                          </View>
                        )}
                        {codigoAcceso && ['SESION_INICIO', 'SESION_CREACION', 'SESION_MODIFICACION', 'SESION_ELIMINACION'].includes(acc.tipo_operacion) && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 20, marginTop: 3, gap: 8 }}>
                            <Text style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>Código: {codigoAcceso}</Text>
                            {materiaNombre && <Text style={{ fontSize: 10, color: '#6b7280' }}>{materiaNombre}</Text>}
                          </View>
                        )}
                        {acc.tipo_operacion === 'USUARIO_MODIFICACION' && acc.cambio?.datos_nuevos ? (
                          <View style={{ marginLeft: 20, marginTop: 4 }}>
                            {Object.entries(acc.cambio.datos_nuevos)
                              .filter(([_, v]: [string, any]) => v && typeof v === 'object' && 'anterior' in v)
                              .map(([campo, valores]: [string, any]) => (
                                <View key={campo} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                                  <Text style={{ fontSize: 11, color: '#555', flex: 1 }}>
                                    {formatearCampoAuditoria(campo)}:{' '}
                                  </Text>
                                  {campo === 'usu_imagen' ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                      {valores.anterior ? (
                                        <AppImage uri={valores.anterior} style={{ width: 20, height: 20, borderRadius: 10, marginRight: 4 }} />
                                      ) : (
                                        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#e0e0e0', marginRight: 4, alignItems: 'center', justifyContent: 'center' }}>
                                          <Text style={{ fontSize: 8 }}>📷</Text>
                                        </View>
                                      )}
                                      <Text style={{ fontSize: 9, color: '#999' }}>→</Text>
                                      {valores.nuevo ? (
                                        <AppImage uri={valores.nuevo} style={{ width: 20, height: 20, borderRadius: 10, marginLeft: 4 }} />
                                      ) : (
                                        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#e0e0e0', marginLeft: 4, alignItems: 'center', justifyContent: 'center' }}>
                                          <Text style={{ fontSize: 8 }}>📷</Text>
                                        </View>
                                      )}
                                    </View>
                                  ) : (
                                    <Text style={{ fontSize: 11, color: '#333' }}>
                                      <Text style={{ color: '#999' }}>{formatearValorAuditoria(campo, valores.anterior)}</Text>
                                      {' → '}
                                      <Text style={{ fontWeight: '600' }}>{formatearValorAuditoria(campo, valores.nuevo)}</Text>
                                    </Text>
                                  )}
                                </View>
                              ))}
                          </View>
                        ) : campos && (
                          <Text style={{ fontSize: 10, color: '#666', marginLeft: 22, marginTop: 1 }}>
                            Cambió: {campos.join(', ')}
                          </Text>
                        )}
                        {acc.tipo_operacion === 'USUARIO_ELIMINACION' && (
                          <View style={{ marginLeft: 22, marginTop: 4, padding: 8, backgroundColor: '#fef2f2', borderRadius: 6, borderLeftWidth: 2, borderLeftColor: '#dc2626' }}>
                            <Text style={{ fontSize: 11, color: '#991b1b', fontWeight: '600' }}>
                              Este usuario fue eliminado del sistema
                            </Text>
                            {acc.detalles?.usuario_afectado?.nombre && (
                              <Text style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                                Nombre: {acc.detalles.usuario_afectado.nombre} {acc.detalles.usuario_afectado.apellido || ''}
                              </Text>
                            )}
                            {acc.detalles?.usuario_afectado?.email && (
                              <Text style={{ fontSize: 11, color: '#666' }}>
                                Email: {acc.detalles.usuario_afectado.email}
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* Materias (solo profesor) */}
            {usuarioModalData.usuario.rol_id === 2 && (
              (() => {
                const materias = (usuarioModalData as any).materias || [];
                return materias.length > 0 ? (
                  <View style={{ marginTop: 16 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#1e3a8a', marginBottom: 8 }}>📚 Materias</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {materias.map((m: any) => (
                        <View key={m.id} style={{ backgroundColor: '#e0f2fe', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                          <Text style={{ fontSize: 11, color: '#0369a1', fontWeight: '500' }}>{m.nombre}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null;
              })()
            )}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );

  // Valida que la URL de imagen sea de un origen confiable
  const esImagenSegura = (url: string | null | undefined): boolean => {
    if (!url) return false;
    return url.startsWith('http') || url.startsWith('/uploads') || url.startsWith('file://') || url.startsWith('data:image');
  };

  // Calcula diferencias entre dos versiones de un quiz (antes/despues)
  const compararCambios = (ant: any, nue: any) => {
    const oldD = ant.metadatos || ant;
    const newD = nue.metadatos || nue;

    // Metadatos
    const metadatos: { campo: string; antes: string; despues: string; tipo?: string }[] = [];
    if (oldD.titulo !== newD.titulo) metadatos.push({ campo: 'Título', antes: oldD.titulo || 'N/A', despues: newD.titulo || 'N/A' });
    if (oldD.tema !== newD.tema) metadatos.push({ campo: 'Tema', antes: oldD.tema || 'N/A', despues: newD.tema || 'N/A' });
    if (oldD.modo_juego !== newD.modo_juego) metadatos.push({ campo: 'Modo de juego', antes: oldD.modo_juego || 'N/A', despues: newD.modo_juego || 'N/A' });
    if (oldD.ponderacion !== newD.ponderacion) metadatos.push({ campo: 'Ponderación', antes: `${oldD.ponderacion || 'N/A'}`, despues: `${newD.ponderacion || 'N/A'}` });
    if (oldD.imagen_portada !== newD.imagen_portada) {
      if (!oldD.imagen_portada && newD.imagen_portada) {
        metadatos.push({ campo: 'Portada', antes: '(sin imagen)', despues: 'imagen', tipo: 'portada_agregada' });
      } else if (oldD.imagen_portada && !newD.imagen_portada) {
        metadatos.push({ campo: 'Portada', antes: 'imagen', despues: '(sin imagen)', tipo: 'portada_eliminada' });
      } else {
        metadatos.push({ campo: 'Portada', antes: 'imagen', despues: 'imagen', tipo: 'portada_cambiada' });
      }
    }

    const temaCambio = oldD.tema !== newD.tema;

    // Preguntas
    const pregAnt: any[] = ant.preguntas || [];
    const pregNue: any[] = nue.preguntas || [];
    const mapAnt = new Map<number, any>(pregAnt.map((p: any) => [p.nro_orden, p]));
    const mapNue = new Map<number, any>(pregNue.map((p: any) => [p.nro_orden, p]));

    const modificadas: any[] = [];
    const agregadas: any[] = [];
    const eliminadas: any[] = [];

    mapAnt.forEach((pAnt: any, nro: number) => {
      const pNue: any = mapNue.get(nro);
      if (!pNue) {
        eliminadas.push({ nro, enunciado: pAnt.enunciado, tipo: pAnt.tipo });
        return;
      }
      const cambios: { campo: string; antes: string; despues: string; tipo?: string }[] = [];

      if (pAnt.enunciado !== pNue.enunciado) {
        cambios.push({ campo: 'Enunciado', antes: pAnt.enunciado, despues: pNue.enunciado });
      }
      if (pAnt.tipo !== pNue.tipo) {
        cambios.push({ campo: 'Tipo', antes: pAnt.tipo, despues: pNue.tipo });
      }
      if (pAnt.tiempo_limite_segundos !== pNue.tiempo_limite_segundos) {
        cambios.push({ campo: 'Tiempo', antes: `${pAnt.tiempo_limite_segundos}s`, despues: `${pNue.tiempo_limite_segundos}s` });
      }
      if (pAnt.puntos_si_es_dificultad !== pNue.puntos_si_es_dificultad) {
        const puntosAntRedondeados = Math.round((pAnt.puntos_si_es_dificultad || 0) * 100) / 100;
        const puntosNueRedondeados = Math.round((pNue.puntos_si_es_dificultad || 0) * 100) / 100;
        if (puntosAntRedondeados !== puntosNueRedondeados) {
          cambios.push({ campo: 'Puntos', antes: `${puntosAntRedondeados}`, despues: `${puntosNueRedondeados}` });
        }
      }
      if (!temaCambio && pAnt.categoria !== pNue.categoria) {
        cambios.push({ campo: 'Categoría', antes: pAnt.categoria || 'N/A', despues: pNue.categoria || 'N/A' });
      }

      // Opciones
      const optsAnt = (pAnt.opciones || []).filter((o: any) => o?.texto);
      const optsNue = (pNue.opciones || []).filter((o: any) => o?.texto);
      if (optsAnt.length !== optsNue.length) {
        cambios.push({ campo: 'Opciones', antes: `${optsAnt.length}`, despues: `${optsNue.length}` });
      }
      const correctaAnt = optsAnt.findIndex((o: any) => o.es_correcta);
      const correctaNue = optsNue.findIndex((o: any) => o.es_correcta);
      if (correctaAnt !== correctaNue) {
        cambios.push({ campo: 'Respuesta correcta', antes: `Opción ${correctaAnt + 1}`, despues: `Opción ${correctaNue + 1}` });
      }

      // Multimedia
      const mmAnt = pAnt.multimedia?.url;
      const mmNue = pNue.multimedia?.url;
      if (mmAnt !== mmNue) {
        if (!mmAnt && mmNue) {
          cambios.push({ campo: 'Imagen', antes: '(sin imagen)', despues: 'imagen', tipo: 'img_agregada' });
        } else if (mmAnt && !mmNue) {
          cambios.push({ campo: 'Imagen', antes: 'imagen', despues: '(sin imagen)', tipo: 'img_eliminada' });
        } else {
          cambios.push({ campo: 'Imagen', antes: 'anterior', despues: 'nueva', tipo: 'img_cambiada' });
        }
      }

      if (cambios.length > 0) {
        modificadas.push({
          nro,
          tipo: pAnt.tipo,
          enunciado: pAnt.enunciado,
          cambios
        });
      }
    });

    mapNue.forEach((pNue: any, nro: number) => {
      if (!mapAnt.has(nro)) {
        agregadas.push({
          nro,
          tipo: pNue.tipo,
          enunciado: pNue.enunciado,
          tiempo: pNue.tiempo_limite_segundos,
          puntos: pNue.puntos_si_es_dificultad,
          opciones: (pNue.opciones || []).filter((o: any) => o?.texto).length
        });
      }
    });

    return { metadatos, preguntas: { modificadas, agregadas, eliminadas } };
  };

  // Modal de diff que muestra que cambio entre la version anterior y la nueva
  const renderCambiosModal = () => (
    <Modal
      visible={cambiosModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setCambiosModalVisible(false)}
    >
      <View style={styles.quizDetalleModalContainer}>
        <View style={styles.quizDetalleModalHeader}>
          <Text style={styles.quizDetalleModalTitle}>{cambiosModalData?.ant ? 'Cambios realizados' : 'Contenido creado'}</Text>
          <TouchableOpacity onPress={() => setCambiosModalVisible(false)}>
            <Text style={styles.quizDetalleModalCloseButton}>✕</Text>
          </TouchableOpacity>
        </View>

        {cambiosModalData ? (() => {
          const { ant, nue, titulo, prof, materia } = cambiosModalData;

          // --- MODO CREACIÓN: mostrar contenido completo del quiz ---
          if (!ant && nue) {
            const data = nue.metadatos || nue;
            const preguntas: any[] = nue.preguntas || [];
            return (
              <ScrollView style={styles.quizDetalleModalContent}>
                <Text style={{ fontSize: 17, fontWeight: 'bold', color: '#1e293b', marginBottom: 2 }}>{titulo}</Text>
                <Text style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>👨‍🏫 {prof} · 📚 {materia}</Text>

                {data.imagen_portada && esImagenSegura(data.imagen_portada) && (
                  <Image source={{ uri: data.imagen_portada.startsWith('/uploads') ? `${API_URL}${data.imagen_portada}` : data.imagen_portada }}
                    style={{ width: 60, height: 60, borderRadius: 8, marginBottom: 10 }} />
                )}

                <View style={{ backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#22c55e' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#166534', marginBottom: 4 }}>➕ Quiz creado</Text>
                  <Text style={{ fontSize: 12, color: '#333' }}>
                    {data.titulo ? `Título: ${data.titulo}` : ''}
                    {data.modo_juego != null ? ` · Modo: ${data.modo_juego}` : ''}
                    {data.ponderacion != null ? ` · Ponderación: ${data.ponderacion}` : ''}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{preguntas.length} preguntas</Text>
                </View>

                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1e3a8a', marginBottom: 8 }}>❓ Preguntas</Text>
                {preguntas.map((pq: any) => (
                  <View key={pq.nro_orden} style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#22c55e' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginRight: 8 }}>#{pq.nro_orden}</Text>
                      <View style={{ backgroundColor: '#e2e8f0', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 10, color: '#475569', fontWeight: '500' }}>{pq.tipo || 'quiz'}</Text>
                      </View>
                    </View>

                    {pq.multimedia?.url && esImagenSegura(pq.multimedia.url) && (
                      <Image source={{ uri: pq.multimedia.url.startsWith('/uploads') ? `${API_URL}${pq.multimedia.url}` : pq.multimedia.url }}
                        style={{ width: 40, height: 40, borderRadius: 6, marginBottom: 4 }} />
                    )}

                    <Text style={{ fontSize: 13, color: '#333', marginBottom: 6 }}>{pq.enunciado}</Text>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, color: '#666' }}>⏱ {pq.tiempo_limite_segundos || 20}s</Text>
                      <Text style={{ fontSize: 11, color: '#666' }}>📊 {Number(pq.puntos_si_es_dificultad ?? 10).toFixed(1)} pts</Text>
                      {pq.categoria && <Text style={{ fontSize: 11, color: '#666' }}>🏷️ {pq.categoria}</Text>}
                    </View>

                    {(pq.opciones || []).filter((o: any) => o?.texto).map((op: any, oi: number) => {
                      const letras = ['🅰', '🅱', '🅲', '🅳'];
                      return (
                        <View key={oi} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                          <Text style={{ fontSize: 12, marginRight: 4 }}>{letras[oi] || `•`}</Text>
                          <Text style={{ fontSize: 12, color: '#333', flex: 1 }}>{op.texto}</Text>
                          {op.es_correcta && <Text style={{ fontSize: 10, color: '#16a34a', fontWeight: '600' }}>✅ Correcta</Text>}
                        </View>
                      );
                    })}
                  </View>
                ))}
                {preguntas.length === 0 && (
                  <Text style={{ fontSize: 13, color: '#999', fontStyle: 'italic' }}>Este quiz no tiene preguntas.</Text>
                )}
              </ScrollView>
            );
          }

          // --- MODO DIFF: comparación antes/después ---
          const result = compararCambios(ant, nue);
          const { metadatos, preguntas } = result;
          const { modificadas, agregadas, eliminadas } = preguntas;
          const hayCambios = metadatos.length > 0 || modificadas.length > 0 || agregadas.length > 0 || eliminadas.length > 0;

          return (
          <ScrollView style={styles.quizDetalleModalContent}>
            <Text style={{ fontSize: 17, fontWeight: 'bold', color: '#1e293b', marginBottom: 2 }}>{titulo}</Text>
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>👨‍🏫 {prof} · 📚 {materia}</Text>

            {!hayCambios && (
              <Text style={{ fontSize: 14, color: '#666', fontStyle: 'italic', textAlign: 'center', padding: 20 }}>
                No se detectaron cambios en este movimiento.
              </Text>
            )}

            {/* Sección Metadatos */}
            {metadatos.length > 0 && (
              <>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1e3a8a', marginBottom: 8 }}>📋 Metadatos</Text>
                {metadatos.map((m, i) => (
                  <View key={i} style={{ marginBottom: 10, paddingLeft: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 4 }}>{m.campo}</Text>
                    {m.tipo?.startsWith('portada') ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {/* Antes */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 10, color: '#dc2626', fontWeight: '600', marginBottom: 2 }}>ANTES</Text>
                          {m.tipo === 'portada_eliminada' || m.tipo === 'portada_cambiada' ? (
                            esImagenSegura(ant.imagen_portada) ? (
                              <Image source={{ uri: ant.imagen_portada.startsWith('/uploads') ? `${API_URL}${ant.imagen_portada}` : ant.imagen_portada }}
                                style={{ width: 40, height: 40, borderRadius: 6 }} />
                            ) : (
                              <Text style={{ fontSize: 12, color: '#666' }}>📷 imagen previa</Text>
                            )
                          ) : (
                            <Text style={{ fontSize: 12, color: '#999' }}>—</Text>
                          )}
                        </View>
                        <Text style={{ fontSize: 14, color: '#94a3b8' }}>→</Text>
                        {/* Después */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 10, color: '#16a34a', fontWeight: '600', marginBottom: 2 }}>DESPUÉS</Text>
                          {m.tipo === 'portada_agregada' || m.tipo === 'portada_cambiada' ? (
                            esImagenSegura(nue.imagen_portada) ? (
                              <Image source={{ uri: nue.imagen_portada.startsWith('/uploads') ? `${API_URL}${nue.imagen_portada}` : nue.imagen_portada }}
                                style={{ width: 40, height: 40, borderRadius: 6 }} />
                            ) : (
                              <Text style={{ fontSize: 12, color: '#666' }}>📷 imagen nueva</Text>
                            )
                          ) : (
                            <Text style={{ fontSize: 12, color: '#999' }}>—</Text>
                          )}
                        </View>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, backgroundColor: '#fef2f2', padding: 6, borderRadius: 6, marginRight: 4 }}>
                          <Text style={{ fontSize: 10, color: '#dc2626', fontWeight: '600', marginBottom: 1 }}>ANTES</Text>
                          <Text style={{ fontSize: 12, color: '#333' }}>{m.antes}</Text>
                        </View>
                        <View style={{ flex: 1, backgroundColor: '#f0fdf4', padding: 6, borderRadius: 6, marginLeft: 4 }}>
                          <Text style={{ fontSize: 10, color: '#16a34a', fontWeight: '600', marginBottom: 1 }}>DESPUÉS</Text>
                          <Text style={{ fontSize: 12, color: '#333' }}>{m.despues}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                ))}
              </>
            )}

            {/* Sección Preguntas */}
            {(modificadas.length > 0 || agregadas.length > 0 || eliminadas.length > 0) && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: metadatos.length > 0 ? 12 : 0, marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#1e3a8a', marginRight: 8 }}>❓ Preguntas</Text>
                  {modificadas.length > 0 && (
                    <View style={{ backgroundColor: '#fef3c7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginRight: 4 }}>
                      <Text style={{ fontSize: 11, color: '#d97706', fontWeight: '600' }}>✏️ {modificadas.length} modif.</Text>
                    </View>
                  )}
                  {agregadas.length > 0 && (
                    <View style={{ backgroundColor: '#dcfce7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginRight: 4 }}>
                      <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: '600' }}>➕ {agregadas.length} nuevas</Text>
                    </View>
                  )}
                  {eliminadas.length > 0 && (
                    <View style={{ backgroundColor: '#fef2f2', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '600' }}>🗑️ {eliminadas.length} elim.</Text>
                    </View>
                  )}
                </View>

                {/* Preguntas modificadas */}
                {modificadas.map((pq: any) => (
                  <View key={`mod-${pq.nro}`} style={{ backgroundColor: '#fffbeb', borderRadius: 8, padding: 10, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#d97706' }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#92400e', marginBottom: 6 }}>#{pq.nro} ✏️ Modificada</Text>
                    {pq.cambios.map((c: any, j: number) => (
                      <View key={j} style={{ marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, color: '#666', fontWeight: '500' }}>{c.campo}</Text>
                        {c.tipo?.startsWith('img') ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                            {c.tipo === 'img_agregada' || c.tipo === 'img_cambiada' ? (
                              (() => {
                                const preguntaNue = nue.preguntas?.find((p: any) => p.nro_orden === pq.nro);
                                const imgUrl = preguntaNue?.multimedia?.url;
                                if (imgUrl && esImagenSegura(imgUrl)) {
                                  const uri = imgUrl.startsWith('/uploads') ? `${API_URL}${imgUrl}` : imgUrl;
                                  return <Image source={{ uri }} style={{ width: 40, height: 40, borderRadius: 6 }} />;
                                }
                                return <Text style={{ fontSize: 11, color: '#666' }}>📷 {c.despues}</Text>;
                              })()
                            ) : (
                              <Text style={{ fontSize: 11, color: '#666' }}>🗑️ {c.despues}</Text>
                            )}
                          </View>
                        ) : c.campo === 'Enunciado' ? (
                          <View style={{ marginTop: 2 }}>
                            <Text style={{ fontSize: 12, color: '#333', backgroundColor: '#fef2f2', padding: 4, borderRadius: 4, marginBottom: 2 }}>{c.antes}</Text>
                            <Text style={{ fontSize: 12, color: '#333', backgroundColor: '#f0fdf4', padding: 4, borderRadius: 4 }}>{c.despues}</Text>
                          </View>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                            <Text style={{ fontSize: 12, color: '#dc2626', marginRight: 4 }}>{c.antes}</Text>
                            <Text style={{ fontSize: 12, color: '#94a3b8' }}>→</Text>
                            <Text style={{ fontSize: 12, color: '#16a34a', marginLeft: 4 }}>{c.despues}</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                ))}

                {/* Preguntas nuevas */}
                {agregadas.map((pq: any) => (
                  <View key={`add-${pq.nro}`} style={{ backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#22c55e' }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#166534', marginBottom: 4 }}>#{pq.nro} ➕ Nueva</Text>
                    <Text style={{ fontSize: 12, color: '#333', marginBottom: 4 }}>{pq.enunciado}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      <Text style={{ fontSize: 11, color: '#666' }}>{pq.tipo}</Text>
                      <Text style={{ fontSize: 11, color: '#666' }}>⏱ {pq.tiempo}s</Text>
                      <Text style={{ fontSize: 11, color: '#666' }}>📊 {pq.puntos} pts</Text>
                      <Text style={{ fontSize: 11, color: '#666' }}>{pq.opciones} opciones</Text>
                    </View>
                  </View>
                ))}

                {/* Preguntas eliminadas */}
                {eliminadas.map((pq: any) => (
                  <View key={`del-${pq.nro}`} style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: 10, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#ef4444' }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#991b1b', marginBottom: 4 }}>#{pq.nro} 🗑️ Eliminada</Text>
                    <Text style={{ fontSize: 12, color: '#333' }}>{pq.enunciado}</Text>
                    <Text style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{pq.tipo}</Text>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
          );
        })() : (
          <View style={styles.quizDetalleModalContent}>
            <Text style={styles.emptyText}>No hay datos disponibles</Text>
          </View>
        )}
      </View>
    </Modal>
  );

  return {
    renderTabButton,
    renderEstadisticasGenerales,
    renderFiltrosAuditoria,
    renderFiltrosUsuarios,
    renderFiltrosSesiones,
    renderFiltrosMaterias,
    renderQuicesRecientes,
    renderSesionesHistorial,
    renderDetalleSesionModal,
    renderMateriasAuditoria,
    renderUsuariosAuditoria,
    renderQuizDetalleModal,
    renderCambiosModal,
    renderHistorialUsuarioModal,
  };
};

// Evitar que expo-router trate a este archivo como ruta que necesita componente por defecto
export default null;
