import { Platform } from 'react-native';
import Constants from 'expo-constants';

let cachedBase: string | null = null;

function normalizeBase(u: string): string {
  const trimmed = u.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/$/, '');
}

export function getApiBaseUrl(): string {
  if (cachedBase) return cachedBase as string;

  const explicit = normalizeBase(
    (process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_BASE || '') as string,
  );
  if (explicit) {
    cachedBase = explicit;
    return cachedBase as string;
  }

  if (Platform.OS !== 'web') {
    const possibleHost =
      (Constants as any)?.expoConfig?.hostUri ||
      (Constants as any)?.manifest?.debuggerHost ||
      (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
      '';

    if (possibleHost) {
      const hostPort = String(possibleHost).split('?')[0];
      const hasProtocol = /^https?:\/\//i.test(hostPort);
      const base = hasProtocol ? hostPort : `http://${hostPort}`;
      cachedBase = normalizeBase(base);
      if (__DEV__) console.log(`[API] Derived base from Constants: ${cachedBase}`);
      return cachedBase as string;
    }
  }

  if (__DEV__) {
    console.warn('[API] No EXPO_PUBLIC_API_BASE set. Set it to your API origin, e.g. http://localhost:3000 or http://192.168.1.X:3000');
  }
  return '';
}

export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  if (!base) return cleanPath;

  if (cleanPath.startsWith('/api/')) {
    if (/:(8081|5173)$/.test(base)) {
      return base.replace(/:(8081|5173)$/,':3000') + cleanPath;
    }
  }

  return `${base}${cleanPath}`;
}
