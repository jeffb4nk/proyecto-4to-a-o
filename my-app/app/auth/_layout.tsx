// Layout para el flujo de autenticación: recuperación de contraseña
// y configuración de preguntas de seguridad.
// Todas las pantallas internas comparten header oculto.
import React from 'react';
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="recuperar/index" />
      <Stack.Screen name="recuperar/preguntas" />
      <Stack.Screen name="recuperar/nueva-contrasena" />
      <Stack.Screen name="configurar-preguntas" />
    </Stack>
  );
}
