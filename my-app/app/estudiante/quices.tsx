// Pantalla donde el estudiante ve todos sus quices: los que tiene pendientes,
// los que ya completo, y los que estan agendados. Tambien maneja el modo offline
// para que puedas presentar quices sin conexion.
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { getItem } from '@/utils/storage';
import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { Card, CardContent } from '@/components/Card';
import Colors from '@/constants/colors';
import { Usuario } from '@/types/user';
import { Ionicons } from '@expo/vector-icons';
import { obtenerResultadosEstudiante, obtenerSesionesDisponibles, obtenerSesionesPendientes, API_URL, getAuthHeaders } from '@/utils/api';
import { obtenerQuizzesPendientes, limpiarQuizzesHuerfanos } from '@/database/quizzesDao';
import { obtenerSesionesConResultadoLocal } from '@/database/resultadosDao';
import { programarNotificaciones } from '@/utils/notificaciones';
import { useOffline } from '@/contexts/OfflineContext';

export default function EstudianteQuicesScreen() {
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);
  const [quicesDisponibles, setQuicesDisponibles] = useState<any[]>([]);
  const [quicesCompletados, setQuicesCompletados] = useState<any[]>([]);
  const [pendientes, setPendientes] = useState<any[]>([]);
  const [quizzesOffline, setQuizzesOffline] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [alertaPendiente, setAlertaPendiente] = useState<string | null>(null);
  const [mostrarModalRepetir, setMostrarModalRepetir] = useState(false);
  const [quizParaRepetir, setQuizParaRepetir] = useState<any>(null);
  const [sesionesCompletadasOffline, setSesionesCompletadasOffline] = useState<number[]>([]);

  const { resultadosPendientes, refreshPendientes } = useOffline();

  useFocusEffect(
    React.useCallback(() => {
      cargarUsuarioActual();
      cargarQuices();
      cargarPendientes();
      refreshPendientes();
    }, [])
  );

  const cargarUsuarioActual = async () => {
    try {
      const userJson = await getItem('user');
      if (userJson) {
        const parsed = JSON.parse(userJson);
        setUsuarioActual(parsed);
        return parsed;
      }
    } catch (error) {
      console.error('Error al cargar usuario actual:', error);
    }
    return null;
  };

  // Carga TODO lo relacionado a quices: disponibles, completados, pendientes y offline.
  // Primero muestra lo que haya en cache para que el usuario vea algo rapido,
  // luego va al backend por datos frescos.
  const cargarQuices = async () => {
    setCargando(true);
    try {
      const usuario = usuarioActual || (await cargarUsuarioActual());
      if (!usuario) {
        setQuicesDisponibles([]);
        setQuicesCompletados([]);
        return;
      }

      // Mostramos datos en cache mientras se cargan los nuevos
      try {
        const cachedDisponibles = await AsyncStorage.getItem(`quices_disponibles_${usuario.usu_id}`);
        const cachedCompletados = await AsyncStorage.getItem(`quices_completados_${usuario.usu_id}`);
        if (cachedDisponibles) setQuicesDisponibles(JSON.parse(cachedDisponibles));
        if (cachedCompletados) setQuicesCompletados(JSON.parse(cachedCompletados));
      } catch (e) {
        console.error('Error cargando cache de quices:', e);
      }

      // Traemos los resultados ya guardados del backend
      try {
        const response = await obtenerResultadosEstudiante(usuario.usu_id);
        const resultados = Array.isArray(response.resultados) ? response.resultados : [];
        const mappedResultados = resultados.map((item: any) => ({
          id: item.sesion_id,
          quizId: item.quiz_id,
          titulo: item.quiz_titulo,
          materia: item.materia_nombre,
          nota: item.nota_final,
          puntos: item.puntos_ganados,
          fecha: item.hora_fin,
          escala: item.escala_puntuacion || item.escala || 100,
          codigoAcceso: item.ses_codigo_acceso,
        }));

        setQuicesCompletados(mappedResultados);
        await AsyncStorage.setItem(`quices_completados_${usuario.usu_id}`, JSON.stringify(mappedResultados));
      } catch (err: any) {
        if (err.message === 'OFFLINE_MODE') {
        } else {
          console.error('Error al cargar resultados del estudiante:', err);
        }
      }

      // Traemos las sesiones activas a las que el estudiante puede entrar
      let disponibles: any[] = [];
      try {
        const disponiblesResponse = await obtenerSesionesDisponibles(usuario.usu_id);
        disponibles = Array.isArray(disponiblesResponse.sesiones) ? disponiblesResponse.sesiones : [];
        setQuicesDisponibles(disponibles);
        await AsyncStorage.setItem(`quices_disponibles_${usuario.usu_id}`, JSON.stringify(disponibles));
      } catch (err: any) {
        if (err.message === 'OFFLINE_MODE') {
        } else {
          console.error('Error al cargar sesiones disponibles:', err);
        }
      }

      // Limpiamos los quizzes offline que ya no existen en el backend.
      // Si no hay internet, no borramos nada para no perder los datos.
      let apiReachable = false;
      const disponiblesIds = disponibles.map((d: any) => d.ses_id);
      let pendientesIds: number[] = [];

      try {
        const pendData = await obtenerSesionesPendientes(usuario.usu_id);
        pendientesIds = (pendData.pendientes || []).map((p: any) => p.sesion_id);
        apiReachable = true;
      } catch (e) {
      }

      if (!apiReachable) {
        try {
          await obtenerSesionesDisponibles(usuario.usu_id);
          apiReachable = true;
        } catch (e) {
        }
      }

      if (apiReachable) {
        const backendIds = [...new Set([...disponiblesIds, ...pendientesIds])];
        await limpiarQuizzesHuerfanos(backendIds);
      }

      // Finalmente cargamos los offline y los completados localmente
      await cargarQuizzesOffline();

      try {
        const completadas = await obtenerSesionesConResultadoLocal();
        setSesionesCompletadasOffline(completadas);
      } catch (e) {
        setSesionesCompletadasOffline([]);
      }
    } catch (error) {
      console.error('Error al cargar quices:', error);
    } finally {
      setCargando(false);
    }
  };

  // Las sesiones agendadas son las que el profesor programa para el futuro.
  // Aqui las cargamos y ademas programamos recordatorios locales para que
  // el estudiante no se olvide de presentarlas.
  const cargarPendientes = async () => {
    const usuario = usuarioActual || (await cargarUsuarioActual());
    if (!usuario) return;
    try {
      // Cache primero, velocidad ante todo
      try {
        const cachedPendientes = await AsyncStorage.getItem(`quices_pendientes_${usuario.usu_id}`);
        if (cachedPendientes) setPendientes(JSON.parse(cachedPendientes));
      } catch (e) {
        console.error('Error cargando cache de pendientes:', e);
      }

      // Despues traemos datos frescos
      const data = await obtenerSesionesPendientes(usuario.usu_id);
      const pendientesList = data.pendientes || [];
      setPendientes(pendientesList);
      await AsyncStorage.setItem(`quices_pendientes_${usuario.usu_id}`, JSON.stringify(pendientesList));

      // Programamos recordatorios locales para cada pendiente
      pendientesList.forEach((p: any) => {
        programarNotificaciones(p.sesion_id, 'Sesión agendada', new Date(p.fecha_inicio));
      });
    } catch (error: any) {
      if (error.message === 'OFFLINE_MODE') {
      } else {
        console.error('Error cargando pendientes:', error);
      }
    }
  };

  const cargarQuizzesOffline = async () => {
    try {
      const offline = await obtenerQuizzesPendientes();
      setQuizzesOffline(offline);
    } catch (error) {
    }
  };

  // Unimos los disponibles del backend, los pendientes y los offline en una sola
  // lista. Filtramos los que ya se completaron localmente para no mostrarlos dos veces.
  const quicesPorPresentar = [
    ...quicesDisponibles.map(d => ({
      id: d.ses_id,
      quizId: d.ses_id_mongo_quiz,
      titulo: d.quiz_titulo,
      fecha: d.ses_fecha_inicio,
      codigo: d.ses_codigo_acceso,
      status: 'disponible'
    })),
    ...pendientes
      .filter(p => !sesionesCompletadasOffline.includes(p.sesion_id))
      .map(p => ({
        id: p.sesion_id,
        quizId: p.quiz_id,
        titulo: p.quiz_titulo || 'Quiz',
        fecha: p.fecha_inicio,
        fecha_fin: p.fecha_fin,
        codigo: p.codigo_acceso,
        status: 'pendiente'
      })),
    ...quizzesOffline.filter(qOff => 
      !quicesDisponibles.some(d => d.ses_id === qOff.sesion_id) &&
      !pendientes.some(p => p.sesion_id === qOff.sesion_id)
    ).map(qOff => ({
      id: qOff.sesion_id,
      quizId: qOff.quiz_id,
      titulo: qOff.titulo || 'Quiz',
      fecha: qOff.fecha_inicio,
      fecha_fin: qOff.fecha_fin,
      codigo: qOff.codigo_acceso,
      status: 'offline'
    }))
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

      <SectionTitle title="Quices" />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Sección Quices por Presentar */}
        {quicesPorPresentar.length > 0 && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Quices por Presentar ({quicesPorPresentar.length})</Text>
            </View>
            {quicesPorPresentar.map((q, index) => (
               <TouchableOpacity key={`${q.id}-${index}`} style={[styles.pendienteCard, { borderLeftColor: q.status === 'disponible' ? Colors.success : Colors.info }]}
                 onPress={() => {
                   if (q.status === 'disponible' || new Date(q.fecha) <= new Date()) {
                     router.push(`/estudiante/quiz/${q.quizId}?sesionId=${q.id}` as any);
                   } else {
                     const fechaFormat = new Date(q.fecha).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                     setAlertaPendiente(fechaFormat);
                   }
                 }}
               >
                 <Ionicons name={q.status === 'disponible' ? "play-circle-outline" : "time-outline"} size={24} color={q.status === 'disponible' ? Colors.success : Colors.info} />
                 <View style={{ flex: 1, marginLeft: 12 }}>
                   <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                     <Text style={styles.pendienteTitulo}>{q.titulo}</Text>
                     <View style={{ backgroundColor: q.status === 'disponible' ? '#E8F5E9' : '#FFFDE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                       <Text style={{ fontSize: 10, color: q.status === 'disponible' ? '#4CAF50' : '#FBC02D', fontWeight: 'bold' }}>
                          {q.status === 'disponible' ? '✅ Disponible ahora' : q.status === 'offline' ? '📱 Offline' : '⏳ Pendiente'}
                       </Text>
                     </View>
                     {quizzesOffline.some(qOff => qOff.sesion_id === q.id) && (
                       <View style={{ backgroundColor: '#E8F5E9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                         <Text style={{ fontSize: 10, color: '#4CAF50', fontWeight: 'bold' }}>📱 Offline</Text>
                       </View>
                     )}
                   </View>
                    <Text style={styles.pendienteFecha}>
                       {q.status === 'disponible' ? 'Disponible ahora' : (q.status === 'pendiente' || q.status === 'offline') && q.fecha_fin ? `Disponible del ${new Date(q.fecha).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} al ${new Date(q.fecha_fin).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : new Date(q.fecha).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                     </Text>
                   <Text style={styles.pendienteCodigo}>Código: {q.codigo}</Text>
                 </View>
                 <Ionicons name="chevron-forward" size={20} color="#999" />
               </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Sección Quices Completados */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Completados</Text>
          
          {cargando ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : quicesCompletados.length > 0 ? (
            quicesCompletados.map((quiz) => (
              <View key={quiz.id} style={styles.quizCard}>
                <TouchableOpacity
                  style={styles.quizInfo}
                  onPress={() => {
                    if (quiz.quizId) {
                      setQuizParaRepetir(quiz);
                      setMostrarModalRepetir(true);
                    }
                  }}
                >
                  <View style={[styles.quizIcon, { backgroundColor: Colors.success + '20' }]}>
                    <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
                  </View>
                  <View style={styles.quizDetails}>
                    <Text style={styles.quizTitle}>{quiz.titulo}</Text>
                    <Text style={styles.quizSubtitle}>{quiz.materia}</Text>
                    {quiz.codigoAcceso ? <Text style={styles.pendienteCodigo}>Código: {quiz.codigoAcceso}</Text> : null}
                    <View style={styles.quizScore}>
                      <Text style={styles.scoreValue}>{quiz.nota}/{quiz.escala || 100}</Text>
                    </View>
                  </View>
                </TouchableOpacity>

              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-done-outline" size={40} color="#ccc" />
              <Text style={styles.emptyStateText}>Aún no has completado quices</Text>
            </View>
          )}
        </View>

        <SectionTitle title="Resultados" />
        <View style={styles.sectionContainer}>
          {quicesCompletados.length > 0 ? (
            quicesCompletados.map((quiz) => (
              <TouchableOpacity 
                key={`res-${quiz.id}`} 
                style={styles.quizCard}
                onPress={() => router.push(`/estudiante/reportes/${quiz.id}` as any)}
              >
                <View style={[styles.quizIcon, { backgroundColor: Colors.primary + '20' }]}>
                  <Ionicons name="bar-chart-outline" size={24} color={Colors.primary} />
                </View>
                <View style={styles.quizDetails}>
                  <Text style={styles.quizTitle}>{quiz.titulo}</Text>
                  <Text style={styles.quizSubtitle}>{quiz.materia}</Text>
                  {quiz.codigoAcceso ? <Text style={styles.pendienteCodigo}>Código: {quiz.codigoAcceso}</Text> : null}
                  <View style={styles.quizScore}>
                    <Text style={styles.scoreValue}>{quiz.nota}/{quiz.escala || 100}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="analytics-outline" size={40} color="#ccc" />
              <Text style={styles.emptyStateText}>No hay resultados para analizar</Text>
            </View>
          )}
        </View>


        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Modal repetir quiz */}
      <Modal
        visible={mostrarModalRepetir}
        transparent
        animationType="fade"
        onRequestClose={() => setMostrarModalRepetir(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Ionicons name="alert-circle-outline" size={40} color={Colors.warning} />
            <Text style={styles.modalTitle}>Repetir Quiz</Text>
            <Text style={styles.modalMessage}>
              Ya completaste este quiz con nota {quizParaRepetir?.nota}/{quizParaRepetir?.escala || 100}. ¿Quieres repetirlo? Se conservará tu primera calificación.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setMostrarModalRepetir(false)}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonTextSecondary]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => {
                  router.push({
                    pathname: `/estudiante/quiz/${quizParaRepetir?.quizId}`,
                    params: {
                      sesionId: quizParaRepetir?.id,
                      yaCompletado: 'true',
                      notaAnterior: `${quizParaRepetir?.nota ?? ''}/${quizParaRepetir?.escala || 100}`,
                    }
                  } as any);
                  setMostrarModalRepetir(false);
                }}
              >
                <Text style={styles.modalButtonText}>Repetir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal sesión agendada */}
      <Modal
        visible={!!alertaPendiente}
        transparent
        animationType="fade"
        onRequestClose={() => setAlertaPendiente(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Ionicons name="time-outline" size={40} color={Colors.info} />
            <Text style={styles.modalTitle}>Aún no comienza</Text>
            <Text style={styles.modalMessage}>
              Disponible el {alertaPendiente}
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setAlertaPendiente(null)}
            >
              <Text style={styles.modalButtonText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  verTodo: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
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
    color: '#999',
    marginTop: 4,
  },
  quizScore: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  scoreValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.success,
  },
  scoreLabel: {
    fontSize: 12,
    color: '#666',
    marginLeft: 2,
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

  // ── Pendientes ──
  pendienteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.info,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  pendienteTitulo: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  pendienteFecha: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  pendienteCodigo: {
    fontSize: 12,
    color: '#999',
    marginTop: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  modalButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 10,
  },
  modalButtonSecondary: {
    backgroundColor: '#e0e0e0',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  modalButtonTextSecondary: {
    color: '#666',
  },
});
