import { setBaseUrl } from '@workspace/api-client-react';

const rawBackendUrl =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  (import.meta.env.VITE_BACKEND_URL as string | undefined);

export const backendHttpUrl = rawBackendUrl?.replace(/\/+$/, '') ?? '';

export function getBackendWebSocketUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (backendHttpUrl) {
    const url = new URL(normalizedPath, backendHttpUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${normalizedPath}`;
}

setBaseUrl(backendHttpUrl || null);
