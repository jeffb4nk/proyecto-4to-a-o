// Pantalla de reportes del estudiante. Muestra un resumen de su rendimiento
// con promedios y detalles de cada quiz completado. Por ahora usa datos de
// ejemplo porque la conexion con el backend esta pendiente.
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { getItem } from '@/utils/storage';
import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { Card, CardContent } from '@/components/Card';
import Colors from '@/constants/colors';
import { Usuario } from '@/types/user';
import { Ionicons } from '@expo/vector-icons';

export default function EstudianteReportesScreen() {
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);
  const [reportes, setReportes] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);

  useFocusEffect(
    React.useCallback(() => {
      cargarUsuarioActual();
      cargarReportes();
    }, [])
  );

  const cargarUsuarioActual = async () => {
    try {
      const userJson = await getItem('user');
      if (userJson) {
        setUsuarioActual(JSON.parse(userJson));
      }
    } catch (error) {
      console.error('Error al cargar usuario actual:', error);
    }
  };

  const cargarReportes = async () => {
    // TODO: Implementar llamada a API para obtener reportes del estudiante
    setCargando(false);
    setReportes([]);
  };

  const reportesEjemplo = [
    {
      id: 1,
      quizTitulo: 'Quiz de Matemáticas',
      materia: 'Matemáticas',
      fecha: '2024-01-15',
      nota: 85,
      escala: 100,
      tiempo: '15:30',
      estado: 'Completado'
    },
    {
      id: 2,
      quizTitulo: 'Quiz de Historia',
      materia: 'Historia',
      fecha: '2024-01-10',
      nota: 92,
      escala: 100,
      tiempo: '12:45',
      estado: 'Completado'
    }
  ];

  return (
    <View style={styles.container}>
      <Header
        showProfile={true}
        profileImage={usuarioActual?.usu_imagen}
        profileName={usuarioActual?.usu_nombre}
        profileLastName={usuarioActual?.usu_apellido}
        onProfilePress={() => router.push('/estudiante/perfil' as any)}
      />

      <SectionTitle title="Reportes" />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Estadísticas Generales */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Tu Rendimiento</Text>
          <Card style={styles.statsCard}>
            <CardContent>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>88.5</Text>
                  <Text style={styles.statLabel}>Promedio</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>2</Text>
                  <Text style={styles.statLabel}>Quices</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>14:07</Text>
                  <Text style={styles.statLabel}>Tiempo Prom.</Text>
                </View>
              </View>
            </CardContent>
          </Card>
        </View>

        {/* Reportes Detallados */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Reportes Detallados</Text>
          
          {cargando ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Cargando reportes...</Text>
            </View>
          ) : reportesEjemplo.length > 0 ? (
            reportesEjemplo.map((reporte) => (
              <TouchableOpacity
                key={reporte.id}
                style={styles.reporteCard}
                onPress={() => {
                  // TODO: Navegar a detalles del reporte
                  Alert.alert('Info', 'Detalles del reporte en desarrollo');
                }}
              >
                <View style={styles.reporteHeader}>
                  <View style={styles.reporteInfo}>
                    <Text style={styles.reporteTitulo}>{reporte.quizTitulo}</Text>
                    <Text style={styles.reporteMateria}>{reporte.materia}</Text>
                  </View>
                  <View style={[styles.notaBadge, { backgroundColor: reporte.nota >= 90 ? Colors.success : reporte.nota >= 70 ? Colors.secondary : Colors.accent }]}>
                    <Text style={styles.notaText}>{reporte.nota}/{reporte.escala}</Text>
                  </View>
                </View>
                
                <View style={styles.reporteMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={16} color="#666" />
                    <Text style={styles.metaText}>{reporte.fecha}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="timer-outline" size={16} color="#666" />
                    <Text style={styles.metaText}>{reporte.tiempo}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                    <Text style={styles.metaText}>{reporte.estado}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={40} color="#ccc" />
              <Text style={styles.emptyStateText}>No tienes reportes disponibles</Text>
              <TouchableOpacity 
                style={styles.unirseButton}
                onPress={() => router.push('/estudiante/unirse' as any)}
              >
                <Text style={styles.unirseButtonText}>Unirse a un Quiz</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

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
  sectionContainer: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  statsCard: {
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
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
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  reporteCard: {
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
  reporteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  reporteInfo: {
    flex: 1,
  },
  reporteTitulo: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  reporteMateria: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  notaBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 40,
    alignItems: 'center',
  },
  notaText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  reporteMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    marginBottom: 12,
  },
  unirseButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
    borderRadius: 16,
  },
  unirseButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  bottomPadding: {
    height: 100,
  },
});