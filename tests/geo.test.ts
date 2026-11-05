import { describe, expect, it } from 'vitest';
import {
  bearing,
  cardinalName,
  circularMean,
  formatDistance,
  formatWalkTime,
  haversine,
  parseCoords,
} from '../src/lib/geo';

describe('haversine', () => {
  it('matches known distances', () => {
    const cordoba = { lat: -31.4201, lng: -64.1888 };
    const buenosAires = { lat: -34.6037, lng: -58.3816 };
    expect(haversine(cordoba, buenosAires) / 1000).toBeCloseTo(646, -1);
    expect(haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111195, -1);
    expect(haversine(cordoba, cordoba)).toBe(0);
  });
});

describe('bearing', () => {
  it('returns cardinal bearings', () => {
    const origin = { lat: 0, lng: 0 };
    expect(bearing(origin, { lat: 1, lng: 0 })).toBeCloseTo(0);
    expect(bearing(origin, { lat: 0, lng: 1 })).toBeCloseTo(90);
    expect(bearing(origin, { lat: -1, lng: 0 })).toBeCloseTo(180);
    expect(bearing(origin, { lat: 0, lng: -1 })).toBeCloseTo(270);
  });
});

describe('circularMean', () => {
  it('averages across the 0/360 boundary', () => {
    const mean = circularMean([350, 10]);
    expect(Math.min(mean, 360 - mean)).toBeCloseTo(0);
    expect(circularMean([80, 100])).toBeCloseTo(90);
  });
});

describe('formatting', () => {
  it('formats distances in es-AR', () => {
    expect(formatDistance(320.4)).toBe('320 m');
    expect(formatDistance(1234)).toBe('1,2 km');
  });
  it('formats walking time', () => {
    expect(formatWalkTime(10)).toBe('1 min');
    expect(formatWalkTime(780)).toBe('10 min');
    expect(formatWalkTime(4680)).toBe('1 h');
  });
  it('names cardinal directions', () => {
    expect(cardinalName(45)).toBe('noreste');
    expect(cardinalName(359)).toBe('norte');
  });
});

describe('parseCoords', () => {
  const expected = { lat: -31.4201, lng: -64.1888 };
  it.each([
    ['plain', '-31.4201,-64.1888'],
    ['spaced', ' -31.4201, -64.1888 '],
    ['viewport url', 'https://www.google.com/maps/@-31.4201,-64.1888,15z'],
    ['query url', 'https://maps.google.com/?q=-31.4201,-64.1888'],
    ['encoded query', 'https://www.google.com/maps/search/?api=1&query=-31.4201%2C-64.1888'],
    ['geo uri', 'geo:-31.4201,-64.1888'],
    ['place pin wins over viewport', 'https://www.google.com/maps/place/X/@-30,-60,15z/data=!3d-31.4201!4d-64.1888'],
    ['app sms', 'Estoy acá: -31.4201,-64.1888 (±12m) https://maps.google.com/?q=-31.4201,-64.1888 – Reencuentro'],
  ])('parses %s', (_name, input) => {
    expect(parseCoords(input)).toEqual(expected);
  });

  it('accepts whole-degree pairs only when they are the entire input', () => {
    expect(parseCoords('-31,-64')).toEqual({ lat: -31, lng: -64 });
    expect(parseCoords('Nos vemos 18, 19 o 20')).toBeNull();
  });

  it('rejects out-of-range and unrelated input', () => {
    expect(parseCoords('95.5,10.5')).toBeNull();
    expect(parseCoords('hola')).toBeNull();
    expect(parseCoords('100% seguro')).toBeNull();
  });
});
