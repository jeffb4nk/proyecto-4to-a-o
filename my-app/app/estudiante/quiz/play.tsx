import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Animated, 
  Dimensions, 
  Image, 
  TextInput,
  ActivityIndicator,
  StatusBar,
  SafeAreaView
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { getItem, setItem } from '@/utils/storage';
import { Ionicons } from '@expo/vector-icons';
import { API_URL, enviarResultadoQuiz, getAuthHeaders } from '@/utils/api';
import { cancelarNotificaciones } from '@/utils/notificaciones';
import { Usuario } from '@/types/user';
import { AppImage } from '@/components/AppImage';
import { 
  QuizCompleto, 
  PreguntaMongo, 
  validarQuizCompleto,
  getEnunciado,
  esSeleccionMultiple,
  esCompletacion,
  esOpcionMultiple,
  getIndicesCorrectos,
  esRespuestaCorrectaSimple,
  esRespuestaCorrectaMultiple,
  esRespuestaCorrectaCompletacion
} from '@/types/quizMongo';
import { obtenerQuizDescargado, actualizarEstadoQuiz } from '@/database/quizzesDao';
import { useOffline } from '@/contexts/OfflineContext';

const { width, height } = Dimensions.get('window');

// Dimensiones y paleta que imitan el estilo Kahoot.
// Los colores de respuestas (rojo, azul, amarillo, verde) son
// los mismos que usa Kahoot para mantener consistencia visual.
const COLORS = {
  // Fondos
  background: '#250548', // Morado oscuro Kahoot
  backgroundDark: '#1a0335',
  card: '#fff',
  
  // Colores de respuestas (Kahoot clásico)
  red: '#e01f3d',      // Triángulo rojo
  blue: '#1b5ff9',     // Rombo azul
  yellow: '#d89e00',   // Círculo amarillo
  green: '#26890c',    // Cuadrado verde
  
  // Estados
  correct: '#00c985',   // Verde brillante
  wrong: '#ff3355',     // Rojo brillante
  
  // UI
  timer: '#ffa51e',     // Naranja temporizador
  timerUrgent: '#ff3355',
  text: '#fff',
  textDark: '#333',
  progressBg: '#3d1a5e',
};

// Los botones de respuesta heredan el color según su posición,
// igual que en Kahoot. Así el estudiante ubica rápido cada opción.
const getAnswerColor = (index: number): string => {
  const colors = [COLORS.red, COLORS.blue, COLORS.yellow, COLORS.green];
  return colors[index % colors.length];
};

// Cada posición tiene una forma geométrica asociada.
// Ayuda a estudiantes con daltonismo a distinguir opciones.
const getAnswerShape = (index: number): 'triangle' | 'diamond' | 'circle' | 'square' => {
  const shapes: ('triangle' | 'diamond' | 'circle' | 'square')[] = 
    ['triangle', 'diamond', 'circle', 'square'];
  return shapes[index % shapes.length];
};

// Pequeño ícono decorativo que va dentro de cada botón de respuesta.
// No es funcional, solo ayuda visual para identificar opciones.
const ShapeIcon: React.FC<{ shape: 'triangle' | 'diamond' | 'circle' | 'square'; size?: number; color?: string }> = 
  ({ shape, size = 32, color = '#fff' }) => {
  const iconName = {
    triangle: 'triangle',
    diamond: 'square',
    circle: 'ellipse',
    square: 'square'
  }[shape];
  
  return <Ionicons name={iconName as any} size={size} color={color} />;
};

