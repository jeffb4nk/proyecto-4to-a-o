// Pantalla de perfil compartida entre admin, profesor y estudiante.
// Muestra los datos del usuario y permite editar nombre, apellido, email y foto.
// Los datos se reciben por parámetros de ruta para evitar consultas extras al backend.
// Al guardar, actualiza SecureStore, el contexto y fuerza una recarga desde API.
import React, { useState, useRef } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Keyboard, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { getItem, setItem } from '@/utils/storage';
import { API_URL, getAuthHeaders } from '@/utils/api';
import Colors from '@/constants/colors';
import { Header } from '@/components/Header';
import { LogoutButton } from '@/components/LogoutButton';
import { getInitials, pickImage } from '@/utils';
import { useUser } from '@/contexts/UserContext';
import { AppImage } from '@/components/AppImage';

export default function ProfileScreen() {
  const { cerrarSesion, actualizarUsuario, cargarUsuario } = useUser();
  // Tomamos los parámetros de la ruta de una vez, sin esperar efectos.
  // Así la pantalla se renderiza inmediatamente con los datos disponibles.
  const params = useLocalSearchParams();
  const nombre = (params.nombre as string) || '';
  const apellido = (params.apellido as string) || '';
  const email = (params.email as string) || '';
  const rol = (params.rol as string) || '';
  const imagen = (params.imagen as string) || '';

  const [isEditing, setIsEditing] = useState(false);
  // Inicializamos los estados de edición con los valores actuales
  // para que el formulario arranque lleno sin esperar a useEffect.
  const [editNombre, setEditNombre] = React.useState(nombre);
  const [editApellido, setEditApellido] = React.useState(apellido);
  const [editEmail, setEditEmail] = React.useState(email);
  const [editImagen, setEditImagen] = React.useState(imagen);
  const [mostrarExito, setMostrarExito] = useState(false);
  const [updatedUserData, setUpdatedUserData] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);
  const lastPutTime = useRef(0);

  const handlePickImage = async () => {
    const image = await pickImage();
    if (image) setEditImagen(image);
  };

  const handleLogout = async () => {
    await cerrarSesion();
    router.replace('/login');
  };

  // Guarda los cambios del perfil contra el backend.
  // Primero actualiza en SecureStore (sin imagen si es muy grande por el límite
  // de 2048 bytes en Android) y luego fuerza una recarga completa desde API
  // para evitar cualquier estado inconsistente entre contexto y storage.
  const handleSave = async () => {
    if (guardandoRef.current) return;
    const now = Date.now();
    if (now - lastPutTime.current < 2000) return;
    lastPutTime.current = now;
    guardandoRef.current = true;
    setGuardando(true);
    try {
      const userJson = await getItem('user');
      if (!userJson) {
        Alert.alert('Error', 'No se encontró información del usuario');
        return;
      }

      const usuario = JSON.parse(userJson);
      const userId = usuario.usu_id;

      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/usuarios/${userId}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usu_nombre: editNombre,
          usu_apellido: editApellido,
          usu_email: editEmail,
          usu_imagen: editImagen || null,
        }),
      });

      if (response.ok) {
        const updatedUser = await response.json();
        
        // SecureStore en Android solo acepta 2048 bytes.
        // Si la imagen base64 es muy grande, la descartamos del storage local.
        // La imagen completa sigue en el backend y se sirve por API.
        const userToSave = { ...updatedUser };
        if (userToSave.usu_imagen && userToSave.usu_imagen.length > 1000) {
            userToSave.usu_imagen = null;
        }
        
        // Actualizamos SecureStore y contexto.
        // El orden importa: primero storage, luego contexto, luego recarga.
        await setItem('user', JSON.stringify(userToSave));
        actualizarUsuario(updatedUser);
        await cargarUsuario(true);
        
        setIsEditing(false);
        setUpdatedUserData(updatedUser);
        setMostrarExito(true);
      } else {
        if (response.status === 401 || response.status === 403) {
          Alert.alert('Sesión expirada', 'Tu sesión ha expirado. Redirigiendo al login...');
          router.replace('/login');
          return;
        }
        const errorData = await response.json().catch(() => ({ detail: 'Error desconocido' }));
        Alert.alert('Error', errorData.detail || 'No se pudieron guardar los cambios');
      }
    } catch (error) {
      console.error('Error al guardar:', error);
      Alert.alert('Error', 'Ocurrió un error al guardar los cambios');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header
        showBackButton={true}
        onBackPress={() => router.back()}
      />

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.profileSection}>
          <TouchableOpacity onPress={isEditing ? handlePickImage : undefined} disabled={!isEditing}>
            {editImagen ? (
              <AppImage uri={editImagen} style={styles.profileImage} />
            ) : imagen ? (
              <AppImage uri={imagen} style={styles.profileImage} />
            ) : (
              <View style={styles.profilePlaceholder}>
                <Text style={styles.profilePlaceholderText}>{getInitials(nombre, apellido)}</Text>
              </View>
            )}
            {isEditing && (
              <View style={styles.editImageOverlay}>
                <Text style={styles.editImageIcon}>📷</Text>
              </View>
            )}
          </TouchableOpacity>
          
          <Text style={styles.userName}>{nombre} {apellido}</Text>
          <Text style={styles.userRole}>{rol}</Text>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Nombre</Text>
            {isEditing ? (
              <TextInput
                style={styles.infoInput}
                value={editNombre}
                onChangeText={setEditNombre}
              />
            ) : (
              <Text style={styles.infoValue}>{nombre}</Text>
            )}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Apellido</Text>
            {isEditing ? (
              <TextInput
                style={styles.infoInput}
                value={editApellido}
                onChangeText={setEditApellido}
              />
            ) : (
              <Text style={styles.infoValue}>{apellido}</Text>
            )}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Email</Text>
            {isEditing ? (
              <TextInput
                style={styles.infoInput}
                value={editEmail}
                onChangeText={setEditEmail}
                keyboardType="email-address"
              />
            ) : (
              <Text style={styles.infoValue}>{email}</Text>
            )}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Rol</Text>
            <Text style={styles.infoValue}>{rol}</Text>
          </View>
        </View>

        <View style={styles.buttonSection}>
          {isEditing ? (
            <>
              <TouchableOpacity style={[styles.saveButton, guardando && { opacity: 0.5 }]} onPress={handleSave} disabled={guardando}>
                <Text style={styles.saveButtonText}>{guardando ? 'Guardando...' : 'Guardar Cambios'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setIsEditing(false)}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)}>
              <Text style={styles.editButtonText}>Editar Perfil</Text>
            </TouchableOpacity>
          )}

          <LogoutButton onPress={handleLogout} />
        </View>
      </ScrollView>

      {/* Modal de éxito */}
      <Modal
        visible={mostrarExito}
        transparent
        animationType="fade"
        onRequestClose={() => setMostrarExito(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <Ionicons name="checkmark-circle" size={64} color="#34C759" />
            <Text style={modalStyles.title}>Éxito</Text>
            <Text style={modalStyles.message}>Datos actualizados correctamente</Text>
             <TouchableOpacity
               style={modalStyles.button}
               onPress={() => {
                 setMostrarExito(false);
                 if (updatedUserData) {
                   router.replace({
                     pathname: '/profile',
                     params: {
                       nombre: updatedUserData.usu_nombre,
                       apellido: updatedUserData.usu_apellido,
                       email: updatedUserData.usu_email,
                       rol: updatedUserData.rol_nombre || 'Usuario', // Asegurar que haya un rol
                       imagen: updatedUserData.usu_imagen || ''
                     }
                   });
                 }
               }}
             >
               <Text style={modalStyles.buttonText}>Aceptar</Text>
             </TouchableOpacity>
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
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: 30,
  },
  profileSection: {
    alignItems: 'center',
    padding: 30,
    paddingTop: 20,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
  },
  profilePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  profilePlaceholderText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  editImageOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.primary,
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editImageIcon: {
    fontSize: 20,
  },
  userName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  userRole: {
    fontSize: 18,
    color: '#666',
    fontWeight: '500',
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 18,
    color: '#333',
    fontWeight: 'bold',
  },
  infoInput: {
    fontSize: 18,
    color: '#333',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f8f9fa',
  },
  buttonSection: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  editButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#34C759',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#FF9500',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    width: '80%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#34C759',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
