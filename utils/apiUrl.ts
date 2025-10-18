import { Platform } from 'react-native';
import Constants from 'expo-constants';

let cachedBase: string | null = null;

function normalizeBase(u: string): string {
  const trimmed = (u || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/$/, '');
}

export function getApiBaseUrl(): string {
  if (cachedBase) return cachedBase;

  // 1) Prefer explicit env
  const explicit = normalizeBase(
    (process.env.EXPO_PUBLIC_API_BASE ||
      process.env.EXPO_PUBLIC_API_URL ||
      '') as string
  );
  if (explicit) {
    cachedBase = explicit;
    if (__DEV__) console.log(`[API] Using EXPO_PUBLIC_API_BASE: ${cachedBase}`);
    return cachedBase;
  }

  // 2) Fallback: best-effort derive (rarely used now)
  if (Platform.OS !== 'web') {
    const possibleHost =
      (Constants as any)?.expoConfig?.hostUri ||
      (Constants as any)?.manifest?.debuggerHost ||
      (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
      '';
    if (possibleHost) {
      const hostPort = String(possibleHost).split('?')[0];
      const hasProtocol = /^https?:\/\//i.test(hostPort);
      cachedBase = normalizeBase(hasProtocol ? hostPort : `http://${hostPort}`);
      if (__DEV__) console.log(`[API] Derived base from Constants: ${cachedBase}`);
      return cachedBase;
    }
  }

  if (__DEV__) {
    console.warn('[API] No EXPO_PUBLIC_API_BASE set. Example: http://10.0.0.47:3001');
  }
  cachedBase = '';
  return cachedBase;
}

export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}