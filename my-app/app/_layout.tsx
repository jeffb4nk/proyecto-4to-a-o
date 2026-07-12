import React from 'react';
import { ThemeProvider, DefaultTheme } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Typography } from '@/constants/typography';
import Colors from '@/constants/colors';
import { UserProvider } from '@/contexts/UserContext';
import { OfflineProvider } from '@/contexts/OfflineContext';
import { useSyncManager } from '@/hooks/useSyncManager';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export const unstable_settings = {
  anchor: '(tabs)',
};

const CustomTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    text: Typography.colors.text.primary,
    background: Colors.background,
    card: Colors.surface,
    border: Colors.border,
    primary: Colors.primary,
    notification: Colors.danger,
  },
};

/** Wrapper that activates the automatic sync manager (runs inside OfflineProvider) */
function SyncManager({ children }: { children: React.ReactNode }) {

  useSyncManager();
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <OfflineProvider>
      <ErrorBoundary fallbackMessage="La app ha tenido un problema. Toca reintentar.">
        <SyncManager>
          <UserProvider>
            <ThemeProvider value={CustomTheme}>
              <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="login" />
                  <Stack.Screen name="profile" />
                  <Stack.Screen name="admin" />
                </Stack>
                <StatusBar style="auto" />
              </SafeAreaView>
            </ThemeProvider>
          </UserProvider>
        </SyncManager>
      </ErrorBoundary>
    </OfflineProvider>
  );
}
