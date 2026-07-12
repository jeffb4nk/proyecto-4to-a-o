import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SectionTitle } from '@/components/SectionTitle';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { useUser } from '@/contexts/UserContext';

// Pantalla principal del panel de administración.
// Desde acá el admin puede saltar a los distintos modos de testing
// (profesor/estudiante) o gestionar el sistema: usuarios, materias y auditoría.
export default function AdminScreen() {
  const { usuario: usuarioActual } = useUser();

  useFocusEffect(
    React.useCallback(() => {
      // Solo entra acá quien sea master. Si no, lo mandamos a la raíz.
      if (!usuarioActual) {
        router.replace('/(tabs)');
        return;
      }
      if (usuarioActual.rol_nombre !== 'master') {
        router.replace('/(tabs)');
        return;
      }
    }, [usuarioActual])
  );

  const irAPerfil = () => {
    const params = new URLSearchParams();
    if (usuarioActual?.usu_nombre) params.append('nombre', usuarioActual.usu_nombre);
    if (usuarioActual?.usu_apellido) params.append('apellido', usuarioActual.usu_apellido);
    if (usuarioActual?.usu_email) params.append('email', usuarioActual.usu_email);
    if (usuarioActual?.rol_nombre) params.append('rol', usuarioActual.rol_nombre);
    if (usuarioActual?.usu_imagen) params.append('imagen', usuarioActual.usu_imagen);
    router.push(`/profile?${params.toString()}`);
  };

  return (
    <View style={styles.container}>
      <Header
        showProfile={true}
        profileImage={usuarioActual?.usu_imagen}
        profileName={usuarioActual?.usu_nombre}
        profileLastName={usuarioActual?.usu_apellido}
        onProfilePress={irAPerfil}
      />

      <ScrollView
        style={styles.mainScrollView}
        contentContainerStyle={[styles.scrollContent, { flexGrow: 1, paddingTop: 10 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        <SectionTitle title="Modos de Testing" />

        <View style={styles.testingContainer}>
          <Card style={styles.testingCard}>
            <TouchableOpacity
              style={styles.testingButton}
              onPress={() => router.push('/profesor')}
            >
              <View style={styles.testingButtonContent}>
                <Text style={styles.testingButtonIcon}>👨‍🏫</Text>
                <View style={styles.testingButtonTextContainer}>
                  <Text style={styles.testingButtonTitle}>Modo Profesor</Text>
                  <Text style={styles.testingButtonSubtitle}>Acceder a quices, reportes y materias</Text>
                </View>
              </View>
              <Text style={styles.testingButtonArrow}>›</Text>
            </TouchableOpacity>
          </Card>

          <Card style={styles.testingCard}>
            <TouchableOpacity
              style={styles.testingButton}
              onPress={() => router.push('/estudiante')}
            >
              <View style={styles.testingButtonContent}>
                <Text style={styles.testingButtonIcon}>👨‍🎓</Text>
                <View style={styles.testingButtonTextContainer}>
                  <Text style={styles.testingButtonTitle}>Modo Estudiante</Text>
                  <Text style={styles.testingButtonSubtitle}>Acceder a dashboard, logros y quizes</Text>
                </View>
              </View>
              <Text style={styles.testingButtonArrow}>›</Text>
            </TouchableOpacity>
          </Card>
        </View>

        <SectionTitle title="Gestión del Sistema" />

        <View style={styles.testingContainer}>
          <Card style={styles.testingCard}>
            <TouchableOpacity
              style={styles.testingButton}
              onPress={() => router.push('/admin/auditoria')}
            >
              <View style={styles.testingButtonContent}>
                <Text style={styles.testingButtonIcon}>📊</Text>
                <View style={styles.testingButtonTextContainer}>
                  <Text style={styles.testingButtonTitle}>Auditoría del Sistema</Text>
                  <Text style={styles.testingButtonSubtitle}>Ver estadísticas generales y reportes</Text>
                </View>
              </View>
              <Text style={styles.testingButtonArrow}>›</Text>
            </TouchableOpacity>
          </Card>

          <Card style={styles.testingCard}>
            <TouchableOpacity
              style={styles.testingButton}
              onPress={() => router.push('/admin/materias')}
            >
              <View style={styles.testingButtonContent}>
                <Text style={styles.testingButtonIcon}>📚</Text>
                <View style={styles.testingButtonTextContainer}>
                  <Text style={styles.testingButtonTitle}>Gestión de Materias</Text>
                  <Text style={styles.testingButtonSubtitle}>Crear, editar y asignar materias</Text>
                </View>
              </View>
              <Text style={styles.testingButtonArrow}>›</Text>
            </TouchableOpacity>
          </Card>

          <Card style={styles.testingCard}>
            <TouchableOpacity
              style={styles.testingButton}
              onPress={() => router.push('/admin/usuarios')}
            >
              <View style={styles.testingButtonContent}>
                <Text style={styles.testingButtonIcon}>👥</Text>
                <View style={styles.testingButtonTextContainer}>
                  <Text style={styles.testingButtonTitle}>Gestión de Usuarios</Text>
                  <Text style={styles.testingButtonSubtitle}>Ver, editar y gestionar usuarios del sistema</Text>
                </View>
              </View>
              <Text style={styles.testingButtonArrow}>›</Text>
            </TouchableOpacity>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  mainScrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  testingContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  testingCard: {
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  testingButton: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  testingButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  testingButtonIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  testingButtonTextContainer: {
    flex: 1,
  },
  testingButtonTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  testingButtonSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  testingButtonArrow: {
    fontSize: 28,
    color: '#ccc',
  },
});
