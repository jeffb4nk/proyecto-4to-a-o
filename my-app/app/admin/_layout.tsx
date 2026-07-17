import { Tabs, router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Colors from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { getInitials } from '@/utils';
import { useUser } from '@/contexts/UserContext';
import { AppImage } from '@/components/AppImage';
import { useNavigation } from '@react-navigation/native';

// Barra de pestañas personalizada para el admin.
// Reemplaza la barra default de Expo para mostrar íconos, etiquetas
// y la foto de perfil con las iniciales cuando no hay imagen.
// Componente personalizado para la barra de navegación inferior
function CustomTabBar({ state, descriptors, navigation }: any) {
  const { usuario } = useUser();

  const icons: { [key: string]: keyof typeof Ionicons.glyphMap } = {
    index: 'home-outline',
    usuarios: 'people-outline',
    auditoria: 'bar-chart-outline',
    materias: 'book-outline',
    perfil: 'person-outline',
  };

  const labels: { [key: string]: string } = {
    index: 'Inicio',
    usuarios: 'Usuarios',
    auditoria: 'Auditoría',
    materias: 'Materias',
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
              onPress={() => {
                // Navegar directamente a la pantalla de perfil
                if (usuario) {
                  router.replace({
                    pathname: '/profile',
                    params: {
                      nombre: usuario.usu_nombre,
                      apellido: usuario.usu_apellido,
                      email: usuario.usu_email,
                      rol: usuario.rol_nombre,
                      imagen: usuario.usu_imagen || ''
                    }
                  });
                }
              }}
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
        if (!iconName) return null;
        
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

// Layout principal del panel admin.
// Protege las rutas: si el usuario no es master (rol 3), lo redirige al login.
// Usa un timeout para evitar parpadeos mientras carga el contexto.
export default function AdminTabLayout() {
  const { usuario, loading } = useUser();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigation = useNavigation();

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (navigation.isFocused() && !loading && (!usuario || usuario.usu_fk_rol !== 3)) {
      timeoutRef.current = setTimeout(() => {
        router.replace('/login');
      }, 200);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [usuario, loading, navigation]);

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="usuarios" options={{ title: 'Usuarios' }} />
      <Tabs.Screen name="auditoria" options={{ title: 'Auditoría' }} />
      <Tabs.Screen name="materias" options={{ title: 'Materias' }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
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
