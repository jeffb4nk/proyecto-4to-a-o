import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '@/contexts/UserContext';
import Colors from '@/constants/colors';
import { resolveImageUrl } from '@/components/AppImage';
import { obtenerDetalleEstudianteSesion, obtenerResultadosGeneralesSesion } from '@/utils/api';

interface DetalleEstudiante {
  estudiante: {
    usu_id: number;
    usu_nombre: string;
    usu_apellido: string;
    usu_imagen?: string;
  };
  sesion: {
    ses_id: number;
    quiz_titulo: string;
    ses_puntuacion_tipo: string;
    escala_puntuacion: number;
  };
  estadisticas: {
    nota_final: number;
    porcentaje_aciertos: number;
    tiempo_total_segundos: number;
  };
  informe_fallas: {
    preguntas: Array<{
      nro_orden: number;
      enunciado: string;
      tipo: string;
      respuesta_usuario: string;
      respuesta_correcta: string;
      es_correcta: boolean;
      tiempo_limite_segundos: number;
    }>;
  };
}

interface ResultadoGeneral {
  usuario_id: number;
  nombre_completo: string;
  nota: number;
  tiempo: number;
  usu_imagen?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ReporteEstudiante() {
  const { sesionId } = useLocalSearchParams();
  const router = useRouter();
  const { usuario } = useUser();

  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState<DetalleEstudiante | null>(null);
  const [ranking, setRanking] = useState<ResultadoGeneral[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function cargarDatos() {
      if (!sesionId || !usuario) return;

      try {
        setLoading(true);
        const [detalleData, rankingData] = await Promise.all([
          obtenerDetalleEstudianteSesion(Number(sesionId), usuario.usu_id),
          obtenerResultadosGeneralesSesion(Number(sesionId))
        ]);

        const backend = detalleData;
        const transformed: DetalleEstudiante = {
          estudiante: {
            usu_id: backend.estudiante?.usuario_id,
            usu_nombre: backend.estudiante?.nombre,
            usu_apellido: backend.estudiante?.apellido,
            usu_imagen: backend.estudiante?.foto_perfil,
          },
          sesion: {
            ses_id: backend.sesion?.ses_id,
            quiz_titulo: backend.sesion?.quiz_titulo,
            ses_puntuacion_tipo: backend.sesion?.modo_juego || 'Igual',
            escala_puntuacion: backend.sesion?.escala_puntuacion || 100,
          },
          estadisticas: {
            nota_final: backend.resultado?.nota_final || 0,
            porcentaje_aciertos: backend.informe_detalle?.resumen?.porcentaje_aciertos
              ?? ((backend.resultado?.nota_final || 0) / (backend.sesion?.escala_puntuacion || 100)) * 100,
            tiempo_total_segundos: (backend.resultado?.tiempo_total_ms || 0) / 1000,
          },
          informe_fallas: {
            preguntas: backend.informe_detalle?.preguntas || [],
          },
        };

        setDetalle(transformed);

        const rawResults = Array.isArray(rankingData) ? rankingData : (rankingData.resultados || []);
        const mappedRanking: ResultadoGeneral[] = rawResults.map((r: any) => {
          const fullName = (r.usuario_nombre || r.nombre || r.usu_nombre || '').trim();
          return {
            usuario_id: r.usuario_id,
            nombre_completo: fullName || 'Estudiante',
            nota: r.nota_final || r.nota_actual || 0,
            tiempo: r.tiempo_total_ms ? Math.floor(r.tiempo_total_ms / 1000) : (r.tiempo_segundos || 0),
            usu_imagen: r.foto_perfil || r.usu_imagen || r.foto,
          };
        });
        setRanking(mappedRanking);
      } catch (err: any) {
        console.error('Error cargando reporte:', err);
        setError(err.message || 'Error al cargar los datos del reporte');
      } finally {
        setLoading(false);
      }
    }

    cargarDatos();
  }, [sesionId, usuario]);

  const formattedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const getGradeColor = (nota: number, escala: number) => {
    const pct = (nota / escala) * 100;
    if (pct >= 60) return '#34C759';
    if (pct >= 40) return '#FF9500';
    return '#FF3B30';
  };

