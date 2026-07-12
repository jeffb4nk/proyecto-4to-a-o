// Pantalla de biblioteca del estudiante. Aqui podria ver todos los quices
// disponibles de forma organizada, pero por ahora esta pendiente de conectar
// con el backend. Es un placeholder que redirige a unirse con codigo.
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { getItem } from '@/utils/storage';
import { Header } from '@/components/Header';
import { SectionTitle } from '@/components/SectionTitle';
import { Card, CardContent } from '@/components/Card';
import Colors from '@/constants/colors';
import { Usuario } from '@/types/user';
import { Ionicons } from '@expo/vector-icons';

export default function EstudianteBibliotecaScreen() {
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);
  const [quices, setQuices] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);

  useFocusEffect(
    React.useCallback(() => {
      cargarUsuarioActual();
      cargarQuices();
    }, [])
  );

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

  const cargarQuices = async () => {
    // TODO: Implementar llamada a API para obtener quices disponibles
    setCargando(false);
    setQuices([]);
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

      <SectionTitle title="Biblioteca" />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Quices Disponibles</Text>
          
          {cargando ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Cargando quices...</Text>
            </View>
          ) : quices.length > 0 ? (
            quices.map((quiz) => (
              <TouchableOpacity
                key={quiz.id}
                style={styles.quizCard}
                onPress={() => router.push(`/estudiante/quiz/${quiz.id}` as any)}
              >
                <View style={styles.quizInfo}>
                  <View style={[styles.quizIcon, { backgroundColor: Colors.primary + '20' }]}>
                    <Ionicons name="document-text-outline" size={24} color={Colors.primary} />
                  </View>
                  <View style={styles.quizDetails}>
                    <Text style={styles.quizTitle}>{quiz.titulo}</Text>
                    <Text style={styles.quizSubtitle}>{quiz.materia}</Text>
                    <Text style={styles.quizMeta}>{quiz.preguntas} preguntas</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#ccc" />
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="library-outline" size={40} color="#ccc" />
              <Text style={styles.emptyStateText}>No hay quices disponibles</Text>
              <TouchableOpacity 
                style={styles.unirseButton}
                onPress={() => router.push('/estudiante/unirse' as any)}
              >
                <Text style={styles.unirseButtonText}>Unirse con código</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

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
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  quizCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quizInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quizIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  quizDetails: {
    flex: 1,
  },
  quizTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  quizSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  quizMeta: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    marginBottom: 12,
  },
  unirseButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
    borderRadius: 16,
  },
  unirseButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  bottomPadding: {
    height: 100,
  },
});