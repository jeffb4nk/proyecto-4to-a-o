// Pantalla de inicio de sesión y registro.
// Tiene dos modos: login (estudiante, profesor o admin) y registro (estudiante o profesor).
// El registro tiene dos pasos: primero datos personales + contraseña, luego preguntas de seguridad.
// Valida contraseña segura en cliente antes de enviar al backend.
import { StyleSheet, View, Text, TextInput, TouchableOpacity, Image, KeyboardAvoidingView, Keyboard, Platform, ScrollView, ActivityIndicator, Modal, FlatList } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { setItem } from '@/utils/storage';
import { login, register } from '@/utils/api';
import { getInitials, pickImage } from '@/utils';
import Colors from '@/constants/colors';
import { useUser } from '@/contexts/UserContext';

export default function LoginScreen() {
  const { cargarUsuario } = useUser();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [loginRole, setLoginRole] = useState<'estudiante' | 'profesor' | 'admin'>('estudiante');
  const [registerRole, setRegisterRole] = useState<'estudiante' | 'profesor'>('estudiante');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [registroPaso, setRegistroPaso] = useState(1);
  const [preguntasDisponibles, setPreguntasDisponibles] = useState<any[]>([]);
  const [pregunta1, setPregunta1] = useState<number | null>(null);
  const [pregunta2, setPregunta2] = useState<number | null>(null);
  const [pregunta3, setPregunta3] = useState<number | null>(null);
  const [respuesta1, setRespuesta1] = useState('');
  const [respuesta2, setRespuesta2] = useState('');
  const [respuesta3, setRespuesta3] = useState('');
  const [cargandoPreguntas, setCargandoPreguntas] = useState(false);
  const [modalSelectorVisible, setModalSelectorVisible] = useState(false);
  const [selectorActivo, setSelectorActivo] = useState<number>(0);
  const [cargando, setCargando] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Abre la galería del dispositivo para seleccionar foto de perfil.
  // La imagen se convierte a base64 y se envía al backend al registrarse.
  const handlePickImage = async () => {
    const image = await pickImage();
    if (image) setProfileImage(image);
  };

  // Trae del backend la lista de preguntas de seguridad disponibles.
  // Se llama al pasar al paso 2 del registro.
  const cargarPreguntas = async () => {
    setCargandoPreguntas(true);
    try {
      const { API_URL } = await import('@/utils/api');
      const response = await fetch(`${API_URL}/auth/preguntas-seguridad`);
      const data = await response.json();
      setPreguntasDisponibles(data);
    } catch (error) {
      console.error('Error cargando preguntas:', error);
    } finally {
      setCargandoPreguntas(false);
    }
  };

  const seleccionarPregunta = (id: number) => {
    if (selectorActivo === 1) setPregunta1(id);
    else if (selectorActivo === 2) setPregunta2(id);
    else if (selectorActivo === 3) setPregunta3(id);
    setModalSelectorVisible(false);
  };

  // Maneja tanto el login como el registro en dos pasos.
  // En registro paso 1: valida datos y avanza a preguntas de seguridad.
  // En registro paso 2: valida preguntas y envía todo al backend.
  // En login: valida credenciales según el rol seleccionado y redirige.
  const handleSubmit = async () => {
    if (cargando) return;
    setErrorMsg(null);
    
    if (isRegister) {
      // Si estamos en paso 1, validar y avanzar al paso 2
      if (registroPaso === 1) {
        if (!name.trim() || !lastName.trim() || !email.trim() || !password) {
          setErrorMsg('Por favor completa todos los campos');
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          setErrorMsg('Ingresa un correo electrónico válido');
          return;
        }
        if (password !== confirmPassword) {
          setErrorMsg('Las contraseñas no coinciden');
          return;
        }
        // Validar contraseña segura
        if (password.length < 8) {
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
        // Todo bien, avanzar al paso 2
        setErrorMsg(null);
        setRegistroPaso(2);
        cargarPreguntas();
        return;
      }
      
      // Paso 2: Validar preguntas de seguridad
      if (!pregunta1 || !pregunta2 || !pregunta3) {
        setErrorMsg('Debes seleccionar 3 preguntas de seguridad');
        return;
      }
      if (pregunta1 === pregunta2 || pregunta1 === pregunta3 || pregunta2 === pregunta3) {
        setErrorMsg('Las 3 preguntas deben ser diferentes');
        return;
      }
      if (!respuesta1.trim() || !respuesta2.trim() || !respuesta3.trim()) {
        setErrorMsg('Debes responder todas las preguntas seleccionadas');
        return;
      }

      setCargando(true);
      try {
        const preguntasArray = [
          { pregunta_id: pregunta1, respuesta: respuesta1.trim() },
          { pregunta_id: pregunta2, respuesta: respuesta2.trim() },
          { pregunta_id: pregunta3, respuesta: respuesta3.trim() },
        ];

        const data = await register({
          nombre: name,
          apellido: lastName,
          email: email.trim(),
          password: password,
          tipo: registerRole,
          imagen: profileImage || undefined,
          preguntas_seguridad: preguntasArray,
        });

        await setItem('token', data.token_acceso);
        await setItem(
          'user',
          JSON.stringify({ usu_id: data.usuario.usu_id, rol_nombre: data.usuario.rol_nombre })
        );

        await cargarUsuario();
        router.replace(registerRole === 'profesor' ? '/profesor' as any : '/estudiante' as any);
      } catch (error: any) {
        setErrorMsg(error.message || 'Error en el registro');
      } finally {
        setCargando(false);
      }
    } else {
      if (!email.trim() || !password) {
        setErrorMsg('Por favor ingresa tu email y contraseña');
        return;
      }
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setErrorMsg('Ingresa un correo electrónico válido');
        return;
      }
      setCargando(true);
      try {
        const data = await login(email.trim(), password, loginRole);

        if (loginRole === 'profesor' && data.usuario.usu_fk_rol !== 2) {
          throw new Error('Las credenciales no corresponden a un profesor');
        }

        if (loginRole === 'admin' && data.usuario.usu_fk_rol !== 3) {
          throw new Error('Las credenciales no corresponden a un administrador');
        }

        if (loginRole === 'estudiante' && data.usuario.usu_fk_rol !== 1) {
          throw new Error('Las credenciales no corresponden a un estudiante');
        }

        await setItem('token', data.token_acceso);
        await setItem(
          'user',
          JSON.stringify({ usu_id: data.usuario.usu_id, rol_nombre: data.usuario.rol_nombre })
        );

        await cargarUsuario();

        if (data.usuario.usu_fk_rol === 3) {
          router.replace('/admin' as any);
        } else if (data.usuario.usu_fk_rol === 2) {
          router.replace('/profesor' as any);
        } else {
          router.replace('/estudiante' as any);
        }
      } catch (error: any) {
        setErrorMsg(error.message || 'Error al iniciar sesión');
      } finally {
        setCargando(false);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 20}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.innerContainer}>
          {isRegister && (
            <TouchableOpacity style={styles.profileImageContainer} onPress={handlePickImage}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.profileImage} />
              ) : (
                <View style={styles.profileInitials}>
                  <Text style={styles.profileInitialsText}>{getInitials(name, lastName)}</Text>
                </View>
              )}
              <View style={styles.cameraIcon}>
                <Text style={styles.cameraIconText}>📷</Text>
              </View>
            </TouchableOpacity>
          )}

          {!isRegister && (
            <View style={styles.profileIcon}>
              <Text style={styles.profileIconText}>👤</Text>
            </View>
          )}

          <View style={styles.titleContainer}>
            <Text style={styles.title}>{isRegister ? 'Crear Cuenta' : 'Iniciar Sesión'}</Text>
          </View>

          <View style={styles.roleSection}>
            <Text style={styles.roleLabel}>Selecciona tu rol</Text>
            <View style={styles.roleRow}>
              {(isRegister ? ['estudiante', 'profesor'] : ['estudiante', 'profesor', 'admin']).map((role) => (
                <TouchableOpacity
                  key={role}
                  onPress={() => {
                    setErrorMsg(null);
                    isRegister
                      ? setRegisterRole(role as 'estudiante' | 'profesor')
                      : setLoginRole(role as 'estudiante' | 'profesor' | 'admin');
                  }}
                  style={[styles.roleButton, (isRegister ? registerRole : loginRole) === role && styles.roleButtonSelected]}
                >
                  <Text
                    style={[
                      styles.roleButtonText,
                      (isRegister ? registerRole : loginRole) === role && styles.roleButtonTextSelected,
                    ]}
                  >
                    {role === 'estudiante' ? 'Estudiante' : role === 'profesor' ? 'Profesor' : 'Administrador'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.roleHint}>
              {isRegister
                ? 'Registra solo como estudiante o profesor.'
                : 'El administrador debe iniciar sesión con credenciales maestras.'}
            </Text>
          </View>

          <View style={styles.formContainer}>
            {isRegister && registroPaso === 1 && (
              <>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={(text) => { setName(text); setErrorMsg(null); }}
                  placeholder="Nombre"
                  autoCapitalize="words"
                />
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={(text) => { setLastName(text); setErrorMsg(null); }}
                  placeholder="Apellido"
                  autoCapitalize="words"
                />
              </>
            )}

            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(text) => { setEmail(text); setErrorMsg(null); }}
              placeholder="Email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={(text) => { setPassword(text); setErrorMsg(null); }}
                placeholder="Contraseña"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
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

            {isRegister && registroPaso === 1 && (
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
            )}

            {isRegister && registroPaso === 1 && (
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={confirmPassword}
                  onChangeText={(text) => { setConfirmPassword(text); setErrorMsg(null); }}
                  placeholder="Confirmar Contraseña"
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
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
            )}

            {isRegister && registroPaso === 2 && (
              <>
                <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 16 }} />
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 4 }}>
                  Preguntas de Seguridad
                </Text>
                <Text style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                  Selecciona 3 preguntas y responde cada una para poder recuperar tu contraseña.
                </Text>
                
                {cargandoPreguntas ? (
                  <ActivityIndicator size="large" color="#4CAF50" style={{ marginVertical: 20 }} />
                ) : (
                  <>
                    {[
                      { num: 1, pregunta: pregunta1, setPregunta: setPregunta1, respuesta: respuesta1, setRespuesta: setRespuesta1 },
                      { num: 2, pregunta: pregunta2, setPregunta: setPregunta2, respuesta: respuesta2, setRespuesta: setRespuesta2 },
                      { num: 3, pregunta: pregunta3, setPregunta: setPregunta3, respuesta: respuesta3, setRespuesta: setRespuesta3 },
                    ].map(({ num, pregunta, setPregunta, respuesta, setRespuesta }) => (
                      <View key={num} style={{ marginBottom: 14 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center', marginRight: 8 }}>
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>{num}</Text>
                          </View>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: '#555' }}>Pregunta {num}</Text>
                        </View>

                        <TouchableOpacity
                          style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, backgroundColor: '#f8f9fa', marginBottom: 8 }}
                          onPress={() => { setSelectorActivo(num); setModalSelectorVisible(true); }}
                        >
                          <Text style={{ fontSize: 14, color: pregunta ? '#333' : '#999', flex: 1 }} numberOfLines={1}>
                            {pregunta ? preguntasDisponibles.find((p: any) => p.id === pregunta)?.pregunta : 'Seleccionar pregunta...'}
                          </Text>
                          <Ionicons name="chevron-down" size={16} color="#999" />
                        </TouchableOpacity>

                        <TextInput
                          style={styles.input}
                          placeholder="Tu respuesta..."
                          value={respuesta}
                          onChangeText={(text) => { setErrorMsg(null); setRespuesta(text); }}
                          autoCapitalize="none"
                        />
                      </View>
                    ))}
                  </>
                )}

                <TouchableOpacity
                  style={[styles.button, { backgroundColor: '#666', marginTop: 8 }]}
                  onPress={() => setRegistroPaso(1)}
                >
                  <Text style={styles.buttonText}>← Volver</Text>
                </TouchableOpacity>
              </>
            )}

            {errorMsg ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.button, cargando && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={cargando}
            >
              {cargando ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>
                  {isRegister ? (registroPaso === 1 ? 'Siguiente' : 'Registrarse') : 'Iniciar Sesión'}
                </Text>
              )}
            </TouchableOpacity>

          {/* Link de recuperación */}
          {!isRegister && (
            <TouchableOpacity
              style={{ marginTop: 8, marginBottom: 12, alignSelf: 'center' }}
              onPress={() => router.push('/auth/recuperar' as any)}
            >
              <Text style={{ color: Colors.primary, fontSize: 14, fontWeight: '500' }}>
                ¿Olvidaste tu contraseña?
              </Text>
            </TouchableOpacity>
          )}
          </View>

          <TouchableOpacity style={styles.switchButton} onPress={() => setIsRegister(!isRegister)}>
            <Text style={styles.switchButtonText}>
              {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Registrarse'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={modalSelectorVisible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', paddingBottom: 30 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333' }}>Selecciona tu pregunta {selectorActivo}</Text>
              <TouchableOpacity onPress={() => setModalSelectorVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={preguntasDisponibles.filter((item: any, index: number, self: any[]) =>
                index === self.findIndex((t: any) => t.id === item.id)
              )}
              keyExtractor={(item: any) => item.id.toString()}
              renderItem={({ item }: { item: any }) => {
                const yaSeleccionada =
                  (selectorActivo === 1 && pregunta1 === item.id) ||
                  (selectorActivo === 2 && pregunta2 === item.id) ||
                  (selectorActivo === 3 && pregunta3 === item.id);
                return (
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                      paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
                      backgroundColor: yaSeleccionada ? '#4CAF50' + '15' : 'transparent'
                    }}
                    onPress={() => seleccionarPregunta(item.id)}
                  >
                    <Text style={{ fontSize: 15, color: yaSeleccionada ? '#4CAF50' : '#333', fontWeight: yaSeleccionada ? '600' : '400', flex: 1 }}>
                      {item.pregunta}
                    </Text>
                    {yaSeleccionada && <Ionicons name="checkmark" size={18} color="#4CAF50" />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  innerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  profileIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  profileIconText: {
    fontSize: 40,
  },
  profileImageContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 20,
    position: 'relative',
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  profileInitials: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitialsText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 15,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
  },
  cameraIconText: {
    fontSize: 14,
  },
  titleContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
  },
  eyeButton: {
    padding: 12,
  },
  passwordRules: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
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
  button: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFF3F3',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  switchButton: {
    marginTop: 20,
  },
  switchButtonText: {
    color: '#4CAF50',
    fontSize: 14,
  },
  roleSection: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  roleLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginBottom: 10,
  },
  roleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  roleButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
  },
  roleButtonText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  roleButtonTextSelected: {
    color: '#fff',
  },
  roleHint: {
    marginTop: 10,
    fontSize: 12,
    color: '#777',
  },
});
