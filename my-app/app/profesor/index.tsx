// Pantalla principal del dashboard del profesor.
// Muestra secciones de: biblioteca (quices recientes), informes (sesiones recientes)
// y plantillas precargadas para crear quices rápido.
// Si el usuario es master probando el rol, muestra un botón para salir del modo.
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, BackHandler } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { Card, CardContent } from '@/components/Card';
import Colors from '@/constants/colors';
import { QuizMongoSimplificado } from '@/types/quizMongo';
import { Ionicons } from '@expo/vector-icons';
import { listarQuices, listarSesionesProfesor } from '@/utils/api';
import QuizCardWithMenu from '@/components/QuizCardWithMenu';
import { useUser } from '@/contexts/UserContext';

export default function ProfesorDashboardScreen() {
  const { usuario: usuarioActual } = useUser();

  useFocusEffect(
    React.useCallback(() => {
      // Verificar autenticación
      if (!usuarioActual) {
        router.replace('/login');
        return;
      }

      // Verificar rol
      if (usuarioActual.rol_nombre !== 'profesor' && usuarioActual.rol_nombre !== 'master') {
        router.replace('/login');
        return;
      }

      cargarQuicesRecientes();
      cargarInformes();

      // Prevenir gesto de atrás
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        return true;
      });

      return () => backHandler.remove();
    }, [usuarioActual])
  );
  
  // Solo traemos los 3 quices más recientes del profesor para la vista de inicio.
  // Si necesita ver todos, va a la biblioteca.
  const cargarQuicesRecientes = async () => {
    try {
      setCargandoQuices(true);
      const autorId = usuarioActual?.usu_id || 1;
      
      const resultado = await listarQuices(autorId);
      // Tomar solo los 3 más recientes
      const recientes = (resultado.quices || []).slice(0, 3);
      setQuicesRecientes(recientes);
    } catch (error) {
      console.error('Error cargando quices:', error);
    } finally {
      setCargandoQuices(false);
    }
  };

  const cargarInformes = async () => {
    try {
      setCargandoSesiones(true);
      const autorId = usuarioActual?.usu_id || 1;
      const resultado = await listarSesionesProfesor(autorId);
      const sesiones = resultado.sesiones || [];
      // Tomar solo las 5 más recientes
      setSesionesRecientes(sesiones.slice(0, 5));
    } catch (error) {
      console.error('Error cargando sesiones:', error);
    } finally {
      setCargandoSesiones(false);
    }
  };

  const irAPerfil = () => {
    // Perfil se accede desde el tab de navegación
  };

  const [quicesRecientes, setQuicesRecientes] = useState<QuizMongoSimplificado[]>([]);
  const [sesionesRecientes, setSesionesRecientes] = useState<any[]>([]);
  const [cargandoQuices, setCargandoQuices] = useState(true);
  const [cargandoSesiones, setCargandoSesiones] = useState(false);

  // Las plantillas son escenarios precargados con preguntas de ejemplo.
  // El profesor toca una y va directo a la pantalla de crear con datos precargados.
  const plantillas = [
    { nombre: 'Evaluación Rápida', descripcion: '10 preguntas de opción múltiple', icono: 'timer', color: Colors.primary },
    { nombre: 'Examen Final', descripcion: '20 preguntas mixtas variadas', icono: 'school', color: Colors.secondary },
    { nombre: 'Solo Selección', descripcion: '15 preguntas de opción múltiple', icono: 'list', color: Colors.accent },
    { nombre: 'Solo Completación', descripcion: '10 preguntas de completar palabras', icono: 'create', color: '#9C27B0' },
    { nombre: 'Quiz Combinado', descripcion: '10 preguntas mixtas (selección + completación)', icono: 'grid', color: '#FF9800' },
    { nombre: 'Cuestionario en Blanco', descripcion: 'Empezar desde cero', icono: 'document', color: '#666' },
  ];

  return (
    <View style={styles.container}>
      <Header
        showProfile={true}
        profileImage={usuarioActual?.usu_imagen}
        profileName={usuarioActual?.usu_nombre}
        profileLastName={usuarioActual?.usu_apellido}
        onProfilePress={() => router.push('/profesor/perfil' as any)}
      />

      {usuarioActual?.rol_nombre === 'master' && (
        <View style={styles.exitModeContainer}>
          <TouchableOpacity 
            style={styles.exitModeButton}
            onPress={() => router.replace('/admin')}
          >
            <Ionicons name="exit-outline" size={20} color="#fff" />
            <Text style={styles.exitModeButtonText}>Salir del Modo Profesor</Text>
          </TouchableOpacity>
        </View>
      )}

      <SectionTitle title="Inicio" />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Sección Biblioteca - Cuestionarios Recientes */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Biblioteca</Text>
            <TouchableOpacity onPress={() => router.push('/profesor/biblioteca' as any)}>
              <Text style={styles.verTodo}>Ver todo →</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionSubtitle}>Cuestionarios recientes</Text>
          {quicesRecientes.length > 0 ? (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.quicesScroll}
              contentContainerStyle={styles.quicesScrollContent}
            >
              {quicesRecientes.map((quiz) => (
                <QuizCardWithMenu
                  key={quiz._id}
                  _id={quiz._id}
                  titulo={quiz.titulo}
                  tema={quiz.tema}
                  cantidad_preguntas={quiz.cantidad_preguntas}
                  fecha_creacion={quiz.fecha_creacion}
                  imagen_portada={quiz.imagen_portada}
                  size="small"
                  onEditar={(id: string) => router.push(`/profesor/crear?quizId=${id}` as any)}
                  onEliminado={cargarQuicesRecientes}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="library-outline" size={40} color="#ccc" />
              <Text style={styles.emptyStateText}>
                {cargandoQuices ? 'Cargando...' : 'No hay quices recientes'}
              </Text>
              {!cargandoQuices && (
                <TouchableOpacity 
                  style={styles.crearButtonSmall}
                  onPress={() => router.push('/profesor/crear' as any)}
                >
                  <Text style={styles.crearButtonTextSmall}>Crear mi primer quiz</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Sección Informes - Sesiones Recientes */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Informes</Text>
            <TouchableOpacity onPress={() => router.push('/profesor/reportes' as any)}>
              <Text style={styles.verTodo}>Ver todo →</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionSubtitle}>Sesiones recientes</Text>
          {sesionesRecientes.length > 0 ? (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.sesionesScroll}
              contentContainerStyle={styles.sesionesScrollContent}
            >
              {sesionesRecientes.map((sesion) => {
                const getEstadoSesion = (s: any) => {
                  if (s.ses_eliminado) return { texto: 'Eliminada', color: '#FF3B30' };
                  if (!s.ses_activo) return { texto: 'Inactiva', color: '#999' };
                  if (new Date(s.ses_fecha_inicio) > new Date()) return { texto: 'Agendada', color: '#007AFF' };
                  if (new Date(s.ses_fecha_fin) < new Date()) return { texto: 'Expirada', color: '#FF9800' };
                  return { texto: 'Activa', color: '#34C759' };
                };
                const estado = getEstadoSesion(sesion);
                const finalizados = sesion.total_finalizados || 0;
                const participantes = sesion.total_participantes || 0;
                return (
                  <TouchableOpacity
                    key={sesion.ses_id}
                    style={styles.sesionCard}
                    activeOpacity={0.9}
                    onPress={() => router.push(`/profesor/reportes?sesion_id=${sesion.ses_id}` as any)}
                  >
                    <View style={styles.sesionPortada}>
                      <Ionicons name="bar-chart-outline" size={32} color="#ccc" />
                      <View style={styles.sesionBadge}>
                        <View style={[styles.sesionBadgeDot, { backgroundColor: estado.color }]} />
                        <Text style={styles.sesionBadgeText}>{estado.texto}</Text>
                      </View>
                    </View>
                    <View style={styles.sesionInfo}>
                      <Text style={styles.sesionCardTitle} numberOfLines={2}>{sesion.quiz_titulo}</Text>
                      <Text style={styles.sesionCardMateria} numberOfLines={1}>{sesion.materia_nombre}</Text>
                      <View style={styles.sesionCardStats}>
                        <View style={styles.sesionCardStat}>
                          <Ionicons name="people-outline" size={12} color="#999" />
                          <Text style={styles.sesionCardStatText}>{participantes}</Text>
                        </View>
                        <View style={styles.sesionCardStat}>
                          <Ionicons name="checkmark-circle-outline" size={12} color="#999" />
                          <Text style={styles.sesionCardStatText}>{finalizados}</Text>
                        </View>
                        <View style={styles.sesionCardStat}>
                          <Ionicons name="key-outline" size={12} color="#999" />
                          <Text style={styles.sesionCardStatText}>{sesion.ses_codigo_acceso}</Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="bar-chart-outline" size={40} color="#ccc" />
              <Text style={styles.emptyStateText}>
                {cargandoSesiones ? 'Cargando...' : 'No hay sesiones recientes'}
              </Text>
              {!cargandoSesiones && (
                <Text style={styles.emptyStateSubtext}>
                  Crea una sesión desde la biblioteca para ver informes
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Sección Plantillas */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Plantillas</Text>
          <Text style={styles.sectionSubtitle}>Empieza rápido con una plantilla</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.plantillasScroll}>
            {plantillas.map((plantilla, index) => (
              <TouchableOpacity
                key={index}
                style={styles.plantillaCard}
                activeOpacity={0.8}
                onPress={() => router.push(`/profesor/crear?plantilla=${encodeURIComponent(plantilla.nombre)}` as any)}
              >
                <View style={[styles.plantillaIconContainer, { backgroundColor: `${plantilla.color}20` }]}>
                  <Ionicons name={plantilla.icono as any} size={28} color={plantilla.color} />
                </View>
                <Text style={styles.plantillaNombre}>{plantilla.nombre}</Text>
                <Text style={styles.plantillaDescripcion}>{plantilla.descripcion}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
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
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  // Plantillas
  plantillasScroll: {
    marginTop: 8,
  },
  plantillaCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    width: 140,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  plantillaIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  plantillaNombre: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  plantillaDescripcion: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  // Sesiones recientes cards (mismas proporciones que QuizCardWithMenu small)
  sesionesScroll: {
    marginTop: 8,
  },
  sesionesScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  sesionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    marginRight: 12,
    marginLeft: 4,
    width: 160,
  },
  sesionPortada: {
    height: 90,
    backgroundColor: '#e8e8e8',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  sesionBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  sesionBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sesionBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  sesionInfo: {
    padding: 10,
  },
  sesionCardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  sesionCardMateria: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '500',
    marginBottom: 8,
  },
  sesionCardStats: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 12,
  },
  sesionCardStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  sesionCardStatText: {
    fontSize: 11,
    color: '#999',
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: '#bbb',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  bottomPadding: {
    height: 100,
  },
  // Sección header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  verTodo: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
  },
  // Biblioteca items
  itemCard: {
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  itemSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  itemAction: {
    padding: 8,
  },
  // Informes
  informesCard: {
    marginBottom: 8,
  },
  informeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  informeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  informeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  informeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  informeValue: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: 'bold',
    marginTop: 2,
  },
  informeDivider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 8,
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
  },
  // Scroll de quices en inicio con espaciado
  quicesScroll: {
    marginTop: 8,
  },
  quicesScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  crearButtonSmall: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.primary,
    borderRadius: 16,
  },
  crearButtonTextSmall: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
});
