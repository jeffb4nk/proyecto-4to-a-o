// Tercer y último paso para recuperar la contraseña.
// El usuario ingresa su nueva contraseña (con validación de seguridad en cliente)
// y la envía al backend junto con el token de recuperación.
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

export default function RecuperarNuevaContrasena() {
  const { tokenReset } = useLocalSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleCambiar = async () => {
    setErrorMsg(null);
    if (!password || password.length < 8) {
      setErrorMsg('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setErrorMsg('La contraseña debe contener al menos una letra mayúscula');
      return;
    }
    if (!/[a-z]/.test(password)) {
      setErrorMsg('La contraseña debe contener al menos una letra minúscula');
      return;
    }
    if (!/[0-9]/.test(password)) {
      setErrorMsg('La contraseña debe contener al menos un número');
      return;
    }
    if (!/[@$!%*?&#._\-]/.test(password)) {
      setErrorMsg('La contraseña debe contener al menos un carácter especial (@$!%*?&#._-)');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden');
      return;
    }

    setCargando(true);
    try {
      const { API_URL } = await import('@/utils/api');
      const response = await fetch(`${API_URL}/auth/recuperar/cambiar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_reset: tokenReset, nueva_password: password })
      });

      if (!response.ok) {
        const err = await response.json();
        setErrorMsg(err.detail || 'No se pudo cambiar la contraseña');
        return;
      }

      setExito(true);
    } catch (error: any) {
      setErrorMsg(error.message || 'Error al cambiar la contraseña');
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
        <Ionicons name="key-outline" size={64} color={Colors.primary} style={{ marginBottom: 20 }} />
        <Text style={styles.title}>Nueva Contraseña</Text>
        <Text style={styles.subtitle}>Ingresa tu nueva contraseña</Text>

        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color="#E53935" style={{ marginRight: 8 }} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Nueva contraseña"
            value={password}
            onChangeText={(t) => { setErrorMsg(null); setPassword(t); }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color="#999"
            />
          </TouchableOpacity>
        </View>

        <View style={styles.passwordRules}>
          <Text style={styles.passwordRulesTitle}>La contraseña debe contener:</Text>
          <View style={styles.ruleRow}>
            <Ionicons
              name={password.length >= 8 ? 'checkmark-circle' : 'ellipse-outline'}
              size={16}
              color={password.length >= 8 ? '#4CAF50' : '#999'}
            />
            <Text style={[styles.ruleText, password.length >= 8 && styles.ruleTextValid]}>
              Al menos 8 caracteres
            </Text>
          </View>
          <View style={styles.ruleRow}>
            <Ionicons
              name={/[A-Z]/.test(password) ? 'checkmark-circle' : 'ellipse-outline'}
              size={16}
              color={/[A-Z]/.test(password) ? '#4CAF50' : '#999'}
            />
            <Text style={[styles.ruleText, /[A-Z]/.test(password) && styles.ruleTextValid]}>
              Una letra mayúscula
            </Text>
          </View>
          <View style={styles.ruleRow}>
            <Ionicons
              name={/[a-z]/.test(password) ? 'checkmark-circle' : 'ellipse-outline'}
              size={16}
              color={/[a-z]/.test(password) ? '#4CAF50' : '#999'}
            />
            <Text style={[styles.ruleText, /[a-z]/.test(password) && styles.ruleTextValid]}>
              Una letra minúscula
            </Text>
          </View>
          <View style={styles.ruleRow}>
            <Ionicons
              name={/[0-9]/.test(password) ? 'checkmark-circle' : 'ellipse-outline'}
              size={16}
              color={/[0-9]/.test(password) ? '#4CAF50' : '#999'}
            />
            <Text style={[styles.ruleText, /[0-9]/.test(password) && styles.ruleTextValid]}>
              Un número
            </Text>
          </View>
          <View style={styles.ruleRow}>
            <Ionicons
              name={/[@$!%*?&#._\-]/.test(password) ? 'checkmark-circle' : 'ellipse-outline'}
              size={16}
              color={/[@$!%*?&#._\-]/.test(password) ? '#4CAF50' : '#999'}
            />
            <Text style={[styles.ruleText, /[@$!%*?&#._\-]/.test(password) && styles.ruleTextValid]}>
              Un carácter especial (@$!%*?&#._-)
            </Text>
          </View>
        </View>

        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Confirmar contraseña"
            value={confirmPassword}
            onChangeText={(t) => { setErrorMsg(null); setConfirmPassword(t); }}
            secureTextEntry={!showConfirmPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            <Ionicons
              name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color="#999"
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, cargando && styles.buttonDisabled]}
          onPress={handleCambiar}
          disabled={cargando}
        >
          {cargando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Cambiar Contraseña</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Modal de éxito */}
      <Modal visible={exito} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Ionicons name="checkmark-circle" size={64} color="#4CAF50" />
            <Text style={styles.modalTitle}>¡Éxito!</Text>
            <Text style={styles.modalText}>Tu contraseña ha sido actualizada correctamente. Ahora puedes iniciar sesión.</Text>
            <TouchableOpacity style={styles.modalButton} onPress={() => router.replace('/login')}>
              <Text style={styles.modalButtonText}>Ir al Login</Text>
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
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
  },
  eyeButton: {
    padding: 16,
  },
  passwordRules: {
    width: '100%',
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  passwordRulesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  ruleText: {
    fontSize: 12,
    color: '#999',
  },
  ruleTextValid: {
    color: '#4CAF50',
    fontWeight: '500',
  },
  button: { width: '100%', backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 20, padding: 32, alignItems: 'center', marginHorizontal: 32, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', marginTop: 12, marginBottom: 8 },
  modalText: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  modalButton: { backgroundColor: '#4CAF50', paddingVertical: 14, paddingHorizontal: 48, borderRadius: 12 },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
