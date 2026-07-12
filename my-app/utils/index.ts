import * as ImagePicker from 'expo-image-picker';

// Sacamos las iniciales del nombre y apellido para mostrarlas
// como avatar cuando el usuario no tiene foto de perfil.
export const getInitials = (name?: string, lastName?: string): string => {
  const first = name?.charAt(0).toUpperCase() || '';
  const last = lastName?.charAt(0).toUpperCase() || '';
  return first + last || '👤';
};

// Elegir imagen de la galeria y devolverla en base64.
// La calidad baja (0.3) es para que pese menos al enviarla al backend
// y no saturar la base de datos con imagenes enormes.
export const pickImage = async (): Promise<string | null> => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    alert('Se necesita permiso para acceder a la galería');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.3,
    base64: true,
  });

  if (!result.canceled && result.assets[0].base64) {
    return `data:image/jpeg;base64,${result.assets[0].base64}`;
  }
  return null;
};
