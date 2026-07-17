// CREADOR DE QUIZ (3241+ líneas) — la pantalla más compleja del sistema.
// Maneja: 4 tipos de pregunta, 6 plantillas precargadas, 2 modos de juego
// (Igual/Dificultad), ponderación configurable, selector de materia,
// carga de imágenes, edición de quizzes existentes, y validación en tiempo real.
// Usa un "doble estado": la pregunta actual vive en estados individuales
// Y en el array preguntas[]. Hay que sincronizar con guardarPreguntaActual().
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { getItem } from '@/utils/storage';
import Colors from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { Usuario } from '@/types/user';
import { TipoPregunta, Pregunta, PreguntaData } from '@/types/quizMongo';
import { pickImage } from '@/utils';
import { AppImage } from '@/components/AppImage';
import Slider from '@react-native-community/slider';
import { guardarQuiz, obtenerQuizPorId, actualizarQuiz } from '@/utils/api';
import { API_URL } from '@/utils/api';

// Los 4 modos de pregunta disponibles.
// Cada uno cambia cómo se renderizan las respuestas y qué validaciones aplican.
const TIPOS_PREGUNTA = [
  { id: 'quiz' as TipoPregunta, nombre: 'Quiz', icono: 'help-circle' },
  { id: 'verdadero_falso' as TipoPregunta, nombre: 'Verdadero o falso', icono: 'checkbox' },
  { id: 'seleccion_multiple' as TipoPregunta, nombre: 'Selección múltiple', icono: 'list' },
  { id: 'completacion' as TipoPregunta, nombre: 'Completación', icono: 'create' },
];

// Colores exactos de Kahoot
const COLORES_RESPUESTA = ['#E21F3D', '#1368CE', '#D89E00', '#26890C']; // Rojo, Azul, Amarillo, Verde
const COLOR_FONDO = '#f5f5f5';
const COLOR_TIEMPO = '#8648CE'; // Púrpura Kahoot

