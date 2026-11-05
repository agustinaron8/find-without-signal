import { describe, expect, it } from 'vitest';
import {
  accuracyCircle,
  hasArrived,
  headingFromOrientation,
  nextPlanTime,
  nextRotation,
  parseCoords,
  shouldRecordTrackPoint,
} from '../src/lib/geo';
import { buildLocationMessage, buildSmsUri, normalizePhone } from '../src/lib/sms';

describe('nextRotation', () => {
  it('takes the shortest way across north', () => {
    expect(nextRotation(359, 1)).toBe(361);
    expect(nextRotation(1, 359)).toBe(-1);
    expect(nextRotation(720, 90)).toBe(810);
    expect(Math.abs(nextRotation(0, 180))).toBe(180);
  });
});

describe('hasArrived', () => {
  it('uses the 25 m floor or the GPS accuracy', () => {
    expect(hasArrived(20, 5)).toBe(true);
    expect(hasArrived(30, 5)).toBe(false);
    expect(hasArrived(30, 40)).toBe(true);
  });
  it('never claims arrival on a poor fix', () => {
    expect(hasArrived(10, 80)).toBe(false);
  });
});

describe('shouldRecordTrackPoint', () => {
  const start = { lat: -31.4, lng: -64.2, t: 0 };
  const far = { lat: -31.401, lng: -64.2 };
  it('records the first accurate point', () => {
    expect(shouldRecordTrackPoint(undefined, { ...start, acc: 10 })).toBe(true);
    expect(shouldRecordTrackPoint(undefined, { ...start, acc: 40 })).toBe(false);
  });
  it('waits for both the time and the distance', () => {
    expect(shouldRecordTrackPoint(start, { ...far, t: 5000, acc: 10 })).toBe(false);
    expect(shouldRecordTrackPoint(start, { ...start, t: 60000, acc: 10 })).toBe(false);
    expect(shouldRecordTrackPoint(start, { ...far, t: 15000, acc: 10 })).toBe(true);
  });
});

describe('nextPlanTime', () => {
  const at = (h: number, m: number) => new Date(2026, 10, 5, h, m);
  it('finds the next time today', () => {
    expect(nextPlanTime(['18:00', '19:00'], at(18, 30))).toEqual({ time: '19:00', minutes: 30 });
  });
  it('wraps to tomorrow after the last time', () => {
    expect(nextPlanTime(['18:00'], at(20, 0))).toEqual({ time: '18:00', minutes: 1320 });
  });
  it('handles an empty plan', () => {
    expect(nextPlanTime([], at(1, 0))).toBeNull();
  });
});

describe('headingFromOrientation', () => {
  it('reads the iOS compass', () => {
    expect(headingFromOrientation({ alpha: 10, webkitCompassHeading: 90 }, 0)).toBe(90);
    expect(headingFromOrientation({ alpha: 10, webkitCompassHeading: 350 }, 90)).toBe(80);
  });
  it('discards an uncalibrated iOS compass', () => {
    expect(headingFromOrientation({ alpha: 10, webkitCompassHeading: 90, webkitCompassAccuracy: -1 }, 0)).toBeNull();
  });
  it('inverts absolute Android alpha', () => {
    expect(headingFromOrientation({ alpha: 90, absolute: true }, 0)).toBe(270);
  });
  it('ignores relative orientation, which is not a compass', () => {
    expect(headingFromOrientation({ alpha: 90, absolute: false }, 0)).toBeNull();
    expect(headingFromOrientation({ alpha: null, absolute: true }, 0)).toBeNull();
  });
});

describe('accuracyCircle', () => {
  it('returns a closed ring', () => {
    const ring = accuracyCircle({ lat: -31, lng: -64 }, 100);
    expect(ring[0][0]).toBeCloseTo(ring[ring.length - 1][0]);
    expect(ring[0][1]).toBeCloseTo(ring[ring.length - 1][1]);
  });
});

describe('sms', () => {
  const here = { lat: -31.4201, lng: -64.1888 };
  it('normalizes free-form phones', () => {
    expect(normalizePhone(' +54 9 (351) 123-4567 ')).toBe('+5493511234567');
    expect(normalizePhone('351 123 4567')).toBe('3511234567');
  });
  it('fits a single GSM-7 segment, even at the longest coordinates', () => {
    const body = buildLocationMessage({ lat: -89.12345, lng: -179.12345 }, 999);
    expect(body.length).toBeLessThanOrEqual(160);
    expect(body).toMatch(/^[A-Za-z0-9 :,.()+\-/?=]+$/);
  });
  it('can be read back by the paste flow', () => {
    const parsed = parseCoords(buildLocationMessage(here, 12));
    expect(parsed).toEqual({ lat: -31.4201, lng: -64.1888 });
  });
  it('builds per-platform URIs', () => {
    expect(buildSmsUri(['+549 351'], 'a b', true)).toBe('sms:+549351&body=a%20b');
    expect(buildSmsUri(['+549 351', '351'], 'a b', false)).toBe('sms:+549351,351?body=a%20b');
    expect(buildSmsUri([], 'x', false)).toBe('sms:?body=x');
  });
});
