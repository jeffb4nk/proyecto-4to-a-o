// Define la barra de navegacion inferior del estudiante con 5 pestañas:
// Inicio, Quices, Unirse, Logros y Perfil. Esta barra se oculta cuando el
// estudiante esta dentro de un quiz para que no estorbe.
import { Tabs, usePathname } from 'expo-router';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Colors from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '@/contexts/UserContext';
import { Usuario } from '@/types/user';
import { getInitials } from '@/utils';
import { AppImage } from '@/components/AppImage';
import OfflineBanner from '@/components/OfflineBanner';

// Componente personalizado para la barra de navegación inferior
function CustomTabBar({ state, descriptors, navigation }: any) {
  const pathname = usePathname();
  const { usuario } = useUser();

  // Ocultar barra cuando estamos en el quiz (ruta contiene /quiz/)
  const shouldHideTabBar = pathname?.includes('/quiz/');

  const icons: { [key: string]: keyof typeof Ionicons.glyphMap } = {
    index: 'home-outline',
    quices: 'library-outline',
    unirse: 'qr-code-outline',
    logros: 'trophy-outline',
    perfil: 'person-outline',
  };

  const labels: { [key: string]: string } = {
    index: 'Inicio',
    quices: 'Quices',
    unirse: 'Unirse',
    logros: 'Logros',
    perfil: 'Perfil',
  };

  // Ocultar barra si estamos en el quiz (despues de que todos los hooks se ejecutaron)
  if (shouldHideTabBar) {
    return null;
  }

  return (
    <View style={styles.tabBar}>
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        // Obtener el nombre de la ruta de forma segura
        const routeName = route.name || route.route?.name || '';
        
        // Renderizar imagen de perfil para el tab de perfil
        if (routeName === 'perfil') {
          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={[
                styles.tabItem,
                isFocused && styles.tabItemActive,
              ]}
              activeOpacity={0.7}
            >
              {usuario?.usu_imagen ? (
                <AppImage
                  uri={usuario.usu_imagen}
                  style={[
                    styles.profileImage,
                    isFocused && styles.profileImageActive,
                  ]}
                />
              ) : (
                <View style={[
                  styles.profilePlaceholder,
                  isFocused && styles.profilePlaceholderActive,
                ]}>
                  <Text style={styles.profilePlaceholderText}>
                    {getInitials(usuario?.usu_nombre, usuario?.usu_apellido)}
                  </Text>
                </View>
              )}
              <Text
                style={[
                  styles.tabLabel,
                  isFocused && styles.tabLabelActive,
                ]}
              >
                {labels[routeName]}
              </Text>
            </TouchableOpacity>
          );
        }

        const iconName = icons[routeName];
        
        // Si no hay un icono válido, no renderizar este tab
        if (!iconName) {
          return null;
        }
        
        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={[
              styles.tabItem,
              isFocused && styles.tabItemActive,
            ]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isFocused ? (iconName.replace('-outline', '') as keyof typeof Ionicons.glyphMap) : iconName}
              size={24}
              color={isFocused ? Colors.primary : '#666'}
            />
            <Text
              style={[
                styles.tabLabel,
                isFocused && styles.tabLabelActive,
              ]}
            >
              {labels[routeName]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function EstudianteTabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
        <Tabs.Screen name="quices" options={{ title: 'Quices' }} />
        <Tabs.Screen name="unirse" options={{ title: 'Unirse' }} />
        <Tabs.Screen name="logros" options={{ title: 'Logros' }} />
        <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingBottom: 8,
    paddingTop: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 12,
  },
  tabItemActive: {
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
  },
  tabLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: Colors.primary,
    fontWeight: 'bold',
  },
  profileImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#ccc',
  },
  profileImageActive: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  profilePlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ccc',
  },
  profilePlaceholderActive: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  profilePlaceholderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
});
