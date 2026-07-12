// Banner que aparece cuando el dispositivo pierde conexión a internet.
// Se desliza desde arriba con una animación para no ser invasivo.
// Les recuerda a los estudiantes que pueden seguir usando quizzes
// descargados aunque no haya internet.
import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useOffline } from "@/contexts/OfflineContext";

export default function OfflineBanner() {
  const { isConnected } = useOffline();
  const slideAnim = useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    if (isConnected === false) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -60,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isConnected, slideAnim]);

  if (isConnected) {
    return null;
  }

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}
    >
      <Ionicons name="wifi-off-outline" size={18} color="#FFFFFF" />
      <Text style={styles.text}>
        Sin conexión — Los quizzes agendados están disponibles offline
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E65100",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
});
