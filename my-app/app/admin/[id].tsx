// Pantalla de detalle de un usuario desde el panel admin.
// Acá el master puede ver info personal, editar campos, activar/desactivar,
// eliminar usuarios y consultar el reporte completo de auditoría (quices,
// sesiones, logros, cambios de perfil) según el rol del usuario.
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Image, TextInput, TouchableOpacity, Modal, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Dropdown } from '@/components/Dropdown';
import { Badge } from '@/components/Badge';
import { CustomModal } from '@/components/Modal';
import { Header } from '@/components/Header';
import { API_URL, getAuthHeaders, obtenerEstadisticasEstudiante } from '@/utils/api';
import { Usuario, UsuarioEdit } from '@/types/user';
import { getInitials, pickImage } from '@/utils';
import { AppImage } from '@/components/AppImage';

export default function UsuarioDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);
  const lastPutTime = useRef(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [auditoriaModalVisible, setAuditoriaModalVisible] = useState(false);
  const [accion, setAccion] = useState<'desactivar' | 'eliminar'>('desactivar');
  const [auditoriaData, setAuditoriaData] = useState<any>(null);
  const [loadingAuditoria, setLoadingAuditoria] = useState(false);
  const [busquedaQuiz, setBusquedaQuiz] = useState('');
  const [filtroMateria, setFiltroMateria] = useState('todas');
  const [usuarioEditando, setUsuarioEditando] = useState<UsuarioEdit>({
    usu_nombre: '',
    usu_apellido: '',
    usu_email: '',
    usu_fk_rol: 1,
    usu_imagen: null,
  });

  const opcionesRol = [
    { label: 'Alumno', value: 1 },
    { label: 'Profesor', value: 2 },
  ];

  useEffect(() => {
    cargarUsuario();
  }, [id]);

  // Recarga silenciosa al volver de otra pantalla (ej: editar perfil).
  // No muestra indicadores de carga, solo actualiza los datos visibles.
  useFocusEffect(
    React.useCallback(() => {
      if (usuario && !editando) {
        const refreshSilencioso = async () => {
          try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_URL}/usuarios/${id}`, { headers });
            if (!response.ok) {
              if (response.status === 401 || response.status === 403) {
                Alert.alert('Sesión expirada', 'Tu sesión ha expirado. Redirigiendo al login...');
                router.replace('/login');
                return;
              }
              throw new Error(`Error HTTP: ${response.status}`);
            }
            const data = await response.json();
            setUsuario(data);
            setUsuarioEditando({
              usu_nombre: data.usu_nombre,
              usu_apellido: data.usu_apellido,
              usu_email: data.usu_email,
              usu_fk_rol: data.usu_fk_rol,
              usu_imagen: data.usu_imagen,
            });
          } catch (error) {
            console.error('Error en refresco silencioso:', error);
          }
        };
        refreshSilencioso();
      }
    }, [id, editando])
  );

  const cargarUsuario = async () => {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/usuarios/${id}`, { headers });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          Alert.alert('Sesión expirada', 'Tu sesión ha expirado. Redirigiendo al login...');
          router.replace('/login');
          return;
        }
        throw new Error(`Error HTTP: ${response.status}`);
      }
      const data = await response.json();
      setUsuario(data);
      setUsuarioEditando({
        usu_nombre: data.usu_nombre,
        usu_apellido: data.usu_apellido,
        usu_email: data.usu_email,
        usu_fk_rol: data.usu_fk_rol,
        usu_imagen: data.usu_imagen,
      });
    } catch (error) {
      console.error('Error al cargar usuario:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleActivo = async () => {
    if (!usuario) return;
    const now = Date.now();
    if (now - lastPutTime.current < 2000) return;
    lastPutTime.current = now;
    try {
      const headers = { ...await getAuthHeaders() };
      const response = await fetch(`${API_URL}/usuarios/${usuario.usu_id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ usu_activo: !usuario.usu_activo }),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          Alert.alert('Sesión expirada', 'Tu sesión ha expirado. Redirigiendo al login...');
          router.replace('/login');
          return;
        }
        throw new Error(`Error HTTP: ${response.status}`);
      }
      cargarUsuario();
    } catch (error) {
      console.error('Error al cambiar estado:', error);
    }
  };

  const eliminarUsuario = async () => {
    if (!usuario) return;
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/usuarios/${usuario.usu_id}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          Alert.alert('Sesión expirada', 'Tu sesión ha expirado. Redirigiendo al login...');
          router.replace('/login');
          return;
        }
        throw new Error(`Error HTTP: ${response.status}`);
      }
      router.back();
    } catch (error) {
      console.error('Error al eliminar usuario:', error);
    }
  };

  const guardarCambios = async () => {
    if (!usuario || guardandoRef.current) return;
    const now = Date.now();
    if (now - lastPutTime.current < 2000) return;
    lastPutTime.current = now;
    guardandoRef.current = true;
    setGuardando(true);
    try {
      const headers = { ...await getAuthHeaders() };
      const response = await fetch(`${API_URL}/usuarios/${usuario.usu_id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(usuarioEditando),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          Alert.alert('Sesión expirada', 'Tu sesión ha expirado. Redirigiendo al login...');
          router.replace('/login');
          return;
        }
        throw new Error(`Error HTTP: ${response.status}`);
      }
      setEditando(false);
      await cargarUsuario();
      if (auditoriaModalVisible) {
        await cargarAuditoria();
      }
    } catch (error) {
      console.error('Error al guardar cambios:', error);
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  const handlePickImage = async () => {
    const image = await pickImage();
    if (image) {
      setUsuarioEditando(prev => ({ ...prev, usu_imagen: image }));
    }
  };

  const confirmarAccion = (accionTipo: 'desactivar' | 'eliminar') => {
    setAccion(accionTipo);
    setModalVisible(true);
  };

  const ejecutarAccion = () => {
    if (accion === 'desactivar') {
      toggleActivo();
    } else if (accion === 'eliminar') {
      eliminarUsuario();
    }
    setModalVisible(false);
  };

  const cargarAuditoria = async () => {
    if (!usuario) return;
    try {
      setLoadingAuditoria(true);
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/usuarios/${usuario.usu_id}/auditoria-completa`, { headers });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          Alert.alert('Sesión expirada', 'Tu sesión ha expirado. Redirigiendo al login...');
          router.replace('/login');
          return;
        }
        setAuditoriaData(null);
        setAuditoriaModalVisible(true);
        return;
      }

      const data = await response.json();
      // Normalizamos la estructura por si el backend omite campos opcionales.
      // Así nos aseguramos que el modal de auditoría no explote.
      const normalized = {
        tipo_usuario: data.tipo_usuario || 'master',
        usuario: data.usuario || {},
        estadisticas: data.estadisticas || { total_quices: 0, total_puntos: 0, promedio: 0, total_materias: 0, total_sesiones: 0, total_alumnos_atendidos: 0 },
        quices_por_materia: data.quices_por_materia || [],
        materias_imparte: data.materias_imparte || [],
        sesiones_creadas: data.sesiones_creadas || [],
        logros_desbloqueados: data.logros_desbloqueados || [],
        cambios_perfil: data.cambios_perfil || [],
      };
      // Para los alumnos, el backend puede devolver el promedio en escala 100.
      // Acá lo normalizamos a escala 20 para que se vea consistente en la UI.
      if (normalized.tipo_usuario === 'alumno') {
        try {
          const statsData = await obtenerEstadisticasEstudiante(usuario!.usu_id);
          if (statsData?.estadisticas?.promedio !== undefined) {
            normalized.estadisticas.promedio = statsData.estadisticas.promedio;
          }
        } catch (e) {
          console.error('No se pudo obtener promedio normalizado:', e);
        }
      }

      setAuditoriaData(normalized);
      setAuditoriaModalVisible(true);
    } catch (error) {
      console.error('Error al cargar auditoría:', error);
    } finally {
      setLoadingAuditoria(false);
    }
  };

  const obtenerQuicesAplanados = (): any[] => {
    if (!auditoriaData?.quices_por_materia) return [];
    const quices: any[] = [];
    for (const materia of auditoriaData.quices_por_materia) {
      for (const quiz of (materia.quizes || [])) {
        quices.push({ ...quiz, materia_nombre: materia.materia_nombre, materia_codigo: materia.materia_codigo });
      }
    }
    return quices;
  };

  const obtenerMateriasDisponibles = (): string[] => {
    if (!auditoriaData?.quices_por_materia) return [];
    const materias = new Set<string>();
    for (const materia of auditoriaData.quices_por_materia) {
      if (materia.materia_nombre) materias.add(materia.materia_nombre);
    }
    return Array.from(materias).sort();
  };

  const quicesFiltrados = React.useMemo(() => {
    const todos = obtenerQuicesAplanados();
    let resultado = todos;
    if (busquedaQuiz.trim()) {
      const busq = busquedaQuiz.toLowerCase().trim();
      resultado = resultado.filter((q: any) =>
        (q.quiz_titulo || '').toLowerCase().includes(busq) ||
        (q.codigo_acceso || '').toLowerCase().includes(busq)
      );
    }
    if (filtroMateria !== 'todas') {
      resultado = resultado.filter((q: any) => q.materia_nombre === filtroMateria);
    }
    return resultado;
  }, [auditoriaData, busquedaQuiz, filtroMateria]);

  const formatearCampo = (campo: string): string => {
    const campos: { [key: string]: string } = {
      'usu_nombre': 'Nombre',
      'usu_apellido': 'Apellido',
      'usu_email': 'Email',
      'usu_activo': 'Estado',
      'usu_fk_rol': 'Rol',
      'usu_imagen': 'Foto',
    };
    return campos[campo] || campo;
  };

  const formatearValor = (campo: string, valor: any): string => {
    if (campo === 'usu_activo') return valor ? 'Activo' : 'Inactivo';
    if (campo === 'usu_fk_rol') {
      const roles: { [key: number]: string } = { 1: 'Alumno', 2: 'Profesor', 3: 'Admin' };
      return roles[Number(valor)] || `Rol ${valor}`;
    }
    if (campo === 'usu_imagen') return valor ? 'Con foto' : 'Sin foto';
    return String(valor ?? 'N/A');
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Cargando usuario...</Text>
      </View>
    );
  }

  if (!usuario) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Usuario no encontrado</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        showBackButton={true}
        onBackPress={() => router.back()}
      />

      <ScrollView style={styles.scrollView}>
        <View style={styles.profileSection}>
          <TouchableOpacity onPress={editando ? handlePickImage : undefined}>
            {editando ? (
              usuarioEditando.usu_imagen ? (
                <AppImage uri={usuarioEditando.usu_imagen} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarPlaceholderText}>
                    {getInitials(usuarioEditando.usu_nombre, usuarioEditando.usu_apellido)}
                  </Text>
                </View>
              )
            ) : (
              usuario.usu_imagen ? (
                <AppImage uri={usuario.usu_imagen} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarPlaceholderText}>
                    {getInitials(usuario.usu_nombre, usuario.usu_apellido)}
                  </Text>
                </View>
              )
            )}
            {editando && (
              <View style={styles.cameraOverlay}>
                <Text style={styles.cameraIcon}>📷</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.userName}>{`${usuario.usu_nombre} ${usuario.usu_apellido}`}</Text>
          <Text style={styles.userEmail}>{usuario.usu_email}</Text>
          <View style={styles.badges}>
            <Badge text={usuario.rol_nombre} variant="info" />
            <Badge 
              text={usuario.usu_activo ? 'Activo' : 'Inactivo'} 
              variant={usuario.usu_activo ? 'success' : 'danger'} 
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información Personal</Text>
          
          {editando ? (
            <>
              <Text style={styles.label}>Nombre:</Text>
              <TextInput
                style={styles.input}
                value={usuarioEditando.usu_nombre}
                onChangeText={(text) => setUsuarioEditando(prev => ({ ...prev, usu_nombre: text }))}
              />
              
              <Text style={styles.label}>Apellido:</Text>
              <TextInput
                style={styles.input}
                value={usuarioEditando.usu_apellido}
                onChangeText={(text) => setUsuarioEditando(prev => ({ ...prev, usu_apellido: text }))}
              />
              
              <Text style={styles.label}>Email:</Text>
              <TextInput
                style={styles.input}
                value={usuarioEditando.usu_email}
                onChangeText={(text) => setUsuarioEditando(prev => ({ ...prev, usu_email: text }))}
              />
              
              <Text style={styles.label}>Rol:</Text>
              <Dropdown
                options={opcionesRol}
                selectedValue={usuarioEditando.usu_fk_rol}
                onSelect={(value) => setUsuarioEditando(prev => ({ ...prev, usu_fk_rol: value }))}
              />
              
              <View style={styles.editButtons}>
                <TouchableOpacity style={styles.cancelEditButton} onPress={() => {
                  setEditando(false);
                  setUsuarioEditando({
                    usu_nombre: usuario.usu_nombre,
                    usu_apellido: usuario.usu_apellido,
                    usu_email: usuario.usu_email,
                    usu_fk_rol: usuario.usu_fk_rol,
                    usu_imagen: usuario.usu_imagen,
                  });
                }}>
                  <Text style={styles.cancelEditButtonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveButton, guardando && { opacity: 0.5 }]} onPress={guardarCambios} disabled={guardando}>
                  <Text style={styles.saveButtonText}>{guardando ? 'Guardando...' : 'Guardar'}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Nombre:</Text>
                <Text style={styles.infoValue}>{usuario.usu_nombre}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Apellido:</Text>
                <Text style={styles.infoValue}>{usuario.usu_apellido}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Email:</Text>
                <Text style={styles.infoValue}>{usuario.usu_email}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Rol:</Text>
                <Text style={styles.infoValue}>{usuario.rol_nombre}</Text>
              </View>
              <TouchableOpacity style={styles.editButton} onPress={() => setEditando(true)}>
                <Text style={styles.editButtonText}>✏️ Editar Información</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Estado</Text>
          <View style={styles.statusRow}>
            <Text style={styles.infoLabel}>Estado actual:</Text>
            <Badge 
              text={usuario.usu_activo ? 'Activo' : 'Inactivo'} 
              variant={usuario.usu_activo ? 'success' : 'danger'} 
            />
          </View>
          <TouchableOpacity 
            style={[styles.actionButton, !usuario.usu_activo && styles.activateButton]}
            onPress={() => confirmarAccion('desactivar')}
          >
            <Text style={styles.actionButtonText}>
              {usuario.usu_activo ? '🔴 Desactivar Usuario' : '🟢 Activar Usuario'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acciones</Text>
          <TouchableOpacity 
            style={styles.auditButton}
            onPress={cargarAuditoria}
          >
            <Text style={styles.auditButtonText}>📊 Ver Reporte del Usuario</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.deleteButton}
            onPress={() => confirmarAccion('eliminar')}
          >
            <Text style={styles.deleteButtonText}>🗑️ Eliminar Usuario</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <CustomModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onConfirm={ejecutarAccion}
        title="Confirmar Acción"
        message={
          accion === 'eliminar'
            ? `¿Estás seguro de eliminar a ${usuario.usu_nombre} ${usuario.usu_apellido}? Esta acción no se puede deshacer.`
            : `¿Estás seguro de ${usuario.usu_activo ? 'desactivar' : 'activar'} a ${usuario.usu_nombre} ${usuario.usu_apellido}?`
        }
      />

      <Modal
        visible={auditoriaModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.auditModalContainer}>
          <View style={styles.auditModalHeader}>
            <View style={styles.auditModalHeaderLeft}>
              <Text style={styles.auditModalTitle}>
                {auditoriaData?.tipo_usuario === 'alumno' ? '📊 Reporte de Alumno' :
                 auditoriaData?.tipo_usuario === 'profesor' ? '👨‍🏫 Reporte de Profesor' :
                 '👑 Reporte de Admin'}
              </Text>
              {auditoriaData?.usuario && (
                <Text style={styles.auditModalSubtitle}>
                  {auditoriaData.usuario.nombre} {auditoriaData.usuario.apellido}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setAuditoriaModalVisible(false)}>
              <Text style={styles.auditModalCloseButton}>✕</Text>
            </TouchableOpacity>
          </View>

          {loadingAuditoria ? (
            <View style={styles.auditModalContent}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Cargando reporte...</Text>
            </View>
          ) : auditoriaData ? (
            <ScrollView style={styles.auditModalContent}>
              
              {/* ============ ALUMNO ============ */}
              {auditoriaData.tipo_usuario === 'alumno' && (
                <>
                  {/* Estadísticas Generales */}
                  <View style={styles.auditCard}>
                    <Text style={styles.auditCardTitle}>📈 Estadísticas Generales</Text>
                    <View style={styles.auditStatRow}>
                      <Text style={styles.auditStatLabel}>Total Quices:</Text>
                      <Text style={styles.auditStatValue}>{auditoriaData.estadisticas?.total_quices || 0}</Text>
                    </View>
                    <View style={styles.auditStatRow}>
                      <Text style={styles.auditStatLabel}>Total Puntos:</Text>
                      <Text style={[styles.auditStatValue, {color: '#FF9800'}]}>{auditoriaData.estadisticas?.total_puntos || 0} pts</Text>
                    </View>
                    <View style={styles.auditStatRow}>
                      <Text style={styles.auditStatLabel}>Promedio:</Text>
                      <Text style={[styles.auditStatValue, {color: '#4CAF50'}]}>{auditoriaData.estadisticas?.promedio || 0} / 20</Text>
                    </View>
                  </View>

                  {/* Quices Presentados */}
                  <View style={styles.auditCard}>
                    <Text style={styles.auditCardTitle}>📝 Quices Presentados</Text>
                    {(auditoriaData.quices_por_materia?.length > 0) ? (
                      <>
                        <View style={styles.filtrosContainer}>
                          <View style={styles.busquedaContainer}>
                            <Text style={styles.busquedaIcon}>🔍</Text>
                            <TextInput
                              style={styles.busquedaInput}
                              placeholder="Buscar quiz..."
                              placeholderTextColor="#999"
                              value={busquedaQuiz}
                              onChangeText={setBusquedaQuiz}
                            />
                          </View>
                          <View style={styles.filtroMateriaContainer}>
                            {obtenerMateriasDisponibles().length > 0 && (
                              <Dropdown
                                options={[
                                  { label: 'Todas', value: 'todas' },
                                  ...obtenerMateriasDisponibles().map(m => ({ label: m, value: m }))
                                ]}
                                selectedValue={filtroMateria}
                                onSelect={setFiltroMateria}
                                placeholder="Filtrar materia"
                              />
                            )}
                          </View>
                        </View>
                        <Text style={styles.quicesContador}>
                          Mostrando {quicesFiltrados.length} de {obtenerQuicesAplanados().length} quices
                        </Text>
                        {quicesFiltrados.length > 0 ? (
                          quicesFiltrados.map((quiz: any, index: number) => (
                            <View key={`${quiz.sesion_id}-${index}`} style={styles.quizCard}>
                              <Text style={styles.quizTitle}>{quiz.quiz_titulo || 'Quiz'}</Text>
                              <Text style={styles.quizCode}>Código: {quiz.codigo_acceso}</Text>
                              <View style={styles.quizStatsRow}>
                                <Text style={styles.quizNote}>Nota: {quiz.nota_final}/{quiz.escala_puntuacion || 100}</Text>
                                <Text style={styles.quizRepetitions}>Repeticiones: {quiz.repeticiones}</Text>
                              </View>
                              <View style={styles.quizStatsRow}>
                                {quiz.tiempo_total_ms > 0 && (
                                  <Text style={styles.quizDate}>Tiempo: {Math.round(quiz.tiempo_total_ms / 1000)}s</Text>
                                )}
                                <Text style={styles.quizDate}>{quiz.modo_juego || 'Igual'}</Text>
                              </View>
                              <Text style={styles.quizMateria}>📚 {quiz.materia_nombre || 'Sin materia'}</Text>
                            </View>
                          ))
                        ) : (
                          <Text style={styles.emptyText}>No se encontraron quices con esos filtros</Text>
                        )}
                      </>
                    ) : (
                      <Text style={styles.emptyText}>No ha completado quices aún</Text>
                    )}
                  </View>

                  {/* Logros Desbloqueados */}
                  <View style={styles.auditCard}>
                    <Text style={styles.auditCardTitle}>🏆 Logros Desbloqueados</Text>
                    {auditoriaData.logros_desbloqueados?.length > 0 ? (
                      auditoriaData.logros_desbloqueados.map((logro: any, index: number) => (
                        <View key={index} style={styles.logroItem}>
                          <Text style={styles.logroCode}>{logro.codigo}</Text>
                          <Text style={styles.logroPoints}>+{logro.puntos_recompensa} pts</Text>
                          <Text style={styles.logroDate}>
                            {logro.fecha_desbloqueo ? new Date(logro.fecha_desbloqueo).toLocaleString('es-ES', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            }) : 'N/A'}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyText}>Sin logros desbloqueados</Text>
                    )}
                  </View>
                </>
              )}

              {/* ============ PROFESOR ============ */}
              {auditoriaData.tipo_usuario === 'profesor' && (
                <>
                  {/* Estadísticas del Profesor */}
                  <View style={styles.auditCard}>
                    <Text style={styles.auditCardTitle}>📈 Resumen de Actividad</Text>
                    <View style={styles.auditStatRow}>
                      <Text style={styles.auditStatLabel}>Materias que Imparte:</Text>
                      <Text style={styles.auditStatValue}>{auditoriaData.estadisticas?.total_materias || 0}</Text>
                    </View>
                    <View style={styles.auditStatRow}>
                      <Text style={styles.auditStatLabel}>Sesiones Creadas:</Text>
                      <Text style={styles.auditStatValue}>{auditoriaData.estadisticas?.total_sesiones || 0}</Text>
                    </View>
                  </View>

                  {/* Materias que Imparte */}
                  <View style={styles.auditCard}>
                    <Text style={styles.auditCardTitle}>📚 Materias que Imparte</Text>
                    {auditoriaData.materias_imparte?.length > 0 ? (
                      auditoriaData.materias_imparte.map((materia: any, index: number) => (
                        <View key={index} style={styles.materiaCard}>
                          <Text style={styles.materiaName}>{materia.nombre}</Text>
                          <Text style={styles.materiaCodigo}>{materia.codigo}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyText}>No tiene materias asignadas</Text>
                    )}
                  </View>

                  {/* Sesiones Creadas */}
                  <View style={styles.auditCard}>
                    <Text style={styles.auditCardTitle}>🎯 Últimas Sesiones</Text>
                    {auditoriaData.sesiones_creadas?.length > 0 ? (
                      auditoriaData.sesiones_creadas.map((sesion: any, index: number) => (
                        <View key={index} style={styles.sesionCard}>
                          <View style={styles.sesionHeader}>
                            <Text style={styles.sesionCodigo}>{sesion.codigo_acceso}</Text>
                            <Text style={styles.sesionFecha}>
                              {sesion.fecha_inicio ? new Date(sesion.fecha_inicio).toLocaleString('es-ES', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                              }) : 'N/A'}
                            </Text>
                          </View>
                          <Text style={styles.sesionMateria}>{sesion.materia_nombre}</Text>
                          <View style={styles.sesionStats}>
                            <Text style={styles.sesionStat}>🚀 {sesion.total_iniciaron} iniciaron</Text>
                            <Text style={styles.sesionStat}>✅ {sesion.total_completaron} completaron</Text>
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyText}>No ha creado sesiones aún</Text>
                    )}
                  </View>
                </>
              )}

              {/* ============ MASTER/ADMIN ============ */}
              {auditoriaData.tipo_usuario === 'master' && (
                <View style={styles.auditCard}>
                  <Text style={styles.auditCardTitle}>👑 Cuenta de Administrador</Text>
                  <Text style={styles.emptyText}>
                    Los administradores no tienen actividad de quiz ni reportes disponibles.
                  </Text>
                </View>
              )}

              {/* ============ CAMBIOS DE PERFIL (TODOS LOS ROLES) ============ */}
              <View style={styles.auditCard}>
                <Text style={styles.auditCardTitle}>✏️ Cambios de Perfil</Text>
                {auditoriaData.cambios_perfil?.length > 0 ? (
                  auditoriaData.cambios_perfil.map((cambio: any, index: number) => (
                    <View key={index} style={styles.cambioItem}>
                      <Text style={styles.cambioDate}>
                        {cambio.fecha ? (() => {
                          const f = typeof cambio.fecha === 'string' ? cambio.fecha : String(cambio.fecha);
                          const fUtc = (f.includes('+') || f.endsWith('Z')) ? f : f + 'Z';
                          return new Date(fUtc).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Caracas' });
                        })() : 'N/A'}
                      </Text>
                      {cambio.datos_nuevos && typeof cambio.datos_nuevos === 'object' ? (
                        Object.entries(cambio.datos_nuevos)
                          .filter(([_, v]: [string, any]) => v && typeof v === 'object' && 'anterior' in v)
                          .map(([campo, valores]: [string, any]) => (
                            <Text key={campo} style={styles.cambioFields}>
                              {formatearCampo(campo)}: {formatearValor(campo, valores.anterior)} → {formatearValor(campo, valores.nuevo)}
                            </Text>
                          ))
                      ) : (
                        <Text style={styles.cambioFields}>
                          {Array.isArray(cambio.campos_modificados) ? cambio.campos_modificados.join(', ') : 'Ninguno'}
                        </Text>
                      )}
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>Sin cambios de perfil registrados</Text>
                )}
              </View>

            </ScrollView>
          ) : (
            <View style={styles.auditModalContent}>
              <Text style={styles.errorText}>No se pudo cargar el reporte</Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 50,
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
    textAlign: 'center',
    marginTop: 50,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  profileSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarPlaceholderText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#007AFF',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  cameraIcon: {
    fontSize: 20,
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  editButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  editButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  cancelEditButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    flex: 1,
    marginRight: 8,
    alignItems: 'center',
  },
  cancelEditButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 12,
    flex: 1,
    marginLeft: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  actionButton: {
    backgroundColor: '#FF9800',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  activateButton: {
    backgroundColor: '#4CAF50',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#F44336',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  auditButton: {
    backgroundColor: '#9C27B0',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  auditButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  auditModalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  auditModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  auditModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  auditModalCloseButton: {
    fontSize: 28,
    color: '#666',
    paddingHorizontal: 8,
  },
  auditModalHeaderLeft: {
    flex: 1,
  },
  auditModalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  auditModalContent: {
    flex: 1,
    padding: 16,
  },
  auditCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  auditCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  auditStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  auditStatLabel: {
    fontSize: 14,
    color: '#666',
  },
  auditStatValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  materiaCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  materiaName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  materiaCodigo: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  sesionCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  sesionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sesionCodigo: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#9C27B0',
  },
  sesionFecha: {
    fontSize: 12,
    color: '#666',
  },
  sesionMateria: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
  },
  sesionStats: {
    flexDirection: 'row',
    gap: 16,
  },
  sesionStat: {
    fontSize: 12,
    color: '#666',
  },
  quizItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  quizCode: {
    fontSize: 14,
    color: '#666',
  },
  quizNote: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  quizRepetitions: {
    fontSize: 12,
    color: '#999',
  },
  quizTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  quizDate: {
    fontSize: 11,
    color: '#888',
  },
  quizCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  quizStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 2,
  },
  quizMateria: {
    fontSize: 12,
    color: '#888',
    marginTop: 6,
    fontStyle: 'italic',
  },
  filtrosContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  busquedaContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 48,
  },
  busquedaIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  busquedaInput: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    padding: 0,
  },
  filtroMateriaContainer: {
    flex: 1,
    height: 48,
  },
  filtroSelect: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filtroLabel: {
    fontSize: 12,
    color: '#666',
    marginRight: 4,
  },
  filtroButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filtroButtonText: {
    fontSize: 12,
    color: '#333',
    maxWidth: 100,
  },
  filtroArrow: {
    fontSize: 10,
    color: '#666',
  },
  quicesContador: {
    fontSize: 11,
    color: '#999',
    marginBottom: 10,
  },
  logroItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    padding: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 4,
  },
  logroCode: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  logroPoints: {
    fontSize: 14,
    color: '#FF9800',
  },
  logroDate: {
    fontSize: 12,
    color: '#666',
  },
  cambioItem: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 4,
  },
  cambioDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  cambioFields: {
    fontSize: 14,
    color: '#333',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
});
