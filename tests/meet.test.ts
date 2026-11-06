import { describe, expect, it } from 'vitest';
import {
  accuracyCircle,
  currentTrip,
  currentTripStart,
  effectiveScreenAngle,
  filterFix,
  hasArrived,
  haversine,
  headingFromOrientation,
  magneticDeclination,
  nextPlanTime,
  nextRotation,
  parseCoords,
  recentWalk,
  shouldRecordTrackPoint,
  walkTrend,
} from '../src/lib/geo';
import { buildLocationMessage, buildSmsUri, normalizePhone } from '../src/lib/sms';

describe('nextRotation', () => {
  it('takes the shortest way across north', () => {
    expect(nextRotation(359, 1)).toBe(361);
    expect(nextRotation(1, 359)).toBe(-1);
    expect(nextRotation(720, 90)).toBe(810);
    expect(Math.abs(nextRotation(0, 180))).toBe(180);
  });
  it('recovers from NaN instead of freezing the arrow', () => {
    expect(nextRotation(NaN, 90)).toBe(90);
  });
});

describe('hasArrived', () => {
  it('uses the 15 m floor or the GPS accuracy', () => {
    expect(hasArrived(14, 5)).toBe(true);
    expect(hasArrived(20, 5)).toBe(false);
    expect(hasArrived(30, 40)).toBe(true);
  });
  it('does not flip back to the arrow on GPS jitter', () => {
    expect(hasArrived(20, 5, true)).toBe(true);
    expect(hasArrived(25, 5, true)).toBe(false);
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

describe('currentTripStart', () => {
  const hours = (h: number) => ({ t: h * 60 * 60 * 1000 });
  it('keeps the first point across a two-day event with short gaps', () => {
    const points = [hours(0), hours(5), hours(11), hours(20), hours(30)];
    expect(currentTripStart(points)).toBe(points[0]);
  });
  it('starts over after a long gap, such as a test at home the day before', () => {
    const points = [hours(0), hours(1), hours(20), hours(25)];
    expect(currentTripStart(points)).toBe(points[2]);
  });
  it('handles an empty track', () => {
    expect(currentTripStart([])).toBeUndefined();
  });
});

describe('currentTrip', () => {
  const hours = (h: number) => ({ t: h * 60 * 60 * 1000 });
  it('leaves out a test from another day', () => {
    const points = [hours(0), hours(1), hours(20), hours(25)];
    expect(currentTrip(points)).toEqual([points[2], points[3]]);
  });
  it('keeps a whole event with short gaps', () => {
    const points = [hours(0), hours(5), hours(11)];
    expect(currentTrip(points)).toEqual(points);
  });
  it('handles an empty track', () => {
    expect(currentTrip([])).toEqual([]);
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
  it('follows the back of a raised phone, where turning shows up in gamma', () => {
    expect(headingFromOrientation({ alpha: 0, beta: 90, gamma: 30, absolute: true }, 0)).toBeCloseTo(330);
    expect(headingFromOrientation({ alpha: 90, beta: 90, gamma: 0, absolute: true }, 0)).toBeCloseTo(270);
  });
  it('keeps the top of the phone when tilted in the hand', () => {
    expect(headingFromOrientation({ alpha: 90, beta: 0, gamma: 0, absolute: true }, 0)).toBeCloseTo(270);
    expect(headingFromOrientation({ alpha: 10, beta: 0, gamma: 25, absolute: true }, 0)).toBeCloseTo(350);
    expect(headingFromOrientation({ alpha: 90, beta: 45, gamma: 0, absolute: true }, 0)).toBeCloseTo(270);
  });
  it('still points forward when leaning a little past vertical', () => {
    expect(headingFromOrientation({ alpha: 90, beta: 110, gamma: 0, absolute: true }, 0)).toBeCloseTo(270);
  });
  it('accounts for a sideways screen', () => {
    expect(headingFromOrientation({ alpha: 0, beta: 0, gamma: 0, absolute: true }, 90)).toBeCloseTo(90);
  });
  it('never returns NaN', () => {
    expect(headingFromOrientation({ alpha: 0, webkitCompassHeading: NaN }, 0)).toBeNull();
    expect(headingFromOrientation({ alpha: NaN, absolute: true }, 0)).toBeNull();
    expect(headingFromOrientation({ alpha: 90, beta: NaN, gamma: 0, absolute: true }, 0)).toBe(270);
  });
  it('ignores relative orientation, which is not a compass', () => {
    expect(headingFromOrientation({ alpha: 90, absolute: false }, 0)).toBeNull();
    expect(headingFromOrientation({ alpha: null, absolute: true }, 0)).toBeNull();
  });
});

describe('effectiveScreenAngle', () => {
  it('ignores a sideways angle on a page drawn upright', () => {
    expect(effectiveScreenAngle(90, 390, 844)).toBe(0);
    expect(effectiveScreenAngle(-90, 390, 844)).toBe(0);
    expect(effectiveScreenAngle(270, 390, 844)).toBe(0);
  });
  it('keeps the angle when the page is really sideways or upside down', () => {
    expect(effectiveScreenAngle(90, 844, 390)).toBe(90);
    expect(effectiveScreenAngle(-90, 844, 390)).toBe(-90);
    expect(effectiveScreenAngle(180, 390, 844)).toBe(180);
    expect(effectiveScreenAngle(0, 390, 844)).toBe(0);
  });
});

describe('magneticDeclination', () => {
  it('corrects near the event and stays out of what it does not know', () => {
    expect(magneticDeclination({ lat: -31.42, lng: -64.19 })).toBeCloseTo(-7.1);
    expect(magneticDeclination({ lat: -34.6, lng: -58.38 })).toBe(0);
  });
});

describe('filterFix', () => {
  const good = { lat: -31.45, lng: -64.27, accuracy: 8, t: 0 };
  it('keeps a good position when a coarse fix arrives', () => {
    const next = filterFix(good, { lat: -31.46, lng: -64.28, accuracy: 900, t: 5000 });
    expect(haversine(good, next)).toBeLessThan(2);
    expect(next.accuracy).toBeCloseTo(8 + 3 * 5);
  });
  it('never claims better than the phone does', () => {
    const next = filterFix(good, { ...good, lat: -31.45001, accuracy: 10, t: 1000 });
    expect(next.accuracy).toBe(10);
  });
  it('follows a walk closely', () => {
    let fix = good;
    for (let i = 1; i <= 30; i++) fix = filterFix(fix, { ...good, lat: good.lat + i * 1.3 / 111320, accuracy: 8, t: i * 1000 });
    const real = { lat: good.lat + 30 * 1.3 / 111320, lng: good.lng };
    expect(haversine(fix, real)).toBeLessThan(3);
  });
  it('trusts a new fix after a long gap', () => {
    const next = filterFix(good, { lat: -31.46, lng: -64.28, accuracy: 10, t: 600000 });
    expect(next.lat).toBeCloseTo(-31.46, 4);
  });
  it('starts over instead of carrying NaN forward', () => {
    const next = filterFix({ ...good, lat: NaN }, { ...good, accuracy: 10, t: 1000 });
    expect(next.lat).toBe(good.lat);
  });
  it('survives a browser that reports zero accuracy', () => {
    const next = filterFix({ ...good, accuracy: 0 }, { ...good, accuracy: 0 });
    expect(Number.isFinite(next.lat)).toBe(true);
  });
});

describe('recentWalk', () => {
  const north = (seconds: number) => ({ lat: -31.45 + seconds * 1.3 / 111320, lng: -64.27, accuracy: 8, t: seconds * 1000 });
  const walking = () => Array.from({ length: 16 }, (_, i) => north(i));

  it('finds the course of a steady walk', () => {
    expect(recentWalk(walking())?.course).toBeCloseTo(0, 0);
  });
  it('says nothing while standing, even if the GPS drifts', () => {
    const drift = Array.from({ length: 16 }, (_, i) => ({ ...north(0), lat: -31.45 + (i % 2) * 20 / 111320, t: i * 1000 }));
    expect(recentWalk(drift)).toBeNull();
    expect(recentWalk([north(0), north(1)])).toBeNull();
    expect(recentWalk([])).toBeNull();
  });
  it('does not trust a move smaller than the GPS error', () => {
    expect(recentWalk(walking().map((s) => ({ ...s, accuracy: 30 })))).toBeNull();
  });
});

describe('walkTrend', () => {
  it('compares the walk with the way to the target', () => {
    expect(walkTrend(10, 350)).toBe('closer');
    expect(walkTrend(90, 0)).toBe('sideways');
    expect(walkTrend(180, 0)).toBe('away');
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
