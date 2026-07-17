// Pantalla principal del estudiante: aqui ve su progreso, sus estadisticas
// y los quices que ha hecho recien. Es como el centro de control.
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, BackHandler } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { Card, CardContent } from '@/components/Card';
import Colors from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '@/contexts/UserContext';
import { obtenerEstadisticasEstudiante, obtenerResultadosEstudiante } from '@/utils/api';

export default function EstudianteDashboardScreen() {
  const { usuario: usuarioActual } = useUser();
  const [puntos, setPuntos] = useState(usuarioActual?.usu_puntos_app || 0);
  const [quicesCompletados, setQuicesCompletados] = useState(0);
  const [promedio, setPromedio] = useState(0);
  const [quicesRecientes, setQuicesRecientes] = useState<any[]>([]);
  const [cargandoQuices, setCargandoQuices] = useState(false);

  useEffect(() => {
    if (usuarioActual?.usu_puntos_app) {
      setPuntos(usuarioActual.usu_puntos_app);
    }
  }, [usuarioActual]);

  // Cada vez que la pantalla recibe foco, verificamos que el usuario siga siendo
  // estudiante. Si alguien se cuela sin permiso, lo mandamos pa fuera.
  useFocusEffect(
    React.useCallback(() => {
      if (!usuarioActual) {
        router.replace('/login');
        return;
      }

      if (usuarioActual.rol_nombre !== 'alumno' && usuarioActual.rol_nombre !== 'master') {
        router.replace('/login');
        return;
      }

      cargarEstadisticas();
      cargarQuicesRecientes();

      // Atrapamos el boton fisico de atras para que no se salga de la app
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        return true;
      });

      return () => backHandler.remove();
    }, [usuarioActual])
  );

  // Trae del backend los puntajes, cuantos quices ha hecho y su promedio.
  // Si no hay internet, solo dejamos que el error pase sin panico.
  const cargarEstadisticas = async () => {
    if (!usuarioActual) return;
    
    try {
      const data = await obtenerEstadisticasEstudiante(usuarioActual.usu_id);
      setPuntos(data.estadisticas.puntos);
      setQuicesCompletados(data.estadisticas.quices_completados);
      setPromedio(data.estadisticas.promedio);
    } catch (error: any) {
      if (error?.message !== 'OFFLINE_MODE') {
        console.error('Error al cargar estadísticas:', error);
      }
    }
  };

  // Carga los ultimos 5 quices que el estudiante ya completo, para mostrarlos
  // en la seccion "Quices Recientes" de la pantalla principal.
  const cargarQuicesRecientes = async () => {
    if (!usuarioActual) return;
    
    try {
      setCargandoQuices(true);
      const response = await obtenerResultadosEstudiante(usuarioActual.usu_id);
      const resultados = Array.isArray(response.resultados) ? response.resultados : [];
      const quices = resultados.map((item: any) => ({
        id: item.sesion_id,
        quizId: item.quiz_id,
        titulo: item.quiz_titulo,
        materia: item.materia_nombre,
        nota: item.nota_final,
        escala: item.escala_puntuacion,
        puntos: item.puntos_ganados,
        fecha: item.hora_fin,
      })).slice(0, 5);
      setQuicesRecientes(quices);
    } catch (error: any) {
      if (error?.message !== 'OFFLINE_MODE') {
        console.error('Error al cargar quices recientes:', error);
      }
      setQuicesRecientes([]);
    } finally {
      setCargandoQuices(false);
    }
  };

  const estadisticas = [
    { 
      titulo: 'Puntos', 
      valor: puntos.toString(), 
      icono: 'star', 
      color: Colors.primary 
    },
    { 
      titulo: 'Quices Completados', 
      valor: quicesCompletados.toString(), 
      icono: 'checkmark-circle', 
      color: Colors.success 
    },
    { 
      titulo: 'Promedio', 
      valor: promedio > 0 ? `${promedio}/20` : 'N/A', 
      icono: 'trending-up', 
      color: Colors.secondary 
    },
  ];

  const accionesRapidas = [
    {
      titulo: 'Unirse a Quiz',
      descripcion: 'Ingresa código de acceso',
      icono: 'qr-code-outline',
      color: Colors.primary,
      onPress: () => router.push('/estudiante/unirse' as any),
    },
    {
      titulo: 'Ver Quices',
      descripcion: 'Quices disponibles',
      icono: 'library-outline',
      color: Colors.secondary,
      onPress: () => router.push('/estudiante/quices' as any),
    },
    {
      titulo: 'Mis Logros',
      descripcion: 'Logros y logros',
      icono: 'trophy-outline',
      color: Colors.accent,
      onPress: () => router.push('/estudiante/logros' as any),
    },
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

      {usuarioActual?.rol_nombre === 'master' && (
        <View style={styles.exitModeContainer}>
          <TouchableOpacity 
            style={styles.exitModeButton}
            onPress={() => router.replace('/admin')}
          >
            <Ionicons name="exit-outline" size={20} color="#fff" />
            <Text style={styles.exitModeButtonText}>Salir del Modo Usuario</Text>
          </TouchableOpacity>
        </View>
      )}

      <SectionTitle title="Inicio" />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Sección Estadísticas */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Tu Progreso</Text>
          <Card style={styles.estadisticasCard}>
            <CardContent>
              <View style={styles.estadisticasRow}>
                {estadisticas.map((estadistica, index) => (
                  <View key={index} style={styles.estadisticaItem}>
                    <View style={[styles.estadisticaIconContainer, { backgroundColor: `${estadistica.color}20` }]}>
                      <Ionicons name={estadistica.icono as any} size={32} color={estadistica.color} />
                    </View>
                    <Text style={styles.estadisticaValor}>{estadistica.valor}</Text>
                    <Text style={styles.estadisticaLabel}>{estadistica.titulo}</Text>
                  </View>
                ))}
              </View>
            </CardContent>
          </Card>
        </View>

        {/* Sección Acciones Rápidas */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
          {accionesRapidas.map((accion, index) => (
            <TouchableOpacity
              key={index}
              style={styles.accionCard}
              onPress={accion.onPress}
              activeOpacity={0.7}
            >
              <View style={[styles.accionIconContainer, { backgroundColor: `${accion.color}20` }]}>
                <Ionicons name={accion.icono as any} size={28} color={accion.color} />
              </View>
              <View style={styles.accionInfo}>
                <Text style={styles.accionTitulo}>{accion.titulo}</Text>
                <Text style={styles.accionDescripcion}>{accion.descripcion}</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#ccc" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Sección Quices Recientes */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quices Recientes</Text>
            <TouchableOpacity onPress={() => router.push('/estudiante/quices' as any)}>
              <Text style={styles.verTodo}>Ver todo →</Text>
            </TouchableOpacity>
          </View>
          {cargandoQuices ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>Cargando...</Text>
            </View>
          ) : quicesRecientes.length > 0 ? (
            quicesRecientes.map((quiz) => (
              <TouchableOpacity
                key={quiz.id}
                style={styles.quizCard}
                onPress={() => router.push({
                  pathname: `/estudiante/quiz/${quiz.quizId}`,
                  params: { sesionId: quiz.id }
                } as any)}
              >
                <View style={styles.quizInfo}>
                  <View style={[styles.quizIcon, { backgroundColor: Colors.success + '20' }]}>
                    <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
                  </View>
                  <View style={styles.quizDetails}>
                    <Text style={styles.quizTitle}>{quiz.titulo}</Text>
                    <Text style={styles.quizSubtitle}>{quiz.materia}</Text>
                    <Text style={styles.quizMeta}>
                      Nota: {quiz.nota}/{quiz.escala ?? 100} | {quiz.fecha ? new Date(quiz.fecha).toLocaleString('es-ES', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      }) : 'N/A'}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#ccc" />
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="library-outline" size={40} color="#ccc" />
              <Text style={styles.emptyStateText}>No hay quices completados</Text>
              <TouchableOpacity 
                style={styles.unirseButton}
                onPress={() => router.push('/estudiante/unirse' as any)}
              >
                <Text style={styles.unirseButtonText}>Unirse con código</Text>
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
  exitModeContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  exitModeButton: {
    backgroundColor: '#dc3545',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  exitModeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  verTodo: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
  },
  // Estadísticas
  estadisticasCard: {
    marginBottom: 8,
  },
  estadisticasRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  estadisticaItem: {
    alignItems: 'center',
  },
  estadisticaIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  estadisticaValor: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  estadisticaLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  // Acciones rápidas
  accionCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  accionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  accionInfo: {
    flex: 1,
  },
  accionTitulo: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  accionDescripcion: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  // Empty state
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
  quizCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  quizInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quizIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  quizDetails: {
    flex: 1,
  },
  quizTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  quizSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  quizMeta: {
    fontSize: 12,
    color: Colors.primary,
    marginTop: 4,
    fontWeight: '500',
  },
  bottomPadding: {
    height: 100,
  },
});
