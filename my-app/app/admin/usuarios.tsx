// Lista de usuarios del sistema visible para el admin.
// Permite buscar por nombre/email y filtrar por rol.
// Al tocar un usuario se navega al detalle donde se puede editar,
// activar/desactivar o ver su reporte de auditoría.
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SearchBar } from '@/components/SearchBar';
import { Badge } from '@/components/Badge';
import { SectionTitle } from '@/components/SectionTitle';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { API_URL, getAuthHeaders } from '@/utils/api';
import Colors from '@/constants/colors';
import { Usuario } from '@/types/user';
import { getInitials } from '@/utils';
import { useUser } from '@/contexts/UserContext';
import { AppImage } from '@/components/AppImage';

export default function UsuariosScreen() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filtroRol, setFiltroRol] = useState<'todos' | 'alumno' | 'profesor' | 'master'>('todos');
  const { usuario: usuarioActual } = useUser();

  useFocusEffect(
    React.useCallback(() => {
      if (!usuarioActual) {
        router.replace('/(tabs)');
        return;
      }
      if (usuarioActual.rol_nombre !== 'master') {
        router.replace('/(tabs)');
        return;
      }
      cargarUsuarios();
    }, [usuarioActual])
  );

  const cargarUsuarios = async () => {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/usuarios/`, { headers });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          Alert.alert('Sesión expirada', 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
          router.replace('/login');
          return;
        }
        throw new Error(`Error HTTP: ${response.status}`);
      }
      const data = await response.json();
      setUsuarios(data);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
    } finally {
      setLoading(false);
    }
  };

  const usuariosFiltrados = (usuarios || [])
    .filter(usuario => {
      if (usuarioActual && usuario.usu_id === usuarioActual.usu_id) {
        return false;
      }
      if (filtroRol !== 'todos') {
        const rolMap: { [key: string]: number } = {
          'alumno': 1,
          'profesor': 2,
          'master': 3
        };
        if (usuario.usu_fk_rol !== rolMap[filtroRol]) {
          return false;
        }
      }
      return `${usuario.usu_nombre} ${usuario.usu_apellido} ${usuario.usu_email}`.toLowerCase().includes(searchText.toLowerCase());
    });

  const navegarADetalle = (usuario: Usuario) => {
    router.push({
      pathname: '/admin/[id]',
      params: { id: usuario.usu_id.toString() }
    });
  };

  const irAPerfil = () => {
    const params = new URLSearchParams();
    if (usuarioActual?.usu_nombre) params.append('nombre', usuarioActual.usu_nombre);
    if (usuarioActual?.usu_apellido) params.append('apellido', usuarioActual.usu_apellido);
    if (usuarioActual?.usu_email) params.append('email', usuarioActual.usu_email);
    if (usuarioActual?.rol_nombre) params.append('rol', usuarioActual.rol_nombre);
    if (usuarioActual?.usu_imagen) params.append('imagen', usuarioActual.usu_imagen);
    router.push(`/profile?${params.toString()}`);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header
          showProfile={true}
          profileImage={usuarioActual?.usu_imagen}
          profileName={usuarioActual?.usu_nombre}
          profileLastName={usuarioActual?.usu_apellido}
          onProfilePress={irAPerfil}
        />
        <Text style={styles.loadingText}>Cargando usuarios...</Text>
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
        onProfilePress={irAPerfil}
      />

      <SectionTitle title="Gestión de Usuarios" />

      <ScrollView
        style={styles.mainScrollView}
        contentContainerStyle={[styles.scrollContent, { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        <View style={styles.searchContainer}>
          <SearchBar
            placeholder="Buscar por nombre, apellido o email..."
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        <View style={styles.filtroContainer}>
          <Card style={styles.filtroCard}>
            <View style={styles.filtroRow}>
              <Text style={styles.filtroLabel}>Filtrar por rol:</Text>
              <View style={styles.filtroButtons}>
                {[
                  { key: 'todos', label: 'Todos' },
                  { key: 'alumno', label: 'Alumnos' },
                  { key: 'profesor', label: 'Profesores' },
                  { key: 'master', label: 'Masters' }
                ].map((rol) => (
                  <TouchableOpacity
                    key={rol.key}
                    style={[
                      styles.filtroButton,
                      filtroRol === rol.key && styles.filtroButtonActive
                    ]}
                    onPress={() => setFiltroRol(rol.key as any)}
                  >
                    <Text style={[
                      styles.filtroButtonText,
                      filtroRol === rol.key && styles.filtroButtonTextActive
                    ]}>
                      {rol.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Card>
        </View>

        {usuariosFiltrados.map((usuario) => (
          <TouchableOpacity
            key={usuario.usu_id}
            style={styles.userItem}
            onPress={() => navegarADetalle(usuario)}
          >
            <View style={styles.userItemContent}>
              {usuario.usu_imagen ? (
                <AppImage uri={usuario.usu_imagen} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarPlaceholderText}>
                    {getInitials(usuario.usu_nombre, usuario.usu_apellido)}
                  </Text>
                </View>
              )}
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{usuario.usu_nombre} {usuario.usu_apellido}</Text>
                <Text style={styles.userEmail}>{usuario.usu_email}</Text>
                <View style={styles.userMeta}>
                  <Badge text={usuario.rol_nombre} />
                  <Badge
                    text={usuario.usu_activo ? 'Activo' : 'Inactivo'}
                    variant={usuario.usu_activo ? 'success' : 'danger'}
                  />
                </View>
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  mainScrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
    paddingTop: 10,
  },
  searchContainer: {
    padding: 16,
    paddingTop: 16,
  },
  userItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarPlaceholderText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  userMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  chevron: {
    fontSize: 28,
    color: '#ccc',
    marginLeft: 12,
  },
  filtroContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  filtroCard: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  filtroRow: {
    marginBottom: 12,
  },
  filtroLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  filtroButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filtroButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  filtroButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filtroButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  filtroButtonTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
