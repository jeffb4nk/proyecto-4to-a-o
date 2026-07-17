// Pantalla de perfil del estudiante. Aqui puede ver sus datos, sus estadisticas
// generales, editar su informacion, configurar preguntas de seguridad y cerrar
// sesion. Es como su carta de presentacion en la app.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { Card, CardContent } from '@/components/Card';
import Colors from '@/constants/colors';
import { Usuario } from '@/types/user';
import { getInitials } from '@/utils';
import { Ionicons } from '@expo/vector-icons';
import { LogoutButton } from '@/components/LogoutButton';
import { useUser } from '@/contexts/UserContext';
import { obtenerEstadisticasEstudiante } from '@/utils/api';
import { AppImage } from '@/components/AppImage';

export default function EstudiantePerfilScreen() {
  const { usuario: usuarioActual, cargarUsuario, cerrarSesion: cerrarSesionContext } = useUser();
  const [estadisticas, setEstadisticas] = useState({ 
    quices_completados: 0, 
    promedio_nota: 0,
    puntos_totales: 0 
  });

  useFocusEffect(
    React.useCallback(() => {
      // Verificar autenticación
      if (!usuarioActual) {
        router.replace('/(tabs)');
        return;
      }

      cargarUsuario();
      cargarEstadisticas();
    }, [usuarioActual])
  );

  const cargarEstadisticas = async () => {
    try {
      if (usuarioActual?.usu_id) {
        const data = await obtenerEstadisticasEstudiante(usuarioActual.usu_id);
        const stats = data.estadisticas || data;
        setEstadisticas({
          quices_completados: stats.quices_completados || 0,
          promedio_nota: stats.promedio || stats.promedio_nota || 0,
          puntos_totales: stats.puntos || stats.puntos_totales || usuarioActual.usu_puntos_app || 0
        });
      }
    } catch (error: any) {
      if (error?.message !== 'OFFLINE_MODE') {
        console.error('Error al cargar estadísticas:', error);
      }
      setEstadisticas({
        quices_completados: 0,
        promedio_nota: 0,
        puntos_totales: usuarioActual?.usu_puntos_app || 0
      });
    }
  };

  const cerrarSesion = async () => {
    try {
      await cerrarSesionContext();
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
            <Text style={styles.rolText}>{usuarioActual?.rol_nombre || 'Estudiante'}</Text>
          </View>
        </View>

        {/* Estadísticas */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{estadisticas.quices_completados}</Text>
            <Text style={styles.statLabel}>Quices</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{estadisticas.promedio_nota}/20</Text>
            <Text style={styles.statLabel}>Promedio</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{estadisticas.puntos_totales}</Text>
            <Text style={styles.statLabel}>Puntos</Text>
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
            style={styles.menuItem} 
            onPress={() => router.push('/estudiante/logros' as any)}
          >
            <View style={styles.menuIconContainer}>
              <Ionicons name="trophy" size={22} color={Colors.secondary} />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuTitulo}>Mis Logros</Text>
              <Text style={styles.menuSubtitulo}>Ver tus logros desbloqueados</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>
        </View>

          {/* Configurar preguntas de seguridad */}
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
  bottomPadding: {
    height: 100,
  },
});
