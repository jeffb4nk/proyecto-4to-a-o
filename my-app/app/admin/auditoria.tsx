// Pantalla de auditoría del sistema para el admin.
// Tiene pestañas: General (estadísticas), Quices, Usuarios, Sesiones y Materias.
// Cada pestaña muestra datos históricos con filtros y permite ver detalle.
// Los datos se refrescan automáticamente cada 15 segundos.
import React from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { useUser } from '@/contexts/UserContext';
import { useAuditoriaData, useQuizDetalle, useFiltros } from '@/utils/auditoria/hooks';
import { AuditoriaComponents } from '@/utils/auditoria/components';
import { styles } from '@/utils/auditoria/styles';
import { Ionicons } from '@expo/vector-icons';

export default function AuditoriaScreen() {
  const router = useRouter();
  const { usuario: usuarioActual } = useUser();
  
  const {
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
  } = useAuditoriaData();

  const {
    quizDetalleVisible,
    setQuizDetalleVisible,
    quizDetalleData,
    loadingQuizDetalle,
    ordenarPor,
    orden,
    cargarDetalleQuiz,
    mostrarDetalleAuditoria,
    cambiarOrdenamiento,
  } = useQuizDetalle();

  const {
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
  } = useFiltros();

  const [activeTab, setActiveTab] = React.useState<'general' | 'quices' | 'usuarios' | 'sesiones' | 'materias'>('general');
  const activeTabRef = React.useRef(activeTab);
  activeTabRef.current = activeTab;

  useFocusEffect(
    React.useCallback(() => {
      if (activeTabRef.current === 'usuarios') {
        cargarUsuariosAuditoria(true);
      } else {
        cargarDatosAuditoria(true);
      }
      const interval = setInterval(() => {
        if (activeTabRef.current === 'usuarios') {
          cargarUsuariosAuditoria(false);
        } else {
          cargarDatosAuditoria(true);
        }
      }, 15000);
      return () => clearInterval(interval);
    }, [cargarDatosAuditoria, cargarUsuariosAuditoria])
  );

  React.useEffect(() => {
    if (activeTab === 'usuarios') {
      cargarUsuariosAuditoria(true);
    }
  }, [activeTab]);

  const irAPerfil = () => {
    const params = new URLSearchParams();
    if (usuarioActual?.usu_nombre) params.append('nombre', usuarioActual.usu_nombre);
    if (usuarioActual?.usu_apellido) params.append('apellido', usuarioActual.usu_apellido);
    if (usuarioActual?.usu_email) params.append('email', usuarioActual.usu_email);
    if (usuarioActual?.rol_nombre) params.append('rol', usuarioActual.rol_nombre);
    if (usuarioActual?.usu_imagen) params.append('imagen', usuarioActual.usu_imagen);
    
    router.push(`/profile?${params.toString()}`);
  };

  const formatearFecha = (fecha: string | undefined | null) => {
    if (!fecha) return 'N/A';
    // Si la fecha no tiene indicador de timezone, asumir UTC y agregar Z
    const fechaStr = typeof fecha === 'string' ? fecha : String(fecha);
    const fechaUtc = (fechaStr.includes('+') || fechaStr.endsWith('Z')) ? fechaStr : fechaStr + 'Z';
    const date = new Date(fechaUtc);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Caracas'
    });
  };

  const {
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
  } = AuditoriaComponents({
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
  });

  return (
    <View style={styles.container}>
      <Header
        showProfile={true}
        profileImage={usuarioActual?.usu_imagen}
        profileName={usuarioActual?.usu_nombre}
        profileLastName={usuarioActual?.usu_apellido}
        onProfilePress={irAPerfil}
      />
      
      <SectionTitle title="Auditoría del Sistema" />

      <View style={styles.tabsRow}>
        {renderTabButton('general', '📊')}
        {renderTabButton('quices', '📝')}
        {renderTabButton('usuarios', '👥')}
        {renderTabButton('sesiones', '🎯')}
        {renderTabButton('materias', '📚')}
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <Text style={styles.loadingText}>Cargando datos de auditoría...</Text>
        ) : (
          <>
            {activeTab === 'general' && renderEstadisticasGenerales()}
            {activeTab === 'quices' && (
              <>
                {renderFiltrosAuditoria()}
                {renderQuicesRecientes()}
              </>
            )}
            {activeTab === 'usuarios' && (
              <>
                {renderFiltrosUsuarios()}
                {renderUsuariosAuditoria()}
              </>
            )}
            {activeTab === 'sesiones' && (
              <>
                {renderFiltrosSesiones()}
                {renderSesionesHistorial()}
              </>
            )}
            {activeTab === 'materias' && (
              <>
                {renderFiltrosMaterias()}
                {renderMateriasAuditoria()}
              </>
            )}
          </>
        )}
      </ScrollView>

      {renderQuizDetalleModal()}
      {renderCambiosModal()}
      {renderHistorialUsuarioModal()}
      {renderDetalleSesionModal()}
    </View>
  );
}
