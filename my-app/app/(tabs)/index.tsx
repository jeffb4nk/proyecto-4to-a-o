import { StyleSheet, View, Text, Animated } from 'react-native';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

export default function WelcomeScreen() {
  const logoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade-in del logo
    Animated.timing(logoOpacity, {
      toValue: 1,
      duration: 1500,
      useNativeDriver: true,
    }).start(() => {
      // Esperar 2 segundos con logo visible
      setTimeout(() => {
        // Fade-out del logo
        Animated.timing(logoOpacity, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }).start(() => {
          // Redirigir al login
          router.replace('/login');
        });
      }, 2000);
    });
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.logoContainer, { opacity: logoOpacity }]}>
        <View style={styles.logoBox}>
          <Text style={styles.logo}>QUIZIMA</Text>
          <Text style={styles.tagline}>Sistema de Evaluación Interactiva</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#4CAF50',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logoBox: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 20,
    marginBottom: 16,
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 8,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
