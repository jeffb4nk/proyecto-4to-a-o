// Muestra una vista previa del quiz antes de que el estudiante empiece a jugar.
// Aqui ve cuantas preguntas tiene, el modo de juego y una portada si el profesor
// le puso una. Tambien valida si la sesion ya empezo o si es repeticion.
import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Image } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { getItem } from '@/utils/storage';
import { API_URL, getAuthHeaders } from '@/utils/api';
import { obtenerQuizDescargado } from '@/database/quizzesDao';
import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { Card, CardContent } from '@/components/Card';
import Colors from '@/constants/colors';
import { Usuario } from '@/types/user';
import { Ionicons } from '@expo/vector-icons';
import { AppImage } from '@/components/AppImage';

export default function QuizScreen() {
  const params = useLocalSearchParams();
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);
  const [quizData, setQuizData] = useState<any>(null);
  const [sesionId, setSesionId] = useState<string>('');
  const [modoJuego, setModoJuego] = useState<string>('');
  const escalaPuntuacionRef = useRef(100);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [canStart, setCanStart] = useState(true);
  const [startTimeError, setStartTimeError] = useState<string | null>(null);
  const [esRepeticion, setEsRepeticion] = useState(false);
  const [notaAnterior, setNotaAnterior] = useState<string>('');

  useFocusEffect(
    useCallback(() => {
      cargarDatos();
    }, [params.quizData, params.sesionId, params.modoJuego])
  );

  // Carga los datos del quiz desde los parametros de la URL (si vienen de unirse)
  // o directamente del backend. Si no hay internet, busca en la base de datos
  // local de SQLite para modo offline. Tambien valida si el quiz ya deberia
  // estar disponible segun la fecha de inicio.
  const cargarDatos = async () => {
    let currentQuizData: any = null;
    let fechaInicioStr: string | null = null;
    let escalaPuntuacion = 100;
    try {
      setCargando(true);
      // Limpiamos datos viejos para que no se vean cosas de otro quiz
      setQuizData(null);
      setErrorMsg(null);
      setEsRepeticion(params.yaCompletado === 'true');
      setNotaAnterior((params.notaAnterior as string) || '');

      const userJson = await getItem('user');
      if (userJson) {
        setUsuarioActual(JSON.parse(userJson));
      }

      const quizDataParam = params.quizData as string | undefined;
      const sesionIdParam = params.sesionId as string | undefined;
      const modoJuegoParam = params.modoJuego as string | undefined;
      const escalaPuntuacionParam = params.escalaPuntuacion as string | undefined;

      // Si el quiz viene comprimido en los parametros (desde unirse), lo usamos
      // directo. Si no, lo pedimos al backend por el id de la sesion.
      if (quizDataParam) {
        currentQuizData = JSON.parse(quizDataParam);
        setQuizData(currentQuizData);
        setSesionId(sesionIdParam || '');
        setModoJuego(modoJuegoParam || '');
        if (escalaPuntuacionParam) {
          escalaPuntuacionRef.current = Number(escalaPuntuacionParam);
        }
      } else if (sesionIdParam) {
        try {
          const headers = await getAuthHeaders();
          const response = await fetch(`${API_URL}/sesiones/obtener-quiz/${sesionIdParam}`, { headers });
          const data = await response.json();

          if (!response.ok) {
            // Si el quiz ya se abrio en otro dispositivo, se lo decimos al usuario
            if (response.status === 403 && data.detail?.includes('otro dispositivo')) {
              setErrorMsg(data.detail);
              setCargando(false);
              return;
            }
            throw new Error(data.detail || data.mensaje || 'No se pudo cargar el quiz');
          }

          currentQuizData = data.quiz;
          setQuizData(currentQuizData);
          setSesionId(sesionIdParam);
          setModoJuego(data.modo_juego || modoJuegoParam || 'Igual');
          fechaInicioStr = data.fecha_inicio || null;
          escalaPuntuacion = data.escala_puntuacion || 100;
          escalaPuntuacionRef.current = escalaPuntuacion;
        } catch (fetchError: any) {
          if (fetchError.message?.includes('otro dispositivo')) {
            setErrorMsg(fetchError.message);
            setCargando(false);
            return;
          }
          // Si no hay conexion, buscamos el quiz descargado localmente
          console.warn('Network fetch failed, trying SQLite fallback:', fetchError);
          const localQuiz = await obtenerQuizDescargado(Number(sesionIdParam));
          if (localQuiz && localQuiz.quiz_json) {
            currentQuizData = JSON.parse(localQuiz.quiz_json);
            setQuizData(currentQuizData);
            setSesionId(sesionIdParam);
            setModoJuego(localQuiz.modo_juego || modoJuegoParam || 'Igual');
            fechaInicioStr = localQuiz.fecha_inicio || null;
            escalaPuntuacion = localQuiz.escala_puntuacion || 100;
            escalaPuntuacionRef.current = escalaPuntuacion;
          } else {
            setErrorMsg('No hay conexión a internet y el quiz no está disponible para modo offline. Por favor, conéctate para descargarlo.');
            setCargando(false);
            return;
          }
        }
      }

      // Verificamos si el quiz ya esta disponible segun la fecha de inicio.
      // Les damos 5 minutos de tolerancia para que no se estresen con la hora exacta.
      if (fechaInicioStr) {
        const fechaInicio = new Date(fechaInicioStr);
        const ahora = new Date();
        const tolerancia = 5 * 60 * 1000;

        if (ahora < new Date(fechaInicio.getTime() - tolerancia)) {
          setCanStart(false);
          setStartTimeError(`Este quiz comienza el ${fechaInicio.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`);
        } else {
          setCanStart(true);
          setStartTimeError(null);
        }
      }
    } catch (error: any) {
      console.error('Error al cargar datos:', error);
      if (!errorMsg && !currentQuizData) {
        setErrorMsg(error.message || 'No se pudo cargar el quiz');
      }
    } finally {
      setCargando(false);
    }
  };

  const handleComenzarQuiz = () => {
    // Leer desde params directamente para evitar estado obsoleto por reuse de pantalla
    const sesionIdActual = (params.sesionId as string) || sesionId;
    const modoJuegoActual = (params.modoJuego as string) || modoJuego;
    const quizActual = quizData;

    if (!quizActual) return;
    
    // Minimizar datos al máximo para evitar límite de SecureStore (<2048 bytes)
    const quizMinimo = {
      _id: quizActual._id,
      titulo: quizActual.titulo || quizActual.metadatos?.titulo || 'Quiz',
      tema: quizActual.tema || quizActual.metadatos?.tema || 'General',
      preguntas: quizActual.preguntas.map((p: any) => ({
        nro_orden: p.nro_orden,
        tipo: p.tipo,
        enunciado: p.enunciado,
        opciones: p.opciones,
        tiempo_limite_segundos: p.tiempo_limite_segundos,
        multimedia: p.multimedia,
        categoria: p.categoria,
        puntos_si_es_dificultad: p.puntos_si_es_dificultad
      }))
    };
    
    // Redirigir directamente a la pantalla de juego tipo Kahoot
    router.push({
      pathname: '/estudiante/quiz/play',
      params: { 
        quizData: JSON.stringify(quizMinimo),
        sesionId: sesionIdActual,
        modoJuego: modoJuegoActual,
        escalaPuntuacion: String(escalaPuntuacionRef.current),
      },
    } as any);
  };

  if (cargando) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Cargando quiz...</Text>
        </View>
      </View>
    );
  }

  if (!quizData) {
    return (
      <View style={styles.container}>
        <Header
          showBackButton={true}
          showProfile={true}
          profileImage={usuarioActual?.usu_imagen}
          profileName={usuarioActual?.usu_nombre}
          profileLastName={usuarioActual?.usu_apellido}
          onProfilePress={() => router.push('/estudiante/perfil' as any)}
        />
        <SectionTitle title="Quiz" />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.accent} />
           <Text style={styles.errorText}>{errorMsg || 'No se pudo cargar el quiz'}</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        showBackButton={true}
        showProfile={true}
        profileImage={usuarioActual?.usu_imagen}
        profileName={usuarioActual?.usu_nombre}
        profileLastName={usuarioActual?.usu_apellido}
        onProfilePress={() => router.push('/estudiante/perfil' as any)}
      />

      <SectionTitle title="Quiz" />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Información del Quiz con Portada */}
        <Card style={styles.quizInfoCard}>
          <CardContent>
            {/* Portada del quiz si existe */}
            {quizData.portada || quizData.metadatos?.imagen_portada || quizData.metadatos?.portada || quizData.multimedia?.url ? (
              <AppImage
                uri={quizData.portada || quizData.metadatos?.imagen_portada || quizData.metadatos?.portada || quizData.multimedia?.url}
                style={styles.quizCover}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.quizCoverPlaceholder}>
                <Ionicons name="book-outline" size={64} color={Colors.primary} />
              </View>
            )}

            <Text style={styles.quizTitle}>
              {quizData.titulo || quizData.metadatos?.titulo || 'Quiz'}
            </Text>

            {/* Meta información */}
            <View style={styles.quizMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="document-text-outline" size={20} color={Colors.primary} />
                <Text style={styles.metaText}>
                  {quizData.preguntas?.length || 0} preguntas
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="game-controller-outline" size={20} color={Colors.primary} />
                <Text style={styles.metaText}>
                  {modoJuego === 'Igual' ? 'Igual' : 'Dificultad'}
                </Text>
              </View>
            </View>

            {quizData.tema || quizData.metadatos?.tema ? (
              <View style={styles.themeBadge}>
                <Ionicons name="prism-outline" size={16} color="#666" />
                <Text style={styles.themeText}>
                  {quizData.tema || quizData.metadatos?.tema}
                </Text>
              </View>
            ) : null}
          </CardContent>
        </Card>

        {esRepeticion && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', borderRadius: 10, padding: 12, marginBottom: 8, marginHorizontal: 16 }}>
              <Ionicons name="refresh-circle" size={20} color="#2E7D32" style={{ marginRight: 8 }} />
              <Text style={{ color: '#1B5E20', fontSize: 13, flex: 1, lineHeight: 18 }}>
                Ya presentaste este quiz (nota: {notaAnterior || 'N/A'}). Puedes repetirlo para practicar (solo online), tu nota original se conserva.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8E1', borderRadius: 10, padding: 10, marginBottom: 16, marginHorizontal: 16 }}>
              <Ionicons name="cloud-offline-outline" size={18} color="#F57F17" style={{ marginRight: 8 }} />
              <Text style={{ color: '#795548', fontSize: 12, flex: 1, lineHeight: 16 }}>
                No disponible para modo offline porque ya lo completaste.
              </Text>
            </View>
          </>
        )}
        {/* Botón de Comenzar */}
            {startTimeError && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF3E0', borderRadius: 10, padding: 12, marginBottom: 16 }}>
                <Ionicons name="time-outline" size={20} color="#EF6C00" style={{ marginRight: 8 }} />
                <Text style={{ color: '#E65100', fontSize: 14, flex: 1 }}>{startTimeError}</Text>
              </View>
            )}
            <TouchableOpacity 
              style={[styles.startButton, !canStart && { backgroundColor: '#ccc', opacity: 0.7 }]} 
              onPress={handleComenzarQuiz}
              disabled={!canStart}
            >
              <Ionicons name="play" size={24} color="#fff" />
              <Text style={styles.startButtonText}>
                {canStart ? 'Comenzar Quiz' : 'Aún no disponible'}
              </Text>
            </TouchableOpacity>

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
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: Colors.primary,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  quizInfoCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  quizCover: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
  },
  quizCoverPlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  quizTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  quizMeta: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  metaText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
    marginLeft: 6,
  },
  themeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  themeText: {
    fontSize: 13,
    color: '#1976d2',
    fontWeight: '500',
    marginLeft: 4,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    marginHorizontal: 16,
    paddingVertical: 18,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  bottomPadding: {
    height: 100,
  },
});