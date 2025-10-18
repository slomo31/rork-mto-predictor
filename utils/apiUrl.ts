import { Platform } from 'react-native';

export function getApiBaseUrl(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return '';
  }
  
  const expoUrl = process.env.EXPO_PUBLIC_API_URL;
  if (expoUrl) {
    return expoUrl;
  }
  
  if (__DEV__) {
    console.warn('[API] No EXPO_PUBLIC_API_URL set, using relative URLs. This may fail on native devices.');
  }
  
  return '';
}

export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}
