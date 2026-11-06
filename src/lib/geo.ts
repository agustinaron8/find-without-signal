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
  new RegExp(`/maps/(?:search|place)/${NUM},[\\s+]*${NUM}`),
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
  // Once NaN, the sum would stay NaN for the rest of the session.
  if (!Number.isFinite(previous)) return target;
  const delta = ((target - previous) % 360 + 540) % 360 - 180;
  return previous + delta;
}

const ARRIVAL_MIN_M = 15;
const ARRIVAL_EXIT_FACTOR = 1.5;

// The wider exit radius keeps GPS jitter from flipping between the arrow and the arrival screen.
export function hasArrived(distance: number, accuracy: number, wasArrived = false): boolean {
  if (isPoorFix(accuracy)) return false;
  const radius = Math.max(accuracy, ARRIVAL_MIN_M);
  return distance <= (wasArrived ? radius * ARRIVAL_EXIT_FACTOR : radius);
}

export const SAVE_MAX_ACCURACY_M = 25;
export const combinedAccuracy = (a: number, b = 0) => Math.hypot(a, b);

// Signed shortest turn from b to a, in the range -180..180.
export const angleBetween = (a: number, b: number) => ((a - b) % 360 + 540) % 360 - 180;

const FADEA = { lat: -31.45, lng: -64.27 };
const FADEA_DECLINATION = -7.1;
const DECLINATION_RADIUS_M = 300000;

// Compasses report magnetic north and bearings use true north. World Magnetic Model value for
// November 2026; it stays within about 1.5° across the radius, and is not known outside it.
export const magneticDeclination = (at: LatLng) => (haversine(at, FADEA) <= DECLINATION_RADIUS_M ? FADEA_DECLINATION : 0);

const FOOT_SPEED_MS = 3;

export interface Fix extends LatLng {
  accuracy: number;
  t: number;
}

// Weighs each fix by its accuracy, so a coarse cell fix cannot throw away a good GPS position.
// The error only grows by what the person could have moved, and never drops below what the
// phone reports: averaging does not remove the error from signals bouncing off nearby things.
export function filterFix(previous: Fix | null, next: Fix, speed: number | null = null): Fix {
  if (!previous || ![previous.lat, previous.lng, previous.accuracy].every(Number.isFinite)) return next;
  const seconds = Math.max(0, next.t - previous.t) / 1000;
  const grown = previous.accuracy + Math.max(FOOT_SPEED_MS, speed ?? 0) * seconds;
  const gain = grown ** 2 / (grown ** 2 + Math.max(next.accuracy, 1) ** 2);
  return {
    lat: previous.lat + gain * (next.lat - previous.lat),
    lng: previous.lng + gain * (next.lng - previous.lng),
    accuracy: Math.min(next.accuracy, grown),
    t: next.t,
  };
}

export const WALK_WINDOW_MS = 20000;
const WALK_MIN_SPAN_MS = 5000;
const WALK_MIN_DISTANCE_M = 12;
const WALK_MIN_STRAIGHTNESS = 0.7;

// Where the person is really going, from their own positions: no magnet can disturb this.
export function recentWalk(samples: Fix[]): { course: number } | null {
  const last = samples[samples.length - 1];
  if (!last) return null;
  const recent = samples.filter((s) => last.t - s.t <= WALK_WINDOW_MS);
  const first = recent[0];
  if (last.t - first.t < WALK_MIN_SPAN_MS) return null;
  const moved = haversine(first, last);
  const worst = Math.max(first.accuracy, last.accuracy);
  if (moved < Math.max(WALK_MIN_DISTANCE_M, worst * 1.5)) return null;
  const path = recent.slice(1).reduce((sum, s, i) => sum + haversine(recent[i], s), 0);
  if (moved / path < WALK_MIN_STRAIGHTNESS) return null;
  return { course: bearing(first, last) };
}

export type WalkTrend = 'closer' | 'sideways' | 'away';

export function walkTrend(course: number, toTarget: number): WalkTrend {
  const off = Math.abs(angleBetween(course, toTarget));
  if (off <= 60) return 'closer';
  return off >= 120 ? 'away' : 'sideways';
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

export function currentTrip<T extends { t: number }>(sortedPoints: T[]): T[] {
  const start = currentTripStart(sortedPoints);
  return start ? sortedPoints.slice(sortedPoints.indexOf(start)) : [];
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

export interface OrientationReading {
  alpha: number | null;
  beta?: number | null;
  gamma?: number | null;
  absolute?: boolean;
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

// The compass follows the top of the phone, and the page only turns with it when it is really
// sideways. A page drawn upright needs no turn, whatever angle the browser reports.
export function effectiveScreenAngle(reported: number, width: number, height: number): number {
  return width <= height && Math.abs(reported) % 180 === 90 ? 0 : reported;
}

export function headingFromOrientation(event: OrientationReading, screenAngle: number): number | null {
  if (typeof event.webkitCompassHeading === 'number') {
    if ((event.webkitCompassAccuracy ?? 0) < 0 || !Number.isFinite(event.webkitCompassHeading)) return null;
    return normalizeDegrees(event.webkitCompassHeading + screenAngle);
  }
  if (!event.absolute || !Number.isFinite(event.alpha)) return null;
  const alpha = event.alpha as number;
  if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return normalizeDegrees(360 - alpha + screenAngle);
  return headingFromAngles(alpha, event.beta as number, event.gamma as number, screenAngle);
}

// Alpha alone is wrong on a raised phone, where turning shows up in gamma instead. This follows
// the top of the screen when flat and the back of the phone as it rises, as a person aims it.
function headingFromAngles(alpha: number, beta: number, gamma: number, screenAngle: number): number {
  const [sA, cA] = [Math.sin(toRad(alpha)), Math.cos(toRad(alpha))];
  const [sB, cB] = [Math.sin(toRad(beta)), Math.cos(toRad(beta))];
  const [sG, cG] = [Math.sin(toRad(gamma)), Math.cos(toRad(gamma))];
  const [sS, cS] = [Math.sin(toRad(screenAngle)), Math.cos(toRad(screenAngle))];
  // Device axes as east, north and up, from the rotation matrix in the W3C spec.
  const right = [cA * cG - sA * sB * sG, cG * sA + cA * sB * sG, -cB * sG];
  const top = [-cB * sA, cA * cB, sB];
  const back = [-cA * sG - sA * sB * cG, -sA * sG + cA * sB * cG];
  const [east, north, up] = top.map((axis, i) => axis * cS + right[i] * sS);
  const lean = Math.max(0, up);
  return normalizeDegrees(toDeg(Math.atan2(east + back[0] * lean, north + back[1] * lean)));
}
