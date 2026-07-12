// Pantalla para que el usuario configure sus 3 preguntas de seguridad.
// Se accede desde el perfil del profesor o desde la gestión de usuarios.
// Las preguntas se usan después para recuperar la contraseña.
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Modal, FlatList } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { obtenerPreguntasSeguridad, configurarPreguntasSeguridad } from '@/utils/api';

export default function ConfigurarPreguntasScreen() {
  const [preguntasDisponibles, setPreguntasDisponibles] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [pregunta1, setPregunta1] = useState<number | null>(null);
  const [pregunta2, setPregunta2] = useState<number | null>(null);
  const [pregunta3, setPregunta3] = useState<number | null>(null);
  const [respuesta1, setRespuesta1] = useState('');
  const [respuesta2, setRespuesta2] = useState('');
  const [respuesta3, setRespuesta3] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [selectorActivo, setSelectorActivo] = useState<number>(0);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  useEffect(() => { cargarPreguntas(); }, []);

  const cargarPreguntas = async () => {
    try {
      setErrorCarga(null);
      const data = await obtenerPreguntasSeguridad();
      setPreguntasDisponibles(data);
    } catch (error) {
      setErrorCarga('No se pudieron cargar las preguntas');
    } finally {
      setCargando(false);
    }
  };

  const seleccionarPregunta = (id: number) => {
    if (selectorActivo === 1) setPregunta1(id);
    else if (selectorActivo === 2) setPregunta2(id);
    else if (selectorActivo === 3) setPregunta3(id);
    setModalVisible(false);
  };

  const [exito, setExito] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGuardar = async () => {
    setErrorMsg(null);
    if (!pregunta1 || !pregunta2 || !pregunta3) {
      setErrorMsg('Debes seleccionar 3 preguntas');
      return;
    }
    if (pregunta1 === pregunta2 || pregunta1 === pregunta3 || pregunta2 === pregunta3) {
      setErrorMsg('Las 3 preguntas deben ser diferentes');
      return;
    }
    if (!respuesta1.trim() || !respuesta2.trim() || !respuesta3.trim()) {
      setErrorMsg('Debes responder todas las preguntas');
      return;
    }

    setGuardando(true);
    try {
      await configurarPreguntasSeguridad([
        { pregunta_id: pregunta1, respuesta: respuesta1.trim() },
        { pregunta_id: pregunta2, respuesta: respuesta2.trim() },
        { pregunta_id: pregunta3, respuesta: respuesta3.trim() },
      ]);
      setExito(true);
    } catch (error: any) {
      setErrorMsg(error.message || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  const getTextoPregunta = (id: number | null) => {
    if (!id) return 'Seleccionar pregunta...';
    const p = preguntasDisponibles.find((q: any) => q.id === id);
    return p ? p.pregunta : 'Seleccionar pregunta...';
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.modalItem, (
        (selectorActivo === 1 && pregunta1 === item.id) ||
        (selectorActivo === 2 && pregunta2 === item.id) ||
        (selectorActivo === 3 && pregunta3 === item.id)
      ) && styles.modalItemSelected]}
      onPress={() => seleccionarPregunta(item.id)}
    >
      <Text style={[styles.modalItemText, (
        (selectorActivo === 1 && pregunta1 === item.id) ||
        (selectorActivo === 2 && pregunta2 === item.id) ||
        (selectorActivo === 3 && pregunta3 === item.id)
      ) && styles.modalItemSelectedText]}>
        {item.pregunta}
      </Text>
      {(selectorActivo === 1 && pregunta1 === item.id) ||
       (selectorActivo === 2 && pregunta2 === item.id) ||
       (selectorActivo === 3 && pregunta3 === item.id) ? (
        <Ionicons name="checkmark" size={18} color={Colors.primary} />
      ) : null}
    </TouchableOpacity>
  );

  const renderPregunta = (num: number, preguntaActual: number | null, respuesta: string, setRespuesta: (t: string) => void) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{num}</Text>
        </View>
        <Text style={styles.cardLabel}>Pregunta de seguridad</Text>
      </View>

      <TouchableOpacity
        style={styles.dropdown}
        onPress={() => { setSelectorActivo(num); setModalVisible(true); }}
      >
        <Text style={[styles.dropdownText, !preguntaActual && styles.dropdownPlaceholder]}>
          {getTextoPregunta(preguntaActual)}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#999" />
      </TouchableOpacity>

      {preguntaActual && (
        <TextInput
          style={styles.answerInput}
          placeholder="Tu respuesta..."
          value={respuesta}
          onChangeText={(t) => setRespuesta(t)}
          autoCapitalize="none"
        />
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#333" />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Ionicons name="shield-checkmark-outline" size={48} color={Colors.primary} />
          <Text style={styles.title}>Preguntas de Seguridad</Text>
          <Text style={styles.subtitle}>
            Selecciona 3 preguntas y responde cada una. Te servirán para recuperar tu contraseña.
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : errorCarga ? (
          <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 20 }}>
            <Ionicons name="alert-circle-outline" size={48} color="#E53935" />
            <Text style={{ color: '#E53333', fontSize: 16, marginTop: 12, textAlign: 'center' }}>{errorCarga}</Text>
            <TouchableOpacity onPress={cargarPreguntas} style={{ marginTop: 16, backgroundColor: Colors.primary, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {renderPregunta(1, pregunta1, respuesta1, setRespuesta1)}
            {renderPregunta(2, pregunta2, respuesta2, setRespuesta2)}
            {renderPregunta(3, pregunta3, respuesta3, setRespuesta3)}

            {errorMsg ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <Ionicons name="alert-circle" size={20} color="#E53935" style={{ marginRight: 8 }} />
                <Text style={{ color: '#E53935', fontSize: 14, flex: 1 }}>{errorMsg}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.saveButton, guardando && { opacity: 0.6 }]}
              onPress={handleGuardar}
              disabled={guardando}
            >
              {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Guardar Preguntas</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Modal selector de preguntas */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecciona tu pregunta {selectorActivo}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={preguntasDisponibles.filter((item, index, self) => 
                index === self.findIndex((t) => t.id === item.id)
              )}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderItem}
            />
          </View>
        </View>
      </Modal>

      {/* Modal de éxito */}
      <Modal visible={exito} transparent animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.successModal}>
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={64} color="#4CAF50" />
            </View>
            <Text style={styles.successTitle}>¡Guardado!</Text>
            <Text style={styles.successText}>Tus preguntas de seguridad han sido configuradas correctamente.</Text>
            <TouchableOpacity style={styles.successButton} onPress={() => router.back()}>
              <Text style={styles.successButtonText}>Aceptar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  scroll: { paddingBottom: 40, paddingHorizontal: 16 },
  backButton: { position: 'absolute', top: 50, left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  header: { alignItems: 'center', paddingTop: 100, paddingBottom: 24 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#333', marginTop: 12, marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },

  // Cards compactos
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  badge: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  badgeText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  cardLabel: { fontSize: 15, fontWeight: '600', color: '#333' },

  // Dropdown
  dropdown: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, backgroundColor: '#f8f9fa' },
  dropdownText: { fontSize: 14, color: '#333', flex: 1, marginRight: 8 },
  dropdownPlaceholder: { color: '#999' },

  // Input respuesta
  answerInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 15, backgroundColor: '#f8f9fa', marginTop: 12 },

  // Botón guardar
  saveButton: { backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', paddingBottom: 30 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  modalItemSelected: { backgroundColor: Colors.primary + '10' },
  modalItemText: { fontSize: 15, color: '#333', flex: 1 },
  modalItemSelectedText: { color: Colors.primary, fontWeight: '600' },
  successModal: { backgroundColor: '#fff', borderRadius: 20, padding: 32, alignItems: 'center', marginHorizontal: 32, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  successIconContainer: { marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  successText: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  successButton: { backgroundColor: '#4CAF50', paddingVertical: 14, paddingHorizontal: 48, borderRadius: 12 },
  successButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
