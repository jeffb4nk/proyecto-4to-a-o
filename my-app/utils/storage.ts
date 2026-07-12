import { Platform } from 'react-native';

// SecureStore no existe en web, solo en dispositivos moviles.
// Por eso este wrapper: para no tener que andar preguntando
// Platform.OS cada vez que necesitamos guardar o leer algo.
let SecureStore: any = null;
if (Platform.OS !== 'web') {
  SecureStore = require('expo-secure-store');
}

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  return SecureStore.setItemAsync(key, value);
}

// Si estamos web usa localStorage, si es movil usa el SecureStore
// que ademas cifra los datos. El token y el usuario van aqui.
export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
    return;
  }
  return SecureStore.deleteItemAsync(key);
}
