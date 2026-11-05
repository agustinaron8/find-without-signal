import { MAP_CACHE_NAME, MAP_STYLE_URL } from '../config';
import type { OfflineArea } from '../db';
import type { LatLng } from './geo';

export type BBox = [number, number, number, number];

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export interface AreaPlan {
  bbox: BBox;
  marginKm: number;
  maxZoom: number;
  tileCount: number;
  reduced: boolean;
}

export interface DownloadProgress {
  done: number;
  total: number;
}

export const MIN_ZOOM = 10;
export const MAX_ZOOM = 14;
export const MAX_TILES = 800;
export const MARGIN_OPTIONS_KM = [1, 2, 5];
export const DEFAULT_MARGIN_KM = 2;

const KM_PER_DEGREE = 111.32;
const MAX_MERCATOR_LAT = 85.0511;
const FALLBACK_MARGINS_KM = [2, 1, 0.5];
const CONCURRENCY = 4;
const RETRIES = 2;
// 8192-8447 holds typographic dashes and quotes, which do appear in place names.
const GLYPH_RANGES = ['0-255', '256-511', '8192-8447'];

export function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const clampedLat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

export function tilesForBBox(bbox: BBox, minZoom: number, maxZoom: number): TileCoord[] {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const tiles: TileCoord[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const topLeft = lngLatToTile(minLng, maxLat, z);
    const bottomRight = lngLatToTile(maxLng, minLat, z);
    for (let x = topLeft.x; x <= bottomRight.x; x++) {
      for (let y = topLeft.y; y <= bottomRight.y; y++) tiles.push({ z, x, y });
    }
  }
  return tiles;
}

export function bboxForPoints(points: LatLng[], marginKm: number): BBox {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const latMargin = marginKm / KM_PER_DEGREE;
  const widestLat = Math.max(Math.abs(minLat), Math.abs(maxLat));
  const lngMargin = marginKm / (KM_PER_DEGREE * Math.max(0.01, Math.cos((widestLat * Math.PI) / 180)));
  return [
    Math.max(-180, Math.min(...lngs) - lngMargin),
    Math.max(-MAX_MERCATOR_LAT, minLat - latMargin),
    Math.min(180, Math.max(...lngs) + lngMargin),
    Math.min(MAX_MERCATOR_LAT, maxLat + latMargin),
  ];
}

// Shrinks the margin first and the detail last, so that the area always stays under MAX_TILES.
export function planArea(points: LatLng[], requestedMarginKm: number): AreaPlan | null {
  const margins = [requestedMarginKm, ...FALLBACK_MARGINS_KM.filter((m) => m < requestedMarginKm)];
  for (let maxZoom = MAX_ZOOM; maxZoom >= MAX_ZOOM - 2; maxZoom--) {
    for (const marginKm of margins) {
      const bbox = bboxForPoints(points, marginKm);
      const tileCount = tilesForBBox(bbox, MIN_ZOOM, maxZoom).length;
      if (tileCount <= MAX_TILES) {
        return { bbox, marginKm, maxZoom, tileCount, reduced: marginKm !== requestedMarginKm || maxZoom !== MAX_ZOOM };
      }
    }
  }
  return null;
}

export function areaCoversPoints(area: OfflineArea, points: LatLng[]): boolean {
  const [minLng, minLat, maxLng, maxLat] = area.bbox;
  return points.every((p) => p.lng >= minLng && p.lng <= maxLng && p.lat >= minLat && p.lat <= maxLat);
}

interface MapStyle {
  sprite?: string;
  glyphs?: string;
  sources: Record<string, { type: string; url?: string; tiles?: string[]; maxzoom?: number }>;
  layers: { layout?: { 'text-font'?: unknown } }[];
}

export function styleAssetUrls(style: MapStyle): string[] {
  const urls: string[] = [];
  if (style.sprite) {
    for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) urls.push(`${style.sprite}${suffix}`);
  }
  if (style.glyphs) {
    const stacks = new Set<string>();
    for (const layer of style.layers) {
      const font = layer.layout?.['text-font'];
      if (Array.isArray(font) && font.every((f) => typeof f === 'string')) stacks.add(font.join(','));
    }
    for (const stack of stacks) {
      for (const range of GLYPH_RANGES) {
        urls.push(style.glyphs.replace('{fontstack}', stack).replace('{range}', range));
      }
    }
  }
  return urls;
}

