import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { Header } from '@/components/Header';
import { AppImage } from '@/components/AppImage';
import { obtenerDetalleEstudianteSesion } from '@/utils/api';

interface PreguntaDetalle {
  nro_orden: number;
  enunciado: string;
  tipo: string;
  respuesta_usuario: any;
  respuesta_correcta: any;
  es_correcta: boolean;
  tiempo_limite_segundos: number;
}

interface Resumen {
  total_preguntas: number;
  correctas: number;
  incorrectas: number;
  porcentaje_aciertos: number;
}

export default function DetalleEstudianteScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const sesionId = parseInt(params.sesionId as string);
  const usuarioId = parseInt(params.usuarioId as string);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    cargarDetalle();
  }, [sesionId, usuarioId]);

  const cargarDetalle = async () => {
    try {
      setCargando(true);
      const resultado = await obtenerDetalleEstudianteSesion(sesionId, usuarioId);
      setData(resultado);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Error al cargar el detalle');
    } finally {
      setCargando(false);
    }
  };

  const formatTiempo = (ms: number) => {
    const segundos = Math.floor(ms / 1000);
    const minutos = Math.floor(segundos / 60);
    const segRestantes = segundos % 60;
    return `${minutos}m ${segRestantes}s`;
  };

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return 'N/A';
    const date = new Date(fecha);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderPregunta = (pregunta: PreguntaDetalle, index: number) => {
    const esCorrecta = pregunta.es_correcta;
    const bgColor = esCorrecta ? '#E8F5E9' : '#FFEBEE';
    const borderColor = esCorrecta ? '#4CAF50' : '#F44336';
    const iconColor = esCorrecta ? '#4CAF50' : '#F44336';
    const iconName = esCorrecta ? 'checkmark-circle' : 'close-circle';

    return (
      <View key={index} style={[styles.preguntaCard, { backgroundColor: bgColor, borderLeftColor: borderColor }]}>
        <View style={styles.preguntaHeader}>
          <View style={[styles.numeroBadge, { backgroundColor: borderColor }]}>
            <Text style={styles.numeroText}>{pregunta.nro_orden}</Text>
          </View>
          <Ionicons name={iconName as any} size={28} color={iconColor} />
        </View>

        <Text style={styles.enunciado}>{pregunta.enunciado}</Text>

        <View style={styles.respuestasContainer}>
          <View style={styles.respuestaItem}>
            <Text style={styles.respuestaLabel}>Tu respuesta:</Text>
            <Text style={[styles.respuestaTexto, esCorrecta ? styles.respuestaCorrecta : styles.respuestaIncorrecta]}>
              {Array.isArray(pregunta.respuesta_usuario) 
                ? pregunta.respuesta_usuario.join(', ') 
                : pregunta.respuesta_usuario || 'Sin respuesta'}
            </Text>
          </View>

          {!esCorrecta && (
            <View style={styles.respuestaItem}>
              <Text style={styles.respuestaLabel}>Respuesta correcta:</Text>
              <Text style={styles.respuestaCorrectaTexto}>
                {Array.isArray(pregunta.respuesta_correcta) 
                  ? pregunta.respuesta_correcta.join(', ') 
                  : pregunta.respuesta_correcta}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.tipoBadge}>
          <Ionicons name="time-outline" size={12} color="#666" />
          <Text style={styles.tipoText}>{pregunta.tiempo_limite_segundos}s</Text>
        </View>
      </View>
    );
  };

  if (cargando) {
    return (
      <SafeAreaView style={styles.container}>
        <Header showBackButton={true} onBackPress={() => router.back()} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Cargando detalle...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={styles.container}>
        <Header showBackButton={true} onBackPress={() => router.back()} />
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={Colors.danger} />
          <Text style={styles.errorText}>{error || 'No se pudo cargar el detalle'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={cargarDetalle}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { estudiante, sesion, resultado, informe_detalle } = data;
  const { preguntas, resumen } = informe_detalle;
  const porcentajeAciertos = resumen?.porcentaje_aciertos || 0;

  return (
    <SafeAreaView style={styles.container}>
      <Header showBackButton={true} onBackPress={() => router.back()} />
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header del Estudiante */}
        <View style={styles.estudianteHeader}>
          {estudiante.foto_perfil ? (
            <AppImage uri={estudiante.foto_perfil} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {estudiante.nombre.charAt(0)}{estudiante.apellido.charAt(0)}
              </Text>
            </View>
          )}
          <Text style={styles.estudianteNombre}>
            {estudiante.nombre} {estudiante.apellido}
          </Text>
          <Text style={styles.estudianteEmail}>{estudiante.email}</Text>
        </View>

        {/* Info de la Sesión */}
        <View style={styles.sesionCard}>
          <Text style={styles.quizTitulo}>{sesion.quiz_titulo}</Text>
          <View style={styles.sesionMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="key-outline" size={14} color="#666" />
              <Text style={styles.metaText}>{sesion.codigo_acceso}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="settings-outline" size={14} color="#666" />
              <Text style={styles.metaText}>{sesion.modo_juego}</Text>
            </View>
          </View>
        </View>

        {/* Estadísticas Principales */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValor}>{resultado.nota_final}/{sesion.escala_puntuacion}</Text>
            <Text style={styles.statLabel}>Nota</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValor}>{porcentajeAciertos}%</Text>
            <Text style={styles.statLabel}>Aciertos</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValor}>{formatTiempo(resultado.tiempo_total_ms)}</Text>
            <Text style={styles.statLabel}>Tiempo</Text>
          </View>
        </View>

        {/* Resumen de Respuestas */}
        <View style={styles.resumenCard}>
          <Text style={styles.resumenTitulo}>Resumen de Respuestas</Text>
          <View style={styles.resumenGrid}>
            <View style={styles.resumenItem}>
              <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
              <Text style={styles.resumenValor}>{resumen?.correctas || 0}</Text>
              <Text style={styles.resumenLabel}>Correctas</Text>
            </View>
            <View style={styles.resumenItem}>
              <Ionicons name="close-circle" size={24} color="#F44336" />
              <Text style={styles.resumenValor}>{resumen?.incorrectas || 0}</Text>
              <Text style={styles.resumenLabel}>Incorrectas</Text>
            </View>
            <View style={styles.resumenItem}>
              <Ionicons name="list" size={24} color="#2196F3" />
              <Text style={styles.resumenValor}>{resumen?.total_preguntas || 0}</Text>
              <Text style={styles.resumenLabel}>Total</Text>
            </View>
          </View>
        </View>

        {/* Lista de Preguntas */}
        <Text style={styles.sectionTitle}>Detalle de Preguntas</Text>
        {preguntas.map((pregunta: PreguntaDetalle, index: number) => renderPregunta(pregunta, index))}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  estudianteHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  estudianteNombre: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
  },
  estudianteEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  sesionCard: {
    backgroundColor: Colors.primary,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  quizTitulo: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  sesionMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValor: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  resumenCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resumenTitulo: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  resumenGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  resumenItem: {
    alignItems: 'center',
  },
  resumenValor: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  resumenLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  preguntaCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  preguntaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  numeroBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numeroText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  enunciado: {
    fontSize: 16,
    color: '#333',
    marginBottom: 16,
    lineHeight: 22,
  },
  respuestasContainer: {
    gap: 12,
  },
  respuestaItem: {
    gap: 4,
  },
  respuestaLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  respuestaTexto: {
    fontSize: 15,
    fontWeight: '600',
  },
  respuestaCorrecta: {
    color: '#4CAF50',
  },
  respuestaIncorrecta: {
    color: '#F44336',
  },
  respuestaCorrectaTexto: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4CAF50',
  },
  tipoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  tipoText: {
    fontSize: 12,
    color: '#666',
  },
  bottomPadding: {
    height: 100,
  },
});