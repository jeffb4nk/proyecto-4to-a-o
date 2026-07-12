// Primer paso para recuperar la contraseña.
// El usuario ingresa su email y el backend verifica si existe
// y si tiene preguntas de seguridad configuradas.
// Si todo está bien, redirige a la pantalla de preguntas.
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

export default function RecuperarIndex() {
  const [email, setEmail] = useState('');
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [avisoModal, setAvisoModal] = useState(false);

  const handleBuscar = async () => {
    setErrorMsg(null);
    if (!email.trim()) {
      setErrorMsg('Ingresa tu correo electrónico');
      return;
    }

    setCargando(true);
    try {
      const { API_URL } = await import('@/utils/api');
      const response = await fetch(`${API_URL}/auth/recuperar/solicitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });
      const data = await response.json();

      if (data.preguntas && data.preguntas.length > 0) {
        router.push({
          pathname: '/auth/recuperar/preguntas',
          params: {
            usuarioId: String(data.usuario_id),
            preguntas: JSON.stringify(data.preguntas)
          }
        });
      } else {
        setAvisoModal(true);
      }
    } catch (error: any) {
      setErrorMsg(error.message || 'Error al conectar con el servidor');
    } finally {
      setCargando(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#333" />
      </TouchableOpacity>

      <View style={styles.content}>
        <Ionicons name="lock-closed-outline" size={64} color={Colors.primary} style={{ marginBottom: 20 }} />
        <Text style={styles.title}>Recuperar Contraseña</Text>
        <Text style={styles.subtitle}>Ingresa tu correo electrónico para verificar tu identidad</Text>

        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color="#E53935" style={{ marginRight: 8 }} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          value={email}
          onChangeText={(t) => { setErrorMsg(null); setEmail(t); }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={[styles.button, cargando && styles.buttonDisabled]}
          onPress={handleBuscar}
          disabled={cargando}
        >
          {cargando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Continuar</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Modal aviso */}
      <Modal visible={avisoModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Ionicons name="information-circle" size={48} color={Colors.primary} />
            <Text style={styles.modalTitle}>Aviso</Text>
            <Text style={styles.modalText}>Si el correo existe y tiene preguntas de seguridad configuradas, recibirás instrucciones.</Text>
            <TouchableOpacity style={styles.modalButton} onPress={() => setAvisoModal(false)}>
              <Text style={styles.modalButtonText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  backButton: { position: 'absolute', top: 50, left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', borderRadius: 10, padding: 12, marginBottom: 16, width: '100%' },
  errorText: { color: '#E53935', fontSize: 14, flex: 1 },
  input: { width: '100%', backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 16 },
  button: { width: '100%', backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 20, padding: 32, alignItems: 'center', marginHorizontal: 32, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginTop: 12, marginBottom: 8 },
  modalText: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  modalButton: { backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 10 },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
