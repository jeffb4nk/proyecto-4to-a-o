// Componente para mostrar etiquetas de estado o contadores.
// Se usa encima de tarjetas de quiz para indicar cantidad de preguntas
// o en listas para marcar estados como activo, pendiente, etc.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BadgeProps } from '@/types/components';

export const Badge: React.FC<BadgeProps> = ({ text, variant = 'info' }) => {
  const backgroundColor = {
    success: '#4CAF50',
    danger: '#F44336',
    warning: '#FF9800',
    info: '#2196F3',
    gray: '#999999',
  }[variant];

  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
