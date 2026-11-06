import { parseCoords, type LatLng } from './geo';

const SHORT_LINK = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[\w-]+/i;
const TIMEOUT_MS = 12000;

export const SHORT_LINK_MESSAGES = {
  offline: 'Es un link corto y necesita internet. Abrilo en Google Maps y copiá las coordenadas, o probá con señal.',
  failed: 'No pude abrir el link corto. Probá de nuevo, o abrilo en Google Maps y copiá las coordenadas.',
  'no-coords':
    'Ese link no trae la ubicación exacta. En Google Maps, mantené apretado el lugar hasta que aparezca un pin rojo, compartí ese pin y pegá el link acá.',
  directions: 'Es un link de cómo llegar, no de un lugar. Compartí solo el lugar de destino.',
} as const;

export type ResolveError = keyof typeof SHORT_LINK_MESSAGES;

export const findShortLink = (text: string) => text.match(SHORT_LINK)?.[0] ?? null;

// Coordinates are read from the text when they are there; a short link has none until it is opened.
export async function resolveCoords(text: string): Promise<LatLng | ResolveError | null> {
  const shortLink = findShortLink(text);
  if (!shortLink) return parseCoords(text);
  if (!navigator.onLine) return 'offline';
  try {
    const response = await fetch(`/api/resolve-maps?url=${encodeURIComponent(shortLink)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = (await response.json()) as { lat?: unknown; lng?: unknown; url?: unknown; error?: unknown };
    if (typeof body.lat === 'number' && typeof body.lng === 'number') return { lat: body.lat, lng: body.lng };
    const fromUrl = typeof body.url === 'string' ? parseCoords(body.url) : null;
    if (fromUrl) return fromUrl;
    return body.error === 'directions' || body.error === 'no-coords' ? body.error : 'failed';
  } catch {
    return 'failed';
  }
}
