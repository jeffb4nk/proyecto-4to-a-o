// Layout para la pantalla de perfil compartida.
// Usada por admin, profesor y estudiante.
// Solo contiene una pantalla con el header oculto (se usa Header personalizado).
import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
