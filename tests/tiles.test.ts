import { describe, expect, it } from 'vitest';
import type { OfflineArea } from '../src/db';
import {
  areaCoversPoints,
  bboxForPoints,
  lngLatToTile,
  MAX_TILES,
  planArea,
  styleAssetUrls,
  tilesForBBox,
  tileUrl,
} from '../src/lib/tiles';

const CORDOBA = { lat: -31.4201, lng: -64.1888 };

describe('lngLatToTile', () => {
  it('matches known slippy-map values', () => {
    expect(lngLatToTile(0, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(lngLatToTile(13.37771, 52.51628, 13)).toEqual({ x: 4400, y: 2686 });
    expect(lngLatToTile(-64.1888, -31.4201, 14)).toEqual({ x: 5270, y: 9699 });
  });
  it('clamps at the edges of the world', () => {
    expect(lngLatToTile(180, 90, 2)).toEqual({ x: 3, y: 0 });
    expect(lngLatToTile(-180, -90, 2)).toEqual({ x: 0, y: 3 });
  });
});

describe('bboxForPoints', () => {
  it('adds the margin in kilometers on every side', () => {
    const [minLng, minLat, maxLng, maxLat] = bboxForPoints([CORDOBA], 2);
    expect(maxLat - minLat).toBeCloseTo((2 * 2) / 111.32, 5);
    // Longitude degrees are shorter away from the equator, so the span must be wider.
    expect(maxLng - minLng).toBeGreaterThan(maxLat - minLat);
    expect(minLng).toBeLessThan(CORDOBA.lng);
    expect(maxLat).toBeGreaterThan(CORDOBA.lat);
  });
});

describe('tilesForBBox', () => {
  it('covers each zoom without duplicates', () => {
    const tiles = tilesForBBox(bboxForPoints([CORDOBA], 2), 10, 14);
    expect(new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`)).size).toBe(tiles.length);
    expect(new Set(tiles.map((t) => t.z))).toEqual(new Set([10, 11, 12, 13, 14]));
    expect(tiles).toContainEqual({ z: 14, ...lngLatToTile(CORDOBA.lng, CORDOBA.lat, 14) });
  });
});

describe('planArea', () => {
  it('keeps the requested margin for a venue-sized area', () => {
    const plan = planArea([CORDOBA], 5)!;
    expect(plan).toMatchObject({ marginKm: 5, maxZoom: 14, reduced: false });
    expect(plan.tileCount).toBeLessThanOrEqual(MAX_TILES);
  });
  it('reduces the area and flags it when points are far apart', () => {
    const plan = planArea([CORDOBA, { lat: -31.2, lng: -64.0 }, { lat: -31.6, lng: -64.6 }], 5)!;
    expect(plan.reduced).toBe(true);
    expect(plan.tileCount).toBeLessThanOrEqual(MAX_TILES);
  });
  it('gives up rather than exceeding the tile limit', () => {
    expect(planArea([CORDOBA, { lat: -34.6, lng: -58.4 }], 2)).toBeNull();
  });
});

describe('areaCoversPoints', () => {
  const area = { bbox: [-65, -32, -64, -31] } as OfflineArea;
  it('detects a point moved outside the downloaded area', () => {
    expect(areaCoversPoints(area, [CORDOBA])).toBe(true);
    expect(areaCoversPoints(area, [CORDOBA, { lat: -34.6, lng: -58.4 }])).toBe(false);
  });
});

describe('style assets', () => {
  it('lists sprites and glyph ranges for each literal font stack', () => {
    const urls = styleAssetUrls({
      sprite: 'https://t/s/ofm',
      glyphs: 'https://t/fonts/{fontstack}/{range}.pbf',
      sources: {},
      layers: [
        { layout: { 'text-font': ['Noto Sans Bold'] } },
        { layout: { 'text-font': ['Noto Sans Bold'] } },
        { layout: {} },
        {},
      ],
    });
    expect(urls).toContain('https://t/s/ofm@2x.png');
    expect(urls).toContain('https://t/fonts/Noto Sans Bold/0-255.pbf');
    expect(urls.filter((u) => u.includes('fonts'))).toHaveLength(3);
  });
  it('fills in tile templates', () => {
    expect(tileUrl('https://t/{z}/{x}/{y}.pbf', { z: 1, x: 2, y: 3 })).toBe('https://t/1/2/3.pbf');
  });
});
