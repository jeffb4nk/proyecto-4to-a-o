// Perfil del profesor dentro del tab de profesor.
// Muestra datos personales, estadísticas (quices y materias),
// enlaces para editar perfil y configurar preguntas de seguridad,
// más la lista de materias que imparte.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { deleteItem } from '@/utils/storage';
import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { Card, CardContent } from '@/components/Card';
import Colors from '@/constants/colors';
import { Usuario } from '@/types/user';
import { getInitials } from '@/utils';
import { Ionicons } from '@expo/vector-icons';
import { LogoutButton } from '@/components/LogoutButton';
import { API_URL } from '@/utils/api';
import { useUser } from '@/contexts/UserContext';
import { AppImage } from '@/components/AppImage';

interface Materia {
  mat_id: number;
  mat_nombre: string;
  mat_codigo: string;
  mat_activo: boolean;
}

export default function PerfilScreen() {
  const { usuario: usuarioActual, cargarUsuario } = useUser();
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [estadisticas, setEstadisticas] = useState({ total_quizes: 0, total_materias: 0 });

  useFocusEffect(
    React.useCallback(() => {
      // Verificar autenticación
      if (!usuarioActual) {
        router.replace('/(tabs)');
        return;
      }

      cargarUsuario();
      cargarMaterias();
      cargarEstadisticas();
    }, [usuarioActual])
  );

  const cargarMaterias = async () => {
    try {
      if (usuarioActual?.usu_id) {
        const response = await fetch(`${API_URL}/materias/profesor/${usuarioActual.usu_id}`);
        if (response.ok) {
          const data = await response.json();
          setMaterias(data.materias || []);
        }
      }
    } catch (error) {
      console.error('Error al cargar materias:', error);
    }
  };

  const cargarEstadisticas = async () => {
    try {
      if (usuarioActual?.usu_id) {
        const response = await fetch(`${API_URL}/materias/estadisticas/profesor/${usuarioActual.usu_id}`);
        if (response.ok) {
          const data = await response.json();
          setEstadisticas(data);
        }
      }
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
    }
  };

  const cerrarSesion = async () => {
    try {
      await deleteItem('user');
      await deleteItem('token');
      router.replace('/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  const handleEditarPerfil = () => {
    if (usuarioActual) {
      router.push({
        pathname: '/profile',
        params: {
          nombre: usuarioActual.usu_nombre,
          apellido: usuarioActual.usu_apellido,
          email: usuarioActual.usu_email,
          rol: usuarioActual.rol_nombre,
          imagen: usuarioActual.usu_imagen || ''
        }
      });
    }
  };

  return (
    <View style={styles.container}>
      <Header
        showProfile={true}
        profileImage={usuarioActual?.usu_imagen}
        profileName={usuarioActual?.usu_nombre}
        profileLastName={usuarioActual?.usu_apellido}
        onProfilePress={() => {}}
      />

      <SectionTitle title="Perfil" />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Información del perfil */}
        <View style={styles.perfilHeader}>
          {usuarioActual?.usu_imagen ? (
            <AppImage uri={usuarioActual.usu_imagen} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>
                {getInitials(usuarioActual?.usu_nombre, usuarioActual?.usu_apellido)}
              </Text>
            </View>
          )}
          <Text style={styles.nombre}>
            {usuarioActual?.usu_nombre} {usuarioActual?.usu_apellido}
          </Text>
          <Text style={styles.email}>{usuarioActual?.usu_email}</Text>
          <View style={styles.rolBadge}>
            <Text style={styles.rolText}>{usuarioActual?.rol_nombre || 'Profesor'}</Text>
          </View>
        </View>

        {/* Estadísticas */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{estadisticas.total_quizes}</Text>
            <Text style={styles.statLabel}>Cuestionarios</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{estadisticas.total_materias}</Text>
            <Text style={styles.statLabel}>Materias</Text>
          </View>
        </View>

        {/* Menú de opciones */}
        <View style={styles.menuContainer}>
          <TouchableOpacity style={styles.menuItem} onPress={handleEditarPerfil}>
            <View style={styles.menuIconContainer}>
              <Ionicons name="person" size={22} color={Colors.primary} />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuTitulo}>Editar Perfil</Text>
              <Text style={styles.menuSubtitulo}>Actualiza tu información</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.menuItem, { backgroundColor: '#FFF3E0', borderRadius: 12, marginTop: 12 }]}
            onPress={() => router.push('/auth/configurar-preguntas' as any)}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#FF9800' + '20' }]}>
              <Ionicons name="shield-checkmark" size={22} color="#FF9800" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuTitulo}>Preguntas de Seguridad</Text>
              <Text style={styles.menuSubtitulo}>Configura tus preguntas para recuperar contraseña</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>
        </View>

        {/* Card de Mis Materias */}
        <View style={styles.materiasCard}>
          <View style={styles.materiasHeader}>
            <Ionicons name="school" size={22} color={Colors.primary} />
            <Text style={styles.materiasTitle}>Mis Materias</Text>
          </View>
          {materias.length > 0 ? (
            materias.map((materia) => (
              <View key={materia.mat_id} style={styles.materiaItem}>
                <Text style={styles.materiaNombre}>{materia.mat_nombre}</Text>
                <Text style={styles.materiaCodigo}>{materia.mat_codigo}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.materiasEmpty}>No tienes materias asignadas</Text>
          )}
        </View>

        {/* Botón cerrar sesión */}
        <LogoutButton onPress={cerrarSesion} />

        <View style={styles.bottomPadding} />
      </ScrollView>
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
  perfilHeader: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: Colors.primary,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: `${Colors.primary}50`,
  },
  avatarPlaceholderText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  nombre: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  rolBadge: {
    backgroundColor: `${Colors.primary}20`,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  rolText: {
    color: Colors.primary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    paddingVertical: 20,
    borderRadius: 12,
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statNum: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e0e0e0',
  },
  menuContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  menuTitulo: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  menuSubtitulo: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  materiasCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  materiasHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  materiasTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  materiaItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  materiaNombre: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  materiaCodigo: {
    fontSize: 13,
    color: '#999',
  },
  materiasEmpty: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  bottomPadding: {
    height: 100,
  },
});
