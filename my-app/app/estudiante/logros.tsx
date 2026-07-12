// Aqui el estudiante ve todos los logros que ha desbloqueado y los que le faltan.
// Cada logro da puntos de recompensa cuando se completa. Es como una vitrina
// de sus mejores momentos en la app.
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { getItem } from '@/utils/storage';
import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { Card, CardContent } from '@/components/Card';
import Colors from '@/constants/colors';
import { Usuario } from '@/types/user';
import { Ionicons } from '@expo/vector-icons';
import { obtenerLogrosEstudiante } from '@/utils/api';

export default function EstudianteLogrosScreen() {
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);
  const [logros, setLogros] = useState<any[]>([]);
  const [totalPuntos, setTotalPuntos] = useState(0);
  const [cargando, setCargando] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      cargarUsuarioActual();
    }, [])
  );

  useEffect(() => {
    if (usuarioActual?.usu_id) {
      cargarLogros();
    }
  }, [usuarioActual]);

  const cargarUsuarioActual = async () => {
    try {
      const userJson = await getItem('user');
      if (userJson) {
        setUsuarioActual(JSON.parse(userJson));
      }
    } catch (error) {
      console.error('Error al cargar usuario actual:', error);
    }
  };

  const cargarLogros = async () => {
    if (!usuarioActual?.usu_id) return;

    try {
      setCargando(true);
      const response = await obtenerLogrosEstudiante(usuarioActual.usu_id);
      if (response) {
        if (response.logros) {
          setLogros(response.logros);
        }
        if (response.total_puntos_logros !== undefined) {
          setTotalPuntos(response.total_puntos_logros);
        }
      }
    } catch (error: any) {
      if (error?.message !== 'OFFLINE_MODE') {
        console.error('Error al cargar logros:', error);
      }
      setLogros([]);
    } finally {
      setCargando(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header
        showProfile={true}
        profileImage={usuarioActual?.usu_imagen}
        profileName={usuarioActual?.usu_nombre}
        profileLastName={usuarioActual?.usu_apellido}
        onProfilePress={() => router.push('/estudiante/perfil' as any)}
      />

      <SectionTitle title="Logros" />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {cargando ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Cargando logros...</Text>
          </View>
        ) : (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Tus Logros</Text>
             <Text style={styles.sectionSubtitle}>
               {logros.filter(l => l.desbloqueado).length} de {logros.length} desbloqueados
             </Text>

             <View style={styles.prestigeContainer}>
               <Ionicons name="star" size={24} color="#FFD700" />
                <Text style={styles.prestigeText}>Puntos por Logros: {totalPuntos}</Text>
             </View>

             <View style={styles.logrosGrid}>
              {logros.map((logro) => (
                <View key={logro.codigo} style={styles.logroCard}>
                  <Card style={!logro.desbloqueado ? styles.logroCardLocked : undefined}>
                    <CardContent>
                      <View style={[styles.logroIconContainer, { backgroundColor: `${logro.color || Colors.primary}${logro.desbloqueado ? '' : '40'}` }]}>
                        <Ionicons
                          name={logro.icono as any}
                          size={32}
                           color={logro.desbloqueado ? '#fff' : '#ccc'}
                        />
                      </View>
                      <Text style={[styles.logroTitulo, !logro.desbloqueado && styles.logroTituloLocked]}>
                        {logro.titulo}
                      </Text>
                      <Text style={[styles.logroDescripcion, !logro.desbloqueado && styles.logroDescripcionLocked]}>
                        {logro.descripcion}
                      </Text>
                      {!logro.desbloqueado && (
                        <View style={styles.lockedBadge}>
                          <Ionicons name="lock-closed" size={16} color="#999" />
                          <Text style={styles.lockedText}>Bloqueado</Text>
                        </View>
                      )}
                      {logro.desbloqueado && logro.puntos_recompensa && (
                        <View style={styles.recompensaBadge}>
                          <Ionicons name="star" size={16} color="#FF8F00" />
                          <Text style={styles.recompensaText}>+{logro.puntos_recompensa} pts</Text>
                        </View>
                      )}
                    </CardContent>
                  </Card>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  sectionContainer: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
   sectionSubtitle: {
     fontSize: 14,
     color: '#666',
     marginBottom: 16,
   },
   prestigeContainer: {
     flexDirection: 'row',
     alignItems: 'center',
     justifyContent: 'center',
     backgroundColor: '#FFFDE7',
     padding: 12,
     borderRadius: 12,
     marginBottom: 20,
     borderWidth: 1,
     borderColor: '#FFD700',
   },
   prestigeText: {
     fontSize: 18,
     fontWeight: 'bold',
     color: '#B8860B',
     marginLeft: 8,
   },
   logrosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  logroCard: {
    width: '50%',
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  logroCardLocked: {
    opacity: 0.6,
  },
  logroIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    alignSelf: 'center',
  },
  logroTitulo: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  logroTituloLocked: {
    color: '#999',
  },
  logroDescripcion: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  logroDescripcionLocked: {
    color: '#999',
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
  },
  lockedText: {
    fontSize: 11,
    color: '#999',
    marginLeft: 4,
  },
  bottomPadding: {
    height: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  recompensaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
  },
  recompensaText: {
    fontSize: 11,
    color: '#FF8F00',
    fontWeight: 'bold',
    marginLeft: 4,
  },
});