  const getGradeBg = (nota: number, escala: number) => {
    const pct = (nota / escala) * 100;
    if (pct >= 60) return 'rgba(52, 199, 89, 0.12)';
    if (pct >= 40) return 'rgba(255, 149, 0, 0.12)';
    return 'rgba(255, 59, 48, 0.12)';
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2D6A4F" />
        <Text style={styles.loadingText}>Cargando tu reporte...</Text>
      </View>
    );
  }

  if (error || !detalle) {
    return (
      <View style={styles.center}>
        <View style={styles.errorIconContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#FF3B30" />
        </View>
        <Text style={styles.errorTitle}>Algo salio mal</Text>
        <Text style={styles.errorText}>
          {error || 'No se encontro informacion del reporte. Asegurate de haber completado el quiz primero.'}
        </Text>
        <TouchableOpacity style={styles.errorButton} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={18} color="#fff" />
          <Text style={styles.errorButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { estadisticas, informe_fallas, sesion, estudiante } = detalle;
  const preguntas = informe_fallas?.preguntas || [];
  const totalPreguntas = preguntas.length;
  const correctas = preguntas.filter((q) => q.es_correcta).length;

  // Podium data
  const sortedRanking = [...ranking].sort((a, b) => b.nota - a.nota || a.tiempo - b.tiempo);
  const top2 = sortedRanking.slice(0, 2);

  const gradeColor = getGradeColor(estadisticas.nota_final, sesion.escala_puntuacion);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* ═══════════════════ HEADER ═══════════════════ */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#555" />
        </TouchableOpacity>
      </View>

      {/* ═══════════════════ GRADE CIRCLE ═══════════════════ */}
      <View style={styles.gradeSection}>
        <View style={[styles.gradeCircle, { borderColor: gradeColor }]}>
          <Text style={[styles.gradeNumber, { color: gradeColor }]}>{estadisticas.nota_final.toFixed(1)}</Text>
          <Text style={styles.gradeLabel}>Nota</Text>
        </View>
      </View>

      {/* ═══════════════════ STUDENT INFO ═══════════════════ */}
      <View style={styles.studentPill}>
        {estudiante.usu_imagen ? (
          <Image source={{ uri: resolveImageUrl(estudiante.usu_imagen) }} style={styles.studentAvatar} />
        ) : (
          <View style={styles.studentAvatarPlaceholder}>
            <Text style={styles.studentAvatarText}>
              {estudiante.usu_nombre?.charAt(0)}{estudiante.usu_apellido?.charAt(0)}
            </Text>
          </View>
        )}
        <Text style={styles.studentName}>
          {estudiante.usu_nombre} {estudiante.usu_apellido}
        </Text>
      </View>

      {/* ═══════════════════ QUIZ TITLE ═══════════════════ */}
      <Text style={styles.quizTitle}>{sesion.quiz_titulo}</Text>

      {/* ═══════════════════ STAT CARDS ═══════════════════ */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <View style={[styles.statCircle, { backgroundColor: 'rgba(52, 199, 89, 0.15)' }]}>
            <Ionicons name="star" size={16} color="#34C759" />
          </View>
          <Text style={[styles.statValue, { color: '#34C759' }]}>
            {estadisticas.porcentaje_aciertos.toFixed(0)}%
          </Text>
          <Text style={[styles.statLabel, { color: '#34C759' }]}>Exactitud</Text>
        </View>

        <View style={styles.statCard}>
          <View style={[styles.statCircle, { backgroundColor: 'rgba(0, 122, 255, 0.15)' }]}>
            <Ionicons name="trophy" size={16} color="#007AFF" />
          </View>
          <Text style={[styles.statValue, { color: '#007AFF' }]}>
            {estadisticas.nota_final.toFixed(1)}/{sesion.escala_puntuacion}
          </Text>
          <Text style={[styles.statLabel, { color: '#007AFF' }]}>Puntos</Text>
        </View>

        <View style={styles.statCard}>
          <View style={[styles.statCircle, { backgroundColor: 'rgba(255, 149, 0, 0.15)' }]}>
            <Ionicons name="time" size={16} color="#FF9500" />
          </View>
          <Text style={[styles.statValue, { color: '#FF9500' }]}>
            {formattedTime(estadisticas.tiempo_total_segundos)}
          </Text>
          <Text style={[styles.statLabel, { color: '#FF9500' }]}>Tiempo</Text>
        </View>
      </View>

      {/* ═══════════════════ QUESTION ANALYSIS ═══════════════════ */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Analisis de Preguntas</Text>
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionBadgeText}>{correctas}/{totalPreguntas}</Text>
        </View>
      </View>

      {totalPreguntas === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={56} color="#C7C7CC" />
          <Text style={styles.emptyTitle}>Sin detalle disponible</Text>
          <Text style={styles.emptySubtitle}>
            Aun no hay informacion de respuestas para este quiz. Completa el quiz para ver tu analisis.
          </Text>
        </View>
      ) : (
        preguntas.map((q, index) => (
          <View key={index} style={styles.questionCard}>
            <View style={styles.questionTopRow}>
              <View style={[styles.questionNumberBadge, { backgroundColor: q.es_correcta ? '#34C759' : '#FF3B30' }]}>
                <Text style={styles.questionNumberText}>{q.nro_orden}</Text>
              </View>
              <View style={styles.questionContent}>
                <Text style={styles.questionText} numberOfLines={3}>{q.enunciado}</Text>
              </View>
              <Ionicons
                name={q.es_correcta ? 'checkmark-circle' : 'close-circle'}
                size={22}
                color={q.es_correcta ? '#34C759' : '#FF3B30'}
              />
            </View>

            {!q.es_correcta && (
              <View style={styles.questionWrongDetail}>
                <View style={styles.wrongAnswerRow}>
                  <Ionicons name="close" size={14} color="#FF3B30" />
                  <Text style={styles.wrongAnswerLabel}>Tu respuesta:</Text>
                  <Text style={styles.wrongAnswerValue}>{q.respuesta_usuario || 'Sin respuesta'}</Text>
                </View>
                <View style={styles.correctAnswerRow}>
                  <Ionicons name="checkmark" size={14} color="#34C759" />
                  <Text style={styles.correctAnswerLabel}>Correcta:</Text>
                  <Text style={styles.correctAnswerValue}>{q.respuesta_correcta}</Text>
                </View>
              </View>
            )}
          </View>
        ))
      )}

      {/* ═══════════════════ RANKING SECTION ═══════════════════ */}
      <Text style={styles.rankingSectionTitle}>Ranking de la Sesion</Text>
      <View style={styles.rankingPeopleRow}>
        <Ionicons name="people" size={16} color="#8E8E93" />
        <Text style={styles.rankingPeopleText}>{ranking.length} {ranking.length === 1 ? 'person' : 'Personas'}</Text>
      </View>

      {/* ═══════════════════ PODIUM (cards, no bars) ═══════════════════ */}
      {sortedRanking.length > 0 && (
        <View style={styles.podiumContainer}>
          {sortedRanking.length >= 2 && (() => {
            // 2nd place on the left
            const second = sortedRanking[1];
            const isMe2 = second.usuario_id === usuario?.usu_id;
            return (
              <View style={styles.podiumCard}>
                <View style={[styles.podiumAvatarRing, { borderColor: '#C0C0C0' }]}>
                  {second.usu_imagen ? (
                    <Image source={{ uri: resolveImageUrl(second.usu_imagen) }} style={styles.podiumAvatar} />
                  ) : (
                    <View style={[styles.podiumAvatarPlaceholder, { backgroundColor: '#E8E8ED' }]}>
                      <Text style={styles.podiumAvatarText}>{second.nombre_completo?.charAt(0) || '?'}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.podiumScore}>{second.nota.toFixed(1)}</Text>
                {isMe2 && (
                  <View style={styles.podiumYouBadge}>
                    <Text style={styles.podiumYouText}>You</Text>
                  </View>
                )}
                <Text style={styles.podiumName} numberOfLines={1}>{second.nombre_completo}</Text>
                <Text style={styles.podiumRank}>#2</Text>
              </View>
            );
          })()}

          {(() => {
            // 1st place on the right (always present)
            const first = sortedRanking[0];
            const isMe1 = first.usuario_id === usuario?.usu_id;
            return (
              <View style={[styles.podiumCard, styles.podiumCardFirst]}>
                <Ionicons name="trophy" size={20} color="#FFD700" style={styles.podiumTrophy} />
                <View style={[styles.podiumAvatarRing, { borderColor: '#34C759', width: 52, height: 52 }]}>
                  {first.usu_imagen ? (
                    <Image source={{ uri: resolveImageUrl(first.usu_imagen) }} style={[styles.podiumAvatar, { width: 46, height: 46 }]} />
                  ) : (
                    <View style={[styles.podiumAvatarPlaceholder, { backgroundColor: 'rgba(52, 199, 89, 0.15)', width: 46, height: 46 }]}>
                      <Text style={[styles.podiumAvatarText, { color: '#34C759' }]}>{first.nombre_completo?.charAt(0) || '?'}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.podiumScore, { fontSize: 26 }]}>{first.nota.toFixed(1)}</Text>
                {isMe1 && (
                  <View style={styles.podiumYouBadge}>
                    <Text style={styles.podiumYouText}>You</Text>
                  </View>
                )}
                <Text style={styles.podiumName} numberOfLines={1}>{first.nombre_completo}</Text>
                <Text style={styles.podiumRank}>#1</Text>
              </View>
            );
          })()}
        </View>
      )}

      {/* ═══════════════════ RANKING LIST ═══════════════════ */}
      <View style={styles.rankingListCard}>
        {sortedRanking.map((user, index) => {
          const isMe = user.usuario_id === usuario?.usu_id;
          const rank = index + 1;

          let badgeBg = '#F2F2F7';
          let badgeColor = '#8E8E93';
          if (rank === 1) { badgeBg = '#FFD700'; badgeColor = '#000'; }
          else if (rank === 2) { badgeBg = '#C0C0C0'; badgeColor = '#000'; }
          else if (rank === 3) { badgeBg = '#CD7F32'; badgeColor = '#fff'; }

          return (
            <View
              key={user.usuario_id}
              style={[styles.rankingRow, isMe && styles.rankingRowMe, index < sortedRanking.length - 1 && styles.rankingRowBorder]}
            >
              <View style={[styles.rankingBadge, { backgroundColor: badgeBg }]}>
                <Text style={[styles.rankingBadgeText, { color: badgeColor }]}>{rank}</Text>
              </View>

              {user.usu_imagen ? (
                <Image source={{ uri: resolveImageUrl(user.usu_imagen) }} style={styles.rankingAvatar} />
              ) : (
                <View style={styles.rankingAvatarPlaceholder}>
                  <Text style={styles.rankingAvatarText}>{user.nombre_completo?.charAt(0) || '?'}</Text>
                </View>
              )}

              <View style={styles.rankingUserInfo}>
                <View style={styles.rankingNameRow}>
                  <Text style={[styles.rankingName, isMe && { color: '#2D6A4F' }]} numberOfLines={1}>
                    {user.nombre_completo}
                  </Text>
                  {isMe && (
                    <View style={styles.meInlineBadge}>
                      <Text style={styles.meInlineBadgeText}>Tu</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.rankingTimeText}>{formattedTime(user.tiempo)}</Text>
              </View>

              <Text style={[styles.rankingScore, isMe && { color: '#2D6A4F' }]}>
                {user.nota.toFixed(1)}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f8f9fa',
  },

  // ─── Loading ───
  loadingText: {
    marginTop: 14,
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },

  // ─── Error ───
  errorIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 12,
  },
  errorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2D6A4F',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  errorButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },

  // ═══════════════════ HEADER ═══════════════════
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ═══════════════════ GRADE CIRCLE ═══════════════════
  gradeSection: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  gradeCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 5,
    borderColor: '#34C759',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  gradeNumber: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1B4332',
  },
  gradeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8E8E93',
    marginTop: 2,
  },

  // ═══════════════════ STUDENT INFO ═══════════════════
  studentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  studentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  studentAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8E8E93',
  },
  studentName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
  },

  // ═══════════════════ QUIZ TITLE ═══════════════════
  quizTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B4332',
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 20,
    paddingHorizontal: 20,
  },

  // ═══════════════════ STAT CARDS ═══════════════════
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },

  // ═══════════════════ SECTION HEADER ═══════════════════
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B4332',
  },
  sectionBadge: {
    backgroundColor: '#2D6A4F',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  sectionBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },

  // ═══════════════════ EMPTY STATE ═══════════════════
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },

  // ═══════════════════ QUESTION CARDS ═══════════════════
  questionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  questionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  questionNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  questionNumberText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  questionContent: {
    flex: 1,
  },
  questionText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    fontWeight: '500',
  },
  questionWrongDetail: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
    gap: 8,
  },
  wrongAnswerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wrongAnswerLabel: {
    fontSize: 13,
    color: '#999',
    fontWeight: '500',
  },
  wrongAnswerValue: {
    fontSize: 13,
    color: '#FF3B30',
    fontWeight: '700',
    flex: 1,
  },
  correctAnswerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  correctAnswerLabel: {
    fontSize: 13,
    color: '#999',
    fontWeight: '500',
  },
  correctAnswerValue: {
    fontSize: 13,
    color: '#34C759',
    fontWeight: '700',
    flex: 1,
  },

  // ═══════════════════ RANKING SECTION ═══════════════════
  rankingSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B4332',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  rankingPeopleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  rankingPeopleText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },

  // ═══════════════════ PODIUM (CARDS) ═══════════════════
  podiumContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  podiumCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    width: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  podiumCardFirst: {
    paddingBottom: 24,
  },
  podiumTrophy: {
    marginBottom: 6,
  },
  podiumAvatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  podiumAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  podiumAvatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  podiumAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#8E8E93',
  },
  podiumScore: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1B4332',
    marginBottom: 4,
  },
  podiumYouBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 6,
  },
  podiumYouText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  podiumName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    maxWidth: 130,
    marginBottom: 4,
  },
  podiumRank: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
  },

  // ═══════════════════ RANKING LIST ═══════════════════
  rankingListCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 20,
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  rankingRowMe: {
    backgroundColor: 'rgba(45, 106, 79, 0.06)',
  },
  rankingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  rankingBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankingBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  rankingAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  rankingAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankingAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8E8E93',
  },
  rankingUserInfo: {
    flex: 1,
  },
  rankingNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankingName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    flexShrink: 1,
  },
  meInlineBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  meInlineBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  rankingTimeText: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  rankingScore: {
    fontSize: 18,
    fontWeight: '800',
    color: '#333',
  },
});
