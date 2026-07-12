// Resultados globales de un quiz (todas las sesiones donde se usó).
// Muestra estadísticas generales y la lista de estudiantes que lo presentaron
// con sus notas, tiempo y si fue offline.
// Útil para que el profesor vea el rendimiento histórico de un mismo quiz.
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { obtenerResultadosGeneralesQuiz } from '@/utils/api';

interface Resultado {
  resultado_id: number;
  sesion_id: number;
  codigo_acceso: string;
  usuario_id: number;
  usuario_nombre: string;
  usuario_email: string;
  nota_final: number;
  escala_puntuacion: number;
  puntos_ganados: number;
  tiempo_total_ms: number;
  hora_inicio: string | null;
  hora_fin: string | null;
  finalizado_offline: boolean;
  repeticiones: number;
}

interface Estadisticas {
  total_participantes: number;
  total_finalizados: number;
  promedio_nota: number;
  promedio_puntos: number;
  mejor_nota: number;
  peor_nota: number;
}

export default function ResultadosQuizScreen() {
  const params = useLocalSearchParams();
  const quizId = params.quizId as string | undefined;
  const router = useRouter();

  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [titulo, setTitulo] = useState('Quiz');
  const [tema, setTema] = useState('');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [estadisticas, setEstadisticas] = useState<Estadisticas | null>(null);
  const [error, setError] = useState('');

  const cargarResultados = async (mostrarRefresco = false) => {
    if (!quizId) {
      setError('No se proporcionó un quiz');
      setCargando(false);
      return;
    }

    try {
      if (mostrarRefresco) setRefrescando(true);
      const data = await obtenerResultadosGeneralesQuiz(quizId);
      setTitulo(data.quiz?.titulo || 'Quiz');
      setTema(data.quiz?.tema || '');
      setResultados(data.resultados || []);
      setEstadisticas(data.estadisticas || null);
      setError('');
    } catch (err: any) {
      setError(err.message || 'No se pudieron cargar los resultados');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  };

  useEffect(() => {
    cargarResultados();
  }, [quizId]);

  const formatTiempo = (ms: number) => {
    const segundos = Math.floor(ms / 1000);
    const minutos = Math.floor(segundos / 60);
    const segRestantes = segundos % 60;
    return `${minutos}m ${segRestantes}s`;
  };

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return 'N/A';
    const date = new Date(fecha);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        showProfile={false}
        profileImage=""
        profileName=""
        profileLastName=""
        onProfilePress={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={() => cargarResultados(true)} />
        }
      >
        <SectionTitle title="Resultados del Quiz" />

        {cargando ? (
          <ActivityIndicator size="large" color={Colors.primary} />
        ) : error ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
            <Text style={styles.emptyText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => cargarResultados(true)}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.headerCard}>
              <Text style={styles.quizTitle}>{titulo}</Text>
              {tema ? <Text style={styles.quizSubtitle}>{tema}</Text> : null}
            </View>

            {estadisticas && (
              <View style={styles.statsCard}>
                <Text style={styles.statsTitle}>Estadísticas generales</Text>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{estadisticas.total_participantes}</Text>
                    <Text style={styles.statLabel}>Participantes</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{estadisticas.promedio_nota}</Text>
                    <Text style={styles.statLabel}>Promedio</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{estadisticas.mejor_nota}</Text>
                    <Text style={styles.statLabel}>Mejor nota</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{estadisticas.peor_nota}</Text>
                    <Text style={styles.statLabel}>Peor nota</Text>
                  </View>
                </View>
              </View>
            )}

            <Text style={styles.sectionLabel}>Lista de resultados</Text>

            {resultados.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="document-text-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>Aún no hay resultados para este quiz</Text>
              </View>
            ) : (
              resultados.map((resultado, index) => (
                <View key={resultado.resultado_id} style={styles.resultadoCard}>
                  <View style={styles.resultadoHeader}>
                    <View style={styles.posicionContainer}>
                      <Text style={styles.posicionText}>#{index + 1}</Text>
                    </View>
                    <View style={styles.resultadoInfo}>
                      <Text style={styles.nombreText}>{resultado.usuario_nombre}</Text>
                      <Text style={styles.emailText}>{resultado.usuario_email}</Text>
                    </View>
                    <View style={styles.notaContainer}>
                      <Text style={styles.notaText}>{resultado.nota_final}/{resultado.escala_puntuacion ?? 100}</Text>
                    </View>
                  </View>

                  <View style={styles.resultadoDetalles}>
                    <View style={styles.detalleItem}>
                      <Ionicons name="time-outline" size={16} color={Colors.primary} />
                      <Text style={styles.detalleText}>{formatTiempo(resultado.tiempo_total_ms)}</Text>
                    </View>
                    <View style={styles.detalleItem}>
                      <Ionicons name="star-outline" size={16} color={Colors.primary} />
                      <Text style={styles.detalleText}>{resultado.puntos_ganados} pts</Text>
                    </View>
                    {resultado.finalizado_offline && (
                      <View style={styles.detalleItem}>
                        <Ionicons name="cloud-offline-outline" size={16} color={Colors.secondary} />
                        <Text style={styles.detalleTextOffline}>Offline</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.fechasContainer}>
                    <Text style={styles.fechaText}>Inicio: {formatFecha(resultado.hora_inicio)}</Text>
                    <Text style={styles.fechaText}>Fin: {formatFecha(resultado.hora_fin)}</Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  quizTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  quizSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statItem: {
    width: '48%',
    backgroundColor: '#f5f7ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  resultadoCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  resultadoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  posicionContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  posicionText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  resultadoInfo: {
    flex: 1,
  },
  nombreText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  emailText: {
    fontSize: 12,
    color: '#999',
  },
  notaContainer: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  notaText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  resultadoDetalles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 10,
  },
  detalleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detalleText: {
    fontSize: 13,
    color: '#666',
  },
  detalleTextOffline: {
    fontSize: 13,
    color: Colors.secondary,
    fontWeight: '600',
  },
  fechasContainer: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 10,
  },
  fechaText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 15,
    color: '#666',
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
});
