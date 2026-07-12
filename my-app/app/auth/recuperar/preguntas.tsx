// Segundo paso para recuperar la contraseña.
// El usuario responde las 3 preguntas de seguridad que configuró al registrarse.
// Si las respuestas son correctas, recibe un token para cambiar la contraseña.
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

export default function RecuperarPreguntas() {
  const params = useLocalSearchParams();
  const usuarioId = Number(params.usuarioId);
  const preguntas = JSON.parse(params.preguntas as string || '[]');

  const [respuestas, setRespuestas] = useState<Record<number, string>>({});
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleResponder = (preguntaId: number, texto: string) => {
    setErrorMsg(null);
    setRespuestas(prev => ({ ...prev, [preguntaId]: texto }));
  };

  const handleVerificar = async () => {
    setErrorMsg(null);
    for (const p of preguntas) {
      if (!respuestas[p.id]?.trim()) {
        setErrorMsg('Responde todas las preguntas');
        return;
      }
    }

    setCargando(true);
    try {
      const { API_URL } = await import('@/utils/api');
      const respuestasArray = preguntas.map((p: any) => ({
        pregunta_id: p.id,
        respuesta: respuestas[p.id]?.trim() || ''
      }));

      const response = await fetch(`${API_URL}/auth/recuperar/verificar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: usuarioId, respuestas: respuestasArray })
      });

      if (!response.ok) {
        const err = await response.json();
        setErrorMsg(err.detail || 'Respuestas incorrectas');
        return;
      }

      const data = await response.json();
      router.push({
        pathname: '/auth/recuperar/nueva-contrasena',
        params: { tokenReset: data.token_reset }
      });
    } catch (error: any) {
      setErrorMsg(error.message || 'Error al verificar respuestas');
    } finally {
      setCargando(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#333" />
      </TouchableOpacity>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Ionicons name="shield-checkmark-outline" size={64} color={Colors.primary} style={{ marginBottom: 20 }} />
        <Text style={styles.title}>Verifica tu Identidad</Text>
        <Text style={styles.subtitle}>Responde las siguientes preguntas de seguridad</Text>

        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color="#E53935" style={{ marginRight: 8 }} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        {preguntas.map((p: any, idx: number) => (
          <View key={p.id} style={styles.questionCard}>
            <View style={styles.questionNumber}>
              <Text style={styles.questionNumberText}>{idx + 1}</Text>
            </View>
            <Text style={styles.questionText}>{p.pregunta}</Text>
            <TextInput
              style={styles.input}
              placeholder="Tu respuesta..."
              value={respuestas[p.id] || ''}
              onChangeText={(t) => handleResponder(p.id, t)}
              autoCapitalize="none"
            />
          </View>
        ))}

        <TouchableOpacity
          style={[styles.button, cargando && styles.buttonDisabled]}
          onPress={handleVerificar}
          disabled={cargando}
        >
          {cargando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Verificar Respuestas</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  backButton: { position: 'absolute', top: 50, left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  scroll: { flex: 1 },
  content: { paddingTop: 100, paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', borderRadius: 10, padding: 12, marginBottom: 16, width: '100%' },
  errorText: { color: '#E53935', fontSize: 14, flex: 1 },
  questionCard: { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  questionNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  questionNumberText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  questionText: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12 },
  input: { width: '100%', backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 15 },
  button: { width: '100%', backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
