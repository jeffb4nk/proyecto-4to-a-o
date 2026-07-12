// Componente base para tarjetas reutilizables en toda la app.
// Viene con Header, Content y Actions para mantener consistencia
// visual entre las pantallas de quizzes, sesiones y resultados.
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { CardProps, CardHeaderProps, CardContentProps, CardActionsProps } from '@/types/components';

export const Card: React.FC<CardProps> = ({ children, style }) => {
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
};

export const CardHeader: React.FC<CardHeaderProps> = ({ title, subtitle }) => {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
};

export const CardContent: React.FC<CardContentProps> = ({ children }) => {
  return (
    <View style={styles.content}>
      {children}
    </View>
  );
};

export const CardActions: React.FC<CardActionsProps> = ({ children }) => {
  return (
    <View style={styles.actions}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
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
  header: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  content: {
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    flexWrap: 'wrap',
  },
});
