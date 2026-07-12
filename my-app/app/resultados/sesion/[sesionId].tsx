// Resultados de una sesión de quiz en vivo para el profesor.
// Muestra estadísticas generales (participantes, promedio, mejor/peor nota)
// y el ranking detallado de estudiantes con su nota, tiempo y estado.
// Actualiza los datos en tiempo real cada 3 segundos (polling).
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { AppImage } from '@/components/AppImage';
import { Header } from '@/components/Header';
import { obtenerResultadosGeneralesSesion, obtenerResultadosTiempoReal } from '@/utils/api';

interface Resultado {
  resultado_id: number;
  usuario_id: number;
  usuario_nombre: string;
  usuario_email: string;
  foto_perfil: string | null;
  nota_final: number;
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

interface Sesion {
  id: number;
  codigo_acceso: string;
  fecha_inicio: string;
  fecha_fin: string;
  quiz_titulo: string;
  quiz_tema: string;
  total_preguntas: number;
  modo_juego: string;
  escala_puntuacion: number;
}

export default function ResultadosSesionScreen() {
  const params = useLocalSearchParams();
  const sesionIdParam = params.sesionId as string | undefined;
  const sesionId = sesionIdParam ? Number(sesionIdParam) : 0;
  const router = useRouter();

  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [estadisticas, setEstadisticas] = useState<Estadisticas | null>(null);
  const [error, setError] = useState('');
  const [enCurso, setEnCurso] = useState(0);
  const [completadosCount, setCompletadosCount] = useState(0);

  const cargarResultados = async (mostrarRefresco = false) => {
    if (!sesionId) {
      setError('No se proporcionó una sesión');
      setCargando(false);
      return;
    }

    try {
      if (mostrarRefresco) setRefrescando(true);
      const data = await obtenerResultadosGeneralesSesion(sesionId);
      setSesion(data.sesion || null);
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
    // Cada 3 segundos preguntamos al backend por resultados actualizados.
    // Esto permite ver en vivo cómo los estudiantes van completando el quiz
    // y sus notas parciales sin necesidad de WebSockets.
    const intervalo = setInterval(async () => {
      if (sesionId) {
        try {
          const data = await obtenerResultadosTiempoReal(sesionId);
          setEnCurso(data.en_curso || 0);
          setCompletadosCount(data.completados || 0);
          if (data.resultados && data.resultados.length > 0) {
              setResultados(data.resultados.map((r: any) => ({
                resultado_id: r.usuario_id,
                usuario_id: r.usuario_id,
                usuario_nombre: `${r.nombre} ${r.apellido}`,
                usuario_email: r.email || '',
                foto_perfil: r.foto_perfil || null,
                nota_final: r.nota_actual,
                puntos_ganados: r.puntos_ganados,
                tiempo_total_ms: r.tiempo_transcurrido_ms,
                hora_inicio: r.hora_inicio,
                hora_fin: r.hora_final,
                finalizado_offline: false,
                repeticiones: 0,
                estado: r.estado,
              })));
          }
        } catch (e) {}
      }
    }, 3000);
    return () => clearInterval(intervalo);
  }, [sesionId]);

  // Recargar resultados al enfocar la pantalla (ej: al volver de editar)
  useFocusEffect(
    useCallback(() => {
      cargarResultados();
    }, [sesionId])
  );

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
        showBackButton={true}
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
        <Text style={styles.screenTitle}>Resultados de la sesión</Text>

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
              <Text style={styles.quizTitle}>{sesion?.quiz_titulo || 'Quiz'}</Text>
              {sesion?.quiz_tema ? <Text style={styles.quizSubtitle}>{sesion.quiz_tema}</Text> : null}
              <View style={styles.chipRow}>
                <View style={styles.chip}>
                  <Ionicons name="help-circle-outline" size={14} color="#fff" />
                  <Text style={styles.chipText}>{sesion?.total_preguntas || 0} preguntas</Text>
                </View>
                <View style={styles.chip}>
                  <Ionicons name={sesion?.modo_juego === 'Dificultad' ? 'flame-outline' : 'reorder-two-outline'} size={14} color="#fff" />
                  <Text style={styles.chipText}>{sesion?.modo_juego === 'Dificultad' ? 'Dificultad' : 'Igual'}</Text>
                </View>
                <View style={styles.chip}>
                  <Ionicons name="key-outline" size={14} color="#fff" />
                  <Text style={styles.chipText}>{sesion?.codigo_acceso || 'N/A'}</Text>
                </View>
              </View>
              <View style={styles.fechaRow}>
                <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.fechaTextBanner}>
                  {formatFecha(sesion?.fecha_inicio || null)}  →  {formatFecha(sesion?.fecha_fin || null)}
                </Text>
              </View>
            </View>