// El componente principal que maneja TODO el flujo de creación del quiz.
// Desde acá se controlan los tipos de pregunta, las plantillas, los modos de juego
// y el guardado contra el backend.
export default function CrearScreen() {
  const params = useLocalSearchParams();
  const quizId = params.quizId as string | undefined;
  const plantillaSeleccionada = params.plantilla as string | undefined;
  const modoEdicion = !!quizId;
  const [plantillaAplicada, setPlantillaAplicada] = useState(false);

  // NOTA: Acá manejamos un "doble estado" — la pregunta actual vive en estados
  // individuales (textoPregunta, respuestas, etc.) y también en el array preguntas[].
  // Hay que llamar guardarPreguntaActual() antes de navegar entre preguntas
  // para no perder los cambios que el profesor haya hecho en la UI.
  const [preguntas, setPreguntas] = useState<PreguntaData[]>([
    {
      id: 1,
      tipo: 'quiz',
      pregunta: '',
      respuestas: ['', '', '', ''],
      respuestaCorrecta: 0,
      respuestasCorrectas: [0],
      tiempo: 20,
      imagen: null,
    }
  ]);
  const [preguntaActual, setPreguntaActual] = useState(1);
  const [tipoPregunta, setTipoPregunta] = useState<TipoPregunta>('quiz');
  const [mostrarSelectorTipo, setMostrarSelectorTipo] = useState(false);
  const [mostrarModalGuardado, setMostrarModalGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [textoPregunta, setTextoPregunta] = useState('');
  const [respuestas, setRespuestas] = useState(['', '', '', '']);
  const [tiempo, setTiempo] = useState(20);
  const [imagenPregunta, setImagenPregunta] = useState<string | null>(null);
  const [mostrarSelectorTiempo, setMostrarSelectorTiempo] = useState(false);
  const [mostrarSelectorPuntos, setMostrarSelectorPuntos] = useState(false);
  const [mostrarSelectorPonderacion, setMostrarSelectorPonderacion] = useState(false);
  const [mostrarMenuOpciones, setMostrarMenuOpciones] = useState(false);
  const [respuestaCorrecta, setRespuestaCorrecta] = useState(0);
  const [respuestasCorrectas, setRespuestasCorrectas] = useState<number[]>([0]); // Para selección múltiple
  const [mostrarModalRespuesta, setMostrarModalRespuesta] = useState(false);
  const [respuestaEditando, setRespuestaEditando] = useState<{ index: number; texto: string } | null>(null);
  const [puntosPregunta, setPuntosPregunta] = useState(10); // Puntuación de la pregunta actual
  const [modoJuego, setModoJuego] = useState<'Igual' | 'Dificultad'>('Igual'); // Modo de juego del quiz
  const [ponderacion, setPonderacion] = useState(100); // Ponderación total del quiz
  const [customPonderacion, setCustomPonderacion] = useState('');
  // Estados para configuración final del quiz
  const [mostrarModalConfiguracion, setMostrarModalConfiguracion] = useState(false);
  const [tituloQuiz, setTituloQuiz] = useState('');
  const [materiaQuiz, setMateriaQuiz] = useState('');
  const [materiaQuizId, setMateriaQuizId] = useState<number | null>(null);
  const [portadaQuiz, setPortadaQuiz] = useState<string | null>(null);
  const [descripcionPlantilla, setDescripcionPlantilla] = useState<string | null>(null);
  const [mostrarSelectorMateria, setMostrarSelectorMateria] = useState(false);
  const [materiasProfesor, setMateriasProfesor] = useState<{ mat_id: number; mat_nombre: string }[]>([]);

  // Valores disponibles para el temporizador de cada pregunta (en segundos)
  const OPCIONES_TIEMPO = [5, 10, 20, 30, 60, 90, 120, 180, 240];

  // Estado para rastrear preguntas con errores
  // Set de IDs de preguntas que no pasan la validación.
  // Se usa para marcar en rojo las miniatura en la barra de navegación.
  const [preguntasConError, setPreguntasConError] = useState<Set<number>>(new Set());
  const [cargandoQuiz, setCargandoQuiz] = useState(false);
  const isLoadingQuiz = useRef(false);

  // -------------------------------------------------------
  // PLANTILLAS: escenarios precargados con preguntas de ejemplo
  // -------------------------------------------------------
  const aplicarPlantilla = (nombrePlantilla: string) => {
    // Limpiar estado antes de aplicar la plantilla
    limpiarEstado();

    let plantillaBase: { titulo: string; descripcion: string; preguntas: PreguntaData[] } = {
      titulo: nombrePlantilla,
      descripcion: '',
      preguntas: [
        {
          id: 1,
          tipo: 'quiz',
          pregunta: '',
          respuestas: ['', '', '', ''],
          respuestaCorrecta: 0,
          respuestasCorrectas: [0],
          tiempo: 20,
          imagen: null,
        }
      ]
    };

    // Cada plantilla trae preguntas de cultura general ya configuradas.
    // La idea es que el profesor no empiece desde cero.
    switch (nombrePlantilla) {
      case 'Evaluación Rápida':
        plantillaBase = {
          titulo: 'Evaluación Rápida',
          descripcion: '10 preguntas de opción múltiple',
          preguntas: [
            {
              id: 1,
              tipo: 'quiz',
              pregunta: '¿Cuál es la capital de Francia?',
              respuestas: ['Londres', 'Berlín', 'París', 'Madrid'],
              respuestaCorrecta: 2,
              respuestasCorrectas: [2],
              tiempo: 20,
              imagen: null,
            },
            {
              id: 2,
              tipo: 'quiz',
              pregunta: '¿Cuál es el planeta más grande del sistema solar?',
              respuestas: ['Tierra', 'Júpiter', 'Marte', 'Saturno'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 20,
              imagen: null,
            },
            {
              id: 3,
              tipo: 'quiz',
              pregunta: '¿En qué año llegó el hombre a la luna?',
              respuestas: ['1965', '1969', '1972', '1975'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 20,
              imagen: null,
            },
            {
              id: 4,
              tipo: 'quiz',
              pregunta: '¿Cuál es el elemento químico más abundante en la Tierra?',
              respuestas: ['Carbono', 'Oxígeno', 'Hidrógeno', 'Nitrógeno'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 20,
              imagen: null,
            },
            {
              id: 5,
              tipo: 'quiz',
              pregunta: '¿Quién escribió "Don Quijote de la Mancha"?',
              respuestas: ['Cervantes', 'Shakespeare', 'Dante', 'Goethe'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 20,
              imagen: null,
            },
            {
              id: 6,
              tipo: 'quiz',
              pregunta: '¿Cuál es el océano más grande del mundo?',
              respuestas: ['Atlántico', 'Índico', 'Pacífico', 'Ártico'],
              respuestaCorrecta: 2,
              respuestasCorrectas: [2],
              tiempo: 20,
              imagen: null,
            },
            {
              id: 7,
              tipo: 'quiz',
              pregunta: '¿Cuántos continentes hay en el mundo?',
              respuestas: ['5', '6', '7', '8'],
              respuestaCorrecta: 2,
              respuestasCorrectas: [2],
              tiempo: 20,
              imagen: null,
            },
            {
              id: 8,
              tipo: 'quiz',
              pregunta: '¿Cuál es el río más largo del mundo?',
              respuestas: ['Amazonas', 'Nilo', 'Yangtsé', 'Misisipi'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 20,
              imagen: null,
            },
            {
              id: 9,
              tipo: 'quiz',
              pregunta: '¿En qué país se encuentra la Torre de Pisa?',
              respuestas: ['España', 'Francia', 'Italia', 'Portugal'],
              respuestaCorrecta: 2,
              respuestasCorrectas: [2],
              tiempo: 20,
              imagen: null,
            },
            {
              id: 10,
              tipo: 'quiz',
              pregunta: '¿Cuál es la montaña más alta del mundo?',
              respuestas: ['K2', 'Kilimanjaro', 'Everest', 'Mont Blanc'],
              respuestaCorrecta: 2,
              respuestasCorrectas: [2],
              tiempo: 20,
              imagen: null,
            },
          ]
        };
        break;
      case 'Examen Final':
        plantillaBase = {
          titulo: 'Examen Final',
          descripcion: '20 preguntas mixtas variadas',
          preguntas: [
            {
              id: 1,
              tipo: 'quiz',
              pregunta: '¿Cuál es la fórmula química del agua?',
              respuestas: ['H2O', 'CO2', 'NaCl', 'O2'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 2,
              tipo: 'seleccion_multiple',
              pregunta: '¿Cuáles de los siguientes son metales?',
              respuestas: ['Hierro', 'Oro', 'Oxígeno', 'Plata'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0, 1, 3],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 3,
              tipo: 'quiz',
              pregunta: '¿Quién descubrió América?',
              respuestas: ['Colón', 'Magallanes', 'Cortés', 'Pizarro'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 4,
              tipo: 'completacion',
              pregunta: 'El símbolo químico del oro es ___',
              respuestas: ['Au', 'Ag', 'Fe', 'Cu'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 5,
              tipo: 'quiz',
              pregunta: '¿Cuál es la velocidad de la luz?',
              respuestas: ['300,000 km/s', '150,000 km/s', '500,000 km/s', '1,000,000 km/s'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 6,
              tipo: 'seleccion_multiple',
              pregunta: '¿Cuáles son los colores primarios?',
              respuestas: ['Rojo', 'Verde', 'Azul', 'Amarillo'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0, 2, 3],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 7,
              tipo: 'quiz',
              pregunta: '¿En qué año comenzó la Segunda Guerra Mundial?',
              respuestas: ['1935', '1939', '1941', '1945'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 8,
              tipo: 'completacion',
              pregunta: 'La capital de Japón es ___',
              respuestas: ['Tokio', 'Seúl', 'Pekín', 'Bangkok'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 9,
              tipo: 'quiz',
              pregunta: '¿Cuál es el órgano más grande del cuerpo humano?',
              respuestas: ['Corazón', 'Hígado', 'Piel', 'Cerebro'],
              respuestaCorrecta: 2,
              respuestasCorrectas: [2],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 10,
              tipo: 'seleccion_multiple',
              pregunta: '¿Cuáles son los planetas rocosos del sistema solar?',
              respuestas: ['Marte', 'Júpiter', 'Tierra', 'Saturno'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0, 2],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 11,
              tipo: 'quiz',
              pregunta: '¿Quién pintó la Mona Lisa?',
              respuestas: ['Van Gogh', 'Da Vinci', 'Picasso', 'Monet'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 12,
              tipo: 'completacion',
              pregunta: 'El elemento químico con número atómico 1 es el ___',
              respuestas: ['Hidrógeno', 'Helio', 'Litio', 'Berilio'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 13,
              tipo: 'quiz',
              pregunta: '¿Cuál es el país más poblado del mundo?',
              respuestas: ['India', 'China', 'EE.UU.', 'Indonesia'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 14,
              tipo: 'seleccion_multiple',
              pregunta: '¿Cuáles son los sentidos humanos?',
              respuestas: ['Oído', 'Olfato', 'Telepatía', 'Vista'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0, 1, 3],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 15,
              tipo: 'quiz',
              pregunta: '¿En qué año cayó el Muro de Berlín?',
              respuestas: ['1987', '1989', '1991', '1993'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 16,
              tipo: 'completacion',
              pregunta: 'La moneda de la Unión Europea es el ___',
              respuestas: ['Euro', 'Dólar', 'Libra', 'Yen'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 17,
              tipo: 'quiz',
              pregunta: '¿Cuál es el desierto más grande del mundo?',
              respuestas: ['Sahara', 'Gobi', 'Atacama', 'Arábigo'],
              respuestaCorrecta: 3,
              respuestasCorrectas: [3],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 18,
              tipo: 'seleccion_multiple',
              pregunta: '¿Cuáles son los océanos del mundo?',
              respuestas: ['Pacífico', 'Atlántico', 'Mediterráneo', 'Índico'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0, 1, 3],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 19,
              tipo: 'quiz',
              pregunta: '¿Quién fue el primer presidente de Estados Unidos?',
              respuestas: ['Lincoln', 'Washington', 'Jefferson', 'Adams'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 20,
              tipo: 'completacion',
              pregunta: 'El número pi es aproximadamente ___',
              respuestas: ['3.14', '3.41', '2.14', '4.14'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 30,
              imagen: null,
            },
          ]
        };
        break;
      case 'Solo Selección':
        plantillaBase = {
          titulo: 'Solo Selección',
          descripcion: '15 preguntas de opción múltiple',
          preguntas: [
            {
              id: 1,
              tipo: 'quiz',
              pregunta: '¿Cuál es la capital de España?',
              respuestas: ['Barcelona', 'Madrid', 'Valencia', 'Sevilla'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 2,
              tipo: 'quiz',
              pregunta: '¿Cuál es el animal terrestre más rápido?',
              respuestas: ['León', 'Guepardo', 'Caballo', 'Antílope'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 3,
              tipo: 'quiz',
              pregunta: '¿Cuántos lados tiene un hexágono?',
              respuestas: ['4', '5', '6', '8'],
              respuestaCorrecta: 2,
              respuestasCorrectas: [2],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 4,
              tipo: 'quiz',
              pregunta: '¿Cuál es el metal más caro?',
              respuestas: ['Oro', 'Plata', 'Platino', 'Rodio'],
              respuestaCorrecta: 3,
              respuestasCorrectas: [3],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 5,
              tipo: 'quiz',
              pregunta: '¿En qué país se encuentra Machu Picchu?',
              respuestas: ['México', 'Perú', 'Chile', 'Bolivia'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 6,
              tipo: 'quiz',
              pregunta: '¿Cuál es el país más pequeño del mundo?',
              respuestas: ['Mónaco', 'Vaticano', 'San Marino', 'Liechtenstein'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 7,
              tipo: 'quiz',
              pregunta: '¿Cuántos huesos tiene el cuerpo humano adulto?',
              respuestas: ['186', '206', '226', '246'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 8,
              tipo: 'quiz',
              pregunta: '¿Cuál es el río más caudaloso del mundo?',
              respuestas: ['Amazonas', 'Nilo', 'Yangtsé', 'Misisipi'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 9,
              tipo: 'quiz',
              pregunta: '¿En qué año se inventó la World Wide Web?',
              respuestas: ['1985', '1989', '1993', '1997'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 10,
              tipo: 'quiz',
              pregunta: '¿Cuál es el país con más islas del mundo?',
              respuestas: ['Indonesia', 'Filipinas', 'Japón', 'Suecia'],
              respuestaCorrecta: 3,
              respuestasCorrectas: [3],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 11,
              tipo: 'quiz',
              pregunta: '¿Cuál es el volcán más alto del mundo?',
              respuestas: ['Etna', 'Vesubio', 'Mauna Loa', 'Kilimanjaro'],
              respuestaCorrecta: 2,
              respuestasCorrectas: [2],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 12,
              tipo: 'quiz',
              pregunta: '¿Cuántos países hay en la Unión Europea?',
              respuestas: ['25', '27', '29', '31'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 13,
              tipo: 'quiz',
              pregunta: '¿Cuál es el lago más profundo del mundo?',
              respuestas: ['Lago Superior', 'Lago Baikal', 'Lago Victoria', 'Mar Caspio'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 14,
              tipo: 'quiz',
              pregunta: '¿En qué país se encuentra la Gran Barrera de Coral?',
              respuestas: ['Australia', 'Nueva Zelanda', 'Fiyi', 'Indonesia'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 15,
              tipo: 'quiz',
              pregunta: '¿Cuál es el animal más grande que ha existido?',
              respuestas: ['Dinosaurio', 'Ballena Azul', 'Elefante', 'Tiburón Ballena'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 25,
              imagen: null,
            },
          ]
        };
        break;
      case 'Solo Completación':
        plantillaBase = {
          titulo: 'Solo Completación',
          descripcion: '10 preguntas de completar palabras',
          preguntas: [
            {
              id: 1,
              tipo: 'completacion',
              pregunta: 'La capital de Argentina es ___',
              respuestas: ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 2,
              tipo: 'completacion',
              pregunta: 'El planeta más cercano al sol es ___',
              respuestas: ['Venus', 'Marte', 'Mercurio', 'Júpiter'],
              respuestaCorrecta: 2,
              respuestasCorrectas: [2],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 3,
              tipo: 'completacion',
              pregunta: 'El autor de Romeo y Julieta es ___',
              respuestas: ['Shakespeare', 'Cervantes', 'Dante', 'Goethe'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 4,
              tipo: 'completacion',
              pregunta: 'La moneda de Japón es el ___',
              respuestas: ['Yen', 'Won', 'Yuan', 'Ringgit'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 5,
              tipo: 'completacion',
              pregunta: 'El elemento químico con símbolo Fe es el ___',
              respuestas: ['Hierro', 'Flúor', 'Fósforo', 'Francio'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 6,
              tipo: 'completacion',
              pregunta: 'La capital de Canadá es ___',
              respuestas: ['Toronto', 'Vancouver', 'Ottawa', 'Montreal'],
              respuestaCorrecta: 2,
              respuestasCorrectas: [2],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 7,
              tipo: 'completacion',
              pregunta: 'El río que atraviza Egipto es el ___',
              respuestas: ['Amazonas', 'Nilo', 'Yangtsé', 'Danubio'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 8,
              tipo: 'completacion',
              pregunta: 'El inventor de la bombilla es ___',
              respuestas: ['Edison', 'Tesla', 'Bell', 'Newton'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 9,
              tipo: 'completacion',
              pregunta: 'La capital de Australia es ___',
              respuestas: ['Sídney', 'Melbourne', 'Canberra', 'Perth'],
              respuestaCorrecta: 2,
              respuestasCorrectas: [2],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 10,
              tipo: 'completacion',
              pregunta: 'El número atómico del carbono es ___',
              respuestas: ['4', '6', '8', '12'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 30,
              imagen: null,
            },
          ]
        };
        break;
      case 'Quiz Combinado':
        plantillaBase = {
          titulo: 'Quiz Combinado',
          descripcion: '10 preguntas mixtas (selección + completación)',
          preguntas: [
            {
              id: 1,
              tipo: 'quiz',
              pregunta: '¿Cuál es la capital de Brasil?',
              respuestas: ['Río de Janeiro', 'São Paulo', 'Brasilia', 'Salvador'],
              respuestaCorrecta: 2,
              respuestasCorrectas: [2],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 2,
              tipo: 'completacion',
              pregunta: 'El símbolo químico del sodio es ___',
              respuestas: ['Na', 'Ni', 'Nb', 'Nd'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 3,
              tipo: 'seleccion_multiple',
              pregunta: '¿Cuáles son los planetas gigantes del sistema solar?',
              respuestas: ['Júpiter', 'Marte', 'Saturno', 'Mercurio'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0, 2],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 4,
              tipo: 'quiz',
              pregunta: '¿En qué año se fundó la ONU?',
              respuestas: ['1940', '1945', '1950', '1955'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 5,
              tipo: 'completacion',
              pregunta: 'La capital de Alemania es ___',
              respuestas: ['Múnich', 'Hamburgo', 'Berlín', 'Frankfurt'],
              respuestaCorrecta: 2,
              respuestasCorrectas: [2],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 6,
              tipo: 'seleccion_multiple',
              pregunta: '¿Cuáles son los estados de la materia?',
              respuestas: ['Sólido', 'Líquido', 'Gaseoso', 'Plasma'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0, 1, 2, 3],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 7,
              tipo: 'quiz',
              pregunta: '¿Quién fue el primer hombre en el espacio?',
              respuestas: ['Armstrong', 'Gagarin', 'Glenn', 'Shepard'],
              respuestaCorrecta: 1,
              respuestasCorrectas: [1],
              tiempo: 25,
              imagen: null,
            },
            {
              id: 8,
              tipo: 'completacion',
              pregunta: 'El elemento químico con símbolo O es el ___',
              respuestas: ['Oro', 'Osmio', 'Oxígeno', 'Oganesón'],
              respuestaCorrecta: 2,
              respuestasCorrectas: [2],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 9,
              tipo: 'seleccion_multiple',
              pregunta: '¿Cuáles son los colores de la bandera de Francia?',
              respuestas: ['Azul', 'Rojo', 'Verde', 'Blanco'],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0, 1, 3],
              tiempo: 30,
              imagen: null,
            },
            {
              id: 10,
              tipo: 'quiz',
              pregunta: '¿Cuál es el país más grande de África?',
              respuestas: ['Egipto', 'Sudáfrica', 'Argelia', 'Nigeria'],
              respuestaCorrecta: 2,
              respuestasCorrectas: [2],
              tiempo: 25,
              imagen: null,
            },
          ]
        };
        break;
      case 'Cuestionario en Blanco':
      default:
        plantillaBase = {
          titulo: 'Cuestionario en Blanco',
          descripcion: 'Empezar desde cero',
          preguntas: [
            {
              id: 1,
              tipo: 'quiz',
              pregunta: '',
              respuestas: ['', '', '', ''],
              respuestaCorrecta: 0,
              respuestasCorrectas: [0],
              tiempo: 20,
              imagen: null,
            }
          ]
        };
        break;
    }

    setTituloQuiz(plantillaBase.titulo);
    setDescripcionPlantilla(plantillaBase.descripcion);
    setPreguntas(plantillaBase.preguntas);
    // Cargar primera pregunta en estados individuales
    if (plantillaBase.preguntas.length > 0) {
      const primera = plantillaBase.preguntas[0];
      setTipoPregunta(primera.tipo);
      setTextoPregunta(primera.pregunta);
      setRespuestas([...primera.respuestas]);
      setRespuestaCorrecta(primera.respuestaCorrecta);
      setRespuestasCorrectas(primera.respuestasCorrectas || [primera.respuestaCorrecta]);
      setTiempo(primera.tiempo);
      setImagenPregunta(primera.imagen);
    }
    setPlantillaAplicada(true);
  };

  // Aquí se decide si aplicar una plantilla al cargar la pantalla.
  // También resetea el estado si se entra sin parámetros (creación nueva).
  useEffect(() => {
    if (plantillaSeleccionada && !modoEdicion && !plantillaAplicada) {
      // Limpiar estado antes de aplicar la nueva plantilla
      limpiarEstado();
      aplicarPlantilla(plantillaSeleccionada);
    } else if (!modoEdicion && !plantillaSeleccionada && !plantillaAplicada) {
      // Limpiar estado cuando se navega a crear sin parámetros
      limpiarEstado();
    }
  }, [plantillaSeleccionada, modoEdicion, plantillaAplicada]);

  // useFocusEffect corre cada vez que la pantalla obtiene foco.
  // Sirve para verificar que el usuario sigue autenticado y,
  // si está en modo creación, limpiar el estado si no hay contenido.
  useFocusEffect(
    useCallback(() => {
      const verificarAutenticacion = async () => {
        const usuario = await getItem('user');
        if (!usuario) {
          router.replace('/login');
          return;
        }

        // Siempre limpiar estado cuando la pantalla gana foco en modo creación
        if (!modoEdicion) {
          const tieneContenido = preguntas.some(p => p.pregunta.trim() !== '');
          if (!tieneContenido) {
            limpiarEstado();
            setPlantillaAplicada(false);
          }
        }
      };

      verificarAutenticacion();
    }, [modoEdicion])
  );

  // Función unificada que limpia el estado del quiz.
  // Recibe opciones para decidir qué limpiar:
  // - soloPreguntas: solo resetea las preguntas, deja la config intacta
  // - conservarPlantilla: limpia preguntas y config, pero no toca lo relacionado a plantilla
  const limpiarEstado = (opciones?: { soloPreguntas?: boolean; conservarPlantilla?: boolean }) => {
    setPreguntas([
      {
        id: 1,
        tipo: 'quiz',
        pregunta: '',
        respuestas: ['', '', '', ''],
        respuestaCorrecta: 0,
        respuestasCorrectas: [0],
        tiempo: 20,
        imagen: null,
      }
    ]);
    setPreguntaActual(1);
    setTipoPregunta('quiz');
    setTextoPregunta('');
    setRespuestas(['', '', '', '']);
    setTiempo(20);
    setImagenPregunta(null);
    setRespuestaCorrecta(0);
    setRespuestasCorrectas([0]);

    // Si solo necesita limpiar preguntas, salir aquí (reemplaza a limpiarEstadosPreguntas)
    if (opciones?.soloPreguntas) return;

    // Limpia configuración del quiz
    setTituloQuiz('');
    setMateriaQuiz('');
    setMateriaQuizId(null);
    setPortadaQuiz(null);
    setPuntosPregunta(10);
    setModoJuego('Igual');
    setPonderacion(100);

    // Si necesita conservar el estado de plantilla, salir aquí (reemplaza a limpiarEstados)
    if (opciones?.conservarPlantilla) return;

    // Limpia estado relacionado con plantillas
    setDescripcionPlantilla(null);
    setPreguntasConError(new Set());
    setPlantillaAplicada(false);
  };

  // Valida cada pregunta según su tipo.
  // Se usa tanto para marcar errores en la UI como para bloquear el guardado.
  const validarPreguntaIndividual = (pregunta: PreguntaData, index: number): boolean => {
    // Validar que la pregunta no esté vacía (aplica a todos los tipos)
    if (!pregunta.pregunta || pregunta.pregunta.trim() === '') {
      return false;
    }
    
    // Validar según el tipo
    switch (pregunta.tipo) {
      case 'verdadero_falso':
        // Verdadero/Falso: solo validar que la pregunta no esté vacía (ya validado arriba)
        return true;
        
      case 'quiz':
        // Selección simple: mínimo 2 respuestas llenas
        const respuestasLlenas = pregunta.respuestas.filter(r => r && r.trim() !== '').length;
        return respuestasLlenas >= 2;
        
      case 'seleccion_multiple':
        // Selección múltiple: mínimo 3 respuestas llenas
        const respuestasLlenasMulti = pregunta.respuestas.filter(r => r && r.trim() !== '').length;
        if (respuestasLlenasMulti < 3) return false;
        // Validar que haya al menos una respuesta correcta seleccionada
        if (!pregunta.respuestasCorrectas || pregunta.respuestasCorrectas.length === 0) return false;
        return true;
        
      case 'completacion':
        // Completación: la respuesta no debe estar vacía
        return !!(pregunta.respuestas[0] && pregunta.respuestas[0].trim() !== '');
        
      default:
        return true;
    }
  };

  // Actualiza el set de errores cada vez que cambia algo relevante.
  // Esto hace que las miniaturas se pongan rojas en vivo, mientras el profesor escribe.
  useEffect(() => {
    if (cargandoQuiz) return;
    
    const errores = new Set<number>();
    preguntas.forEach((pregunta, index) => {
      // Validar que la pregunta exista antes de intentar acceder a sus propiedades
      if (!pregunta) return;
      
      // Si es la pregunta actual, usar los estados temporales
      if (index + 1 === preguntaActual) {
        const preguntaActualData: PreguntaData = {
          id: preguntaActual,
          tipo: tipoPregunta,
          pregunta: textoPregunta,
          respuestas: [...respuestas],
          respuestaCorrecta,
          respuestasCorrectas: tipoPregunta === 'seleccion_multiple' ? respuestasCorrectas : undefined,
          tiempo,
          imagen: imagenPregunta,
        };
        if (!validarPreguntaIndividual(preguntaActualData, index)) {
          errores.add(index + 1);
        }
      } else {
        // Para otras preguntas, usar el array
        if (!validarPreguntaIndividual(pregunta, index)) {
          errores.add(index + 1);
        }
      }
    });
    setPreguntasConError(errores);
  }, [preguntas, textoPregunta, respuestas, respuestasCorrectas, tipoPregunta, preguntaActual, cargandoQuiz]);

  // Apenas se abre el modal de configuración final, cargamos las materias del profesor.
  // Así el profesor puede seleccionar a qué materia pertenece el quiz.
  useEffect(() => {
    if (mostrarModalConfiguracion) {
      cargarMateriasProfesor();
    }
  }, [mostrarModalConfiguracion]);

  // Función auxiliar: distribuir puntos exactos (decimales)
  const distribuirPuntos = (total: number, cantidad: number): number[] => {
    const porPregunta = total / cantidad;
    return Array.from({ length: cantidad }, () => porPregunta);
  };

  // Cada vez que cambia el modo de juego, la ponderación o la cantidad de preguntas,
  // se recalculan los puntos. En modo Igual se distribuye parejo; en Dificultad
  // se reescala proporcionalmente para que sumen la ponderación.
  useEffect(() => {
    if (preguntas.length === 0 || isLoadingQuiz.current) return;

    // En Dificultad: reescalar proporcionalmente al cambiar ponderación
    if (modoJuego === 'Dificultad') {
      setPreguntas(prev => {
        const currentTotal = prev.reduce((sum, p) => sum + (p.puntos ?? 0), 0);

        if (currentTotal > 0 && currentTotal !== ponderacion) {
          const factor = ponderacion / currentTotal;
          const nuevas = prev.map(p => ({
            ...p,
            puntos: Math.round((p.puntos ?? 0) * factor * 10) / 10
          }));
          const nuevoPuntos = nuevas[preguntaActual - 1]?.puntos
            ?? distribuirPuntos(ponderacion, prev.length)[preguntaActual - 1];
          setPuntosPregunta(nuevoPuntos);
          return nuevas;
        }

        const puntosActual = prev[preguntaActual - 1]?.puntos;
        const fallback = distribuirPuntos(ponderacion, prev.length)[preguntaActual - 1];
        setPuntosPregunta(puntosActual ?? fallback);
        return prev;
      });
      return;
    }

    // Igual: distribución uniforme obligatoria
    const distribucion = distribuirPuntos(ponderacion, preguntas.length);
    setPreguntas(prev => prev.map((p, i) => ({
      ...p,
      puntos: distribucion[i]
    })));
    setPuntosPregunta(distribucion[preguntaActual - 1] ?? distribucion[0]);
  }, [modoJuego, ponderacion, preguntas.length]);

  // Cargar quiz existente si estamos en modo edición
  useEffect(() => {
    if (modoEdicion && quizId) {
      limpiarEstado({ soloPreguntas: true });
      cargarQuizExistente();
    }
  }, [modoEdicion, quizId]);

  // Trae el quiz desde MongoDB y lo deserializa de vuelta al formato del frontend.
  // El mapping es medio tedioso porque el backend guarda las opciones como
  // array de objetos {texto, es_correcta} y acá manejamos arrays planos.
  const cargarQuizExistente = async () => {
    isLoadingQuiz.current = true;
    try {
      setCargandoQuiz(true);
      const quizData = await obtenerQuizPorId(quizId!);
      
      // Cargar metadatos (están dentro de quizData.metadatos)
      const metadatos = quizData.metadatos || {};
      setTituloQuiz(metadatos.titulo || '');
      setMateriaQuiz(metadatos.tema || '');
      setMateriaQuizId(metadatos.materia_id || null);
      setPortadaQuiz(metadatos.imagen_portada || null);
      
      // Cargar modo de juego y ponderación desde MongoDB
      if (metadatos.modo_juego) {
        setModoJuego(metadatos.modo_juego);
      }
      if (metadatos.ponderacion) {
        setPonderacion(metadatos.ponderacion);
      }
      
      // Cargar preguntas
      if (quizData.preguntas && quizData.preguntas.length > 0) {
        const preguntasCargadas: PreguntaData[] = quizData.preguntas.map((p: any, index: number) => {
          // Convertir opciones de vuelta al formato del frontend
          const respuestas = p.opciones.map((opt: any) => opt.texto);
          
          // Encontrar respuesta correcta
          let respuestaCorrecta = 0;
          let respuestasCorrectas: number[] = [];
          
          if (p.tipo === 'seleccion_multiple') {
            respuestasCorrectas = p.opciones
              .map((opt: any, idx: number) => opt.es_correcta ? idx : -1)
              .filter((idx: number) => idx !== -1);
          } else if (p.tipo !== 'verdadero_falso') {
            respuestaCorrecta = p.opciones.findIndex((opt: any) => opt.es_correcta);
            if (respuestaCorrecta === -1) respuestaCorrecta = 0;
          }
          
          return {
            id: index + 1,
            tipo: p.tipo,
            pregunta: p.enunciado,
            respuestas,
            respuestaCorrecta,
            respuestasCorrectas: p.tipo === 'seleccion_multiple' ? respuestasCorrectas : undefined,
            tiempo: p.tiempo_limite_segundos || 20,
            imagen: p.multimedia?.url || null,
            puntos: p.puntos_si_es_dificultad,
          };
        });
        
        setPreguntas(preguntasCargadas);
        
        // Cargar la primera pregunta directamente con los datos cargados
        cargarPregunta(0, preguntasCargadas);
      }
    } catch (error) {
      console.error('Error cargando quiz:', error);
      alert('Error al cargar el quiz');
    } finally {
      setCargandoQuiz(false);
      setTimeout(() => { isLoadingQuiz.current = false; }, 0);
    }
  };

  // Obtiene las materias asignadas al profesor desde PostgreSQL.
  // Se usa en el modal de configuración para asociar el quiz a una materia.
  const cargarMateriasProfesor = async () => {
    try {
      const userJson = await getItem('user');
      if (userJson) {
        const usuario = JSON.parse(userJson);
        const response = await fetch(`${API_URL}/materias/profesor/${usuario.usu_id}`);
        if (response.ok) {
          const data = await response.json();
          const materias = data.materias || [];
          setMateriasProfesor(materias.map((m: any) => ({ mat_id: m.mat_id, mat_nombre: m.mat_nombre })));
        }
      }
    } catch (error) {
      console.error('Error al cargar materias del profesor:', error);
    }
  };

  // Al tocar "Listo" se guarda la pregunta que se está editando y se abre
  // el modal de configuración final (título, materia, portada).
  const handleGuardar = () => {
    guardarPreguntaActual();
    setMostrarModalConfiguracion(true);
  };
  

  // Aquí es donde realmente se arma el objeto del quiz y se manda al backend.
  // Si es edición manda un PUT, si es nuevo manda un POST.
  // Después de guardar muestra un modal de éxito y redirige a la biblioteca.
  const handleFinalizarGuardado = async () => {
    try {
      setGuardando(true);
      setErrorGuardado(null);
      
      // Busco el usuario que está logueado para ponerlo como autor del quiz
      const userData = await getItem('user');
      const usuario = userData ? JSON.parse(userData) : null;
      const autorId = usuario?.usu_id || 1; // Si no hay usuario, pongo 1 por defecto
      
      // Preparar las preguntas en formato del backend
      const preguntasFormateadas = preguntas.map((p, index) => {
        // Filtrar respuestas vacías
        const respuestasFiltradas = p.respuestas.filter(r => r && r.trim() !== '');
        
        // Recalcular índices de respuestas correctas después de filtrar
        let nuevasRespuestasCorrectas: number[] = [];
        if (p.tipo === 'seleccion_multiple' && p.respuestasCorrectas) {
          nuevasRespuestasCorrectas = p.respuestasCorrectas
            .map(idxOriginal => respuestasFiltradas.findIndex((_, idx) => idx === idxOriginal))
            .filter(idx => idx !== -1);
        }
        
        // Recalcular índice de respuesta correcta para selección simple y Verdadero/Falso
        let nuevaRespuestaCorrecta = 0;
        if (p.tipo !== 'seleccion_multiple') {
          nuevaRespuestaCorrecta = p.tipo === 'verdadero_falso' 
            ? p.respuestaCorrecta // En V/F el índice es directo (0 o 1)
            : respuestasFiltradas.findIndex((_, idx) => idx === p.respuestaCorrecta);
            
          if (nuevaRespuestaCorrecta === -1) nuevaRespuestaCorrecta = 0;
        }
        
        return {
          nro_orden: index + 1,
          tipo: p.tipo,
          enunciado: p.pregunta,
          tiempo_limite_segundos: p.tiempo,
          opciones: respuestasFiltradas.map((respuesta, idx) => ({
            texto: respuesta,
            es_correcta: p.tipo === 'seleccion_multiple' 
              ? nuevasRespuestasCorrectas.includes(idx)
              : idx === nuevaRespuestaCorrecta
          })),
          multimedia: p.imagen ? { tipo: 'imagen', url: p.imagen } : null,
          categoria: materiaQuiz,
          puntos_si_es_dificultad: p.puntos ?? ponderacion / preguntas.length
        };
      });
      
      // Armo el objeto con toda la info del quiz
      const quizData = {
        metadatos: {
          titulo: tituloQuiz,
          tema: materiaQuiz,
          materia_id: materiaQuizId,
          autor_id: autorId,
          imagen_portada: portadaQuiz,
          recompensa_puntos_app: 100,
          ponderacion: ponderacion,
          modo_juego: modoJuego
        },
        preguntas: preguntasFormateadas
      };
      
      // Lo mando al backend para guardar o actualizar
      let resultado;
      if (modoEdicion && quizId) {
        resultado = await actualizarQuiz(quizId, quizData);
      } else {
        resultado = await guardarQuiz(quizData);
      }
      
      // Cierro el modal de configuración
      setMostrarModalConfiguracion(false);
      
      // Si no es modo edición, limpiar estados
      if (!modoEdicion) {
        limpiarEstado({ conservarPlantilla: true });
      }
      
      // Muestro el "Guardado correctamente"
      setMostrarModalGuardado(true);
      setTimeout(() => {
        setMostrarModalGuardado(false);
        router.push('/profesor/biblioteca' as any);
      }, 2000);
      
    } catch (error: any) {
      console.error('Error guardando quiz:', error);
      setErrorGuardado(error.message || 'Error al guardar el quiz');
      alert('Error al guardar: ' + (error.message || 'Error desconocido'));
    } finally {
      setGuardando(false);
    }
  };
  
  // Abre el selector de imágenes del dispositivo para poner una portada al quiz.
  const seleccionarPortada = async () => {
    const result = await pickImage();
    if (result) {
      setPortadaQuiz(result);
    }
  };

  const totalPreguntas = preguntas.length;

  // Sincroniza los estados temporales de la pregunta actual de vuelta al array global.
  // Esto es necesario porque trabajamos con estados individuales (textoPregunta, respuestas, etc.)
  // y el array es la fuente de verdad para todo el quiz.
  const guardarPreguntaActual = () => {
    setPreguntas(prevPreguntas => {
      const nuevasPreguntas = [...prevPreguntas];
      nuevasPreguntas[preguntaActual - 1] = {
        id: preguntaActual,
        tipo: tipoPregunta,
        pregunta: textoPregunta,
        respuestas: [...respuestas],
        respuestaCorrecta,
        respuestasCorrectas: tipoPregunta === 'seleccion_multiple' ? respuestasCorrectas : undefined,
        tiempo,
        imagen: imagenPregunta,
        puntos: puntosPregunta
      } as any;
      return nuevasPreguntas;
    });
  };

  // Cargar una pregunta del array
  const cargarPregunta = (index: number, preguntasData?: PreguntaData[]) => {
    const preguntasSource = preguntasData || preguntas;
    const pregunta = preguntasSource[index];
    if (pregunta) {
      setTipoPregunta(pregunta.tipo);
      setTextoPregunta(pregunta.pregunta);
      setRespuestas(pregunta.respuestas);
      setRespuestaCorrecta(pregunta.respuestaCorrecta);
      setRespuestasCorrectas(pregunta.respuestasCorrectas || [pregunta.respuestaCorrecta]);
      setTiempo(pregunta.tiempo);
      setImagenPregunta(pregunta.imagen);
      setPuntosPregunta(pregunta.puntos ?? ponderacion / preguntas.length);
    }
  };

  // Agrega una pregunta vacía al final del array y se posiciona en ella.
  // Primero guarda la pregunta actual para no perder los cambios.
  const crearNuevaPregunta = () => {
    const preguntaActualGuardada: PreguntaData = {
      id: preguntaActual,
      tipo: tipoPregunta,
      pregunta: textoPregunta,
      respuestas: [...respuestas],
      respuestaCorrecta,
      respuestasCorrectas: tipoPregunta === 'seleccion_multiple' ? respuestasCorrectas : undefined,
      tiempo,
      imagen: imagenPregunta,
      puntos: puntosPregunta,
    };
    
    setPreguntas(prevPreguntas => {
      const nuevasPreguntas = [...prevPreguntas];
      nuevasPreguntas[preguntaActual - 1] = preguntaActualGuardada;
      
      const nuevoId = nuevasPreguntas.length + 1;
      const nuevaPregunta: any = {
        id: nuevoId,
        tipo: 'quiz',
        pregunta: '',
        respuestas: ['', '', '', ''],
        respuestaCorrecta: 0,
        respuestasCorrectas: [0],
        tiempo: 20,
        imagen: null,
        puntos: ponderacion / (prevPreguntas.length + 1),
      };
      
      const nuevasPreguntasConNueva = [...nuevasPreguntas, nuevaPregunta];
      
      // Actualizar pregunta actual y limpiar estados después de actualizar el array
      queueMicrotask(() => {
        setPreguntaActual(nuevoId);
        setTipoPregunta('quiz');
        setTextoPregunta('');
        setRespuestas(['', '', '', '']);
        setRespuestaCorrecta(0);
        setRespuestasCorrectas([0]);
        setTiempo(20);
        setImagenPregunta(null);
      });
      
      return nuevasPreguntasConNueva as any;
    });
  };

  // Navegación entre preguntas. Si estamos en la última y tocan "siguiente",
  // se crea una pregunta nueva automáticamente.
  const handleSiguiente = () => {
    if (preguntaActual < preguntas.length) {
      guardarPreguntaActual();
      const siguienteIndex = preguntaActual;
      setPreguntaActual(preguntaActual + 1);
      cargarPregunta(siguienteIndex);
    } else {
      crearNuevaPregunta();
    }
  };

  const handleAnterior = () => {
    if (preguntaActual > 1) {
      guardarPreguntaActual();
      cargarPregunta(preguntaActual - 2);
      setPreguntaActual(preguntaActual - 1);
    }
  };

  // Elimina la pregunta actual y reindexa los IDs para que queden consecutivos.
  // Si solo hay una pregunta no deja borrarla.
  const handleEliminarPregunta = () => {
    if (totalPreguntas > 1) {
      const nuevasPreguntas = preguntas.filter((_, i) => i !== preguntaActual - 1);
      
      // Reindexar IDs
      const preguntasReindexadas = nuevasPreguntas.map((p, i) => ({ ...p, id: i + 1 }));
      setPreguntas(preguntasReindexadas);
      
      // Calcular el nuevo índice de pregunta a cargar
      let nuevoIndice = 0;
      if (preguntaActual > 1) {
        nuevoIndice = preguntaActual - 2;
        setPreguntaActual(preguntaActual - 1);
      }
      
      // Cargar la pregunta con las nuevas preguntas actualizadas
      cargarPregunta(nuevoIndice, preguntasReindexadas);
    } else {
    }
    setMostrarMenuOpciones(false);
  };

  // Crea una copia exacta de la pregunta actual y la inserta justo después.
  // Reindexa todo para que los IDs sigan siendo secuenciales.
  const handleDuplicarPregunta = () => {
    const preguntaActualGuardada: PreguntaData = {
      id: preguntaActual,
      tipo: tipoPregunta,
      pregunta: textoPregunta,
      respuestas: [...respuestas],
      respuestaCorrecta,
      respuestasCorrectas: tipoPregunta === 'seleccion_multiple' ? respuestasCorrectas : undefined,
      tiempo,
      imagen: imagenPregunta,
      puntos: puntosPregunta,
    };
    
    setPreguntas(prevPreguntas => {
      const nuevasPreguntas = [...prevPreguntas];
      nuevasPreguntas[preguntaActual - 1] = preguntaActualGuardada;
      
      // Crear una copia con nuevo ID
      const preguntaDuplicada: PreguntaData = {
        ...preguntaActualGuardada,
        id: nuevasPreguntas.length + 1,
      };
      
      // Insertar después de la pregunta actual
      nuevasPreguntas.splice(preguntaActual, 0, preguntaDuplicada);
      
      // Reindexar IDs
      const preguntasReindexadas = nuevasPreguntas.map((p, i) => ({ ...p, id: i + 1 }));
      
      // Ir a la pregunta duplicada después de actualizar el estado
      queueMicrotask(() => {
        setPreguntaActual(preguntaActual + 1);
        cargarPregunta(preguntaActual);
      });
      
      return preguntasReindexadas;
    });
    setMostrarMenuOpciones(false);
  };

  // Cambia el tipo de pregunta y ajusta las respuestas automáticamente.
  // Por ejemplo, al pasar a V/F pone "Verdadero" y "Falso" fijo,
  // y al pasar a completación solo deja un input.
  const seleccionarTipo = (tipo: TipoPregunta) => {
    setTipoPregunta(tipo);
    // Ajustar respuestas según el tipo
    let nuevasRespuestas: string[];
    switch (tipo) {
      case 'verdadero_falso':
        nuevasRespuestas = ['Verdadero', 'Falso'];
        setRespuestaCorrecta(0);
        setRespuestasCorrectas([0]);
        break;
      case 'completacion':
        nuevasRespuestas = [''];
        setRespuestaCorrecta(0);
        setRespuestasCorrectas([0]);
        break;
      case 'seleccion_multiple':
        // Selección múltiple: mantener o inicializar 4 respuestas
        nuevasRespuestas = respuestas.length >= 2 ? respuestas.slice(0, 4) : ['', '', '', ''];
        if (nuevasRespuestas.length < 4) {
          while (nuevasRespuestas.length < 4) nuevasRespuestas.push('');
        }
        setRespuestasCorrectas([0]); // Por defecto la primera es correcta
        setRespuestaCorrecta(0);
        break;
      default:
        // Quiz: mantener o inicializar 4 respuestas
        nuevasRespuestas = respuestas.length >= 2 ? respuestas.slice(0, 4) : ['', '', '', ''];
        if (nuevasRespuestas.length < 4) {
          while (nuevasRespuestas.length < 4) nuevasRespuestas.push('');
        }
        setRespuestaCorrecta(0);
        setRespuestasCorrectas([0]);
    }
    setRespuestas(nuevasRespuestas);
    setRespuestaCorrecta(0);
    setRespuestasCorrectas([0]);
    
    // Actualizar también en el array de preguntas
    const nuevasPreguntas = [...preguntas];
    nuevasPreguntas[preguntaActual - 1] = {
      ...nuevasPreguntas[preguntaActual - 1],
      tipo: tipo,
      respuestas: nuevasRespuestas,
      respuestaCorrecta: 0,
      respuestasCorrectas: [0],
    };
    setPreguntas(nuevasPreguntas);
    
    setMostrarSelectorTipo(false);
  };

  // Helper que devuelve cuántas respuestas tiene la pregunta actual según el tipo.
  // V/F siempre tiene 2, Completación siempre 1, el resto varía.
  const getCantidadRespuestas = () => {
    switch (tipoPregunta) {
      case 'verdadero_falso':
        return 2;
      case 'completacion':
        return 1;
      default:
        return respuestas.filter(r => r !== '' || respuestas.indexOf(r) < 2).length;
    }
  };

  // Agrega una opción de respuesta vacía (máximo 4, y no disponible en V/F ni Completación).
  const agregarRespuesta = () => {
    if (respuestas.length < 4 && tipoPregunta !== 'verdadero_falso' && tipoPregunta !== 'completacion') {
      setRespuestas([...respuestas, '']);
    }
  };

  // Elimina una respuesta por su índice. Reindexa las respuestas correctas
  // para que los índices sigan apuntando a las opciones correctas.
  const eliminarRespuesta = (index: number) => {
    if (tipoPregunta === 'verdadero_falso') return; // No eliminar en V/F
    if (respuestas.length > 2) {
      const nuevas = respuestas.filter((_, i) => i !== index);
      setRespuestas(nuevas);
      // Reindexar respuestasCorrectas después de eliminar
      setRespuestasCorrectas(prev =>
        prev.map(i => i > index ? i - 1 : i).filter(i => i >= 0 && i < nuevas.length)
      );
    }
  };

  // Actualiza el texto de una respuesta en el array de estados temporales
  const updateRespuesta = (index: number, texto: string) => {
    const nuevasRespuestas = [...respuestas];
    nuevasRespuestas[index] = texto;
    setRespuestas(nuevasRespuestas);
  };

  // Marca o desmarca una respuesta como correcta.
  // En selección múltiple funciona como toggle (varias correctas).
  // En los demás tipos solo se puede tener una.
  const seleccionarRespuestaCorrecta = (index: number) => {
    if (tipoPregunta === 'seleccion_multiple') {
      // Toggle: agregar o quitar de la lista de correctas
      const nuevasCorrectas = respuestasCorrectas.includes(index)
        ? respuestasCorrectas.filter(i => i !== index)
        : [...respuestasCorrectas, index];
      setRespuestasCorrectas(nuevasCorrectas);
      
      // Actualizar en el array global
      const nuevasPreguntas = [...preguntas];
      nuevasPreguntas[preguntaActual - 1] = {
        ...nuevasPreguntas[preguntaActual - 1],
        respuestasCorrectas: nuevasCorrectas,
        pregunta: textoPregunta,
        tipo: tipoPregunta,
        respuestas: [...respuestas],
        tiempo,
        imagen: imagenPregunta,
      };
      setPreguntas(nuevasPreguntas);
    } else {
      // Quiz y V/F: solo una correcta
      setRespuestaCorrecta(index);
      const nuevasPreguntas = [...preguntas];
      nuevasPreguntas[preguntaActual - 1] = {
        id: preguntaActual,
        tipo: tipoPregunta,
        pregunta: textoPregunta,
        respuestas: [...respuestas],
        respuestaCorrecta: index,
        tiempo,
        imagen: imagenPregunta,
        puntos: puntosPregunta,
      };
      setPreguntas(nuevasPreguntas);
    }
  };

  // Abre el modal para editar el texto de una respuesta individual.
  const abrirModalRespuesta = (index: number) => {
    setRespuestaEditando({ index, texto: respuestas[index] || '' });
    setMostrarModalRespuesta(true);
  };

  // Toma el texto del modal de edición y lo guarda en el estado de respuestas.
  const guardarRespuestaEditada = () => {
    if (respuestaEditando) {
      const nuevasRespuestas = [...respuestas];
      nuevasRespuestas[respuestaEditando.index] = respuestaEditando.texto;
      setRespuestas(nuevasRespuestas);
      
      // Guardar en el array de preguntas
      const nuevasPreguntas = [...preguntas];
      nuevasPreguntas[preguntaActual - 1] = {
        ...nuevasPreguntas[preguntaActual - 1],
        respuestas: nuevasRespuestas,
      };
      setPreguntas(nuevasPreguntas);
    }
    setMostrarModalRespuesta(false);
    setRespuestaEditando(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Header con selector de tipo, ponderación, modo de juego, menú y botón Listo */}
      <View style={styles.headerKahoot}>
        <TouchableOpacity 
          style={styles.tipoSelector}
          onPress={() => setMostrarSelectorTipo(true)}
        >
          <Ionicons 
            name={TIPOS_PREGUNTA.find(t => t.id === tipoPregunta)?.icono as any || 'help-circle'} 
            size={20} 
            color="#333" 
          />
          <Text style={styles.tipoTexto} numberOfLines={1}>
            {TIPOS_PREGUNTA.find(t => t.id === tipoPregunta)?.nombre || 'Quiz'}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#333" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.ponderacionSelector}
          onPress={() => setMostrarSelectorPonderacion(true)}
        >
          <Ionicons name="star-outline" size={18} color="#333" />
          <Text style={styles.ponderacionTexto} numberOfLines={1}>
            {ponderacion} pts
          </Text>
          <Ionicons name="chevron-down" size={14} color="#333" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.gameModeSelector}
          onPress={() => setModoJuego(modoJuego === 'Igual' ? 'Dificultad' : 'Igual')}
        >
          <Ionicons 
            name={modoJuego === 'Igual' ? 'swap-horizontal' : 'bar-chart'} 
            size={18} 
            color="#333" 
          />
          <Text style={styles.gameModeTexto} numberOfLines={1}>
            {modoJuego === 'Igual' ? 'Igual' : 'Dificultad'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuButton}
          onPress={() => setMostrarMenuOpciones(true)}
        >
          <Ionicons name="ellipsis-vertical" size={20} color="#333" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.listoButton} onPress={handleGuardar}>
          <Text style={styles.listoTexto}>Listo</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Área de multimedia tipo Kahoot con burbuja de tiempo */}
        <View style={styles.multimediaWrapper}>
          <TouchableOpacity 
            style={styles.multimediaArea}
            onPress={async () => {
              const imagen = await pickImage();
              if (imagen) {
                setImagenPregunta(imagen);
              }
            }}
          >
            {imagenPregunta ? (
              <View style={styles.imagenContainer}>
                <AppImage uri={imagenPregunta} style={styles.imagenPreview} />
                <TouchableOpacity 
                  style={styles.botonEliminarImagen}
                  onPress={(e) => {
                    e.stopPropagation();
                    setImagenPregunta(null);
                  }}
                >
                  <Ionicons name="close-circle" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Ionicons name="image-outline" size={40} color="#666" />
                <Text style={styles.multimediaTexto}>Añadir imagen</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Burbuja de tiempo Kahoot - tocable, posicionada sobre el borde */}
          <TouchableOpacity 
            style={styles.tiempoBubble}
            onPress={() => setMostrarSelectorTiempo(true)}
          >
            <Ionicons name="time" size={14} color="#fff" />
            <Text style={styles.tiempoTexto}>{tiempo} s</Text>
          </TouchableOpacity>

          {/* Burbuja de puntos - visible en ambos modos, editable solo en Dificultad */}
          <TouchableOpacity 
            style={[
              styles.puntosBubble,
              modoJuego === 'Igual' && styles.puntosBubbleDisabled
            ]}
            onPress={() => modoJuego === 'Dificultad' && setMostrarSelectorPuntos(true)}
            disabled={modoJuego === 'Igual'}
          >
            <Ionicons name="star" size={14} color="#fff" />
            <Text style={styles.puntosTexto}>{Number(puntosPregunta).toFixed(1)} pts</Text>
          </TouchableOpacity>
        </View>

        {/* Campo de pregunta estilo Kahoot - límite 95 caracteres */}
        <View style={styles.preguntaContainer}>
          <TextInput
            style={styles.preguntaInput}
            value={textoPregunta}
            onChangeText={setTextoPregunta}
            placeholder="Pulsa para añadir una pregunta"
            placeholderTextColor="#888"
            multiline
            maxLength={95}
          />
          <Text style={styles.contadorCaracteres}>
            {textoPregunta.length}/95
          </Text>
        </View>

        {/* Grid de respuestas según tipo de pregunta */}
        <View style={[styles.respuestasGrid, tipoPregunta === 'verdadero_falso' && styles.respuestasGrid2Col]}>
          {tipoPregunta === 'completacion' ? (
            // Completación: Input simple
            <View style={styles.completacionContainer}>
              <Text style={styles.completacionLabel}>Respuesta correcta:</Text>
              <TextInput
                style={styles.completacionInput}
                value={respuestas[0] || ''}
                onChangeText={(texto) => updateRespuesta(0, texto)}
                placeholder="Escribe la respuesta correcta"
                placeholderTextColor="#888"
                maxLength={75}
              />
              <Text style={styles.respuestaContadorCompletacion}>
                {(respuestas[0] || '').length}/75
              </Text>
            </View>
          ) : (
            // Quiz, Selección múltiple, Verdadero/Falso
            respuestas.map((respuesta, index) => (
              <TouchableOpacity 
                key={index} 
                style={[
                  styles.respuestaCard, 
                  { backgroundColor: COLORES_RESPUESTA[index] },
                  tipoPregunta === 'verdadero_falso' && styles.respuestaCardVF,
                  (tipoPregunta === 'seleccion_multiple' 
                    ? respuestasCorrectas.includes(index)
                    : respuestaCorrecta === index
                  ) && styles.respuestaCardCorrecta
                ]}
                onPress={() => abrirModalRespuesta(index)}
              >
                {/* Figura geométrica de fondo translúcida */}
                {index === 0 && (
                  <View style={[styles.figuraFondo, { top: -10, right: -15, transform: [{ rotate: '15deg' }] }]}>
                    <Ionicons name="triangle" size={60} color="rgba(255,255,255,0.15)" />
                  </View>
                )}
                {index === 1 && (
                  <View style={[styles.figuraFondo, { bottom: -10, left: -10, transform: [{ rotate: '-10deg' }] }]}>
                    <Ionicons name="diamond" size={50} color="rgba(255,255,255,0.15)" />
                  </View>
                )}
                {index === 2 && (
                  <View style={[styles.figuraFondo, { top: -5, left: -15, transform: [{ rotate: '5deg' }] }]}>
                    <Ionicons name="square" size={50} color="rgba(255,255,255,0.15)" />
                  </View>
                )}
                {index === 3 && (
                  <View style={[styles.figuraFondo, { bottom: -15, right: -10, transform: [{ rotate: '-5deg' }] }]}>
                    <Ionicons name="ellipse" size={55} color="rgba(255,255,255,0.15)" />
                  </View>
                )}
                
                {/* Checkmark si es la respuesta correcta */}
                {(tipoPregunta === 'seleccion_multiple' 
                  ? respuestasCorrectas.includes(index)
                  : respuestaCorrecta === index
                ) && (
                  <View style={[
                    styles.checkCorrecta,
                    tipoPregunta === 'verdadero_falso' && styles.checkCorrectaVF
                  ]}>
                    <Ionicons name="checkmark-circle" size={24} color="#fff" />
                    {tipoPregunta === 'verdadero_falso' && (
                      <Text style={styles.textoCorrectaVF}>Correcta</Text>
                    )}
                  </View>
                )}
                
                {/* Texto de respuesta - no editable, abre modal al tocar */}
                <View style={styles.respuestaTextoContainer} pointerEvents="none">
                  {respuesta ? (
                    <Text style={styles.respuestaTexto} numberOfLines={2}>
                      {respuesta}
                    </Text>
                  ) : tipoPregunta !== 'verdadero_falso' ? (
                    <Text style={styles.respuestaPlaceholder}>
                      Agregar respuesta
                    </Text>
                  ) : null}
                </View>
                
                {tipoPregunta !== 'verdadero_falso' && respuesta.length > 0 && (
                  <Text style={styles.respuestaContador}>
                    {respuesta.length}/75
                  </Text>
                )}
                
                {/* Botón eliminar respuesta (solo si > 2 respuestas y no es V/F) */}
                {tipoPregunta !== 'verdadero_falso' && respuestas.length > 2 && (
                  <TouchableOpacity 
                    style={styles.botonEliminarRespuesta}
                    onPress={(e) => {
                      e.stopPropagation();
                      eliminarRespuesta(index);
                    }}
                  >
                    <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Mensaje de advertencia para selección múltiple */}
        {tipoPregunta === 'seleccion_multiple' && respuestasCorrectas.length < 2 && (
          <View style={styles.warningContainer}>
            <Text style={styles.warningText}>La selección múltiple requiere al menos 2 respuestas correctas.</Text>
          </View>
        )}

        {/* Botón añadir más respuestas (solo para quiz/selección múltiple) */}
        {tipoPregunta !== 'verdadero_falso' && tipoPregunta !== 'completacion' && respuestas.length < 4 && (
          <TouchableOpacity style={styles.addPreguntaButton} onPress={agregarRespuesta}>
            <Ionicons name="add-circle" size={20} color={Colors.primary} />
            <Text style={styles.addPreguntaTexto}>Añadir respuesta</Text>
          </TouchableOpacity>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Barra inferior con miniaturas de preguntas y botones anterior/siguiente/añadir */}
      <View style={styles.navBar}>
        <TouchableOpacity 
          style={[styles.navButton, preguntaActual === 1 && styles.navButtonDisabled]}
          onPress={handleAnterior}
          disabled={preguntaActual === 1}
        >
          <Ionicons name="chevron-back" size={24} color={preguntaActual === 1 ? '#ccc' : '#333'} />
        </TouchableOpacity>

        {/* Lista horizontal de preguntas */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.preguntasList}
        >
          {preguntas.map((p, index) => (
            <TouchableOpacity
              key={p.id}
              style={[
                styles.preguntaMiniatura,
                preguntaActual === index + 1 && styles.preguntaMiniaturaActiva,
                p.pregunta && styles.preguntaMiniaturaConContenido,
                preguntasConError.has(index + 1) && styles.preguntaMiniaturaConError
              ]}
              onPress={() => {
                guardarPreguntaActual();
                cargarPregunta(index);
                setPreguntaActual(index + 1);
              }}
            >
              <Text style={[
                styles.preguntaMiniaturaNumero,
                preguntaActual === index + 1 && styles.preguntaMiniaturaNumeroActivo,
                preguntasConError.has(index + 1) && styles.preguntaMiniaturaNumeroError
              ]}>
                {index + 1}
              </Text>
              {p.imagen && (
                <View style={styles.miniaturaImagenIndicator}>
                  <Ionicons name="image" size={10} color="#fff" />
                </View>
              )}
              {preguntasConError.has(index + 1) && (
                <View style={styles.miniaturaErrorIndicator}>
                  <Ionicons name="warning" size={10} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.navButton} onPress={crearNuevaPregunta}>
          <Ionicons name="add" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      {/* Modal para cambiar el tipo de pregunta (Quiz, V/F, Selección Múltiple, Completación) */}
      <Modal
        visible={mostrarSelectorTipo}
        transparent
        animationType="slide"
        onRequestClose={() => setMostrarSelectorTipo(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitulo}>Cambiar modo</Text>
            {TIPOS_PREGUNTA.map((tipo) => (
              <TouchableOpacity
                key={tipo.id}
                style={[
                  styles.tipoOption,
                  tipoPregunta === tipo.id && styles.tipoOptionSelected
                ]}
                onPress={() => seleccionarTipo(tipo.id)}
              >
                <Ionicons name={tipo.icono as any} size={24} color={tipoPregunta === tipo.id ? Colors.primary : '#666'} />
                <Text style={[
                  styles.tipoOptionText,
                  tipoPregunta === tipo.id && styles.tipoOptionTextSelected
                ]}>
                  {tipo.nombre}
                </Text>
                {tipoPregunta === tipo.id && (
                  <Ionicons name="checkmark" size={20} color={Colors.primary} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setMostrarSelectorTipo(false)}
            >
              <Text style={styles.modalCloseText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal selector de tiempo */}
      <Modal
        visible={mostrarSelectorTiempo}
        transparent
        animationType="slide"
        onRequestClose={() => setMostrarSelectorTiempo(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitulo}>Tiempo límite</Text>
            <View style={styles.tiempoGrid}>
              {OPCIONES_TIEMPO.map((segundos) => (
                <TouchableOpacity
                  key={segundos}
                  style={[
                    styles.tiempoOption,
                    tiempo === segundos && styles.tiempoOptionSelected
                  ]}
                  onPress={() => {
                    setTiempo(segundos);
                    setMostrarSelectorTiempo(false);
                  }}
                >
                  <Text style={[
                    styles.tiempoOptionText,
                    tiempo === segundos && styles.tiempoOptionTextSelected
                  ]}>
                    {segundos}s
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setMostrarSelectorTiempo(false)}
            >
              <Text style={styles.modalCloseText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal selector de puntos - solo Dificultad */}
      <Modal
        visible={mostrarSelectorPuntos}
        transparent
        animationType="slide"
        onRequestClose={() => setMostrarSelectorPuntos(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitulo}>Puntos de la pregunta</Text>

            {(() => {
              const sumaOtras = preguntas.reduce((sum, p, index) => {
                if (index === preguntaActual - 1) return sum;
                return sum + (p.puntos ?? 0);
              }, 0);
              const disponibles = Math.max(0, ponderacion - sumaOtras);

              return (
                <>
                  <Text style={styles.puntosDisponibles}>
                    Presupuesto total: {ponderacion} pts
                  </Text>
                  <Text style={styles.puntosDisponibles}>
                    Asignados (otras): {Number(sumaOtras).toFixed(1)} pts
                  </Text>
                  <Text style={[styles.puntosDisponibles, { fontWeight: 'bold' }]}>
                    Disponibles: {Number(disponibles).toFixed(1)} pts
                  </Text>

                  <Text style={styles.puntosSliderValor}>
                    {Number(puntosPregunta).toFixed(1)} pts
                  </Text>

                  <Slider
                    minimumValue={0.1}
                    maximumValue={disponibles}
                    step={0.1}
                    value={puntosPregunta}
                    onValueChange={(valor: number) => setPuntosPregunta(valor)}
                    minimumTrackTintColor={Colors.primary}
                    maximumTrackTintColor="#e0e0e0"
                    thumbTintColor={Colors.primary}
                    style={styles.puntosSlider}
                  />
                </>
              );
            })()}

            <TouchableOpacity
              style={styles.modalConfirmButton}
              onPress={() => setMostrarSelectorPuntos(false)}
            >
              <Text style={styles.modalConfirmText}>Confirmar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setMostrarSelectorPuntos(false)}
            >
              <Text style={styles.modalCloseText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal selector de ponderación */}
      <Modal
        visible={mostrarSelectorPonderacion}
        transparent
        animationType="slide"
        onRequestClose={() => { setCustomPonderacion(''); setMostrarSelectorPonderacion(false); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitulo}>Ponderación del quiz</Text>
            <View style={styles.tiempoGrid}>
              {[10, 20, 100].map((valor) => (
                <TouchableOpacity
                  key={valor}
                  style={[
                    styles.tiempoOption,
                    ponderacion === valor && styles.tiempoOptionSelected
                  ]}
                  onPress={() => {
                    guardarPreguntaActual();
                    setPonderacion(valor);
                    setCustomPonderacion('');
                    setMostrarSelectorPonderacion(false);
                  }}
                >
                  <Text style={[
                    styles.tiempoOptionText,
                    ponderacion === valor && styles.tiempoOptionTextSelected
                  ]}>
                    {valor}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.customPonderacionContainer}>
              <Text style={styles.customPonderacionLabel}>Personalizada (1-999)</Text>
              <View style={styles.customPonderacionRow}>
                <TextInput
                  style={styles.customPonderacionInput}
                  keyboardType="numeric"
                  placeholder="Ej: 5"
                  placeholderTextColor="#999"
                  value={customPonderacion}
                  onChangeText={(text) => setCustomPonderacion(text.replace(/[^0-9]/g, ''))}
                  maxLength={3}
                />
                <TouchableOpacity
                  style={[
                    styles.customPonderacionButton,
                    (!customPonderacion || parseInt(customPonderacion) < 1 || parseInt(customPonderacion) > 999) && styles.customPonderacionButtonDisabled
                  ]}
                  onPress={() => {
                    const val = parseInt(customPonderacion);
                    if (val >= 1 && val <= 999) {
                      guardarPreguntaActual();
                      setPonderacion(val);
                      setMostrarSelectorPonderacion(false);
                    }
                  }}
                  disabled={!customPonderacion || parseInt(customPonderacion) < 1 || parseInt(customPonderacion) > 999}
                >
                  <Text style={styles.customPonderacionButtonText}>Aplicar</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => { setCustomPonderacion(''); setMostrarSelectorPonderacion(false); }}
            >
              <Text style={styles.modalCloseText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal de configuración final del quiz */}
      <Modal
        visible={mostrarModalConfiguracion}
        transparent
        animationType="slide"
        onRequestClose={() => setMostrarModalConfiguracion(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <ScrollView 
            style={styles.modalConfiguracionScroll}
            contentContainerStyle={styles.modalConfiguracionScrollContent}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.modalConfiguracionContent}>
              <Text style={styles.modalConfiguracionTitulo}>Configurar Quiz</Text>
              <Text style={styles.modalConfiguracionSubtitulo}>Personaliza tu quizzima antes de publicar</Text>
              
              {/* Portada */}
              <TouchableOpacity style={styles.portadaSelector} onPress={seleccionarPortada}>
                {portadaQuiz ? (
                  <AppImage uri={portadaQuiz} style={styles.portadaPreview} />
                ) : (
                  <View style={styles.portadaPlaceholder}>
                    <Ionicons name="image-outline" size={40} color="#999" />
                    <Text style={styles.portadaPlaceholderText}>Añadir portada</Text>
                  </View>
                )}
                {portadaQuiz && (
                  <View style={styles.portadaEditBadge}>
                    <Ionicons name="camera" size={16} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
              
              {/* Título */}
              <View style={styles.configuracionField}>
                <Text style={styles.configuracionLabel}>Título del quiz</Text>
                <TextInput
                  style={styles.configuracionInput}
                  value={tituloQuiz}
                  onChangeText={setTituloQuiz}
                  placeholder="Ej: Quiz de Matemáticas - Álgebra"
                  placeholderTextColor="#999"
                  maxLength={50}
                />
                <Text style={styles.configuracionContador}>{tituloQuiz.length}/50</Text>
              </View>
              
              {/* Materia */}
              <View style={styles.configuracionField}>
                <Text style={styles.configuracionLabel}>Materia</Text>
                <TouchableOpacity 
                  style={styles.materiaSelector}
                  onPress={() => setMostrarSelectorMateria(true)}
                >
                  <Text style={materiaQuiz ? styles.materiaTexto : styles.materiaPlaceholder}>
                    {materiaQuiz || 'Seleccionar materia'}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#666" />
                </TouchableOpacity>
              </View>

              {/* Warning de validación */}
              {preguntasConError.size > 0 && (
                <View style={styles.publishWarning}>
                  <Ionicons name="alert-circle" size={16} color="#E21F3D" />
                  <Text style={styles.publishWarningText}>Hay preguntas con errores. Corrígelas antes de guardar.</Text>
                </View>
              )}

              {/* Botones */}
              <View style={styles.modalConfiguracionBotones}>
                <TouchableOpacity 
                  style={styles.modalConfigBotonCancelar}
                  onPress={() => setMostrarModalConfiguracion(false)}
                >
                  <Text style={styles.modalConfigBotonCancelarTexto}>Cancelar</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[
                    styles.modalConfigBotonGuardar,
                    (!tituloQuiz.trim() || !materiaQuiz || guardando || preguntasConError.size > 0) && styles.modalConfigBotonGuardarDisabled
                  ]}
                  onPress={handleFinalizarGuardado}
                  disabled={!tituloQuiz.trim() || !materiaQuiz || guardando || preguntasConError.size > 0}
                >
                  <Text style={styles.modalConfigBotonGuardarTexto}>
                    {guardando ? 'Guardando...' : modoEdicion ? 'Actualizar' : 'Guardar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal selector de materia */}
      <Modal
        visible={mostrarSelectorMateria}
        transparent
        animationType="slide"
        onRequestClose={() => setMostrarSelectorMateria(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.selectorMateriaContent}>
            <Text style={styles.modalTitulo}>Seleccionar Materia</Text>
            
            <ScrollView style={styles.materiasLista}>
              {materiasProfesor.length > 0 ? (
                materiasProfesor.map((materia) => (
                  <TouchableOpacity 
                    key={materia.mat_id}
                    style={[
                      styles.materiaOption,
                      materiaQuizId === materia.mat_id && styles.materiaOptionSelected
                    ]}
                    onPress={() => {
                      setMateriaQuiz(materia.mat_nombre);
                      setMateriaQuizId(materia.mat_id);
                      setMostrarSelectorMateria(false);
                    }}
                  >
                    <Text style={[
                      styles.materiaOptionText,
                      materiaQuizId === materia.mat_id && styles.materiaOptionTextSelected
                    ]}>
                      {materia.mat_nombre}
                    </Text>
                    {materiaQuizId === materia.mat_id && (
                      <Ionicons name="checkmark" size={20} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.materiaEmptyText}>No tienes materias asignadas</Text>
              )}
            </ScrollView>

            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setMostrarSelectorMateria(false)}
            >
              <Text style={styles.modalCloseText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal de guardado exitoso */}
      <Modal
        visible={mostrarModalGuardado}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalGuardadoContent}>
            <Ionicons name="checkmark-circle" size={60} color={Colors.success} />
            <Text style={styles.modalGuardadoTitulo}>{modoEdicion ? '¡Quizzima actualizado!' : '¡Quizzima creado!'}</Text>
            <Text style={styles.modalGuardadoSubtitulo}>Guardado en biblioteca</Text>
          </View>
        </View>
      </Modal>

      {/* Modal menú de opciones */}
      <Modal
        visible={mostrarMenuOpciones}
        transparent
        animationType="slide"
        onRequestClose={() => setMostrarMenuOpciones(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.menuContent}>
            <Text style={styles.menuTitulo}>Opciones</Text>
            
            <TouchableOpacity 
              style={styles.menuOption}
              onPress={handleEliminarPregunta}
            >
              <Ionicons name="trash-outline" size={22} color={Colors.danger} />
              <Text style={[styles.menuOptionText, { color: Colors.danger }]}>
                Eliminar esta pregunta
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuOption}
              onPress={handleDuplicarPregunta}
            >
              <Ionicons name="copy-outline" size={22} color="#333" />
              <Text style={styles.menuOptionText}>Duplicar pregunta</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuCloseButton}
              onPress={() => setMostrarMenuOpciones(false)}
            >
              <Text style={styles.modalCloseText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal de edición de respuesta */}
      <Modal
        visible={mostrarModalRespuesta}
        transparent
        animationType="slide"
        onRequestClose={() => setMostrarModalRespuesta(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalRespuestaContent}>
            <Text style={styles.modalTitulo}>
              Editar Respuesta {respuestaEditando ? String.fromCharCode(65 + respuestaEditando.index) : ''}
            </Text>
            
            {/* Input para editar texto (oculto en V/F) */}
            {tipoPregunta !== 'verdadero_falso' && (
              <>
                <TextInput
                  style={styles.modalRespuestaInput}
                  value={respuestaEditando?.texto || ''}
                  onChangeText={(texto) => setRespuestaEditando(prev => prev ? { ...prev, texto } : null)}
                  placeholder="Escribe la respuesta..."
                  placeholderTextColor="#999"
                  multiline
                  maxLength={75}
                  autoFocus
                />
                
                <Text style={styles.modalRespuestaContador}>
                  {(respuestaEditando?.texto || '').length}/75
                </Text>
              </>
            )}
            
            {/* En V/F mostrar solo el texto fijo */}
            {tipoPregunta === 'verdadero_falso' && respuestaEditando && (
              <View style={styles.modalRespuestaTextoFijo}>
                <Text style={styles.modalRespuestaTextoFijoLabel}>
                  {respuestaEditando.index === 0 ? 'Verdadero' : 'Falso'}
                </Text>
              </View>
            )}

            {/* Toggle para respuesta correcta */}
            <TouchableOpacity 
              style={styles.toggleCorrectaContainer}
              onPress={() => {
                if (respuestaEditando) {
                  seleccionarRespuestaCorrecta(respuestaEditando.index);
                }
              }}
            >
              <View style={[
                styles.toggleCorrecta,
                respuestaEditando && (
                  tipoPregunta === 'seleccion_multiple' 
                    ? respuestasCorrectas.includes(respuestaEditando.index)
                    : respuestaCorrecta === respuestaEditando.index
                ) && styles.toggleCorrectaActivo
              ]}>
                {respuestaEditando && (
                  tipoPregunta === 'seleccion_multiple' 
                    ? respuestasCorrectas.includes(respuestaEditando.index)
                    : respuestaCorrecta === respuestaEditando.index
                ) && (
                  <Ionicons name="checkmark" size={18} color="#fff" />
                )}
              </View>
              <Text style={styles.toggleCorrectaTexto}>
                {respuestaEditando && (
                  tipoPregunta === 'seleccion_multiple' 
                    ? respuestasCorrectas.includes(respuestaEditando.index)
                    : respuestaCorrecta === respuestaEditando.index
                ) 
                  ? 'Respuesta correcta ✓' 
                  : 'Marcar como correcta'}
              </Text>
            </TouchableOpacity>

            {/* Botones de acción */}
            <View style={styles.modalRespuestaBotones}>
              <TouchableOpacity 
                style={styles.modalRespuestaBotonCancelar}
                onPress={() => {
                  setMostrarModalRespuesta(false);
                  setRespuestaEditando(null);
                }}
              >
                <Text style={styles.modalRespuestaBotonCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.modalRespuestaBotonGuardar}
                onPress={guardarRespuestaEditada}
              >
                <Text style={styles.modalRespuestaBotonGuardarTexto}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Estilos del creador de quiz. Siguen la línea visual de Kahoot:
// colores llamativos, tarjetas con figuras geométricas, burbujas de tiempo/puntos.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLOR_FONDO,
  },
  scrollView: {
    flex: 1,
  },
  // Header Kahoot style (claro)
  headerKahoot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexWrap: 'nowrap',
  },
  tipoSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  tipoTexto: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  menuButton: {
    padding: 6,
    marginLeft: 4,
    flexShrink: 0,
  },
  listoButton: {
    marginLeft: 'auto',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    flexShrink: 0,
  },
  listoTexto: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  ponderacionSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    marginLeft: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  ponderacionTexto: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  gameModeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    marginLeft: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  gameModeTexto: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  // Wrapper multimedia + tiempo
  multimediaWrapper: {
    marginHorizontal: 16,
    marginTop: 16,
    position: 'relative',
  },
  // Área multimedia Kahoot (claro)
  multimediaArea: {
    height: 140,
    backgroundColor: '#e8e8e8',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ccc',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  multimediaTexto: {
    fontSize: 14,
    color: '#666',
  },
  // Imagen seleccionada
  imagenContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
  },
  imagenPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  botonEliminarImagen: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
  },
  // Burbuja de tiempo - posicionada en el borde inferior del multimedia
  tiempoBubble: {
    position: 'absolute',
    left: 12,
    bottom: -16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLOR_TIEMPO,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
    zIndex: 10,
  },
  tiempoTexto: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  // Burbuja de puntos
  puntosBubble: {
    position: 'absolute',
    right: 12,
    bottom: -16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFA500',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
    zIndex: 10,
  },
  puntosBubbleDisabled: {
    opacity: 0.5,
  },
  puntosTexto: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  // Pregunta Kahoot style (claro)
  preguntaContainer: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: '#fff',
    borderRadius: 4,
    padding: 20,
    minHeight: 80,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  preguntaInput: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
  contadorCaracteres: {
    fontSize: 11,
    color: '#999',
    textAlign: 'right',
    marginTop: 8,
  },
  respuestaContador: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },
  // Respuestas grid Kahoot
  respuestasGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 10,
  },
  respuestaCard: {
    width: '48%',
    aspectRatio: 1.6,
    borderRadius: 4,
    padding: 12,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  figuraFondo: {
    position: 'absolute',
    opacity: 0.6,
  },
  respuestaTextoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  respuestaTexto: {
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
  },
  respuestaPlaceholder: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  // Añadir más respuestas
  addPreguntaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  warningContainer: {
    marginTop: 8,
    paddingHorizontal: 16,
  },
  warningText: {
    color: '#E21F3D',
    fontSize: 13,
    fontWeight: '600',
  },
  addPreguntaTexto: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  // Menú de opciones
  menuContent: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  menuTitulo: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  menuSubTitulo: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 8,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuOptionText: {
    fontSize: 16,
    color: '#333',
  },
  menuCloseButton: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  // Estilos para Verdadero/Falso (2 columnas)
  respuestasGrid2Col: {
    justifyContent: 'center',
  },
  respuestaCardVF: {
    width: '48%',
  },
  respuestaCardCorrecta: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  checkCorrecta: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  checkCorrectaVF: {
    top: 'auto',
    bottom: 12,
    right: 'auto',
    left: '50%',
    marginLeft: -40,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
  },
  textoCorrectaVF: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
  },
  botonEliminarRespuesta: {
    position: 'absolute',
    top: 4,
    right: 4,
    padding: 4,
  },
  // Estilos para Completación
  completacionContainer: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  completacionLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  completacionInput: {
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f9f9f9',
  },
  respuestaContadorCompletacion: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
    textAlign: 'right',
  },
  // Nav bar inferior Kahoot (claro)
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1368CE',
  },
  navButtonDisabled: {
    opacity: 0.3,
    borderColor: '#ccc',
  },
  preguntasList: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
  },
  preguntaMiniatura: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
  },
  preguntaMiniaturaActiva: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    transform: [{ scale: 1.1 }],
  },
  preguntaMiniaturaConContenido: {
    backgroundColor: '#e8e8e8',
    borderColor: '#bbb',
  },
  preguntaMiniaturaNumero: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
  },
  preguntaMiniaturaNumeroActivo: {
    color: '#fff',
  },
  preguntaMiniaturaConError: {
    backgroundColor: '#FFE5E5',
    borderColor: '#E21F3D',
  },
  preguntaMiniaturaNumeroError: {
    color: '#E21F3D',
  },
  puntosContainer: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  puntosLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  puntosInput: {
    width: 80,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 8,
    textAlign: 'center',
    backgroundColor: '#fff',
  },
  configuracionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  escalaOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  escalaOption: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  escalaOptionSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  escalaText: { color: '#333' },
  escalaTextSelected: { color: '#fff', fontWeight: '700' },
  distribucionOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  distribOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  distribOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  distribText: { color: '#333' },
  distribTextActive: { color: '#fff', fontWeight: '700' },
  publishWarning: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6,
    backgroundColor: '#FFF0F0',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  publishWarningText: { 
    color: '#E21F3D', 
    fontWeight: '600',
    fontSize: 13,
    flex: 1,
  },
  miniaturaErrorIndicator: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#E21F3D',
    borderRadius: 8,
    padding: 2,
  },
  miniaturaImagenIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    padding: 2,
  },
  // Todos los modals comparten overlay oscuro y content white con bordes redondeados
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 60,
    paddingBottom: 20,
  },
  modalContent: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitulo: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  tipoOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 12,
  },
  tipoOptionSelected: {
    backgroundColor: `${Colors.primary}15`,
  },
  tipoOptionText: {
    flex: 1,
    fontSize: 16,
    color: '#666',
  },
  tipoOptionTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  // Grid de opciones de tiempo (5s, 10s, 20s, etc.)
  tiempoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  tiempoOption: {
    width: '28%',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  tiempoOptionSelected: {
    backgroundColor: COLOR_TIEMPO,
  },
  tiempoOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  tiempoOptionTextSelected: {
    color: '#fff',
  },
  tiempoOptionDisabled: {
    opacity: 0.4,
    backgroundColor: '#ccc',
  },
  tiempoOptionTextDisabled: {
    color: '#999',
  },
  // Sección para ponderación personalizada (valores entre 1 y 999)
  customPonderacionContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  customPonderacionLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  customPonderacionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  customPonderacionInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  customPonderacionButton: {
    height: 44,
    paddingHorizontal: 20,
    backgroundColor: COLOR_TIEMPO,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customPonderacionButtonDisabled: {
    opacity: 0.4,
  },
  customPonderacionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  puntosDisponibles: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  puntosInputModal: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  puntosSliderValor: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  puntosSlider: {
    width: '100%',
    height: 40,
    marginBottom: 16,
  },
  modalConfirmButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalCloseButton: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#666',
  },
  modalGuardadoContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  modalGuardadoTitulo: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
  },
  modalGuardadoSubtitulo: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  // Modal que se abre al tocar una tarjeta de respuesta para editar su texto
  modalRespuestaContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  modalRespuestaInput: {
    fontSize: 18,
    color: '#333',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginTop: 16,
  },
  modalRespuestaContador: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 8,
    marginBottom: 16,
  },
  toggleCorrectaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    marginBottom: 20,
  },
  toggleCorrecta: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleCorrectaActivo: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  toggleCorrectaTexto: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  modalRespuestaBotones: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalRespuestaBotonCancelar: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  modalRespuestaBotonCancelarTexto: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  modalRespuestaBotonGuardar: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  modalRespuestaBotonGuardarTexto: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  modalRespuestaTextoFijo: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginVertical: 20,
  },
  modalRespuestaTextoFijoLabel: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  // Modal de configuración final
  modalConfiguracionScroll: {
    width: '100%',
    maxHeight: '85%',
  },
  modalConfiguracionScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 20,
  },
  modalConfiguracionContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    paddingBottom: 32,
  },
  modalConfiguracionTitulo: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  modalConfiguracionSubtitulo: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  portadaSelector: {
    width: '100%',
    height: 150,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    overflow: 'hidden',
    marginBottom: 20,
  },
  portadaPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  portadaPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  portadaPlaceholderText: {
    fontSize: 14,
    color: '#999',
  },
  portadaEditBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 8,
  },
  configuracionField: {
    marginBottom: 20,
  },
  configuracionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  configuracionInput: {
    fontSize: 16,
    color: '#333',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 14,
  },
  configuracionContador: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
  },
  materiaSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 14,
  },
  materiaTexto: {
    fontSize: 16,
    color: '#333',
  },
  materiaPlaceholder: {
    fontSize: 16,
    color: '#999',
  },
  modalConfiguracionBotones: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalConfigBotonCancelar: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  modalConfigBotonCancelarTexto: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  modalConfigBotonGuardar: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  modalConfigBotonGuardarDisabled: {
    backgroundColor: '#ccc',
  },
  modalConfigBotonGuardarTexto: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  // Selector de materia
  selectorMateriaContent: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    maxHeight: '70%',
  },
  materiasLista: {
    maxHeight: 300,
    marginVertical: 12,
  },
  materiaOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 6,
  },
  materiaOptionSelected: {
    backgroundColor: '#f0f0f0',
  },
  materiaOptionText: {
    fontSize: 16,
    color: '#333',
  },
  materiaOptionTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  materiaEmptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  bottomPadding: {
    height: 100,
  },
});
