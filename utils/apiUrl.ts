import { Platform } from 'react-native';
import Constants from 'expo-constants';

let cachedBase: string | null = null;

export function getApiBaseUrl(): string {
  if (cachedBase) return cachedBase as string;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      cachedBase = window.location.origin;
      return cachedBase as string;
    }
    return '';
  }

  const explicit = (process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_BASE || '').trim();
  if (explicit) {
    cachedBase = explicit.replace(/\/$/, '');
    return cachedBase as string;
  }

  const possibleHost =
    (Constants as any)?.expoConfig?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost ||
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
    '';

  if (possibleHost) {
    const hostPort = String(possibleHost).split('?')[0];
    const hasProtocol = /^https?:\/\//i.test(hostPort);
    const base = hasProtocol ? hostPort : `http://${hostPort}`;
    cachedBase = base.replace(/\/$/, '');
    if (__DEV__) console.log(`[API] Derived base from Constants: ${cachedBase}`);
    return cachedBase as string;
  }

  if (__DEV__) {
    console.warn('[API] Could not determine API base URL. Set EXPO_PUBLIC_API_URL to your dev server origin, e.g. http://192.168.1.X:8081');
  }
  return '';
}

export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}
