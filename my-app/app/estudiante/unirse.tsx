// El estudiante escribe el codigo de 6 digitos que le dio el profesor y se une
// al quiz. Si la sesion es agendada, descarga el quiz para poder verlo sin internet.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Modal } from 'react-native';
import { router } from 'expo-router';
import { getItem } from '@/utils/storage';
import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { Card, CardContent } from '@/components/Card';
import Colors from '@/constants/colors';
import { Usuario } from '@/types/user';
import { Ionicons } from '@expo/vector-icons';
import { unirseSesion, API_URL, getAuthHeaders, reautenticar } from '@/utils/api';
import { getDeviceId } from '@/utils/dispositivo';
import { programarNotificaciones } from '@/utils/notificaciones';
import { guardarQuizDescargado } from '@/database/quizzesDao';
import { descargarImagenesQuiz } from '@/utils/imagenesOffline';

export default function UnirseSesionScreen() {
  const [codigoAcceso, setCodigoAcceso] = useState('');
  const [unido, setUnido] = useState(false);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modalPendiente, setModalPendiente] = useState(false);
  const [fechaPendiente, setFechaPendiente] = useState('');
  const [descargaOffline, setDescargaOffline] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [descargaCompleta, setDescargaCompleta] = useState(false);
  React.useEffect(() => {
    cargarUsuario();
  }, []);

  const cargarUsuario = async () => {
    try {
      const userJson = await getItem('user');
      if (userJson) {
        setUsuario(JSON.parse(userJson));
      }
    } catch (error) {
      console.error('Error al cargar usuario:', error);
    }
  };

  // Valida el codigo, llama al backend para unirse y si todo sale bien
  // redirige al estudiante al preview del quiz. Si es una sesion agendada,
  // descarga el quiz completo para que funcione sin internet.
  const handleUnirse = async () => {
    setErrorMsg(null);
    if (!codigoAcceso.trim()) {
      setErrorMsg('Por favor ingresa el código de acceso');
      return;
    }

    if (codigoAcceso.length !== 6) {
      setErrorMsg('El código debe tener exactamente 6 dígitos');
      return;
    }

    if (!usuario) {
      setErrorMsg('No hay usuario autenticado');
      return;
    }

    try {
      setCargando(true);
      const deviceId = await getDeviceId();
      const resultado = await unirseSesion(codigoAcceso.toUpperCase(), usuario.usu_id, deviceId);

      // El backend nos dice si la sesion aun no empieza (agendada).
      // En ese caso la descargamos para tenerla lista cuando llegue la hora.
      if (resultado.status === 'pendiente') {
        setDescargando(true);
        setDescargaCompleta(false);
        setDescargaOffline(false);
        try {
          const headers = await getAuthHeaders();
          let response = await fetch(`${API_URL}/sesiones/descarga-offline`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...headers,
            },
            body: JSON.stringify({ codigo_acceso: codigoAcceso.toUpperCase() }),
          });

          // Si el token falló, reintentar con token nuevo
          if (response.status === 401) {
            const renovado = await reautenticar();
            if (renovado) {
              const newHeaders = await getAuthHeaders();
              response = await fetch(`${API_URL}/sesiones/descarga-offline`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...newHeaders,
                },
                body: JSON.stringify({ codigo_acceso: codigoAcceso.toUpperCase() }),
              });
            }
          }

            if (response.ok) {
            const quizData = await response.json();

            // Las imagenes del quiz se guardan localmente para que se vean sin conexion
            const quizObj = JSON.parse(JSON.stringify(quizData.quiz_completo));
            const quizConImagenes = await descargarImagenesQuiz(quizObj, quizData.sesion_id);

            await guardarQuizDescargado({
              sesion_id: quizData.sesion_id,
              quiz_id: quizData.quiz_id,
              codigo_acceso: codigoAcceso.toUpperCase(),
              quiz_json: JSON.stringify(quizConImagenes),
              titulo: quizData.titulo,
              materia_nombre: quizData.materia_nombre || null,
              modo_juego: quizData.modo_juego,
              escala_puntuacion: quizData.escala_puntuacion,
              fecha_inicio: quizData.fecha_inicio,
              fecha_fin: quizData.fecha_fin,
              total_preguntas: quizData.total_preguntas,
              token_descarga: quizData.token_descarga,
              descargado_en: quizData.descargado_en,
              estado: 'pendiente',
              sincronizado_en: null,
            });
            setDescargaCompleta(true);
          } else {
            // Si falla la descarga, igual se puede unir - la descarga no es crítica
            setDescargaOffline(true);
          }
        } catch (downloadError) {
        } finally {
          setDescargando(false);
        }

        // Agendamos un recordatorio local para el dia del quiz
        programarNotificaciones(
          resultado.sesion_id,
          'Sesión agendada',
          new Date(resultado.fecha_inicio)
        );
        setFechaPendiente(new Date(resultado.fecha_inicio).toLocaleString('es-ES', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        }));
        setModalPendiente(true);
        return;
      }

      // Guardamos el quiz localmente por si el estudiante pierde conexion despues
      // Solo descargamos si es primera vez; si ya completo, no sobrescribimos
      let descargaExitosa = false;
      if (!resultado.ya_completado) {
        try {
          const headers = await getAuthHeaders();
          let downloadResponse = await fetch(`${API_URL}/sesiones/descarga-offline`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...headers,
            },
            body: JSON.stringify({ codigo_acceso: codigoAcceso.toUpperCase() }),
          });

          // Si el token falló, reintentar con token nuevo
          if (downloadResponse.status === 401) {
            const renovado = await reautenticar();
            if (renovado) {
              const newHeaders = await getAuthHeaders();
              downloadResponse = await fetch(`${API_URL}/sesiones/descarga-offline`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...newHeaders,
                },
                body: JSON.stringify({ codigo_acceso: codigoAcceso.toUpperCase() }),
              });
            }
          }

          if (downloadResponse.ok) {
            const quizData = await downloadResponse.json();

            const quizObj = JSON.parse(JSON.stringify(quizData.quiz_completo));
            const quizConImagenes = await descargarImagenesQuiz(quizObj, quizData.sesion_id);

            await guardarQuizDescargado({
              sesion_id: quizData.sesion_id,
              quiz_id: quizData.quiz_id,
              codigo_acceso: codigoAcceso.toUpperCase(),
              quiz_json: JSON.stringify(quizConImagenes),
              titulo: quizData.titulo,
              materia_nombre: quizData.materia_nombre || null,
              modo_juego: quizData.modo_juego,
              escala_puntuacion: quizData.escala_puntuacion,
              fecha_inicio: quizData.fecha_inicio,
              fecha_fin: quizData.fecha_fin,
              total_preguntas: quizData.total_preguntas,
              token_descarga: quizData.token_descarga,
              descargado_en: quizData.descargado_en,
              estado: 'pendiente',
              sincronizado_en: null,
            });
            descargaExitosa = true;
          }
        } catch (e) {
        }
      }

      // Redirigir directamente al quiz
      const quizMinimo = {
        _id: resultado.quiz._id,
        titulo: resultado.quiz.metadatos?.titulo || 'Quiz',
        tema: resultado.quiz.metadatos?.tema || 'General',
        portada: resultado.quiz.metadatos?.imagen_portada || null,
        preguntas: resultado.quiz.preguntas.map((p: any) => ({
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
      
      router.push({
        pathname: '/estudiante/quiz/[id]',
        params: { 
          id: resultado.quiz_id,
          sesionId: resultado.sesion_id.toString(),
          modoJuego: resultado.modo_juego,
          escalaPuntuacion: resultado.escala_puntuacion,
          quizData: JSON.stringify(quizMinimo),
          yaCompletado: resultado.ya_completado ? 'true' : 'false',
          notaAnterior: resultado.resultado?.nota_final ?? '',
        },
      } as any);
      
      setUnido(true);
    } catch (error: any) {
      setErrorMsg(error.message || 'No se pudo unir a la sesión');
    } finally {
      setCargando(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header
        showProfile={true}
        profileImage={usuario?.usu_imagen}
        profileName={usuario?.usu_nombre}
        profileLastName={usuario?.usu_apellido}
        onProfilePress={() => router.push('/estudiante/perfil' as any)}
      />

      <SectionTitle title="Unirse a Quiz" />

      <View style={styles.content}>
        <Card style={styles.card}>
          <CardContent>
            <View style={styles.iconContainer}>
              <Ionicons name="qr-code-outline" size={64} color={Colors.primary} />
            </View>
            
            <Text style={styles.title}>Ingresa el código de acceso</Text>
            <Text style={styles.subtitle}>
              Tu profesor te proporcionará un código de 6 números para unirte al quiz
            </Text>

              <TextInput
                style={[styles.input, errorMsg && { borderColor: '#E53935' }]}
                placeholder="123456"
                value={codigoAcceso}
                 onChangeText={(text) => {
                   setCodigoAcceso(text.replace(/[^0-9]/g, ''));
                   setErrorMsg(null);
                 }}
                placeholderTextColor="#999"
                keyboardType="numeric"
                maxLength={6}
                textAlign="center"
              />

             {errorMsg && (
               <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', borderRadius: 10, padding: 12, marginBottom: 16 }}>
                 <Ionicons name="alert-circle" size={20} color="#E53935" style={{ marginRight: 8 }} />
                 <Text style={styles.errorText}>{errorMsg}</Text>
               </View>
             )}

            <TouchableOpacity
              style={[styles.button, (!codigoAcceso || cargando) && styles.buttonDisabled]}
              onPress={handleUnirse}
              disabled={!codigoAcceso || cargando}
            >
              {cargando ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Unirse al Quiz</Text>
              )}
            </TouchableOpacity>

            <View style={styles.infoContainer}>
              <View style={styles.infoItem}>
                <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
                <Text style={styles.infoText}>
                  El código contiene solo números
                </Text>
              </View>
              <View style={styles.infoItem}>
                <Ionicons name="time-outline" size={20} color={Colors.secondary} />
                <Text style={styles.infoText}>
                  Asegúrate de unirte antes de la fecha límite
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.primary} />
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>

      {/* Modal de descarga */}
      <Modal
        visible={modalPendiente}
        transparent
        animationType="fade"
        onRequestClose={() => { setModalPendiente(false); router.replace('/estudiante'); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {descargando && (
              <>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.modalTitle}>Descargando quiz...</Text>
                <Text style={styles.modalText}>Guardando recursos para modo offline</Text>
              </>
            )}
            {descargaCompleta && (
              <>
                <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
                <Text style={styles.modalTitle}>¡Guardado correctamente!</Text>
                <Text style={styles.modalText}>El quiz está listo para presentar sin conexión.</Text>
                <View style={styles.modalDateRow}>
                  <Ionicons name="calendar-outline" size={16} color={Colors.info} />
                  <Text style={styles.modalDate}>{fechaPendiente}</Text>
                </View>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => { setModalPendiente(false); router.replace('/estudiante'); }}
                >
                  <Text style={styles.modalButtonText}>Entendido</Text>
                </TouchableOpacity>
              </>
            )}
            {!descargando && !descargaCompleta && (
              <>
                <Ionicons name="warning-outline" size={48} color="#F59E0B" />
                <Text style={styles.modalTitle}>Sesión agendada</Text>
                <Text style={styles.modalText}>Te has registrado correctamente</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8E1', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12 }}>
                  <Ionicons name="warning-outline" size={18} color="#F59E0B" style={{ marginRight: 6 }} />
                  <Text style={{ color: '#92400E', fontSize: 13, fontWeight: '500', flex: 1 }}>
                    No se pudo descargar para modo offline. Necesitarás conexión para presentar este quiz.
                  </Text>
                </View>
                <View style={styles.modalDateRow}>
                  <Ionicons name="calendar-outline" size={16} color={Colors.info} />
                  <Text style={styles.modalDate}>{fechaPendiente}</Text>
                </View>
                <Text style={styles.modalTextSmall}>
                  Recibirás un recordatorio antes de que comience
                </Text>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => { setModalPendiente(false); router.replace('/estudiante'); }}
                >
                  <Text style={styles.modalButtonText}>Entendido</Text>
                </TouchableOpacity>
              </>
            )}
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
  content: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  card: {
    marginBottom: 16,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
    input: {
      backgroundColor: '#fff',
      borderWidth: 2,
      borderColor: '#e0e0e0',
      borderRadius: 12,
      paddingVertical: 16,
      fontSize: 24,
      fontWeight: 'bold',
      color: '#333',
      letterSpacing: 4,
      marginBottom: 24,
      textAlignVertical: 'center',
      textAlign: 'center',
    },
   errorText: {
     color: '#E53935',
     fontSize: 14,
     flex: 1,
   },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoContainer: {
    gap: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    marginLeft: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  backButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: Colors.primary,
    fontWeight: '600',
  },

  // ── Modal Pendientes ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '85%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0f7ff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  modalDate: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.info,
  },
  modalTextSmall: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
