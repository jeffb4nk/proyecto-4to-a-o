// Botón genérico con color personalizable y estado deshabilitado.
// Se usa en toda la app para acciones principales como "Comenzar quiz",
// "Guardar", "Publicar". Cuando está deshabilitado se pone gris
// para que el usuario sepa que no puede tocarlo.
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { QuizButtonProps } from '@/types/components';

export const QuizButton: React.FC<QuizButtonProps> = ({
  title,
  onPress,
  color = '#007AFF',
  style,
  disabled = false,
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: disabled ? '#ccc' : color },
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
