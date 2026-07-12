// Layout de pestañas para el profesor con barra personalizada.
// Pestañas: Inicio, Informes, Crear, Biblioteca.
// El perfil se muestra como ícono especial con la foto del usuario.
// Si el usuario no es profesor ni master, lo redirige al login.
import { Tabs, router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Colors from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { getInitials } from '@/utils';
import { useUser } from '@/contexts/UserContext';
import { AppImage } from '@/components/AppImage';

// Componente personalizado para la barra de navegación inferior
function CustomTabBar({ state, descriptors, navigation }: any) {
  const { usuario } = useUser();

  const icons: { [key: string]: keyof typeof Ionicons.glyphMap } = {
    index: 'home-outline',
    reportes: 'bar-chart-outline',
    crear: 'add-circle-outline',
    biblioteca: 'library-outline',
    sesiones: 'list-outline',
  };

  const labels: { [key: string]: string } = {
    index: 'Inicio',
    reportes: 'Informes',
    crear: 'Crear',
    biblioteca: 'Biblioteca',
    sesiones: 'Sesiones',
    perfil: 'Perfil',
  };

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

        // Renderizar imagen de perfil para el tab de perfil
        if (route.name === 'perfil') {
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
                {labels[route.name]}
              </Text>
            </TouchableOpacity>
          );
        }

        const iconName = icons[route.name];
        if (!iconName) return null; // Evitar error si no hay icono definido
        
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
              {labels[route.name]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function ProfesorTabLayout() {
  const { usuario, loading } = useUser();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!loading && (!usuario || (usuario.usu_fk_rol !== 2 && usuario.usu_fk_rol !== 3))) {
      timeoutRef.current = setTimeout(() => {
        router.replace('/login');
      }, 200);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [usuario, loading]);

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="reportes" options={{ title: 'Reportes' }} />
      <Tabs.Screen name="crear" options={{ title: 'Crear' }} />
      <Tabs.Screen name="biblioteca" options={{ title: 'Biblioteca' }} />
    </Tabs>
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
