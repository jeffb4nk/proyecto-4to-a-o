// Gestión de materias desde el panel admin.
// Acá el master puede crear, editar, activar/desactivar y eliminar materias.
// También asigna el profesor principal a cada materia.
// Incluye un sistema de caché simple para evitar llamadas repetidas al backend.
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, Modal, RefreshControl, KeyboardAvoidingView, Platform, Switch, Pressable } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { API_URL, getAuthHeaders } from '@/utils/api';
import Colors from '@/constants/colors';
import { useUser } from '@/contexts/UserContext';

interface Materia {
  mat_id: number;
  mat_nombre: string;
  mat_codigo: string;
  mat_fk_profesor: number;
  mat_activo: boolean;
  profesor: {
    id: number;
    nombre: string;
    apellido: string;
  };
  total_sesiones: number;
  total_alumnos: number;
}

interface Profesor {
  id: number;
  nombre: string;
  apellido: string;
  email?: string;
  nombre_completo?: string;
}

export default function MateriasScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const { usuario: usuarioActual } = useUser();
  const [modalVisible, setModalVisible] = useState(false);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [notifVisible, setNotifVisible] = useState(false);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMsg, setNotifMsg] = useState('');
  const [notifType, setNotifType] = useState<'success' | 'error'>('success');
  const [materiaAEliminar, setMateriaAEliminar] = useState<Materia | null>(null);
  const [materiaEditando, setMateriaEditando] = useState<Materia | null>(null);
  const [searchText, setSearchText] = useState('');
  const [formData, setFormData] = useState({
    mat_nombre: '',
    mat_codigo: '',
    mat_fk_profesor: 0,
    mat_activo: true,
  });
  const [profesorSearchText, setProfesorSearchText] = useState('');
  const [creandoMateria, setCreandoMateria] = useState(false);

  // Guardamos materias y profesores en caché 30 segundos.
  // Así si el usuario cambia de pestaña y vuelve, no se dispara otra llamada
  // innecesaria al backend.
  const cacheRef = useRef<{
    materias: Materia[];
    profesores: Profesor[];
    timestamp: number;
  }>({ materias: [], profesores: [], timestamp: 0 });

  useFocusEffect(
    React.useCallback(() => {
      cargarDatos();
    }, [])
  );

  const irAPerfil = () => {
    // Pasamos solo lo necesario porque SecureStore en Android
    // tiene un límite de 2048 bytes por entrada.
    const userData = {
      nombre: usuarioActual?.usu_nombre || '',
      apellido: usuarioActual?.usu_apellido || '',
      email: usuarioActual?.usu_email || '',
      rol: usuarioActual?.rol_nombre || '',
      imagen: usuarioActual?.usu_imagen || ''
    };
    
    router.push({
      pathname: '/profile',
      params: userData
    });
  };

  const showNotif = (title: string, msg: string, type: 'success' | 'error' = 'success') => {
    setNotifTitle(title);
    setNotifMsg(msg);
    setNotifType(type);
    setNotifVisible(true);
  };

  const cargarDatos = async (forceRefresh: boolean = false) => {
    const now = Date.now();
    // Si los datos tienen menos de 30 segundos, los reusamos.
    // Esto evita llamadas repetidas al backend cuando el usuario
    // solo cambió de pestaña y volvió.
    const CACHE_DURATION = 30000;
    
    if (!forceRefresh && cacheRef.current.timestamp > now - CACHE_DURATION) {
      setMaterias(cacheRef.current.materias);
      setProfesores(cacheRef.current.profesores);
      return;
    }

    try {
      setLoading(true);
      
      // Cargamos cada sección con su propio timeout y abort controller.
      // Si una falla (timeout o error), devolvemos el valor por defecto
      // en vez de romper toda la pantalla. El usuario puede hacer pull-to-refresh.
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
          if (error?.name === 'AbortError') {
            console.warn(`⏰ Timeout en ${url} (${timeoutMs}ms)`);
          }
          return defaultValue;
        }
      };

      const [materiasData, profesoresData] = await Promise.all([
        cargarSeccion('/materias/', [], 6000),
        cargarSeccion('/materias/profesores/disponibles', [], 4000)
      ]);

      cacheRef.current = {
        materias: materiasData,
        profesores: profesoresData,
        timestamp: now
      };

      setMaterias(materiasData);
      setProfesores(profesoresData);
      
    } catch (error) {
      console.error('Error general al cargar datos de materias:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    cargarDatos(true);
  };

  const limpiarFormulario = () => {
    setFormData({ mat_nombre: '', mat_codigo: '', mat_fk_profesor: 0, mat_activo: true });
    setProfesorSearchText('');
  };

  // Genera un código único para la materia usando el nombre como base.
  // El código se compone del nombre normalizado (sin acentos, mayúsculas)
  // más un sufijo numérico basado en timestamp para evitar colisiones.
  // Si el nombre está vacío, genera un código tipo MAT_123456.
  const generarCodigoMateria = (nombre: string) => {
    const sufijo = `_${Date.now().toString().slice(-5)}`;
    const baseMaximaLongitud = 20 - sufijo.length;
    
    const base = nombre
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, baseMaximaLongitud);
      
    return base ? `${base}${sufijo}` : `MAT_${Date.now().toString().slice(-6)}`;
  };

  const crearMateria = async () => {
    if (!formData.mat_nombre || !formData.mat_fk_profesor) {
      showNotif('Error', 'El nombre y el profesor son obligatorios', 'error');
      return;
    }

    setCreandoMateria(true);
    try {
      const materiaCrear = {
        ...formData,
        mat_codigo: formData.mat_codigo.trim() || generarCodigoMateria(formData.mat_nombre),
      };

      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/materias/`, {
        method: 'POST',
        headers,
        body: JSON.stringify(materiaCrear)
      });

      if (response.ok) {
        showNotif('Éxito', 'Materia creada correctamente');
        setModalVisible(false);
        limpiarFormulario();
        cargarDatos(true);
      } else {
        const error = await response.json();
        showNotif('Error', error.detail || 'No se pudo crear la materia', 'error');
      }
    } catch (error) {
      console.error('Error al crear materia:', error);
      showNotif('Error', 'Ocurrió un error al crear la materia', 'error');
    } finally {
      setCreandoMateria(false);
    }
  };

  const actualizarMateria = async () => {
    if (!materiaEditando || !formData.mat_nombre) {
      showNotif('Error', 'El nombre es obligatorio', 'error');
      return;
    }

    setCreandoMateria(true);
    try {
      const materiaActualizar = {
        mat_nombre: formData.mat_nombre,
        mat_codigo: formData.mat_codigo.trim() || generarCodigoMateria(formData.mat_nombre),
        mat_fk_profesor: formData.mat_fk_profesor,
        mat_activo: formData.mat_activo,
      };

      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/materias/${materiaEditando.mat_id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(materiaActualizar)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'No se pudo actualizar la materia');
      }

      showNotif('Éxito', 'Materia actualizada correctamente');
      setConfigModalVisible(false);
      setMateriaEditando(null);
      setFormData({ mat_nombre: '', mat_codigo: '', mat_fk_profesor: 0, mat_activo: true });
      cargarDatos(true);
    } catch (error: any) {
      console.error('Error al actualizar materia:', error);
      showNotif('Error', error.message || 'Ocurrió un error al actualizar la materia', 'error');
    } finally {
      setCreandoMateria(false);
    }
  };

  const eliminarMateria = (materia: Materia) => {
    setMateriaAEliminar(materia);
    setDeleteModalVisible(true);
  };

  const abrirModalConfiguracion = (materia: Materia) => {
    setMateriaEditando(materia);
    
    setFormData({
      mat_nombre: materia.mat_nombre,
      mat_codigo: materia.mat_codigo,
      mat_fk_profesor: materia.mat_fk_profesor,
      mat_activo: materia.mat_activo,
    });
    setProfesorSearchText('');
    setConfigModalVisible(true);
  };

  const toggleMateriaActivo = (value: boolean) => {
    if (!value) {
      setConfirmModalVisible(true);
    } else {
      setFormData(prev => ({ ...prev, mat_activo: true }));
    }
  };

  const materiasFiltradas = materias.filter(materia =>
    materia.mat_nombre.toLowerCase().includes(searchText.toLowerCase()) ||
    materia.mat_codigo.toLowerCase().includes(searchText.toLowerCase()) ||
    materia.profesor.nombre.toLowerCase().includes(searchText.toLowerCase())
  );

  const renderMateriaCard = (materia: Materia) => (
    <Card key={materia.mat_id} style={styles.materiaCard}>
      <View style={styles.materiaHeader}>
        <View style={styles.materiaInfo}>
          <Text style={styles.materiaNombre}>{materia.mat_nombre}</Text>
          <Text style={styles.materiaCodigo}>{materia.mat_codigo}</Text>
           <Text style={styles.materiaProfesor}>
             Prof. {materia.profesor.nombre} {materia.profesor.apellido}
           </Text>
        </View>
        <View style={styles.materiaStatus}>
          <View style={[
            styles.statusIndicator,
            materia.mat_activo ? styles.statusActive : styles.statusInactive
          ]}>
            <Text style={[
              styles.statusText,
              materia.mat_activo ? styles.statusTextActive : styles.statusTextInactive
            ]}>
              {materia.mat_activo ? 'Activa' : 'Inactiva'}
            </Text>
          </View>
        </View>
      </View>
      
      <View style={styles.materiaActions}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.editButton]}
          onPress={() => abrirModalConfiguracion(materia)}
        >
          <Text style={styles.actionButtonText}>Configurar</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => eliminarMateria(materia)}
        >
          <Text style={styles.actionButtonText}>Eliminar</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );

  const profesoresFiltrados = profesores.filter(profesor => {
    const nombre = (profesor.nombre_completo ?? `${profesor.nombre} ${profesor.apellido}`).toLowerCase();
    const email = (profesor.email ?? '').toLowerCase();
    const q = profesorSearchText.toLowerCase();
    return nombre.includes(q) || email.includes(q);
  });

  const renderProfesorOption = (profesor: Profesor, index: number) => {
    const seleccionado = formData.mat_fk_profesor === profesor.id;

    return (
      <TouchableOpacity
        key={profesor.id}
        style={[
          styles.profesorOption,
          seleccionado && styles.profesorOptionSelected,
        ]}
        onPress={() => {
          setFormData(prev => ({ ...prev, mat_fk_profesor: profesor.id }));
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              borderWidth: 2,
              borderColor: Colors.primary,
              marginRight: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: seleccionado ? Colors.primary : 'transparent'
            }}
          >
            {seleccionado && <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text>}
          </View>
          <View>
            <Text style={styles.profesorNombre}>{profesor.nombre_completo}</Text>
            <Text style={styles.profesorEmail}>{profesor.email}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <View style={styles.container}>
        <Header
          showProfile={true}
          showBackButton={false}
          profileImage={usuarioActual?.usu_imagen}
          profileName={usuarioActual?.usu_nombre}
          profileLastName={usuarioActual?.usu_apellido}
          onProfilePress={irAPerfil}
        />
        
        <SectionTitle title="Gestión de Materias" />
        
        <ScrollView 
          style={styles.scrollView}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          }
        >
          {/* Barra de búsqueda y acciones */}
          <View style={styles.searchSection}>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar materias..."
              value={searchText}
              onChangeText={setSearchText}
            />
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => {
                limpiarFormulario();
                setModalVisible(true);
              }}
            >
              <Text style={styles.addButtonText}>+ Nueva Materia</Text>
            </TouchableOpacity>
          </View>
  
          {/* Lista de materias */}
          {loading ? (
            <Text style={styles.loadingText}>Cargando materias...</Text>
          ) : materiasFiltradas.length === 0 ? (
            <Text style={styles.emptyText}>
              {searchText ? 'No se encontraron materias' : 'No hay materias registradas'}
            </Text>
          ) : (
            materiasFiltradas.map(renderMateriaCard)
          )}
        </ScrollView>
  
        {/* Modal Crear Materia */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <KeyboardAvoidingView
            style={styles.modalContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 20}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nueva Materia</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalContent}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nombre de la Materia</Text>
                <TextInput
                  style={styles.formInput}
                  value={formData.mat_nombre}
                  onChangeText={(text) => setFormData({...formData, mat_nombre: text})}
                  placeholder="Ej: Matemáticas"
                />
              </View>
  
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Profesor</Text>
                {formData.mat_fk_profesor > 0 && (
                  <View style={styles.profesorSeleccionadoResumen}>
                    <Text style={styles.profesorSeleccionadoTexto}>
                      Profesor seleccionado: {profesores.find(p => p.id === formData.mat_fk_profesor)?.nombre_completo || 'Desconocido'}
                    </Text>
                  </View>
                )}
                <TextInput
                  style={styles.formInput}
                  placeholder="Buscar profesor..."
                  value={profesorSearchText}
                  onChangeText={setProfesorSearchText}
                />
                <ScrollView 
                  style={styles.profesoresList}
                  nestedScrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                >
                  {profesoresFiltrados.length === 0 ? (
                    <Text style={styles.emptyText}>
                      {profesorSearchText ? 'No se encontraron profesores' : 'No hay profesores disponibles'}
                    </Text>
                  ) : (
                    profesoresFiltrados.map((profesor, index) => renderProfesorOption(profesor, index))
                  )}
                </ScrollView>
              </View>
            </ScrollView>
  
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelModalButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.saveModalButton, creandoMateria && styles.disabledButton]}
                onPress={crearMateria}
                disabled={creandoMateria}
              >
                <Text style={styles.modalButtonText}>{creandoMateria ? 'Creando...' : 'Crear Materia'}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Modal Configuración de Materia */}
        <Modal
          visible={configModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <KeyboardAvoidingView
            style={styles.modalContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 20}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Configurar Materia</Text>
              <TouchableOpacity onPress={() => setConfigModalVisible(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalContent}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nombre de la Materia</Text>
                <TextInput
                  style={styles.formInput}
                  value={formData.mat_nombre}
                  onChangeText={(text) => setFormData({...formData, mat_nombre: text})}
                  placeholder="Ej: Matemáticas"
                />
              </View>
  
               <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Código de la Materia</Text>
                <TextInput
                  style={styles.formInput}
                  value={formData.mat_codigo}
                  onChangeText={(text) => setFormData({...formData, mat_codigo: text})}
                  placeholder="Ej: MAT101"
                />
              </View>
            
               <View style={[styles.formGroup, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                 <View>
                   <Text style={styles.formLabel}>Estado de la Materia</Text>
                   <Text style={{ fontSize: 12, color: '#666' }}>
                     {formData.mat_activo ? 'La materia está activa' : 'La materia está inactiva'}
                   </Text>
                 </View>
                 <Pressable 
                   onPress={() => toggleMateriaActivo(!formData.mat_activo)}
                   style={{ cursor: 'pointer' }}
                 >
                   <Switch
                     value={formData.mat_activo}
                     onValueChange={toggleMateriaActivo}
                     pointerEvents="none"
                     trackColor={{ false: '#ddd', true: Colors.primary }}
                     thumbColor={formData.mat_activo ? '#fff' : '#f4f3f4'}
                   />
                 </Pressable>
               </View>
            
               <View style={styles.formGroup}>
                 <Text style={styles.formLabel}>Asignar Profesor</Text>
                 <Text style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                   Seleccione el profesor asignado a la materia.
                 </Text>
                 <TextInput
                  style={styles.formInput}
                  placeholder="Buscar profesor..."
                  value={profesorSearchText}
                  onChangeText={setProfesorSearchText}
                />
                <ScrollView 
                  style={styles.profesoresList}
                  nestedScrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                >
                  {profesoresFiltrados.length === 0 ? (
                    <Text style={styles.emptyText}>
                      {profesorSearchText ? 'No se encontraron profesores' : 'No hay profesores disponibles'}
                    </Text>
                  ) : (
                    profesoresFiltrados.map((profesor, index) => renderProfesorOption(profesor, index))
                  )}
                </ScrollView>
               </View>
             </ScrollView>

             <View style={styles.modalActions}>
               <TouchableOpacity 
                 style={[styles.modalButton, styles.cancelModalButton]}
                 onPress={() => setConfigModalVisible(false)}
               >
                 <Text style={styles.modalButtonText}>Cancelar</Text>
               </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.saveModalButton, creandoMateria && styles.disabledButton]}
                  onPress={actualizarMateria}
                  disabled={creandoMateria}
                >
                  <Text style={styles.modalButtonText}>{creandoMateria ? 'Guardando...' : 'Guardar Cambios'}</Text>
                </TouchableOpacity>
             </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Modal Confirmar Inactivación */}
        <Modal
          visible={confirmModalVisible}
          animationType="fade"
          transparent={true}
        >
          <View style={{ 
            flex: 1, 
            backgroundColor: 'rgba(0,0,0,0.5)', 
            justifyContent: 'center', 
            alignItems: 'center', 
            padding: 20 
          }}>
            <View style={[styles.modalContainer, { 
              width: '80%', 
              borderRadius: 20, 
              maxHeight: '40%' 
            }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Confirmar Inactivación</Text>
                <TouchableOpacity onPress={() => setConfirmModalVisible(false)}>
                  <Text style={styles.modalCloseButton}>✕</Text>
                </TouchableOpacity>
              </View>
              
              <View style={[styles.modalContent, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ textAlign: 'center', fontSize: 16, color: '#333', marginBottom: 20 }}>
                  Al desactivar la materia, los profesores ya no podrán crear nuevas sesiones para ella. ¿Deseas continuar?
                </Text>
              </View>
              
              <View style={styles.modalActions}>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.cancelModalButton]}
                  onPress={() => setConfirmModalVisible(false)}
                >
                  <Text style={styles.modalButtonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.saveModalButton, { backgroundColor: '#dc3545' }]}
                  onPress={() => {
                    setFormData(prev => ({ ...prev, mat_activo: false }));
                    setConfirmModalVisible(false);
                  }}
                >
                  <Text style={styles.modalButtonText}>Desactivar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal Confirmar Eliminación */}
        <Modal
          visible={deleteModalVisible}
          animationType="fade"
          transparent={true}
        >
          <View style={{
            flex: 1, 
            backgroundColor: 'rgba(0,0,0,0.5)', 
            justifyContent: 'center', 
            alignItems: 'center', 
            padding: 20 
          }}>
            <View style={[styles.modalContainer, {
              width: '80%', 
              borderRadius: 20, 
              maxHeight: '40%' 
            }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Confirmar Eliminación</Text>
                <TouchableOpacity onPress={() => setDeleteModalVisible(false)}>
                  <Text style={styles.modalCloseButton}>✕</Text>
                </TouchableOpacity>
              </View>
              
               <View style={[styles.modalContent, { justifyContent: 'center', alignItems: 'center' }]}>
                 <Text style={{ textAlign: 'center', fontSize: 16, color: '#333', marginBottom: 20 }}>
                   ⚠️ Esta acción ocultará la materia, sus quices y sesiones. Los datos históricos se conservarán para los reportes. ¿Deseas continuar?
                 </Text>
               </View>
              
              <View style={styles.modalActions}>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.cancelModalButton]}
                  onPress={() => setDeleteModalVisible(false)}
                >
                  <Text style={styles.modalButtonText}>Cancelar</Text>
                </TouchableOpacity>
                 <TouchableOpacity 
                   style={[
                     styles.modalButton, 
                     styles.saveModalButton, 
                     { backgroundColor: '#dc3545' }
                   ]}
                    onPress={async () => {
                     if (!materiaAEliminar) return;
                     try {
                       const headers = await getAuthHeaders();
                       const response = await fetch(`${API_URL}/materias/${materiaAEliminar.mat_id}`, {
                         method: 'DELETE',
                         headers
                       });
                       if (response.ok) {
                         showNotif('Éxito', 'Materia eliminada correctamente');
                         setDeleteModalVisible(false);
                         cargarDatos(true);
                       } else {
                         const errorData = await response.json().catch(() => ({ detail: 'Error desconocido' }));
                         showNotif('Error', errorData.detail || 'No se pudo eliminar la materia', 'error');
                       }
                     } catch (error) {
                       console.error('Error al eliminar materia:', error);
                       showNotif('Error', 'Ocurrió un error al eliminar la materia', 'error');
                     }
                   }}
                >
                  <Text style={styles.modalButtonText}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal de Feedback (éxito/error) */}
        <Modal visible={notifVisible} animationType="fade" transparent={true} onRequestClose={() => setNotifVisible(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ width: '80%', backgroundColor: '#fff', borderRadius: 12, padding: 24, alignItems: 'center' }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>
                {notifType === 'success' ? '✅' : '❌'}
              </Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8 }}>
                {notifTitle}
              </Text>
              <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 }}>
                {notifMsg}
              </Text>
              <TouchableOpacity
                style={{
                  backgroundColor: notifType === 'success' ? '#4CAF50' : '#F44336',
                  borderRadius: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 40,
                }}
                onPress={() => setNotifVisible(false)}
              >
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Aceptar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </>
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
  searchSection: {
    flexDirection: 'row',
    padding: 20,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  addButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#666',
  },
  materiaCard: {
    marginHorizontal: 20,
    marginVertical: 8,
  },
  materiaHeader: {
    marginBottom: 15,
  },
  materiaInfo: {
    marginBottom: 10,
  },
  materiaNombre: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  materiaCodigo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  materiaProfesor: {
    fontSize: 14,
    color: '#666',
  },
  materiaStatus: {
    flexDirection: 'row',
    gap: 8,
  },
  statusIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusActive: {
    backgroundColor: '#4CAF50',
  },
  statusInactive: {
    backgroundColor: '#9E9E9E',
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusTextActive: {
    color: '#fff',
  },
  statusTextInactive: {
    color: '#fff',
  },
  materiaActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: Colors.primary,
  },
  assignButton: {
    backgroundColor: '#2196F3',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '500',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    fontSize: 24,
    color: '#666',
  },
  modalContent: {
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
    color: '#333',
  },
  formInput: {
    height: 40,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  profesoresList: {
    maxHeight: 200,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  profesorSeleccionadoResumen: {
    backgroundColor: `${Colors.primary}15`,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  profesorSeleccionadoTexto: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  profesorOption: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  profesorOptionSelected: {
    backgroundColor: Colors.primary + '20',
  },
  profesorOptionPrincipal: {
    backgroundColor: Colors.secondary + '20',
  },
  principalButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#eee',
    marginLeft: 10,
  },
  principalButtonActive: {
    backgroundColor: Colors.primary,
  },
  principalButtonText: {
    fontSize: 12,
    color: '#666',
  },
  principalButtonTextActive: {
    color: '#fff',
  },
  profesorNombre: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  profesorEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelModalButton: {
    backgroundColor: '#6c757d',
  },
  saveModalButton: {
    backgroundColor: Colors.primary,
  },
  disabledButton: {
    opacity: 0.6,
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
