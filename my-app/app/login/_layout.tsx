// Layout para las vistas de login.
// Solo tiene una pantalla (index) que alterna entre inicio de sesión y registro.
import { Stack } from 'expo-router';

export default function LoginLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Acceso' }} />
    </Stack>
  );
}
