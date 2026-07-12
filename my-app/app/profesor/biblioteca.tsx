// Biblioteca de quices del profesor.
// Muestra todos los quices creados por el profesor en una cuadrícula de 2 columnas.
// Cada quiz tiene un menú contextual para crear sesión, editar o eliminar.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { getItem } from '@/utils/storage';
import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { Card, CardContent } from '@/components/Card';
import Colors from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { Usuario } from '@/types/user';
import { QuizMongoSimplificado } from '@/types/quizMongo';
import { listarQuices } from '@/utils/api';
import QuizCardWithMenu from '@/components/QuizCardWithMenu';

export default function BibliotecaScreen() {
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);

  useEffect(() => {
    const cargarUsuario = async () => {
      try {
        const userJson = await getItem('user');
        if (userJson) {
          setUsuarioActual(JSON.parse(userJson));
        }
      } catch (error) {
        console.error('Error al cargar usuario:', error);
      }
    };
    cargarUsuario();
  }, []);
  const [quices, setQuices] = useState<QuizMongoSimplificado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Cargo los quices desde MongoDB cuando entro a la pantalla
  const cargarQuices = async () => {
    try {
      setCargando(true);
      setError(null);
      
      const userJson = await getItem('user');
      const usuario = userJson ? JSON.parse(userJson) : null;
      const autorId = usuario?.usu_id || 1;
      
      const resultado = await listarQuices(autorId);
      setQuices(resultado.quices || []);
    } catch (err: any) {
      console.error('Error cargando quices:', err);
      setError('No se pudieron cargar los quices');
    } finally {
      setCargando(false);
    }
  };
  
  useFocusEffect(
    React.useCallback(() => {
      cargarQuices();
    }, [])
  );

  return (
    <View style={styles.container}>
      <Header
        showProfile={true}
        profileImage={usuarioActual?.usu_imagen}
        profileName={usuarioActual?.usu_nombre}
        profileLastName={usuarioActual?.usu_apellido}
        onProfilePress={() => router.push('/profesor/perfil' as any)}
      />

      <SectionTitle title="Biblioteca" />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Mis Quices */}
        <Text style={styles.sectionTitle}>Mis Quices</Text>
        
        {cargando ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Cargando quices...</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
            <Text style={styles.emptyStateText}>{error}</Text>
            <TouchableOpacity onPress={cargarQuices} style={styles.retryButton}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : quices.length > 0 ? (
          <View style={styles.quizGrid}>
            {quices.map((quiz) => (
              <View key={quiz._id} style={styles.quizGridItem}>
                <QuizCardWithMenu
                  {...{
                    _id: quiz._id,
                    titulo: quiz.titulo,
                    tema: quiz.tema,
                    cantidad_preguntas: quiz.cantidad_preguntas,
                    fecha_creacion: quiz.fecha_creacion,
                    imagen_portada: quiz.imagen_portada,
                    size: 'medium',
                    onPresentar: (id: string) => router.push(`/profesor/sesion/crear?quizId=${id}` as any),
                    onEditar: (id: string) => router.push(`/profesor/crear?quizId=${id}` as any),
                    onEliminado: cargarQuices,
                  } as any}
                />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color="#ccc" />
            <Text style={styles.emptyStateText}>No hay quices</Text>
            <Text style={styles.emptyStateSubtext}>Crea tu primer quiz para verlo aquí</Text>
            <TouchableOpacity 
              style={styles.crearButton}
              onPress={() => router.push('/profesor/crear' as any)}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.crearButtonText}>Crear Quiz</Text>
            </TouchableOpacity>
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
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
  },
  // Grid de 2 columnas
  quizGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 8,
    justifyContent: 'flex-start',
  },
  // Cada item ocupa la mitad menos el margen
  quizGridItem: {
    width: '50%',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  bottomPadding: {
    height: 100,
  },
  // Loading
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 4,
    marginBottom: 20,
  },
  crearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
  },
  crearButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
    borderRadius: 20,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
});
