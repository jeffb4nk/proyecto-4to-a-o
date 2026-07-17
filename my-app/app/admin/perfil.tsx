// Pantalla de perfil del admin.
// Es solo un puente que redirige inmediatamente a la pantalla compartida /profile
// con los datos del usuario actual. No renderiza nada visible.
import React, { useEffect } from 'react';
import { router } from 'expo-router';
import { useUser } from '@/contexts/UserContext';

export default function AdminPerfilScreen() {
  const { usuario } = useUser();

  useEffect(() => {
    const params = new URLSearchParams();
    if (usuario?.usu_nombre) params.append('nombre', usuario.usu_nombre);
    if (usuario?.usu_apellido) params.append('apellido', usuario.usu_apellido);
    if (usuario?.usu_email) params.append('email', usuario.usu_email);
    if (usuario?.rol_nombre) params.append('rol', usuario.rol_nombre);
    if (usuario?.usu_imagen) params.append('imagen', usuario.usu_imagen);
    router.replace(`/profile?${params.toString()}`);
  }, []);

  return null;
}
