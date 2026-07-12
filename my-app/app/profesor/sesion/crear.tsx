// Creación de una sesión de quiz (publicar un quiz para los estudiantes).
// Toma un quiz de la biblioteca y lo configura con fechas de disponibilidad
// (inmediato o agendado). Genera un código de 6 dígitos al enviarlo al backend.
// El modo de juego y la ponderación vienen del quiz y no se editan acá.
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Share, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { getItem } from '@/utils/storage';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Colors from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { QuizCompleto } from '@/types/quizMongo';
import { Header } from '@/components/Header';
import { obtenerQuizPorId, crearSesionAsignada, obtenerMateria } from '@/utils/api';
import { AppImage } from '@/components/AppImage';

/**
 * Convierte Date a string ISO local (YYYY-MM-DDTHH:MM)
 * SIN desfase UTC, usando zona horaria del navegador/dispositivo.
 * Esto es importante para que el input datetime-local en web muestre
 * la hora correcta sin ajustarla por UTC.
 */
function formatLocalISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Selector de fecha/hora adaptativo.
 * - Web: usa <input type="datetime-local"> visible
 * - iOS: usa el DateTimePicker nativo como modal
 * - Android: NO renderiza nada visible, usa DateTimePickerAndroid.open()
 *   para evitar el bug de desmontaje del componente con el diálogo abierto.
 * 
 * NOTA: En web, el input datetime-local se renderiza absolute dentro
 * de un contenedor con position: relative para que no cubra otros elementos.
 */
function PlatformDateTimePicker({
  value,
  mode,
  onChange,
  minimumDate,
}: {
  value: Date | null;
  mode: 'date' | 'time' | 'datetime';
  onChange: (date: Date) => void;
  minimumDate?: Date;
}) {
  if (Platform.OS === 'web') {
    const valStr = value ? formatLocalISO(value) : '';

    return (
      <input
        type="datetime-local"
        value={valStr}
        min={minimumDate ? formatLocalISO(minimumDate) : undefined}
        onChange={(e) => {
          const newDate = new Date(e.target.value);
          if (!isNaN(newDate.getTime())) onChange(newDate);
        }}
        style={{
          width: '100%',
          padding: '14px',
          border: '1.5px solid #e0e0e0',
          borderRadius: '12px',
          backgroundColor: '#fff',
          fontSize: '14px',
          color: '#333',
          marginBottom: '18px',
          boxSizing: 'border-box',
          cursor: 'pointer',
          outline: 'none',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          lineHeight: 'normal',
        }}
      />
    );
  }

  if (Platform.OS === 'android') {
    return null;
  }

  // iOS: declarativo (funciona bien con mode='datetime')
  return (
    <DateTimePicker
      value={value || new Date()}
      mode={mode === 'datetime' ? 'datetime' : mode}
      display="default"
      minimumDate={minimumDate}
      onChange={(_event, date) => { if (date) onChange(date); }}
    />
  );
}

/**
 * Abre el picker nativo de Android secuencialmente: date → time.
 * Se usa en vez del componente declarativo <DateTimePicker> para evitar
 * el crash "Cannot read property 'dismiss' of undefined" al desmontar.
 */
function openAndroidDateTimePicker(
  currentValue: Date | null,
  minimumDate: Date | undefined,
  onConfirm: (date: Date) => void,
) {
  DateTimePickerAndroid.open({
    value: currentValue || new Date(),
    mode: 'date',
    minimumDate,
    onChange: (_event: any, date?: Date) => {
      if (_event?.type === 'dismissed' || !date) return;
      DateTimePickerAndroid.open({
        value: date,
        mode: 'time',
        is24Hour: true,
        onChange: (_event2: any, timeDate?: Date) => {
          if (_event2?.type === 'dismissed' || !timeDate) return;
          onConfirm(timeDate);
        },
      });
    },
  });
}

