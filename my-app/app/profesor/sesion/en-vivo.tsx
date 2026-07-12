import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { getItem } from '@/utils/storage';
import Colors from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { Card, CardContent } from '@/components/Card';
import { obtenerResultadosTiempoReal } from '@/utils/api';

interface ResultadoTiempoReal {
  usuario_id: number;
  nombre: string;
  apellido: string;
  estado: 'en_curso' | 'completado' | 'no_iniciado';
  nota_actual: number;
  escala_puntuacion: number;
  tiempo_transcurrido_ms: number;
  puntos_ganados: number;
  hora_inicio: string | null;
  hora_final: string | null;
}

export default function SesionEnVivoScreen() {
  const params = useLocalSearchParams();
  const sesionId = params.sesionId as string;
  const [resultados, setResultados] = useState<ResultadoTiempoReal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [estadisticas, setEstadisticas] = useState({
    total: 0,
    completados: 0,
    en_curso: 0,
    no_iniciados: 0
  });

  const cargarResultados = async () => {
    try {
      const data = await obtenerResultadosTiempoReal(parseInt(sesionId));
      setResultados(data.resultados);
      setEstadisticas({
        total: data.total,
        completados: data.completados,
        en_curso: data.en_curso,
        no_iniciados: data.no_iniciados
      });
    } catch (error: any) {
      console.error('Error cargando resultados:', error);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  };

  useEffect(() => {
    cargarResultados();
    // Actualizar cada 3 segundos
    const intervalo = setInterval(cargarResultados, 3000);
    return () => clearInterval(intervalo);
  }, [sesionId]);

  const onRefresh = async () => {
    setRefrescando(true);
    await cargarResultados();
  };

  const formatearTiempo = (ms: number) => {
    const segundos = Math.floor(ms / 1000);
    const minutos = Math.floor(segundos / 60);
    const segRestantes = segundos % 60;
    return `${minutos}:${segRestantes.toString().padStart(2, '0')}`;
  };

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'completado':
        return Colors.success;
      case 'en_curso':
        return Colors.primary;
      case 'no_iniciado':
        return '#999';
      default:
        return '#999';
    }
  };

  const getEstadoTexto = (estado: string) => {
    switch (estado) {
      case 'completado':
        return 'Completado';
      case 'en_curso':
        return 'En curso';
      case 'no_iniciado':
        return 'No iniciado';
      default:
        return estado;
    }
  };

  const renderResultado = (resultado: ResultadoTiempoReal, index: number) => (
    <Card key={resultado.usuario_id} style={styles.resultadoCard}>
      <CardContent>
        <View style={styles.resultadoHeader}>
          <View style={styles.resultadoInfo}>
            <View style={[styles.rankingBadge, { backgroundColor: index < 3 ? Colors.primary : '#f0f0f0' }]}>
              <Text style={[styles.rankingText, index < 3 && styles.rankingTextGold]}>
                #{index + 1}
              </Text>
            </View>
            <View style={styles.estudianteInfo}>
              <Text style={styles.estudianteNombre}>{resultado.nombre} {resultado.apellido}</Text>
              <View style={styles.estadoBadge}>
                <View style={[styles.estadoDot, { backgroundColor: getEstadoColor(resultado.estado) }]} />
                <Text style={[styles.estadoTexto, { color: getEstadoColor(resultado.estado) }]}>
                  {getEstadoTexto(resultado.estado)}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.resultadoStats}>
            <Text style={styles.notaValor}>{resultado.nota_actual.toFixed(1)}/{resultado.escala_puntuacion ?? 100}</Text>
            <Text style={styles.notaLabel}>Puntos</Text>
          </View>
        </View>

        <View style={styles.resultadoMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={16} color="#666" />
            <Text style={styles.metaText}>
              {resultado.estado === 'en_curso' ? 'Tiempo: ' : 'Total: '}
              {formatearTiempo(resultado.tiempo_transcurrido_ms)}
            </Text>
          </View>
          {resultado.puntos_ganados > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="star-outline" size={16} color="#666" />
              <Text style={styles.metaText}>+{resultado.puntos_ganados} pts</Text>
            </View>
          )}
        </View>
      </CardContent>
    </Card>
  );

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
      
      <SectionTitle title="Resultados en Vivo" />

      {/* Estadísticas */}
      <View style={styles.estadisticasContainer}>
        <View style={styles.estadisticaCard}>
          <Text style={styles.estadisticaValor}>{estadisticas.total}</Text>
          <Text style={styles.estadisticaLabel}>Total</Text>
        </View>
        <View style={styles.estadisticaCard}>
          <Text style={[styles.estadisticaValor, { color: Colors.success }]}>
            {estadisticas.completados}
          </Text>
          <Text style={styles.estadisticaLabel}>Completados</Text>
        </View>
        <View style={styles.estadisticaCard}>
          <Text style={[styles.estadisticaValor, { color: Colors.primary }]}>
            {estadisticas.en_curso}
          </Text>
          <Text style={styles.estadisticaLabel}>En curso</Text>
        </View>
      </View>

      {/* Lista de resultados */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {cargando ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Cargando resultados...</Text>
          </View>
        ) : resultados.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>Aún no hay participantes</Text>
          </View>
        ) : (
          resultados.map(renderResultado)
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
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    textAlign: 'center',
  },
  estadisticasContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  estadisticaCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  estadisticaValor: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  estadisticaLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  resultadoCard: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  resultadoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultadoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rankingBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankingText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
  },
  rankingTextGold: {
    color: '#fff',
  },
  estudianteInfo: {
    flex: 1,
  },
  estudianteNombre: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  estadoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
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
  resultadoStats: {
    alignItems: 'center',
  },
  notaValor: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  notaLabel: {
    fontSize: 12,
    color: '#666',
  },
  resultadoMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
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
});
