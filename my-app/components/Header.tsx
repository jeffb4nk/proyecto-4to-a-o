// Barra superior de la app con el logo QUIZIMA, botón de volver
// y acceso al perfil del usuario. Toma los datos del contexto de
// usuario para mostrar la foto o las iniciales si no hay imagen.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { getInitials } from '@/utils';
import { HeaderProps } from '@/types/components';
import { useUser } from '@/contexts/UserContext';
import { AppImage } from '@/components/AppImage';

export const Header: React.FC<HeaderProps> = ({
  showBackButton = false,
  onBackPress,
  showProfile = false,
  profileImage: propProfileImage,
  profileName: propProfileName,
  profileLastName: propProfileLastName,
  onProfilePress,
}) => {
  const [imageError, setImageError] = useState(false);
  const { usuario, loading } = useUser();

  // Usar datos del contexto si están disponibles, sino usar props
  const profileImage = usuario?.usu_imagen || propProfileImage;
  const profileName = usuario?.usu_nombre || propProfileName;
  const profileLastName = usuario?.usu_apellido || propProfileLastName;

  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {showBackButton ? (
          <TouchableOpacity onPress={onBackPress || router.back} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Volver</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.appName}>QUIZIMA</Text>
      </View>

      {showProfile && (
        <TouchableOpacity
          onPress={onProfilePress}
          style={styles.profileButton}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {profileImage && !imageError ? (
            <AppImage
              uri={profileImage}
              style={styles.profileImage}
              onError={(e) => {
                console.log(' Error cargando imagen de perfil:', e.nativeEvent.error);
                setImageError(true);
              }}
            />
          ) : (
            <View style={styles.profilePlaceholder}>
              <Text style={styles.profilePlaceholderText}>{getInitials(profileName, profileLastName)}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.primary,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  profilePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePlaceholderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});