export default function CrearSesionScreen() {
  const params = useLocalSearchParams();
  const quizId = params.quizId as string | undefined;
  const [quiz, setQuiz] = useState<QuizCompleto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [isMateriaActiva, setIsMateriaActiva] = useState(true);
  const [tipoPublicacion, setTipoPublicacion] = useState<'inmediato' | 'agendado'>('inmediato');
  const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
  const [fechaFin, setFechaFin] = useState<Date | null>(null);
  const [pickerMode, setPickerMode] = useState<'datetimeInicio' | 'datetimeFin' | null>(null);
  const [asignando, setAsignando] = useState(false);
  const [codigoGenerado, setCodigoGenerado] = useState<string>('');
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  // Resetear fechas y tipo SOLO al montar (una vez), no en cada focus
  useEffect(() => {
    setTipoPublicacion('inmediato');
    setFechaInicio(null);
    setFechaFin(null);
    setPickerMode(null);
  }, []);

  // Cargar quiz al enfocar la pantalla (se re-ejecuta al volver de otra pantalla)
  useFocusEffect(
    useCallback(() => {
      const cargarQuiz = async () => {
        if (!quizId) return;
        try {
          setCargando(true);
          const resultado = await obtenerQuizPorId(quizId);
          setQuiz(resultado);

          const materiaId = resultado.metadatos?.materia_id;
          if (materiaId) {
            try {
              const materiaData = await obtenerMateria(materiaId);
              setIsMateriaActiva(materiaData.mat_activo);
            } catch {
              setIsMateriaActiva(true);
            }
          } else {
            setIsMateriaActiva(true);
          }
        } catch (error) {
          console.error('Error cargando quiz:', error);
          Alert.alert('Error', 'No se pudo cargar el quiz');
        } finally {
          setCargando(false);
        }
      };

      cargarQuiz();
      setCodigoGenerado('');
      setAsignando(false);
    }, [quizId])
  );


  const formatDate = (date: Date | null) => {
    if (!date) return 'Seleccionar fecha';
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatTime = (date: Date | null) => {
    if (!date) return 'Seleccionar hora';
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const handleCrearSesion = async () => {
    setErrorMensaje(null);

    if (!quizId) {
      setErrorMensaje('No se encontró el identificador del quiz.');
      return;
    }
    if (!quiz) {
      setErrorMensaje('El quiz no se ha cargado correctamente. Intenta de nuevo.');
      return;
    }
    const materiaId = quiz.metadatos.materia_id;
    if (!materiaId) {
      setErrorMensaje('El quiz no tiene una materia asignada. Edita el quiz y selecciona una materia.');
      return;
    }
    if (!fechaFin) {
      setErrorMensaje('Selecciona la fecha y hora de fin.');
      return;
    }
    if (tipoPublicacion === 'agendado' && !fechaInicio) {
      setErrorMensaje('Selecciona la fecha y hora de inicio.');
      return;
    }

    const ahora = new Date();
    const inicio = tipoPublicacion === 'inmediato' ? ahora : fechaInicio!;

    if (tipoPublicacion === 'agendado' && inicio <= ahora) {
      setErrorMensaje('La fecha de inicio debe ser posterior a la fecha actual.');
      return;
    }
    if (fechaFin <= inicio) {
      setErrorMensaje('La fecha de fin debe ser posterior a la fecha de inicio. Verifica las horas.');
      return;
    }
    if (tipoPublicacion === 'agendado' && fechaFin <= ahora) {
      setErrorMensaje('La fecha de fin debe ser posterior a la fecha y hora actual.');
      return;
    }

    try {
      setAsignando(true);
      const userJson = await getItem('user');
      const usuario = userJson ? JSON.parse(userJson) : null;
      const profesorId = usuario?.usu_id || 1;

      const sesionData: any = {
        id_quiz_mongo: quizId,
        id_materia: materiaId,
        id_profesor: profesorId,
        modo_juego: quiz.metadatos.modo_juego || 'Igual',
        escala_puntuacion: quiz.metadatos.ponderacion || 100,
        tipo_publicacion: tipoPublicacion,
        fecha_fin: formatLocalISO(fechaFin),
      };
      if (tipoPublicacion === 'agendado') {
        sesionData.fecha_inicio = formatLocalISO(inicio);
      }

      const resultado = await crearSesionAsignada(sesionData);
      setCodigoGenerado(resultado.codigo_para_estudiantes);
      Alert.alert('Sesión creada', `Código de acceso: ${resultado.codigo_para_estudiantes}`);
    } catch (error: any) {
      console.error('Error creando sesión:', error);
      Alert.alert('Error', error.message || 'No se pudo crear la sesión');
    } finally {
      setAsignando(false);
    }
  };

  const handleCompartir = async () => {
    if (!codigoGenerado) return;
    try {
      await Share.share({
        title: 'Código de acceso al quiz',
        message: `Comparte este código con tus estudiantes:\n${codigoGenerado}`,
      });
    } catch (error) {
      console.error('Error compartiendo código:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        showProfile={false}
        profileImage=""
        profileName=""
        profileLastName=""
        onProfilePress={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {cargando ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 60 }} />
        ) : !quiz ? (
          <Text style={styles.errorText}>No se encontró el quiz seleccionado.</Text>
        ) : (
          <View>
            {/* Mini preview card del quiz */}
            <View style={styles.previewCard}>
              {quiz.metadatos.imagen_portada ? (
                <AppImage uri={quiz.metadatos.imagen_portada} style={styles.previewImage} />
              ) : (
                <View style={styles.previewPlaceholder}>
                  <Ionicons name="help-circle-outline" size={36} color="#ccc" />
                </View>
              )}
              <View style={styles.previewInfo}>
                <Text style={styles.quizTitle} numberOfLines={1}>{quiz.metadatos.titulo}</Text>
                <View style={styles.previewChips}>
                  <View style={styles.previewChip}>
                    <Ionicons name="help-circle-outline" size={14} color="#888" />
                    <Text style={styles.previewChipText}>
                      {quiz.preguntas.length} {quiz.preguntas.length === 1 ? 'pregunta' : 'preguntas'}
                    </Text>
                  </View>
                  <View style={styles.previewChip}>
                    <Ionicons
                      name={quiz.metadatos.modo_juego === 'Dificultad' ? 'flame-outline' : 'reorder-two-outline'}
                      size={14}
                      color="#888"
                    />
                    <Text style={styles.previewChipText}>
                      {quiz.metadatos.modo_juego === 'Dificultad' ? 'Dificultad' : 'Igual'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
            <View style={styles.card}>
              {!isMateriaActiva && (
                <View style={styles.warningBanner}>
                  <Ionicons name="alert-circle-outline" size={20} color="#C53030" />
                  <Text style={styles.warningText}>
                    ⚠️ Esta materia está desactivada. No puedes crear nuevas sesiones hasta que el administrador la active.
                  </Text>
                </View>
              )}
              {errorMensaje && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle-outline" size={20} color="#C53030" />
                  <Text style={styles.errorBannerText}>{errorMensaje}</Text>
                </View>
              )}
              <Text style={styles.sectionLabel}>Materia</Text>
              <View style={styles.materiaChip}>
                <Ionicons name="book-outline" size={16} color={Colors.primary} />
                <Text style={styles.materiaChipText}>
                  {quiz.metadatos.tema || 'Sin materia'}
                </Text>
              </View>

              <Text style={styles.sectionLabel}>Tipo de publicación</Text>
              <View style={styles.tipoPublicacionContainer}>
                <TouchableOpacity
                  style={[styles.tipoOption, tipoPublicacion === 'inmediato' && styles.tipoOptionSelected]}
                  onPress={() => { setTipoPublicacion('inmediato'); setErrorMensaje(null); }}
                >
                  <Text style={[styles.tipoOptionText, tipoPublicacion === 'inmediato' && styles.tipoOptionTextSelected]}>
                    Publicar ahora
                  </Text>
                  <Text style={styles.tipoOptionDesc}>
                    Disponible desde este instante hasta la fecha que seleccione
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tipoOption, tipoPublicacion === 'agendado' && styles.tipoOptionSelected]}
                  onPress={() => { setTipoPublicacion('agendado'); setErrorMensaje(null); }}
                >
                  <Text style={[styles.tipoOptionText, tipoPublicacion === 'agendado' && styles.tipoOptionTextSelected]}>
                    Agendar
                  </Text>
                  <Text style={styles.tipoOptionDesc}>
                    Disponible solo en el rango de fechas que seleccione
                  </Text>
                </TouchableOpacity>
              </View>

              {tipoPublicacion === 'agendado' && (
                <>
                  <Text style={styles.sectionLabel}>Inicio</Text>
                  {Platform.OS === 'web' ? (
                    <PlatformDateTimePicker
                      value={fechaInicio}
                      mode="datetime"
                      minimumDate={new Date()}
                      onChange={(date) => { setFechaInicio(date); setErrorMensaje(null); }}
                    />
                  ) : Platform.OS === 'android' ? (
                    <View style={{ position: 'relative' }}>
                      <TouchableOpacity
                        style={styles.dateTimeButton}
                        onPress={() => openAndroidDateTimePicker(fechaInicio, new Date(), (date) => {
                          setFechaInicio(date);
                          setErrorMensaje(null);
                        })}
                      >
                        <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
                        <Text style={styles.dateTimeButtonText}>
                          {fechaInicio ? `${formatDate(fechaInicio)}  ${formatTime(fechaInicio)}` : 'Seleccionar fecha y hora'}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color="#999" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ position: 'relative' }}>
                      <TouchableOpacity style={styles.dateTimeButton} onPress={() => setPickerMode('datetimeInicio')}>
                        <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
                        <Text style={styles.dateTimeButtonText}>
                          {fechaInicio ? `${formatDate(fechaInicio)}  ${formatTime(fechaInicio)}` : 'Seleccionar fecha y hora'}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color="#999" />
                      </TouchableOpacity>
                      {pickerMode === 'datetimeInicio' && (
                        <PlatformDateTimePicker
                          value={fechaInicio}
                          mode="datetime"
                          minimumDate={new Date()}
                          onChange={(date) => {
                            setFechaInicio(date);
                            setPickerMode(null);
                          }}
                        />
                      )}
                    </View>
                  )}
                </>
              )}

              <Text style={styles.sectionLabel}>{tipoPublicacion === 'inmediato' ? 'Disponible hasta' : 'Fin'}</Text>
              {Platform.OS === 'web' ? (
                <PlatformDateTimePicker
                  value={fechaFin}
                  mode="datetime"
                  minimumDate={fechaInicio || new Date()}
                  onChange={(date) => { setFechaFin(date); setErrorMensaje(null); }}
                />
              ) : Platform.OS === 'android' ? (
                <View style={{ position: 'relative' }}>
                  <TouchableOpacity
                    style={styles.dateTimeButton}
                    onPress={() => openAndroidDateTimePicker(fechaFin, fechaInicio || new Date(), (date) => {
                      setFechaFin(date);
                      setErrorMensaje(null);
                    })}
                  >
                    <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
                    <Text style={styles.dateTimeButtonText}>
                      {fechaFin ? `${formatDate(fechaFin)}  ${formatTime(fechaFin)}` : 'Seleccionar fecha y hora'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#999" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ position: 'relative' }}>
                  <TouchableOpacity style={styles.dateTimeButton} onPress={() => setPickerMode('datetimeFin')}>
                    <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
                    <Text style={styles.dateTimeButtonText}>
                      {fechaFin ? `${formatDate(fechaFin)}  ${formatTime(fechaFin)}` : 'Seleccionar fecha y hora'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#999" />
                  </TouchableOpacity>
                  {pickerMode === 'datetimeFin' && (
                    <PlatformDateTimePicker
                      value={fechaFin}
                      mode="datetime"
                      minimumDate={fechaInicio || new Date()}
                      onChange={(date) => {
                        setFechaFin(date);
                        setPickerMode(null);
                      }}
                    />
                  )}
                </View>
              )}

              {codigoGenerado ? (
                <View style={styles.codeContainer}>
                  <View style={styles.codeCelebrationIcon}>
                    <Ionicons name="checkmark-circle" size={48} color={Colors.primary} />
                  </View>
                  <Text style={styles.codeTitle}>Sesión creada</Text>
                  <Text style={styles.codeSubtitle}>Comparte este código con tus estudiantes</Text>
                  <View style={styles.codeValueBox}>
                    <Text style={styles.codeValue}>{codigoGenerado}</Text>
                  </View>
                  <TouchableOpacity style={styles.shareButton} onPress={handleCompartir}>
                    <Ionicons name="share-outline" size={18} color="#fff" />
                    <Text style={styles.shareButtonText}>Compartir código</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            {codigoGenerado ? (
              <TouchableOpacity
                style={styles.irASesionesButton}
                onPress={() => router.push('/profesor/sesiones')}
              >
                <Ionicons name="list-outline" size={20} color="#fff" />
                <Text style={styles.createButtonText}>Ir a Sesiones</Text>
              </TouchableOpacity>
            ) : (
               <TouchableOpacity
                  style={[
                    styles.createButton, 
                    (asignando || !isMateriaActiva || !fechaFin || (tipoPublicacion === 'agendado' && !fechaInicio)) && styles.createButtonDisabled
                  ]}
                  onPress={handleCrearSesion}
                  disabled={asignando || !isMateriaActiva || !fechaFin || (tipoPublicacion === 'agendado' && !fechaInicio)}
               >
                 {asignando ? (
                   <ActivityIndicator color="#fff" />
                 ) : (
                   <View style={styles.createButtonContent}>
                     <Ionicons name="play-circle-outline" size={20} color="#fff" />
                     <Text style={styles.createButtonText}>
                       {!isMateriaActiva ? "Materia Inactiva" : "Crear sesión"}
                     </Text>
                   </View>
                 )}
               </TouchableOpacity>
            )}
          </View>
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
    paddingBottom: 80,
  },
  errorText: {
    color: Colors.danger,
    textAlign: 'center',
    marginTop: 40,
  },

  // ── Preview card ──
  previewCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  previewImage: {
    width: '100%',
    height: 100,
    resizeMode: 'cover',
  },
  previewPlaceholder: {
    width: '100%',
    height: 100,
    backgroundColor: '#e8e8e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewInfo: {
    padding: 14,
  },
  quizTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  previewChips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  previewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f5f5f5',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  previewChipText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },

  // ── Card principal ──
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },

  // ── Chip de materia (compacto) ──
  materiaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0f7ff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 18,
    alignSelf: 'flex-start',
  },
  materiaChipText: {
    color: '#444',
    fontSize: 14,
    fontWeight: '500',
  },

  // ── Tipo de publicación ──
  tipoPublicacionContainer: {
    gap: 10,
    marginBottom: 18,
  },
  tipoOption: {
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#fff',
  },
  tipoOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}08`,
  },
  tipoOptionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  tipoOptionTextSelected: {
    color: Colors.primary,
  },
  tipoOptionDesc: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },

  // ── Selector fecha+hora combinado ──
  dateTimeButton: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    backgroundColor: '#fff',
    marginBottom: 18,
  },
  dateTimeButtonText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },

  // ── Botón crear sesión ──
  createButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  irASesionesButton: {
    backgroundColor: Colors.secondary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  createButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  warningBanner: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FF3B30',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  warningText: {
    color: '#C53030',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  errorBanner: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FF3B30',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorBannerText: {
    color: '#C53030',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },

  // ── Código generado ──
  codeContainer: {
    marginTop: 20,
    padding: 24,
    backgroundColor: '#f0faf0',
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
  },
  codeCelebrationIcon: {
    marginBottom: 8,
  },
  codeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  codeSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
    textAlign: 'center',
  },
  codeValueBox: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  codeValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 6,
    color: '#333',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.secondary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  shareButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
