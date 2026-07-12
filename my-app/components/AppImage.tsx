// Componente que resuelve imágenes del backend.
// El backend guarda rutas relativas como /uploads/imagen.jpg
// pero React Native necesita una URL absoluta para mostrar la imagen.
import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';
import { API_URL } from '@/utils/api';

interface AppImageProps {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  [key: string]: any;
}

/**
 * Resuelve una ruta de imagen del backend a URL completa.
 * - /uploads/xxx.jpg → http://192.168.1.10:8000/uploads/xxx.jpg
 * - http://... o https://... → sin cambio
 * - data:image/... → sin cambio
 * - null / undefined → undefined
 */
export function resolveImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('file://')) return path;
  return `${API_URL}${path}`;
}

/**
 * Componente centralizado para imágenes del backend.
 * Convierte automáticamente rutas relativas (/uploads/...) en URLs absolutas
 * usando API_URL. También acepta URLs completas o data URIs sin modificarlas.
 *
 * Uso:
 *   <AppImage uri={usuario.usu_imagen} style={styles.avatar} />
 *   <AppImage uri={quiz.metadatos.imagen_portada} style={styles.portada} />
 */
export function AppImage({ uri, style, ...props }: AppImageProps) {
  const resolvedUri = resolveImageUrl(uri);

  if (!resolvedUri) {
    return null;
  }

  return <Image source={{ uri: resolvedUri }} style={style} {...props} />;
}