            {estadisticas && (
              <View style={styles.statsCard}>
                <Text style={styles.statsTitle}>Estadísticas</Text>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Ionicons name="people-outline" size={20} color={Colors.primary} />
                    <Text style={styles.statValue}>{estadisticas.total_participantes}</Text>
                    <Text style={styles.statLabel}>Participantes</Text>
                  </View>
                  <View style={[styles.statItem, styles.statHighlight]}>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                    <Text style={styles.statValueHighlight}>
                      {estadisticas.total_participantes > 0
                        ? Math.round((estadisticas.total_finalizados / estadisticas.total_participantes) * 100)
                        : 0}%
                    </Text>
                    <Text style={styles.statLabelHighlight}>Completado</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="trending-up-outline" size={20} color={Colors.primary} />
                    <Text style={styles.statValue}>{estadisticas.promedio_nota}/{sesion?.escala_puntuacion || ''}</Text>
                    <Text style={styles.statLabel}>Promedio</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="trophy-outline" size={20} color={Colors.warning} />
                    <Text style={[styles.statValue, { color: Colors.warning }]}>{estadisticas.mejor_nota}/{sesion?.escala_puntuacion || ''}</Text>
                    <Text style={styles.statLabel}>Mejor nota</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="arrow-down-outline" size={20} color={Colors.danger} />
                    <Text style={[styles.statValue, { color: Colors.danger }]}>{estadisticas.peor_nota}/{sesion?.escala_puntuacion || ''}</Text>
                    <Text style={styles.statLabel}>Peor nota</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="time-outline" size={20} color={Colors.info} />
                    <Text style={[styles.statValue, { color: Colors.info }]}>{enCurso}</Text>
                    <Text style={styles.statLabel}>En curso</Text>
                  </View>
                </View>
              </View>
            )}

            <Text style={styles.sectionLabel}>Ranking de Estudiantes ({resultados.length})</Text>

            {resultados.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="document-text-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>Aún no hay resultados para esta sesión</Text>
              </View>
            ) : (
              resultados.map((resultado, index) => {
                const esOro = index === 0;
                const esPlata = index === 1;
                const esBronce = index === 2;
                const badgeBg = esOro ? '#FFD700' : esPlata ? '#C0C0C0' : esBronce ? '#CD7F32' : `${Colors.primary}18`;
                const badgeTextColor = esOro || esPlata || esBronce ? '#fff' : Colors.primary;
                const cardBg = esOro ? '#FFFDE7' : esPlata ? '#F5F5F5' : esBronce ? '#FFF3E0' : '#fff';
                const borderColor = esOro ? '#FFD700' : esPlata ? '#C0C0C0' : esBronce ? '#CD7F32' : 'transparent';

                return (
                <View key={resultado.resultado_id || resultado.usuario_id || index} style={[styles.resultadoCard, { backgroundColor: cardBg, borderLeftWidth: esOro || esPlata || esBronce ? 4 : 0, borderLeftColor: borderColor }]}>
                  <View style={styles.resultadoHeader}>
                    <View style={[styles.posicionContainer, { backgroundColor: badgeBg }]}>
                      <Text style={[styles.posicionText, { color: badgeTextColor, fontSize: esOro || esPlata || esBronce ? 16 : 14 }]}>
                        #{index + 1}
                      </Text>
                    </View>
                    {resultado.foto_perfil ? (
                      <AppImage uri={resultado.foto_perfil} style={styles.fotoPerfil} />
                    ) : (
                      <View style={styles.fotoPerfilPlaceholder}>
                        <Ionicons name="person" size={22} color="#fff" />
                      </View>
                    )}
                    <View style={styles.resultadoInfo}>
                      <Text style={styles.nombreText}>{resultado.usuario_nombre}</Text>
                      <Text style={styles.emailText}>{resultado.usuario_email}</Text>
                      <View style={styles.estadoBadge}>
                        <View style={[styles.estadoDot, { backgroundColor: (resultado as any).estado === 'en_curso' ? Colors.info : Colors.success }]} />
                        <Text style={[styles.estadoTexto, { color: (resultado as any).estado === 'en_curso' ? Colors.info : Colors.success }]}>
                          {(resultado as any).estado === 'en_curso' ? 'En curso' : 'Completado'}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.notaContainer, esOro || esPlata || esBronce ? { backgroundColor: badgeBg } : {}]}>
                      <Text style={[styles.notaText, esOro || esPlata || esBronce ? { color: '#333' } : {}]}>
                        {resultado.nota_final}/{sesion?.escala_puntuacion || 100}
                      </Text>
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
                );
              })
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
  screenTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginBottom: 12,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerCard: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  quizTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  quizSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
    marginBottom: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  fechaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)',
  },
  fechaTextBanner: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
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
    gap: 8,
  },
  statItem: {
    width: '31%',
    flexGrow: 1,
    minWidth: 90,
    backgroundColor: '#f5f7ff',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  statHighlight: {
    backgroundColor: Colors.primary,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  statValueHighlight: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
  statLabelHighlight: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
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
  fotoPerfil: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: '#e0e0e0',
  },
  fotoPerfilPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
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
  estadoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  estadoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  estadoTexto: {
    fontSize: 12,
    fontWeight: '500',
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
