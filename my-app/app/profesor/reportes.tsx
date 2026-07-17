// Reportes detallados de sesiones para el profesor.
// Muestra la lista de sesiones creadas y al seleccionar una, presenta
// los resultados ordenables por nota, tiempo o nombre.
// El profesor puede analizar el rendimiento de cada sesión desde acá.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { getItem } from '@/utils/storage';
import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { Card, CardContent } from '@/components/Card';
import Colors from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { Usuario } from '@/types/user';
import { listarParaReportes, obtenerResultadosSesion } from '@/utils/api';

interface Sesion {
  ses_id: number;
  ses_codigo_acceso: string;
  ses_id_mongo_quiz: string;
  ses_nombre_grupo: string;
  ses_puntuacion_tipo: string;
  ses_estatus: string;
  ses_fecha_inicio: string;
  ses_fecha_fin: string;
  ses_activo: boolean;
  ses_escala_puntuacion: number;
  quiz_titulo: string;
  materia_nombre: string;
  total_participantes: number;
  total_finalizados: number;
  ses_eliminado?: boolean;
  ses_estado_display?: string;
}

export default function ReportesScreen() {
  const params = useLocalSearchParams();
  const sesionIdParam = params.sesion_id as string;
  
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [loading, setLoading] = useState(true);
  const [vistaDetalle, setVistaDetalle] = useState(false);
  const [sesionSeleccionada, setSesionSeleccionada] = useState<Sesion | null>(null);
  const [resultados, setResultados] = useState<any>(null);
  const [ordenarPor, setOrdenarPor] = useState<'nota' | 'tiempo' | 'nombre'>('nota');
  const [orden, setOrden] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const cargarUsuario = async () => {
      try {
        const userJson = await getItem('user');
        if (userJson) {
          setUsuarioActual(JSON.parse(userJson));
        }
      } catch (error) {
        console.error('Error al cargar usuario:', error);
      }
    };
    cargarUsuario();
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Verificar autenticación
      const verificarYCargar = async () => {
        const usuario = await getItem('user');
        if (!usuario) {
          router.replace('/login');
          return;
        }
        // Recargar sesiones al enfocar la pantalla
        if (usuarioActual) {
          cargarSesiones();
          // Si estamos en vista detalle, recargar también los resultados de la sesión seleccionada
          if (vistaDetalle && sesionSeleccionada) {
            verResultados(sesionSeleccionada);
          }
        }
      };

      verificarYCargar();
    }, [usuarioActual, vistaDetalle, sesionSeleccionada])
  );

  useEffect(() => {
    if (usuarioActual) {
      cargarSesiones();
      
      // Si se pasa un sesion_id, cargar directamente los detalles
      if (sesionIdParam) {
        const sesionId = parseInt(sesionIdParam);
        const cargarSesionDirecta = async () => {
          try {
            const data = await listarParaReportes(usuarioActual!.usu_id);
            const sesionEncontrada = data.sesiones.find((s: Sesion) => s.ses_id === sesionId);
            if (sesionEncontrada) {
              await verResultados(sesionEncontrada);
            }
          } catch (error) {
            console.error('Error al cargar sesión directa:', error);
          }
        };
        cargarSesionDirecta();
      }
    }
  }, [usuarioActual, sesionIdParam]);

  const cargarSesiones = async () => {
    try {
      setLoading(true);
      const data = await listarParaReportes(usuarioActual!.usu_id);
      setSesiones(data.sesiones);
    } catch (error: any) {
      console.error('Error al cargar sesiones:', error);
    } finally {
      setLoading(false);
    }
  };

  const verResultados = async (sesion: Sesion) => {
    try {
      setSesionSeleccionada(sesion);
      setLoading(true);
      const data = await obtenerResultadosSesion(sesion.ses_id, ordenarPor, orden);
      setResultados(data);
      setVistaDetalle(true);
    } catch (error: any) {
      console.error('Error al cargar resultados:', error);
    } finally {
      setLoading(false);
    }
  };

  const cambiarOrdenamiento = async (nuevoOrdenarPor: 'nota' | 'tiempo' | 'nombre') => {
    let nuevoOrden: 'asc' | 'desc' = 'desc';
    if (ordenarPor === nuevoOrdenarPor) {
      nuevoOrden = orden === 'asc' ? 'desc' : 'asc';
    }
    setOrdenarPor(nuevoOrdenarPor);
    setOrden(nuevoOrden);
    if (sesionSeleccionada) {
      try {
        setLoading(true);
        const data = await obtenerResultadosSesion(sesionSeleccionada.ses_id, nuevoOrdenarPor, nuevoOrden);
        setResultados(data);
      } catch (error: any) {
        console.error('Error al ordenar resultados:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const getEstadoColor = (sesion: Sesion) => {
    if (sesion.ses_eliminado) return '#FF3B30';
    if (!sesion.ses_activo) return '#999';
    if (new Date(sesion.ses_fecha_inicio) > new Date()) return '#007AFF';
    if (new Date(sesion.ses_fecha_fin) < new Date()) return '#FF9800';
    return '#34C759';
  };

  const getEstadoTexto = (sesion: Sesion) => {
    if (sesion.ses_eliminado) return 'Eliminada';
    if (!sesion.ses_activo) return 'Inactiva';
    if (new Date(sesion.ses_fecha_inicio) > new Date()) return 'Agendada';
    if (new Date(sesion.ses_fecha_fin) < new Date()) return 'Expirada';
    return 'Activa';
  };



  if (loading && !vistaDetalle) {
    return (
      <View style={styles.container}>
        <Header
          showProfile={true}
          profileImage={usuarioActual?.usu_imagen}
          profileName={usuarioActual?.usu_nombre}
          profileLastName={usuarioActual?.usu_apellido}
          onProfilePress={() => router.push('/profesor/perfil' as any)}
        />
        <SectionTitle title="Reportes" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (vistaDetalle && sesionSeleccionada && resultados) {
    return (
      <View style={styles.container}>
        <Header
          showProfile={true}
          profileImage={usuarioActual?.usu_imagen}
          profileName={usuarioActual?.usu_nombre}
          profileLastName={usuarioActual?.usu_apellido}
          onProfilePress={() => router.push('/profesor/perfil' as any)}
        />
        
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backButton} onPress={() => setVistaDetalle(false)}>
            <Ionicons name="arrow-back" size={24} color={Colors.primary} />
            <Text style={styles.backButtonText}>Volver a sesiones</Text>
          </TouchableOpacity>

          <SectionTitle title={resultados.sesion.quiz_titulo} />

          <Card style={styles.statsCard}>
            <CardContent>
              <Text style={styles.statsTitle}>📊 Estadísticas Generales</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{resultados.estadisticas.total_estudiantes}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{resultados.estadisticas.completados}</Text>
                  <Text style={styles.statLabel}>Completados</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{resultados.estadisticas.no_completados}</Text>
                  <Text style={styles.statLabel}>No completaron</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{resultados.estadisticas.nota_promedio}/{sesionSeleccionada?.ses_escala_puntuacion || ''}</Text>
                  <Text style={styles.statLabel}>Promedio</Text>
                </View>
              </View>
            </CardContent>
          </Card>

          <View style={styles.filtrosContainer}>
            <Text style={styles.filtrosTitle}>Ordenar por:</Text>
            <View style={styles.filtrosRow}>
              {(['nota', 'tiempo', 'nombre'] as const).map((opcion) => (
                <TouchableOpacity
                  key={opcion}
                  style={[
                    styles.filtroButton,
                    ordenarPor === opcion && styles.filtroButtonActive
                  ]}
                  onPress={() => cambiarOrdenamiento(opcion)}
                >
                  <Text style={[
                    styles.filtroButtonText,
                    ordenarPor === opcion && styles.filtroButtonTextActive
                  ]}>
                    {opcion === 'nota' ? 'Nota' : opcion === 'tiempo' ? 'Tiempo' : 'Nombre'}
                  </Text>
                  {ordenarPor === opcion && (
                    <Ionicons 
                      name={orden === 'asc' ? 'arrow-up' : 'arrow-down'} 
                      size={16} 
                      color="#fff" 
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <SectionTitle title="Resultados por Estudiante" />

          {resultados.resultados.map((resultado: any, index: number) => (
            <TouchableOpacity
              key={index}
              activeOpacity={0.7}
              onPress={() => {
                if (resultado.estado === 'completado') {
                  router.push({
                    pathname: '/profesor/sesion/detalle-estudiante',
                    params: {
                      sesionId: sesionSeleccionada?.ses_id.toString(),
                      usuarioId: resultado.usuario_id.toString()
                    }
                  } as any);
                }
              }}
            >
              <Card style={([
                styles.resultadoCard,
                resultado.estado === 'no_completado' && styles.resultadoCardNoCompletado
              ].filter(Boolean) as any)}>
                <CardContent>
                  <View style={styles.resultadoHeader}>
                    <View>
                      <Text style={styles.resultadoNombre}>
                        {resultado.nombre} {resultado.apellido}
                      </Text>
                      <Text style={styles.resultadoEmail}>{resultado.email}</Text>
                    </View>
                    <View style={[
                      styles.estadoBadge,
                      resultado.estado === 'completado' ? styles.estadoCompletado : styles.estadoNoCompletado
                    ]}>
                      <Text style={styles.estadoText}>
                        {resultado.estado === 'completado' ? '✓' : '✗'}
                      </Text>
                    </View>
                  </View>
                  
                  {resultado.estado === 'completado' ? (
                    <View style={styles.resultadoStats}>
                      <View style={styles.resultadoStat}>
                        <Text style={styles.resultadoStatLabel}>Nota:</Text>
                        <Text style={styles.resultadoStatValue}>{resultado.nota_final}/{sesionSeleccionada?.ses_escala_puntuacion || 100}</Text>
                      </View>
                      <View style={styles.resultadoStat}>
                        <Text style={styles.resultadoStatLabel}>Aciertos:</Text>
                        <Text style={styles.resultadoStatValue}>{resultado.porcentaje_aciertos}%</Text>
                      </View>
                      <View style={styles.resultadoStat}>
                        <Text style={styles.resultadoStatLabel}>Puntos:</Text>
                        <Text style={styles.resultadoStatValue}>{resultado.puntos_ganados}</Text>
                      </View>
                      <View style={styles.resultadoStat}>
                        <Text style={styles.resultadoStatLabel}>Tiempo:</Text>
                        <Text style={styles.resultadoStatValue}>
                          {Math.round(resultado.tiempo_total_ms / 1000)}s
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.noCompletadoText}>No completó el quiz</Text>
                  )}
                </CardContent>
              </Card>
            </TouchableOpacity>
          ))}

          <View style={styles.bottomPadding} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        showProfile={true}
        profileImage={usuarioActual?.usu_imagen}
        profileName={usuarioActual?.usu_nombre}
        profileLastName={usuarioActual?.usu_apellido}
        onProfilePress={() => router.push('/profesor/perfil' as any)}
      />

      <SectionTitle title="Reportes de Quizes" />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {sesiones.length > 0 ? (
          sesiones.map((sesion) => (
            <TouchableOpacity 
              key={sesion.ses_id} 
              onPress={() => verResultados(sesion)}
            >
              <Card style={styles.sesionCard}>
                <CardContent>
                  <View style={styles.sesionHeader}>
                    <View style={styles.sesionIcon}>
                      <Ionicons name="document-text" size={24} color={Colors.primary} />
                    </View>
                    <View style={styles.sesionInfo}>
                      <Text style={styles.sesionTitulo}>{sesion.quiz_titulo}</Text>
                      <Text style={styles.sesionMateria}>{sesion.materia_nombre}</Text>
                      <Text style={styles.sesionCodigo}>Código: {sesion.ses_codigo_acceso}</Text>
                      <Text style={styles.sesionFecha}>
                        📅 {new Date(sesion.ses_fecha_inicio).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color="#999" />
                  </View>
                  
                  <View style={styles.sesionStats}>
                    <View style={styles.sesionStat}>
                      <Text style={styles.sesionStatValue}>{sesion.total_participantes}</Text>
                      <Text style={styles.sesionStatLabel}>Participantes</Text>
                    </View>
                    <View style={styles.sesionStat}>
                      <Text style={styles.sesionStatValue}>{sesion.total_finalizados}</Text>
                      <Text style={styles.sesionStatLabel}>Finalizados</Text>
                    </View>
                    <View style={styles.sesionStat}>
                      <View style={[
                        styles.estadoSesionBadge,
                        { backgroundColor: getEstadoColor(sesion) }
                      ]}>
                        <Text style={styles.estadoSesionTexto}>{getEstadoTexto(sesion)}</Text>
                      </View>
                    </View>
                  </View>
                </CardContent>
              </Card>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="bar-chart-outline" size={48} color="#ccc" />
            <Text style={styles.emptyStateText}>No hay sesiones disponibles</Text>
            <Text style={styles.emptyStateSubtext}>Crea y lanza quizes para ver los reportes aquí</Text>
          </View>
        )}

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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    marginTop: 12,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  backButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: Colors.primary,
    fontWeight: 'bold',
  },
  sesionCard: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  sesionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sesionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${Colors.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sesionInfo: {
    flex: 1,
  },
  sesionTitulo: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  sesionMateria: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  sesionCodigo: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  sesionFecha: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  sesionStats: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  sesionStat: {
    flex: 1,
    alignItems: 'center',
  },
  sesionStatInactivo: {
    opacity: 0.6,
  },
  sesionStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  sesionStatValueInactivo: {
    color: '#999',
  },
  sesionStatLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  estadoSesionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'center',
  },
  estadoSesionTexto: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  statsCard: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  filtrosContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  filtrosTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  filtrosRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filtroButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    gap: 4,
  },
  filtroButtonActive: {
    backgroundColor: Colors.primary,
  },
  filtroButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  filtroButtonTextActive: {
    color: '#fff',
  },
  resultadoCard: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  resultadoCardNoCompletado: {
    backgroundColor: '#fff5f5',
  },
  resultadoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultadoNombre: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  resultadoEmail: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  estadoBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  estadoCompletado: {
    backgroundColor: '#4CAF50',
  },
  estadoNoCompletado: {
    backgroundColor: '#f44336',
  },
  estadoText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultadoStats: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  resultadoStat: {
    flex: 1,
    alignItems: 'center',
  },
  resultadoStatLabel: {
    fontSize: 11,
    color: '#666',
  },
  resultadoStatValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.primary,
    marginTop: 2,
  },
  noCompletadoText: {
    fontSize: 14,
    color: '#f44336',
    marginTop: 8,
    fontStyle: 'italic',
  },
  bottomPadding: {
    height: 100,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 4,
    textAlign: 'center',
  },
});
