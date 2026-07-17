// Gestión de sesiones del profesor.
// Lista todas las sesiones creadas con filtros (Todos, Activo, Expirado, Finalizado).
// Permite ver resultados, ir a la pantalla en vivo, desactivar o eliminar sesiones.
// Cada sesión muestra código, título, materia, estado y participantes.
import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert, 
  RefreshControl,
  ActivityIndicator,
  Modal 
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { getItem } from '@/utils/storage';
import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { Card, CardContent } from '@/components/Card';
import Colors from '@/constants/colors';
import { Usuario } from '@/types/user';
import { Ionicons } from '@expo/vector-icons';
import { listarSesionesProfesor, desactivarSesion, eliminarSesion, Sesion } from '@/utils/api';

type FiltroSesion = 'Todos' | 'Activo' | 'Expirado' | 'Finalizado' | 'Eliminado';

export default function SesionesScreen() {
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [filtroActual, setFiltroActual] = useState<FiltroSesion>('Todos');
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    titulo: string;
    mensaje: string;
    tipo: 'desactivar' | 'eliminar';
    sesionId: number;
    codigoAcceso: string;
  } | null>(null);

  useEffect(() => {
    cargarDatos();
  }, [filtroActual, usuarioActual]);

  const cargarDatos = async () => {
    try {
      if (!usuarioActual) return;
      
      setCargando(true);
      const estatusParam = filtroActual === 'Todos' ? undefined : filtroActual;
      const response = await listarSesionesProfesor(usuarioActual.usu_id, estatusParam);
      setSesiones(response.sesiones);
    } catch (error) {
      console.error('Error al cargar sesiones:', error);
      Alert.alert('Error', 'No se pudieron cargar las sesiones');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarUsuario();
  }, []);

  // Recargar datos cada vez que la pantalla gana foco (al crear sesión y volver)
  useFocusEffect(
    useCallback(() => {
      const verificarYCargar = async () => {
        const usuario = await getItem('user');
        if (!usuario) {
          router.replace('/login');
          return;
        }
        // Recargar sesiones si el usuario ya está cargado
        if (usuarioActual) {
          cargarDatos();
        }
      };

      verificarYCargar();
    }, [usuarioActual])
  );

  const cargarUsuario = async () => {
    try {
      const userJson = await getItem('user');
      if (userJson) {
        const user = JSON.parse(userJson);
        setUsuarioActual(user);
      }
    } catch (error) {
      console.error('Error al cargar usuario:', error);
    }
  };

  const onRefresh = async () => {
    setRefrescando(true);
    await cargarDatos();
    setRefrescando(false);
  };

  const handleDesactivarSesion = (sesionId: number, codigoAcceso: string) => {
    setModalConfig({
      titulo: 'Desactivar Sesión',
      mensaje: `¿Estás seguro de desactivar la sesión ${codigoAcceso}? Los estudiantes ya no podrán unirse.`,
      tipo: 'desactivar',
      sesionId,
      codigoAcceso,
    });
    setModalVisible(true);
  };

  const handleEliminarSesion = (sesionId: number, codigoAcceso: string) => {
    setModalConfig({
      titulo: 'Eliminar Sesión',
      mensaje: `¿Estás seguro de eliminar la sesión ${codigoAcceso}? Esta acción no se puede deshacer y eliminará todos los resultados.`,
      tipo: 'eliminar',
      sesionId,
      codigoAcceso,
    });
    setModalVisible(true);
  };

  const confirmarAccionModal = async () => {
    if (!modalConfig || !usuarioActual) {
      setModalVisible(false);
      setModalConfig(null);
      return;
    }
    try {
      if (modalConfig.tipo === 'desactivar') {
        await desactivarSesion(modalConfig.sesionId, usuarioActual.usu_id);
      } else {
        await eliminarSesion(modalConfig.sesionId, usuarioActual.usu_id);
      }
      setModalVisible(false);
      setModalConfig(null);
      cargarDatos();
    } catch (error: any) {
      setModalVisible(false);
      setModalConfig(null);
      Alert.alert('Error', error.message || 'No se pudo realizar la acción');
    }
  };

  const cerrarModal = () => {
    setModalVisible(false);
    setModalConfig(null);
  };

  const getEstadoColor = (sesion: Sesion) => {
    if (sesion.ses_eliminado) return '#FF3B30';
    if (!sesion.ses_activo) return '#999';
    if (new Date(sesion.ses_fecha_inicio) > new Date()) return Colors.info;
    if (new Date(sesion.ses_fecha_fin) < new Date()) return '#FF9800';
    return Colors.success;
  };

  const getEstadoTexto = (sesion: Sesion) => {
    if (sesion.ses_eliminado) return 'Eliminada';
    if (!sesion.ses_activo) return 'Inactiva';
    if (new Date(sesion.ses_fecha_inicio) > new Date()) return 'Agendada';
    if (new Date(sesion.ses_fecha_fin) < new Date()) return 'Expirada';
    return 'Activa';
  };

  const getFiltros = (): FiltroSesion[] => ['Todos', 'Activo', 'Expirado', 'Finalizado', 'Eliminado'];

  const renderSesion = (sesion: Sesion) => (
    <Card key={sesion.ses_id} style={styles.sesionCard}>
      <CardContent>
        <View style={styles.sesionHeader}>
          <View style={styles.sesionInfo}>
            <Text style={styles.codigoAcceso}>{sesion.ses_codigo_acceso}</Text>
            <Text style={styles.quizTitulo}>{sesion.quiz_titulo}</Text>
            <Text style={styles.materiaNombre}>{sesion.materia_nombre}</Text>
          </View>
          <View style={[styles.estadoContainer, { backgroundColor: getEstadoColor(sesion) }]}>
            <Text style={styles.estadoTexto}>{getEstadoTexto(sesion)}</Text>
          </View>
        </View>

        <View style={styles.sesionMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="people-outline" size={16} color="#666" />
            <Text style={styles.metaText}>{sesion.total_participantes} participantes</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#666" />
            <Text style={styles.metaText}>{sesion.total_finalizados} finalizados</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="game-controller-outline" size={16} color="#666" />
            <Text style={styles.metaText}>{sesion.ses_puntuacion_tipo}</Text>
          </View>
        </View>

        <View style={styles.sesionFechas}>
          <Text style={styles.fechaTexto}>
            Inicio: {new Date(sesion.ses_fecha_inicio).toLocaleString('es-ES', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}
          </Text>
          <Text style={styles.fechaTexto}>
            Fin: {new Date(sesion.ses_fecha_fin).toLocaleString('es-ES', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}
          </Text>
        </View>

        <View style={styles.sesionActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.detailsButton]}
            onPress={() => router.push(`/resultados/sesion/${sesion.ses_id}` as any)}
          >
            <Ionicons name="bar-chart-outline" size={16} color={Colors.primary} />
            <Text style={styles.actionButtonText}>Ver resultados</Text>
          </TouchableOpacity>

          {sesion.ses_activo && new Date(sesion.ses_fecha_fin) > new Date() && (
            <TouchableOpacity
              style={[styles.actionButton, styles.deactivateButton]}
              onPress={() => handleDesactivarSesion(sesion.ses_id, sesion.ses_codigo_acceso)}
            >
              <Ionicons name="pause-circle-outline" size={16} color="#FF9800" />
              <Text style={[styles.actionButtonText, { color: '#FF9800' }]}>Desactivar</Text>
            </TouchableOpacity>
          )}

          {!sesion.ses_activo || new Date(sesion.ses_fecha_fin) <= new Date() ? (
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => handleEliminarSesion(sesion.ses_id, sesion.ses_codigo_acceso)}
            >
              <Ionicons name="trash-outline" size={16} color={Colors.accent} />
              <Text style={[styles.actionButtonText, { color: Colors.accent }]}>Eliminar</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </CardContent>
    </Card>
  );

  if (!usuarioActual) {
    return (
      <View style={styles.container}>
        <Header
          showProfile={true}
          profileImage=""
          profileName=""
          profileLastName=""
          onProfilePress={() => router.push('/profesor/perfil' as any)}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        showProfile={true}
        profileImage={usuarioActual?.usu_imagen}
        profileName={usuarioActual?.usu_nombre}
        profileLastName={usuarioActual?.usu_apellido}
        onProfilePress={() => router.push('/profesor/perfil' as any)}
      />

      <SectionTitle title="Gestión de Sesiones" />

      {/* Filtros */}
      <View style={styles.filtrosContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {getFiltros().map((filtro) => (
            <TouchableOpacity
              key={filtro}
              style={[
                styles.filtroButton,
                filtroActual === filtro && styles.filtroButtonActive
              ]}
              onPress={() => setFiltroActual(filtro)}
            >
              <Text style={[
                styles.filtroButtonText,
                filtroActual === filtro && styles.filtroButtonTextActive
              ]}>
                {filtro}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Lista de sesiones */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {cargando ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Cargando sesiones...</Text>
          </View>
        ) : sesiones.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No hay sesiones {filtroActual !== 'Todos' ? filtroActual.toLowerCase() : ''}</Text>
          </View>
        ) : (
          sesiones.map(renderSesion)
        )}
      </ScrollView>

      {/* Modal de confirmación */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={cerrarModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>{modalConfig?.titulo}</Text>
            <Text style={styles.modalMessage}>{modalConfig?.mensaje}</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={cerrarModal}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={modalConfig?.tipo === 'eliminar' ? styles.modalDeleteButton : styles.modalConfirmButton}
                onPress={confirmarAccionModal}
              >
                <Text style={styles.modalConfirmText}>
                  {modalConfig?.tipo === 'eliminar' ? 'Eliminar' : 'Desactivar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
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
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    textAlign: 'center',
  },
  filtrosContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  filtroButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  filtroButtonActive: {
    backgroundColor: Colors.primary,
  },
  filtroButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  filtroButtonTextActive: {
    color: '#fff',
  },
  sesionCard: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  sesionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sesionInfo: {
    flex: 1,
  },
  codigoAcceso: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  quizTitulo: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    marginBottom: 2,
  },
  materiaNombre: {
    fontSize: 14,
    color: '#777',
  },
  estadoContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  estadoTexto: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  sesionMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  sesionFechas: {
    marginBottom: 16,
  },
  fechaTexto: {
    fontSize: 12,
    color: '#888',
    marginBottom: 2,
  },
  sesionActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
  },
  detailsButton: {
    flex: 1,
    marginRight: 8,
  },
  liveButton: {
    flex: 1,
    marginRight: 8,
  },
  deactivateButton: {
    flex: 1,
    marginRight: 8,
  },
  deleteButton: {
    flex: 1,
  },
  actionButtonText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '500',
    marginLeft: 4,
  },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  modalConfirmButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#FF9800',
  },
  modalDeleteButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#E53935',
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
