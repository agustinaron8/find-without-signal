export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6371000;
const WALKING_SPEED_MS = 1.3;
const CARDINALS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export const normalizeDegrees = (deg: number) => ((deg % 360) + 360) % 360;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function bearing(from: LatLng, to: LatLng): number {
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLng);
  return normalizeDegrees(toDeg(Math.atan2(y, x)));
}

export function circularMean(degrees: number[]): number {
  const sin = degrees.reduce((sum, d) => sum + Math.sin(toRad(d)), 0);
  const cos = degrees.reduce((sum, d) => sum + Math.cos(toRad(d)), 0);
  return normalizeDegrees(toDeg(Math.atan2(sin, cos)));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

export function formatWalkTime(meters: number): string {
  const minutes = Math.max(1, Math.round(meters / WALKING_SPEED_MS / 60));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

export function cardinalName(deg: number): string {
  return CARDINALS[Math.round(normalizeDegrees(deg) / 45) % 8];
}

const isValid = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
const DECIMAL = '(-?\\d{1,3}\\.\\d+)';

// Most specific first: `!3d!4d` is a place's real pin, while `@` is only the viewport center.
const COORD_PATTERNS = [
  new RegExp(`!3d${NUM}!4d${NUM}`),
  new RegExp(`[?&](?:q|ll|query|destination|daddr)=(?:loc:)?${NUM},\\s*${NUM}`),
  new RegExp(`geo:${NUM},${NUM}`),
  new RegExp(`@${NUM},${NUM}`),
  new RegExp(`${DECIMAL}\\s*,\\s*${DECIMAL}`),
  new RegExp(`^\\s*${NUM}\\s*,\\s*${NUM}\\s*$`),
];

export function parseCoords(input: string): LatLng | null {
  let text = input;
  try {
    text = decodeURIComponent(input);
  } catch {
    // Free text may hold a stray "%"; parse it as is.
  }
  for (const pattern of COORD_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (isValid(lat, lng)) return { lat, lng };
  }
  return null;
}

export const isPoorFix = (accuracy: number) => accuracy > 50;

// Accumulates rotation so a move from 359° to 1° turns 2° instead of spinning back around.
export function nextRotation(previous: number, target: number): number {
  const delta = ((target - previous) % 360 + 540) % 360 - 180;
  return previous + delta;
}

export function hasArrived(distance: number, accuracy: number): boolean {
  return !isPoorFix(accuracy) && distance <= Math.max(accuracy, 25);
}

const TRACK_MIN_INTERVAL_MS = 15000;
const TRACK_MIN_DISTANCE_M = 10;
const TRACK_MAX_ACCURACY_M = 40;

export function shouldRecordTrackPoint(
  last: (LatLng & { t: number }) | undefined,
  next: LatLng & { t: number; acc: number },
): boolean {
  if (next.acc >= TRACK_MAX_ACCURACY_M) return false;
  if (!last) return true;
  return next.t - last.t >= TRACK_MIN_INTERVAL_MS && haversine(last, next) >= TRACK_MIN_DISTANCE_M;
}

const TRIP_MAX_GAP_MS = 12 * 60 * 60 * 1000;

// Only a long silence ends a trip, so events spanning days keep their real starting point
// while a test run at home the day before does not count as the start.
export function currentTripStart<T extends { t: number }>(sortedPoints: T[]): T | undefined {
  for (let i = sortedPoints.length - 1; i > 0; i--) {
    if (sortedPoints[i].t - sortedPoints[i - 1].t > TRIP_MAX_GAP_MS) return sortedPoints[i];
  }
  return sortedPoints[0];
}

export function nextPlanTime(times: string[], now: Date): { time: string; minutes: number } | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const upcoming = times
    .map((time) => {
      const [h, m] = time.split(':').map(Number);
      const of = h * 60 + m;
      return { time, minutes: of > nowMinutes ? of - nowMinutes : of + 1440 - nowMinutes };
    })
    .sort((a, b) => a.minutes - b.minutes);
  return upcoming[0] ?? null;
}

export function accuracyCircle(center: LatLng, radiusM: number, steps = 32): [number, number][] {
  const latDelta = radiusM / 111320;
  const lngDelta = radiusM / (111320 * Math.max(0.01, Math.cos(toRad(center.lat))));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = (i / steps) * 2 * Math.PI;
    return [center.lng + lngDelta * Math.cos(angle), center.lat + latDelta * Math.sin(angle)];
  });
}

interface OrientationReading {
  alpha: number | null;
  absolute?: boolean;
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

export function headingFromOrientation(event: OrientationReading, screenAngle: number): number | null {
  if (typeof event.webkitCompassHeading === 'number') {
    if ((event.webkitCompassAccuracy ?? 0) < 0) return null;
    return normalizeDegrees(event.webkitCompassHeading + screenAngle);
  }
  if (event.absolute && typeof event.alpha === 'number') return normalizeDegrees(360 - event.alpha + screenAngle);
  return null;
}