// === COMPONENTE PRINCIPAL ===
// Acá vive todo el juego: desde que el estudiante ve la primera pregunta
// hasta que sale de la pantalla de resultados.
export default function QuizPlayScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  
  // Datos básicos: quién es el usuario, qué quiz está jugando y cómo está configurada la sesión.
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);
  const [quizData, setQuizData] = useState<QuizCompleto | null>(null);
  const [sesionId, setSesionId] = useState<string>('');
  const [codigoAcceso, setCodigoAcceso] = useState<string>('');
  const [modoJuego, setModoJuego] = useState<string>('Igual');
  const [escalaPuntuacion, setEscalaPuntuacion] = useState<number | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  
  // Acá va todo lo que cambia durante el juego: qué pregunta va,
  // cuánto tiempo le queda, su puntaje y las respuestas que ha dado.
  const [preguntaActual, setPreguntaActual] = useState<number>(0);
  const [tiempoRestante, setTiempoRestante] = useState<number>(0);
  const [tiempoMaximo, setTiempoMaximo] = useState<number>(0);
  const [puntos, setPuntos] = useState<number>(0);
  const [respuestasUsuario, setRespuestasUsuario] = useState<number[][]>([]);
  const respuestasUsuarioRef = useRef<number[][]>([]);
  
  // Una vez que termina el quiz, estos estados guardan la nota, el resultado
  // y el ranking de la sesión para mostrarlos en la pantalla de resultados.
  const [notaFinal, setNotaFinal] = useState<number | null>(null);
  const [puntosFinales, setPuntosFinales] = useState<number | null>(null);
  const [resultadoGuardado, setResultadoGuardado] = useState<boolean>(false);
  const [guardandoResultado, setGuardandoResultado] = useState<boolean>(false);
  const [primerResultado, setPrimerResultado] = useState<any>(null);
  const [topResultados, setTopResultados] = useState<any[]>([]);
  const [cargandoTopResultados, setCargandoTopResultados] = useState<boolean>(false);
  const inicioTiempoRef = useRef<number>(Date.now());
  
  // Como las respuestas de completación son texto libre, necesitamos
  // guardarlas aparte para mostrarlas en el resumen final.
  const [textosCompletacion, setTextosCompletacion] = useState<Record<number, string>>({});
  const textosCompletacionRef = useRef<Record<number, string>>({});
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // === REPORTE DE PROGRESO EN VIVO ===
  // Mientras el estudiante juega, mandamos su puntaje al backend.
  // Así el profesor puede ver en tiempo real cómo va cada uno.
  const reportarProgreso = useCallback(async (puntosActuales: number) => {
    try {
      const progHeaders = await getAuthHeaders();
      await fetch(`${API_URL}/sesiones/progreso`, {
        method: 'PATCH',
        headers: progHeaders,
        body: JSON.stringify({
          sesion_id: parseInt(sesionId),
          id_usuario: usuarioActual?.usu_id,
          puntos_actuales: puntosActuales,
          pregunta_actual: preguntaActual + 1,
          total_preguntas: quizData?.preguntas.length || 0
        })
      });
    } catch (e) {
      // Si falla el reporte en vivo no pasa nada, el juego sigue igual.
    }
  }, [sesionId, usuarioActual, preguntaActual, quizData]);

  // Cada vez que los puntos cambian, disparamos el reporte de progreso
  // para que el profesor vea la nota actualizada en su pantalla de "En vivo".
  useEffect(() => {
    if (puntos > 0 && sesionId && usuarioActual && quizData) {
      const notaParcial = calcularNotaFinal();
      reportarProgreso(notaParcial);
    }
  }, [puntos, reportarProgreso, sesionId, usuarioActual, quizData]);
  const [mostrarResultados, setMostrarResultados] = useState<boolean>(false);
  const [comentarioFinal, setComentarioFinal] = useState<string>('');
  
  // Cada tipo de pregunta maneja la respuesta distinto:
  // simple (un índice), múltiple (array) o completación (texto).
  const [respuestaSeleccionada, setRespuestaSeleccionada] = useState<number | null>(null);
  const [respuestasSeleccionadas, setRespuestasSeleccionadas] = useState<number[]>([]);
  const [respuestaCompletacion, setRespuestaCompletacion] = useState<string>('');
  const [feedbackCorrecto, setFeedbackCorrecto] = useState<boolean | null>(null);
  const [estaRespondiendo, setEstaRespondiendo] = useState<boolean>(false);
  
  // Si el estudiante pierde conexión, el hook de OfflineContext se encarga
  // de encolar el resultado y sincronizarlo cuando vuelva el internet.
  const { isConnected, resultadosPendientes, enviarResultado } = useOffline();
  
  // Las animaciones hacen que el juego se sienta más fluido
  // y le dan feedback visual al estudiante.
  const animacionProgreso = useRef(new Animated.Value(1)).current;
  const animacionPregunta = useRef(new Animated.Value(0)).current;
  const animacionFeedback = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Con useFocusEffect controlamos que al volver a esta pantalla
  // no se recargue el quiz si ya estamos en medio de una partida.
  // Esto evita pérdida de progreso por navegación accidental.
  const sesionIdFromParams = params.sesionId as string;
  const sesionIdRef = useRef<string>('');
  const enJuegoActivoRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!sesionIdFromParams) return;

      const primeraVez = sesionIdFromParams !== sesionIdRef.current;
      const jugando = enJuegoActivoRef.current && preguntaActual > 0 && !mostrarResultados;

      if (primeraVez || !jugando) {
        sesionIdRef.current = sesionIdFromParams;
        enJuegoActivoRef.current = true;
        setMostrarResultados(false);
        cargarDatos();
      }
    }, [sesionIdFromParams])
  );

  // Cada vez que cambia la pregunta, arrancamos el timer y la animación.
  // Si ya estamos en resultados o cargando, no se hace nada.
  useEffect(() => {
    if (!cargando && quizData && !mostrarResultados && !estaRespondiendo) {
      iniciarTemporizador();
      animarEntradaPregunta();
    }
    return () => limpiarTimer();
  }, [preguntaActual, cargando, mostrarResultados]);

  // === FUNCIONES DE CARGA ===
  // Mata el timer actual si existe. Lo llamamos antes de crear uno nuevo
  // para evitar que varios timers corran al mismo tiempo.
  const limpiarTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Esta función es la primera que se ejecuta al entrar al quiz.
  // Intenta traer los datos del backend; si falla, busca en SQLite local.
  const cargarDatos = async () => {
    let loadedQuiz: QuizCompleto | null = null;
    let isOffline = false;
    let quizLocalData: any = null;
    try {
      setCargando(true);
      setError(null);
      setOfflineMode(false);
      
      // Si el estudiante venía de otro quiz, limpiamos todo para empezar frescos.
      respuestasUsuarioRef.current = [];
      textosCompletacionRef.current = {};
      setRespuestasUsuario([]);
      setTextosCompletacion({});
      setPuntos(0);
      setPreguntaActual(0);
      setMostrarResultados(false);
      setResultadoGuardado(false);
      setPrimerResultado(null);
      setNotaFinal(null);
      setPuntosFinales(null);
      inicioTiempoRef.current = Date.now();
      
      // Validar parámetros
      const sesionIdParam = params.sesionId as string;
      if (!sesionIdParam) {
        setError('No se recibió el ID de sesión');
        return;
      }
      
      // Recuperamos el usuario desde el storage local.
      const userJson = await getItem('user');
      if (userJson) {
        try { setUsuarioActual(JSON.parse(userJson)); } catch (e) {}
      }

      // A veces el quiz ya viene en los parámetros de navegación,
      // así nos ahorramos un viaje al backend.
      const quizDataParam = params.quizData as string | undefined;
      if (quizDataParam) {
        try {
          const parsed = JSON.parse(quizDataParam);
          if (parsed && Array.isArray(parsed.preguntas) && parsed.preguntas.length > 0) {
            loadedQuiz = parsed;
            setQuizData(loadedQuiz as QuizCompleto);
            setSesionId(sesionIdParam);
            setCodigoAcceso('');
            setModoJuego((params.modoJuego as string) || 'Igual');
            setEscalaPuntuacion(Number(params.escalaPuntuacion) || null);
            const tiempoInicial = (loadedQuiz as QuizCompleto).preguntas[0].tiempo_limite_segundos || 20;
            setTiempoRestante(tiempoInicial);
            setTiempoMaximo(tiempoInicial);
            setCargando(false);
            return;
          }
        } catch (e) {
        }
      }

      // Intento 1: cargar desde el backend si hay conexión.
      try {
        const quizHeaders = await getAuthHeaders();
        const response = await fetch(`${API_URL}/sesiones/obtener-quiz/${sesionIdParam}`, { headers: quizHeaders });
        const data = await response.json();
        
        if (!response.ok) {
          if (response.status === 403 && data.detail?.includes('otro dispositivo')) {
            setError(data.detail);
            setCargando(false);
            return;
          }
          throw new Error(data.detail || `Error ${response.status}`);
        }
        
        if (!data.quiz || !validarQuizCompleto(data.quiz)) throw new Error('Estructura de quiz inválida');
        
        loadedQuiz = data.quiz;
        setQuizData(loadedQuiz);
        setSesionId(sesionIdParam);
        setCodigoAcceso(data.codigo_acceso || '');
        setModoJuego(data.modo_juego || (params.modoJuego as string) || 'Igual');
        setEscalaPuntuacion(data.escala_puntuacion || null);
        
      } catch (onlineError: any) {
        if (onlineError?.message?.includes('otro dispositivo')) {
          setError(onlineError.message);
          setCargando(false);
          return;
        }
        // Intento 2: si no hay internet, cargamos el quiz desde SQLite
        // (previamente descargado por el estudiante en su biblioteca).
        const sesionIdNum = Number(sesionIdParam);
        const quizLocal = await obtenerQuizDescargado(sesionIdNum);
        quizLocalData = quizLocal;
        
        if (quizLocal) {
          loadedQuiz = JSON.parse(quizLocal.quiz_json);
          setQuizData(loadedQuiz);
          setSesionId(sesionIdParam);
          setCodigoAcceso(quizLocal.codigo_acceso);
          setModoJuego(quizLocal.modo_juego);
          setEscalaPuntuacion(quizLocal.escala_puntuacion);
          setOfflineMode(true);
          isOffline = true;
        } else {
          throw new Error('No hay conexión y el quiz no está descargado localmente');
        }
      }
      
      // Configuramos el tiempo de la primera pregunta según lo que definió el profe.
      if (loadedQuiz && loadedQuiz.preguntas.length > 0) {
        const tiempoInicial = loadedQuiz.preguntas[0].tiempo_limite_segundos || 20;
        setTiempoRestante(tiempoInicial);
        setTiempoMaximo(tiempoInicial);
      }
      
    } catch (err) {
       console.error('❌ Error cargando quiz:', err);
      setError('No hay conexión a internet y el quiz no está disponible para modo offline. Por favor, conéctate para descargarlo.');
    } finally {
      // --- VALIDACIÓN FINAL DE HORA ---
      // Si el quiz tiene fecha programada y el estudiante intenta
      // abrirlo antes, lo bloqueamos. Esto evita que se adelanten.
      if (loadedQuiz) {
        const fechaInicioStr = isOffline 
          ? quizLocalData?.fecha_inicio 
          : null; // Si es online, el backend ya validó el acceso

        if (fechaInicioStr) {
          const fechaInicio = new Date(fechaInicioStr);
          const ahora = new Date();
          const tolerancia = 5 * 60 * 1000; // 5 minutos

          if (ahora < new Date(fechaInicio.getTime() - tolerancia)) {
            setError('Aún no es hora de presentar este quiz. Por favor, espera al horario programado.');
            setQuizData(null); // Bloquear el juego
            setCargando(false);
            return;
          }
        }
      }
      setCargando(false);
    }
  };

  // El modo de juego llega como "Igual" o "Dificultad" y puede incluir
  // una escala opcional. Esta función separa ambos valores.
  const parseModoJuego = (modo: string): { modoBase: string; escala: number } => {
    const [modoBase, escalaRaw] = modo?.split('-') || [];
    const escala = Number(escalaRaw) || 100;
    return {
      modoBase: modoBase || 'Igual',
      escala: (escala >= 1 && escala <= 999) ? escala : 100
    };
  };

  // Acá convertimos las respuestas del estudiante en una nota numérica.
  // Dependiendo del modo (Igual o Dificultad), cada pregunta vale distinto.
  // Selección múltiple tiene puntuación parcial.
  const calcularNotaFinal = () => {
    if (!quizData || !escalaPuntuacion) return 0;
    const modoBase = modoJuego;
    const escala = escalaPuntuacion;

    const totalPosible = quizData.preguntas.reduce((sum, pregunta) => {
      return sum + (modoBase === 'Dificultad' ? (pregunta.puntos_si_es_dificultad ?? 1) : 1);
    }, 0);

    const puntosAcumulados = quizData.preguntas.reduce((sum, pregunta, index) => {
      const respuestasPregunta = respuestasUsuarioRef.current[index] || [];
      
      let puntosPregunta = 0;
      if (esSeleccionMultiple(pregunta)) {
        // En selección múltiple el estudiante puede acertar solo algunas
        // de las opciones correctas. Le damos puntos proporcionales.
        const indicesCorrectos = getIndicesCorrectos(pregunta);
        const totalCorrectas = indicesCorrectos.length;
        const aciertos = respuestasPregunta.filter(r => indicesCorrectos.includes(r)).length;
        
        if (totalCorrectas > 0) {
          puntosPregunta = aciertos / totalCorrectas;
        }
        
      } else if (esCompletacion(pregunta)) {
        const textoRespuesta = textosCompletacionRef.current[index] || '';
        const esCorrecta = esRespuestaCorrectaCompletacion(pregunta, textoRespuesta);
        puntosPregunta = esCorrecta ? 1 : 0;
      } else {
        const esCorrecta = esRespuestaCorrectaSimple(pregunta, respuestasPregunta[0]);
        puntosPregunta = esCorrecta ? 1 : 0;
      }

      if (modoBase === 'Dificultad') {
        return sum + (puntosPregunta * (pregunta.puntos_si_es_dificultad ?? 1));
      }
      return sum + puntosPregunta;
    }, 0);

    if (totalPosible === 0) return 0;
    const nota = (puntosAcumulados / totalPosible) * escala;
    const notaFinal = Math.min(escala, Math.round(nota * 100) / 100);
    
    return notaFinal;
  };

  // Los puntos canjeables se normalizan a una escala de 10 para que
  // todos los quizzes, sin importar su ponderación, den máximo 10 puntos.
  const calcularPuntosGanados = (nota: number) => {
    if (!escalaPuntuacion) return 0;
    const proporcion = nota / escalaPuntuacion;
    return Math.round(proporcion * 10);
  };

  // Genera un objeto con el detalle de cada pregunta: qué respondió el
  // estudiante, cuál era la respuesta correcta y si acertó. Se guarda
  // como parte del resultado para que el profesor pueda revisarlo después.
  const construirInformeDetallado = () => {
    if (!quizData) return {};
    
    const preguntas_detalle = quizData.preguntas.map((pregunta, index) => {
      const respuestasPregunta = respuestasUsuarioRef.current[index] || [];
      const tipoPregunta = pregunta.tipo;
      let respuesta_usuario: any = null;
      let respuesta_correcta: any = null;
      let es_correcta = false;
      
      // Dependiendo del tipo de pregunta, obtenemos la respuesta
      // del estudiante de forma distinta.
      if (esSeleccionMultiple(pregunta)) {
        const indices_correctos = pregunta.opciones
          .map((op, i) => op.es_correcta ? i : -1)
          .filter(i => i !== -1);
        respuesta_usuario = respuestasPregunta.map(i => pregunta.opciones[i]?.texto || '');
        respuesta_correcta = indices_correctos.map(i => pregunta.opciones[i]?.texto || '');
        es_correcta = esRespuestaCorrectaMultiple(pregunta, respuestasPregunta);
      } else if (esCompletacion(pregunta)) {
        const texto = textosCompletacionRef.current[index] || '';
        respuesta_usuario = texto;
        respuesta_correcta = pregunta.opciones.find(o => o.es_correcta)?.texto || '';
        es_correcta = esRespuestaCorrectaCompletacion(pregunta, texto);
      } else {
        const indice = respuestasPregunta[0];
        respuesta_usuario = indice !== undefined ? pregunta.opciones[indice]?.texto : null;
        respuesta_correcta = pregunta.opciones.find(o => o.es_correcta)?.texto || '';
        es_correcta = esRespuestaCorrectaSimple(pregunta, indice);
      }
      
      return {
        nro_orden: index + 1,
        enunciado: pregunta.enunciado,
        tipo: tipoPregunta,
        respuesta_usuario,
        respuesta_correcta,
        es_correcta,
        tiempo_limite_segundos: pregunta.tiempo_limite_segundos
      };
    });
    
    const total_preguntas = preguntas_detalle.length;
    const correctas = preguntas_detalle.filter(p => p.es_correcta).length;
    const porcentaje_aciertos = total_preguntas > 0 ? (correctas / total_preguntas) * 100 : 0;
    
    return {
      preguntas: preguntas_detalle,
      resumen: {
        total_preguntas,
        correctas,
        incorrectas: total_preguntas - correctas,
        porcentaje_aciertos: Math.round(porcentaje_aciertos * 10) / 10
      }
    };
  };

  // Envía el resultado al backend (o lo encola si estamos offline).
  // Si es la primera vez que el estudiante presenta este quiz, se guarda
  // la nota. Si ya lo había hecho antes, solo se registra la repetición.
  const guardarResultado = async (nota: number, puntosGanados: number) => {
    if (!usuarioActual || !sesionId) return;
    
    const sesionIdNum = Number(sesionId);
    if (!sesionIdNum || sesionIdNum <= 0) return;
    
    try {
      setGuardandoResultado(true);
      
      const resultado = {
        sesion_id: sesionIdNum,
        id_usuario: usuarioActual.usu_id,
        nota_final: nota,
        puntos_ganados: puntosGanados,
        tiempo_total_ms: Date.now() - inicioTiempoRef.current,
        informe_fallas: construirInformeDetallado(),
        hora_inicio_local: new Date(inicioTiempoRef.current).toISOString(),
        finalizado_en_local: new Date().toISOString(),
        es_offline: offlineMode // Use the state we added
      };

      // Si hay conexión, se envía al backend. Si no, se guarda en la cola offline
      // y se sincroniza cuando vuelva el internet.
      const result = await enviarResultado(resultado);
      
      if (result.success) {
        if (!result.offline && result.data) {
          // Actualizar puntos del usuario si fue online
          if (result.data.usuario?.usu_puntos_app !== undefined) {
            const storedUser = await getItem('user');
            if (storedUser) {
              const parsedUser = JSON.parse(storedUser);
              parsedUser.usu_puntos_app = result.data.usuario.usu_puntos_app;
              await setItem('user', JSON.stringify(parsedUser));
            }
          }
          if (result.data.resultado) {
            setPrimerResultado(result.data.resultado);
          }
        }
        setResultadoGuardado(true);
        // En la biblioteca offline, marcamos el quiz como completado
        // para que el estudiante sepa que ya lo presentó.
        try {
          await actualizarEstadoQuiz(sesionIdNum, "completado");
        } catch (e) {
          console.warn('No se pudo actualizar estado del quiz offline:', e);
        }
      }
    } catch (error) {
    } finally {
      setGuardandoResultado(false);
    }
  };

  // === ANIMACIONES ===
  // Cada vez que cambia de pregunta, la tarjeta hace un slide hacia arriba.
  // Esto hace que el juego se sienta más dinámico.
  const animarEntradaPregunta = () => {
    animacionPregunta.setValue(0);
    Animated.timing(animacionPregunta, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  };

  // Cuando el estudiante responde, mostramos un overlay verde o rojo
  // que aparece, se mantiene un segundo y desaparece.
  const animarFeedback = (esCorrecto: boolean) => {
    animacionFeedback.setValue(0);
    Animated.sequence([
      Animated.timing(animacionFeedback, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(1000),
      Animated.timing(animacionFeedback, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // === TEMPORIZADOR ===
  // Arranca la cuenta regresiva para la pregunta actual.
  // Cuando llega a cero, se marca como tiempo agotado y se pasa a la siguiente.
  const iniciarTemporizador = () => {
    limpiarTimer();
    
    if (!quizData) return;
    const pregunta = quizData.preguntas[preguntaActual];
    if (!pregunta) return;
    
    const tiempo = pregunta.tiempo_limite_segundos || 20;
    setTiempoRestante(tiempo);
    setTiempoMaximo(tiempo);
    
    // La barrita de progreso visual se anima de lleno a vacío
    // durante el tiempo disponible de la pregunta.
    animacionProgreso.setValue(1);
    Animated.timing(animacionProgreso, {
      toValue: 0,
      duration: tiempo * 1000,
      useNativeDriver: false,
    }).start();
    
    timerRef.current = setInterval(() => {
      setTiempoRestante((prev) => {
        if (prev <= 1) {
          limpiarTimer();
          manejarTiempoAgotado();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Cuando el tiempo se acaba, registramos la pregunta como incorrecta
  // (array vacío) y mostramos feedback negativo antes de continuar.
  const manejarTiempoAgotado = () => {
    if (!quizData) return;
    
    setRespuestasUsuario(prev => {
      const nuevo = [...prev, []];
      respuestasUsuarioRef.current = nuevo;
      return nuevo;
    });
    setFeedbackCorrecto(false);
    animarFeedback(false);
    
    setTimeout(() => {
      pasarASiguientePregunta();
    }, 1500);
  };

  // === MANEJO DE RESPUESTAS ===
  // Esta función se llama cada vez que el estudiante toca una opción.
  // Si es selección múltiple, solo marca/desmarca. Si es simple, responde
  // automáticamente y muestra feedback.
  const manejarRespuesta = useCallback((indiceRespuesta: number) => {
    if (!quizData || estaRespondiendo) return;
    
    const pregunta = quizData.preguntas[preguntaActual];
    const multiple = esSeleccionMultiple(pregunta);
    
    if (multiple) {
      // En selección múltiple el estudiante puede elegir varias opciones
      // antes de confirmar. Acá solo hacemos toggle.
      setRespuestasSeleccionadas(prev => 
        prev.includes(indiceRespuesta)
          ? prev.filter(i => i !== indiceRespuesta)
          : [...prev, indiceRespuesta]
      );
    } else {
      // En selección simple (quiz/VF) la respuesta es inmediata.
      // No esperamos a que el estudiante confirme.
      setEstaRespondiendo(true);
      setRespuestaSeleccionada(indiceRespuesta);
      limpiarTimer();
      
      const esCorrecta = esRespuestaCorrectaSimple(pregunta, indiceRespuesta);
      setFeedbackCorrecto(esCorrecta);
      animarFeedback(esCorrecta);
      
      if (esCorrecta) {
        const { modoBase } = parseModoJuego(modoJuego);
        const puntosGanados = modoBase === 'Dificultad'
          ? (pregunta.puntos_si_es_dificultad ?? 1)
          : 1;
        setPuntos(p => p + puntosGanados);
      }
      
      setRespuestasUsuario(prev => {
        const nuevo = [...prev, [indiceRespuesta]];
        respuestasUsuarioRef.current = nuevo;
        return nuevo;
      });
      
      // Esperamos 1.5 segundos para que el estudiante vea el feedback
      // antes de pasar automáticamente a la siguiente pregunta.
      setTimeout(() => {
        pasarASiguientePregunta();
      }, 1500);
    }
  }, [quizData, preguntaActual, estaRespondiendo, modoJuego, tiempoRestante]);

  // El estudiante seleccionó varias opciones y tocó "Confirmar".
  // Evaluamos si el conjunto completo de selecciones es correcto.
  const confirmarRespuestasMultiples = useCallback(() => {
    if (!quizData || respuestasSeleccionadas.length === 0 || estaRespondiendo) return;
    
    const pregunta = quizData.preguntas[preguntaActual];
    setEstaRespondiendo(true);
    limpiarTimer();
    
    const esCorrecta = esRespuestaCorrectaMultiple(pregunta, respuestasSeleccionadas);
    setFeedbackCorrecto(esCorrecta);
    animarFeedback(esCorrecta);
    
    if (esCorrecta) {
      const { modoBase } = parseModoJuego(modoJuego);
      const puntosGanados = modoBase === 'Dificultad'
        ? (pregunta.puntos_si_es_dificultad ?? 1)
        : 1;
      setPuntos(p => p + puntosGanados);
    }
    
    setRespuestasUsuario(prev => {
      const nuevo = [...prev, [...respuestasSeleccionadas]];
      respuestasUsuarioRef.current = nuevo;
      return nuevo;
    });
    
    setTimeout(() => {
      setRespuestasSeleccionadas([]);
      pasarASiguientePregunta();
    }, 1500);
  }, [quizData, preguntaActual, respuestasSeleccionadas, estaRespondiendo, modoJuego, tiempoRestante]);

  // Para preguntas de completación, el estudiante escribe su respuesta
  // y la mandamos a validar. La comparación normaliza el texto (sin acentos,
  // sin puntuación) para no fallar por diferencias tontas.
  const confirmarCompletacion = useCallback(() => {
    if (!quizData || !respuestaCompletacion.trim() || estaRespondiendo) return;
    
    const pregunta = quizData.preguntas[preguntaActual];
    setEstaRespondiendo(true);
    limpiarTimer();
    
    const textoLimpio = respuestaCompletacion.trim();
    const esCorrecta = esRespuestaCorrectaCompletacion(pregunta, textoLimpio);
    setFeedbackCorrecto(esCorrecta);
    animarFeedback(esCorrecta);
    
    if (esCorrecta) {
      const { modoBase } = parseModoJuego(modoJuego);
      const puntosGanados = modoBase === 'Dificultad'
        ? (pregunta.puntos_si_es_dificultad ?? 1)
        : 1;
      setPuntos(p => p + puntosGanados);
    }
    
    setRespuestasUsuario(prev => {
      const nuevo = [...prev, [-1]];
      respuestasUsuarioRef.current = nuevo;
      return nuevo;
    }); // Guardamos -1 como marcador de que fue respuesta de completación
    setTextosCompletacion(prev => {
      const nuevo = { ...prev, [preguntaActual]: textoLimpio };
      textosCompletacionRef.current = nuevo;
      return nuevo;
    }); // Necesitamos el texto original para el informe detallado
    
    setTimeout(() => {
      setRespuestaCompletacion('');
      pasarASiguientePregunta();
    }, 1500);
  }, [quizData, preguntaActual, respuestaCompletacion, estaRespondiendo, modoJuego, tiempoRestante]);

  // Limpia los estados de respuesta y avanza a la siguiente pregunta.
  // Si ya no hay más preguntas, termina el quiz.
  const pasarASiguientePregunta = () => {
    if (!quizData) return;
    
    setEstaRespondiendo(false);
    setRespuestaSeleccionada(null);
    setFeedbackCorrecto(null);
    setRespuestasSeleccionadas([]);
    setRespuestaCompletacion('');
    // NO reiniciar textosCompletacion aquí — los necesitamos para el resumen final.
    
    if (preguntaActual < quizData.preguntas.length - 1) {
      setPreguntaActual(p => p + 1);
    } else {
      finalizarQuiz();
    }
  };

  // Terminaron todas las preguntas. Calculamos la nota, mostramos la
  // pantalla de resultados y guardamos el resultado en el backend.
  const finalizarQuiz = async () => {
    limpiarTimer();
    const nota = calcularNotaFinal();
    const puntosGanados = calcularPuntosGanados(nota);
    setNotaFinal(nota);
    setPuntosFinales(puntosGanados);
    setMostrarResultados(true);
    // Cancelar notificaciones pendientes de esta sesión
    cancelarNotificaciones(Number(sesionId));
    // Primero guardar resultado, luego esperar y cargar ranking
    await guardarResultado(nota, puntosGanados);
    // Después de guardar, esperamos medio segundo y cargamos el ranking
    // de la sesión para mostrarlo en el podio.
    setTimeout(() => cargarTopResultados(), 500);
  };

  // Trae el top de resultados de la sesión desde el backend
  // para mostrarlos en el podio de la pantalla final.
  const cargarTopResultados = async () => {
    try {
      setCargandoTopResultados(true);
      const topHeaders = await getAuthHeaders();
      const response = await fetch(`${API_URL}/sesiones/top-resultados/${sesionId}?limite=0`, { headers: topHeaders });
      if (response.ok) {
        const data = await response.json();
        setTopResultados(data.top_resultados || []);
      }
    } catch (error) {
    } finally {
      setCargandoTopResultados(false);
    }
  };

  // Vuelve todo al estado inicial por si el estudiante quiere intentar
  // el quiz de nuevo (aunque la nota final ya quedó guardada).
  const reiniciarQuiz = () => {
    setPreguntaActual(0);
    setRespuestasUsuario([]);
    respuestasUsuarioRef.current = [];
    setTextosCompletacion({});
    textosCompletacionRef.current = {};
    setPuntos(0);
    setMostrarResultados(false);
    setComentarioFinal('');
    setNotaFinal(null);
    setPuntosFinales(null);
    setResultadoGuardado(false);
    setPrimerResultado(null);
    setEstaRespondiendo(false);
    inicioTiempoRef.current = Date.now();
    if (quizData && quizData.preguntas.length > 0) {
      const tiempoInicial = quizData.preguntas[0].tiempo_limite_segundos || 20;
      setTiempoRestante(tiempoInicial);
      setTiempoMaximo(tiempoInicial);
    }
  };

  const salirQuiz = () => {
    limpiarTimer();
    router.replace('/estudiante');
  };

  // === RENDER ===
  // Todo lo que sigue es JSX. Acá decidimos qué mostrar según el estado actual.
  
  // Mientras se cargan los datos del quiz, mostramos un spinner.
  if (cargando) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.timer} />
          <Text style={styles.loadingText}>Cargando quiz...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Si algo salió mal (sin conexión, quiz no encontrado, etc.),
  // mostramos un mensaje de error con opción a volver.
  if (error || !quizData) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle" size={64} color={COLORS.wrong} />
          <Text style={styles.errorTitle}>¡Ups!</Text>
          <Text style={styles.errorText}>{error || 'No se pudo cargar el quiz'}</Text>
          <TouchableOpacity style={styles.actionBtn} onPress={salirQuiz}>
            <Text style={styles.actionBtnText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Cuando el quiz termina, mostramos la pantalla de resultados con
  // la nota, los puntos, el detalle de respuestas correctas y el podio.
  if (mostrarResultados) {
    const respuestasCorrectas = quizData.preguntas.reduce((count, pregunta, index) => {
      const respuestasPregunta = respuestasUsuario[index] || [];
      if (respuestasPregunta.length === 0) return count;
      if (esSeleccionMultiple(pregunta)) {
        return count + (esRespuestaCorrectaMultiple(pregunta, respuestasPregunta) ? 1 : 0);
      } else if (esCompletacion(pregunta)) {
        const textoRespuesta = textosCompletacion[index];
        return count + (esRespuestaCorrectaCompletacion(pregunta, textoRespuesta || '') ? 1 : 0);
      } else {
        return count + (esRespuestaCorrectaSimple(pregunta, respuestasPregunta[0]) ? 1 : 0);
      }
    }, 0);
    
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.exitBtn} onPress={salirQuiz}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.resultsContainer}>
          {/* Contenido superior: Trofeo, título y stats */}
          <View style={styles.resultsTopContent}>
            {/* Trofeo decorativo para celebrar */}
            <Animated.View style={styles.trophyContainer}>
              <Ionicons name="trophy" size={100} color={COLORS.timer} />
            </Animated.View>

            <Text style={styles.resultsTitle}>¡Quiz Completado!</Text>
            
            {/* Tarjetas con nota, puntos canjeables y respuestas correctas */}
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{notaFinal !== null ? `${notaFinal} / ${escalaPuntuacion ?? '?'}` : `${calcularNotaFinal()} / ${escalaPuntuacion ?? '?'}`}</Text>
                <Text style={styles.statLabel}>Nota</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{puntosFinales !== null ? `${puntosFinales} / 10` : `${calcularPuntosGanados(calcularNotaFinal())} / 10`}</Text>
                <Text style={styles.statLabel}>Puntos canjeables</Text>
              </View>
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{respuestasCorrectas}/{quizData.preguntas.length}</Text>
                <Text style={styles.statLabel}>Correctas</Text>
              </View>
              {resultadoGuardado && primerResultado ? (
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>✓</Text>
                  <Text style={styles.statLabel}>Primera nota</Text>
                </View>
              ) : null}
            </View>
          </View>

          {resultadoGuardado && primerResultado ? (
            <View style={styles.resultNotice}>
              <Text style={styles.resultNoticeText}>
                Tu primera nota se ha guardado. Si repites el quiz, esta primera puntuación se conserva.
              </Text>
            </View>
          ) : null}

          {/* Podio con el ranking completo de la sesión para que el estudiante
              vea cómo le fue comparado con sus compañeros. */}
          <View style={styles.podiumContainer}>
            <Text style={styles.podiumTitle}>🏆 Resultados de la Sesión</Text>
            {cargandoTopResultados ? (
              <ActivityIndicator size="large" color={COLORS.timer} />
              ) : topResultados.length > 0 ? (
                <ScrollView style={styles.podiumScroll} nestedScrollEnabled={true}>
                  <View style={styles.podiumList}>
                    {topResultados.map((resultado, index) => (
                  <View key={index} style={[
                    styles.podiumItem,
                    index === 0 && styles.podiumFirst,
                    index === 1 && styles.podiumSecond,
                    index === 2 && styles.podiumThird
                  ]}>
                    <View style={styles.podiumRank}>
                      <Text style={styles.podiumRankText}>#{index + 1}</Text>
                    </View>
                    <View style={styles.podiumInfo}>
                      <Text style={styles.podiumName}>{resultado.nombre} {resultado.apellido}</Text>
                      <View style={styles.podiumStats}>
                        <Text style={styles.podiumScore}>Nota: {resultado.nota_final}/{escalaPuntuacion}</Text>
                        <Text style={styles.podiumTime}>
                          Tiempo: {Math.floor(resultado.tiempo_total_ms / 1000)}s
                        </Text>
                      </View>
                    </View>
                    {index === 0 && <Ionicons name="medal" size={24} color="#FFD700" />}
                    {index === 1 && <Ionicons name="medal" size={24} color="#C0C0C0" />}
                    {index === 2 && <Ionicons name="medal" size={24} color="#CD7F32" />}
                  </View>
                ))}
              </View>
            </ScrollView>
            ) : (
              <Text style={styles.podiumEmpty}>No hay resultados disponibles aún</Text>
            )}
          </View>

          {/* Botón de salir */}
          <View style={styles.resultsButtons}>
            <TouchableOpacity style={[styles.actionBtn, styles.secondaryBtn]} onPress={salirQuiz}>
              <Ionicons name="home" size={24} color={COLORS.text} />
              <Text style={[styles.actionBtnText, styles.secondaryBtnText]}>Salir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // === PANTALLA DE JUEGO ===
  // Acá empieza el HTML visual del juego. Determinamos el tipo de la pregunta
  // actual para saber qué UI mostrar (botones, checkbox o input de texto).
  const pregunta = quizData.preguntas[preguntaActual];
  const preguntaMultiple = esSeleccionMultiple(pregunta);
  const preguntaCompletacion = esCompletacion(pregunta);
  const totalPreguntas = quizData.preguntas.length;
  
  // El círculo del timer cambia a rojo cuando quedan 5 segundos o menos.
  const progresoTimer = tiempoMaximo > 0 ? tiempoRestante / tiempoMaximo : 1;
  const timerColor = tiempoRestante <= 5 ? COLORS.timerUrgent : COLORS.timer;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      
      {/* Barra superior: puntaje acumulado a la izquierda, botón de salir a la derecha */}
      <View style={styles.gameHeader}>
        <View style={styles.scoreBadge}>
          <Ionicons name="star" size={20} color={COLORS.timer} />
          <Text style={styles.scoreText}>{Number(puntos).toFixed(1)}</Text>
        </View>
        <TouchableOpacity style={styles.exitBtn} onPress={salirQuiz}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Barrita delgada que muestra el avance entre preguntas */}
      <View style={styles.progressBar}>
        <View 
          style={[
            styles.progressFill, 
            { width: `${((preguntaActual + 1) / totalPreguntas) * 100}%` }
          ]} 
        />
      </View>

      {/* Temporizador circular que se va "vaciando" con el tiempo.
          Cuando llega a 5s o menos, el color cambia a rojo para alertar. */}
      <View style={styles.timerWrapper}>
        <View style={[styles.timerCircle, { borderColor: timerColor }]}>
          <Animated.View 
            style={[
              styles.timerFill,
              {
                backgroundColor: timerColor,
                height: animacionProgreso.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['100%', '0%']
                })
              }
            ]} 
          />
          <Text style={[styles.timerText, { color: timerColor }]}>
            {tiempoRestante}
          </Text>
        </View>
        <Text style={styles.questionCounter}>
          {preguntaActual + 1} / {totalPreguntas}
        </Text>
      </View>

      {/* Tarjeta de pregunta */}
      <Animated.View 
        style={[
          styles.questionCard,
          {
            opacity: animacionPregunta,
            transform: [{
              translateY: animacionPregunta.interpolate({
                inputRange: [0, 1],
                outputRange: [50, 0]
              })
            }]
          }
        ]}
      >
        {pregunta.multimedia?.url && (
          <AppImage 
            uri={pregunta.multimedia.url} 
            style={styles.questionImage}
            resizeMode="cover"
          />
        )}
        <Text style={styles.questionText}>
          {getEnunciado(pregunta)}
        </Text>
      </Animated.View>

      {/* Área de respuestas */}
      <View style={styles.answersArea}>
        {preguntaCompletacion ? (
          // === PREGUNTA DE COMPLETACIÓN ===
          // El estudiante escribe la respuesta en un campo de texto.
          // El botón se deshabilita si está vacío o si ya respondió.
          <View style={styles.completionWrapper}>
            <TextInput
              style={styles.completionInput}
              placeholder="Escribe tu respuesta..."
              placeholderTextColor="#666"
              value={respuestaCompletacion}
              onChangeText={setRespuestaCompletacion}
              autoFocus
              editable={!estaRespondiendo}
            />
            <TouchableOpacity 
              style={[
                styles.confirmBtn,
                (!respuestaCompletacion.trim() || estaRespondiendo) && styles.confirmBtnDisabled
              ]}
              onPress={confirmarCompletacion}
              disabled={!respuestaCompletacion.trim() || estaRespondiendo}
            >
              <Text style={styles.confirmBtnText}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // === OPCIONES DE RESPUESTA ===
          // Para preguntas tipo quiz, V/F y selección múltiple.
          // Se renderizan en una cuadrícula de 2x2 con colores Kahoot.
          <>
            <View style={styles.answersGrid}>
              {pregunta.opciones.map((opcion, index) => {
                const isSelected = preguntaMultiple 
                  ? respuestasSeleccionadas.includes(index)
                  : respuestaSeleccionada === index;
                
                // Dependiendo del estado del feedback, el botón cambia de color
                // para mostrar si la opción era correcta o no.
                let buttonStyle = {};
                let iconOverlay = null;
                
                if (feedbackCorrecto !== null && !preguntaMultiple) {
                  // Después de responder: resaltamos la opción correcta en verde
                  // y la que el estudiante escogió (si era incorrecta) en rojo.
                  const esCorrectaIndex = getIndicesCorrectos(pregunta).includes(index);
                  if (esCorrectaIndex) {
                    buttonStyle = styles.answerCorrect;
                    iconOverlay = <Ionicons name="checkmark-circle" size={28} color="#fff" />;
                  } else if (isSelected && !esCorrectaIndex) {
                    buttonStyle = styles.answerWrong;
                    iconOverlay = <Ionicons name="close-circle" size={28} color="#fff" />;
                  }
                  } else {
                    // Antes de responder: mostramos el color normal Kahoot
                    // y atenuamos un poco si está seleccionado (solo múltiple).
                    buttonStyle = { 
                      backgroundColor: getAnswerColor(index),
                      opacity: isSelected ? 0.8 : 1
                    };
                  }
  
                  const shape = getAnswerShape(index);
                
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.answerBtn,
                      buttonStyle,
                      (estaRespondiendo || (!preguntaMultiple && respuestaSeleccionada !== null)) && styles.answerDisabled
                    ]}
                    onPress={() => manejarRespuesta(index)}
                    disabled={estaRespondiendo || (!preguntaMultiple && respuestaSeleccionada !== null)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.answerShapeContainer}>
                      <ShapeIcon shape={shape} size={28} />
                    </View>
                    <Text style={styles.answerBtnText} numberOfLines={2}>
                      {opcion.texto}
                    </Text>
                    {preguntaMultiple && isSelected && (
                      <View style={styles.selectedIndicator}>
                        <Ionicons name="checkmark" size={20} color="#fff" />
                      </View>
                    )}
                    {iconOverlay && (
                      <View style={styles.feedbackIcon}>
                        {iconOverlay}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Para selección múltiple, mostramos un botón de confirmar
                con el número de opciones seleccionadas. */}
            {preguntaMultiple && respuestasSeleccionadas.length > 0 && (
              <TouchableOpacity 
                style={[
                  styles.confirmMultipleBtn,
                  estaRespondiendo && styles.confirmBtnDisabled
                ]}
                onPress={confirmarRespuestasMultiples}
                disabled={estaRespondiendo}
              >
                <Text style={styles.confirmMultipleText}>
                  Confirmar ({respuestasSeleccionadas.length})
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* Capa semitransparente que cubre toda la pantalla cuando el
          estudiante responde, mostrando si fue correcto o incorrecto. */}
      {feedbackCorrecto !== null && (
        <Animated.View 
          style={[
            styles.feedbackOverlay,
            { 
              backgroundColor: feedbackCorrecto ? COLORS.correct : COLORS.wrong,
              opacity: animacionFeedback 
            }
          ]}
        >
          <Ionicons 
            name={feedbackCorrecto ? "checkmark-circle" : "close-circle"} 
            size={80} 
            color="#fff" 
          />
          <Text style={styles.feedbackOverlayText}>
            {feedbackCorrecto ? '¡Correcto!' : '¡Incorrecto!'}
          </Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// Todos los estilos están definidos acá abajo para mantener el JSX limpio.
// Usamos StyleSheet.create en vez de objetos inline para mejor performance.
const styles = StyleSheet.create({
  // === CONTENEDORES BASE ===
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  
  // === HEADER ===
  // Dos variantes: una para la pantalla de resultados (solo botón cerrar)
  // y otra para el juego (puntaje + botón cerrar).
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  exitBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  scoreText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },

  // === BARRA DE PROGRESO ===
  // Línea delgada horizontal que muestra cuántas preguntas llevas.
  progressBar: {
    height: 4,
    backgroundColor: COLORS.progressBg,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.timer,
    borderRadius: 2,
  },

  // === TEMPORIZADOR ===
  // Círculo con relleno animado que se va vaciando.
  timerWrapper: {
    alignItems: 'center',
    marginBottom: 16,
  },
  timerCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    backgroundColor: COLORS.backgroundDark,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  timerFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    opacity: 0.3,
  },
  timerText: {
    fontSize: 32,
    fontWeight: 'bold',
    zIndex: 1,
  },
  questionCounter: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    marginTop: 8,
    fontWeight: '600',
  },

  // === PREGUNTA ===
  // Tarjeta blanca donde se muestra el enunciado y la imagen (si tiene).
  questionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    maxHeight: height * 0.35,
  },
  questionImage: {
    width: '100%',
    height: 150,
    borderRadius: 12,
    marginBottom: 16,
  },
  questionText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textDark,
    lineHeight: 28,
    textAlign: 'center',
  },

  // === ÁREA DE RESPUESTAS ===
  // Acá van los botones de colores o el input de completación.
  answersArea: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  answersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  answerBtn: {
    width: (width - 64) / 2,
    height: 100,
    borderRadius: 12,
    padding: 16,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  answerBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    marginTop: 8,
  },
  answerShapeContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerCorrect: {
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: COLORS.correct,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  answerWrong: {
    borderWidth: 4,
    borderColor: '#fff',
    opacity: 0.7,
  },
  answerDisabled: {
    opacity: 0.5,
  },
  selectedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackIcon: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },

  // === COMPLETACIÓN ===
  // Input de texto y botón confirmar para preguntas de completación.
  completionWrapper: {
    gap: 16,
  },
  completionInput: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 20,
    fontSize: 18,
    color: COLORS.textDark,
    minHeight: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmBtn: {
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  confirmBtnDisabled: {
    backgroundColor: '#666',
    opacity: 0.5,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  confirmMultipleBtn: {
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmMultipleText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },

  // === FEEDBACK OVERLAY ===
  // Capa que cubre la pantalla completa para mostrar "¡Correcto!" o "¡Incorrecto!".
  feedbackOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  feedbackOverlayText: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
    marginTop: 16,
  },

  // === PANTALLA DE CARGA ===
  // Mientras se obtienen los datos del backend o SQLite.
  loadingText: {
    fontSize: 18,
    color: '#fff',
    marginTop: 16,
  },

  // === PANTALLA DE ERROR ===
  // Cuando algo sale mal: sin conexión, quiz no disponible, etc.
  errorTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
  },
  errorText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.blue,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  primaryBtn: {
    backgroundColor: COLORS.green,
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#fff',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryBtnText: {
    color: '#fff',
  },

  // === RESULTADOS ===
  // Pantalla que se muestra al terminar el quiz: stats + podio.
  resultsContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 30,
    justifyContent: 'space-between',
  },
  resultsTopContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  trophyContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  resultsTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.blue,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontWeight: '600',
  },
  resultNotice: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    padding: 12,
    marginTop: 16,
    borderRadius: 12,
  },
  resultNoticeText: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  resultsButtons: {
    gap: 12,
    width: '100%',
  },
  
  // === PODIO ===
  // Ranking de todos los estudiantes que presentaron esta sesión.
  podiumContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 20,
    marginTop: 12,
    marginBottom: 12,
  },
  podiumTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  podiumList: {
    gap: 12,
  },
  podiumItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  podiumFirst: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  podiumSecond: {
    backgroundColor: 'rgba(192, 192, 192, 0.2)',
    borderWidth: 2,
    borderColor: '#C0C0C0',
  },
  podiumThird: {
    backgroundColor: 'rgba(205, 127, 50, 0.2)',
    borderWidth: 2,
    borderColor: '#CD7F32',
  },
  podiumRank: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumRankText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  podiumInfo: {
    flex: 1,
  },
  podiumName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  podiumStats: {
    flexDirection: 'row',
    gap: 16,
  },
  podiumScore: {
    color: '#fff',
    fontSize: 14,
  },
  podiumTime: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
  },
  podiumEmpty: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
  },
  podiumScroll: {
    maxHeight: 280,
  },
});