export const tileUrl = (template: string, { z, x, y }: TileCoord) =>
  template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

// `cache: 'reload'` also tells the service worker to let this request reach the network.
async function fetchWithRetry(url: string, signal?: AbortSignal): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(url, { cache: 'reload', signal });
      if (response.ok || response.status === 404) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

async function fetchAndStore(cache: Cache, url: string, signal?: AbortSignal): Promise<Response> {
  const response = await fetchWithRetry(url, signal);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  await cache.put(url, response.clone());
  return response;
}

async function resolveTileTemplate(cache: Cache, tileJsonUrl: string, probe: TileCoord, signal?: AbortSignal) {
  // Reusing a still-served version keeps areas downloaded earlier for other groups readable.
  const cached = await cache.match(tileJsonUrl, { ignoreVary: true });
  if (cached) {
    const template = ((await cached.json()) as { tiles: string[] }).tiles[0];
    const response = await fetchWithRetry(tileUrl(template, probe), signal).catch(() => null);
    if (response?.ok) return template;
  }
  const response = await fetchAndStore(cache, tileJsonUrl, signal);
  return ((await response.json()) as { tiles: string[] }).tiles[0];
}

export interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
  signal?: AbortSignal;
}

export async function downloadArea(plan: AreaPlan, { onProgress, signal }: DownloadOptions = {}): Promise<OfflineArea> {
  const cache = await caches.open(MAP_CACHE_NAME);

  const styleResponse = await fetchAndStore(cache, MAP_STYLE_URL, signal);
  const style = (await styleResponse.json()) as MapStyle;
  const vector = Object.values(style.sources).find((source) => source.type === 'vector' && source.url);
  if (!vector?.url) throw new Error('Map style has no vector source');

  const tiles = tilesForBBox(plan.bbox, MIN_ZOOM, plan.maxZoom);
  const template = await resolveTileTemplate(cache, vector.url, tiles[0], signal);

  // Low-zoom raster sources are overscaled by the style, so their base tiles are needed too.
  const rasterUrls = Object.values(style.sources)
    .filter((source) => source.type === 'raster' && source.tiles?.[0])
    .flatMap((source) =>
      tilesForBBox(plan.bbox, source.maxzoom ?? 0, source.maxzoom ?? 0).map((t) => tileUrl(source.tiles![0], t)),
    );
  const assets = [...styleAssetUrls(style), ...rasterUrls];
  const tileUrls = tiles.map((t) => tileUrl(template, t));
  const queue = [...assets, ...tileUrls];

  let done = 0;
  let failed = 0;
  let next = 0;
  onProgress?.({ done, total: queue.length });

  const worker = async () => {
    while (next < queue.length) {
      const url = queue[next++];
      signal?.throwIfAborted();
      const present = await cache.match(url, { ignoreVary: true });
      if (!present) {
        try {
          const response = await fetchWithRetry(url, signal);
          // A 404 from the tile server just means there is nothing to draw in that tile.
          if (response.ok) await cache.put(url, response);
        } catch (err) {
          if (signal?.aborted || (err as Error).name === 'QuotaExceededError') throw err;
          failed++;
        }
      }
      done++;
      onProgress?.({ done, total: queue.length });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (failed > 0) throw new Error(`${failed} map files failed to download`);

  return {
    bbox: plan.bbox,
    minZoom: MIN_ZOOM,
    maxZoom: plan.maxZoom,
    tileCount: tiles.length,
    downloadedAt: Date.now(),
    tilesetVersionUrl: template,
  };
}

// True when a later download moved the shared TileJSON to a version this area does not hold.
export async function isAreaCurrent(area: OfflineArea): Promise<boolean> {
  const cache = await caches.open(MAP_CACHE_NAME);
  const style = await cache.match(MAP_STYLE_URL, { ignoreVary: true });
  if (!style) return false;
  const parsed = (await style.json()) as MapStyle;
  const vector = Object.values(parsed.sources).find((source) => source.type === 'vector' && source.url);
  const tileJson = vector?.url ? await cache.match(vector.url, { ignoreVary: true }) : undefined;
  if (!tileJson) return false;
  return ((await tileJson.json()) as { tiles: string[] }).tiles[0] === area.tilesetVersionUrl;
}
