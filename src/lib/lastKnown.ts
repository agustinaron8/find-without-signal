import type { MemberLocation } from '../db';
import { MAX_MEMBER_NAME } from './members';

export const LOCATION_ENDPOINT = '/api/loc';
export const LOCATION_MAX_AGE_MS = 72 * 60 * 60 * 1000;
export const LOCATION_STALE_MS = 15 * 60 * 1000;
export const SYNC_INTERVAL_MS = 3 * 60 * 1000;
const RETRY_BASE_MS = 30 * 1000;
// In a crowd a moment of signal is what we are waiting for, so failures retry sooner than the normal pace.
const RETRY_MAX_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 15 * 1000;
const MAX_ENTRIES = 150;
const IV_BYTES = 12;
const CLOCK_SKEW_MS = 60 * 60 * 1000;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const PHONE = /^[+\d\s().-]{7,25}$/;

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64Url = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

const sha256 = async (value: string) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

export const sharingKey = (groupId: string) => `share-location-${groupId}`;
export const OFF_PENDING = 'off';
// Who this phone last published as, so that entry can be removed even if the identity changes later.
export const sharedAsKey = (groupId: string) => `shared-as-${groupId}`;

export const STATUSES: Record<string, string> = {
  ok: 'Estoy bien',
  going: 'Voy al punto',
  staying: 'Me quedo acá',
};
export const statusKey = (groupId: string) => `my-status-${groupId}`;

export interface LocationKeys {
  channel: string;
  key: CryptoKey;
}

// The group id is random and only travels in the share link's hash, so every phone holding the
// group can derive these and the server cannot. It also means groups shared before this feature
// existed work without sharing them again.
export async function deriveLocationKeys(groupId: string): Promise<LocationKeys> {
  const channel = toBase64Url((await sha256(`reencuentro/channel/${groupId}`)).slice(0, 16));
  const raw = await sha256(`reencuentro/key/${groupId}`);
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { channel, key };
}

export const memberTag = async (channel: string, memberId: string): Promise<string> =>
  toBase64Url((await sha256(`${channel}/${memberId}`)).slice(0, 16));

export interface LocationFix {
  memberId: string;
  lat: number;
  lng: number;
  acc: number;
  t: number;
  name?: string;
  color?: string;
  phone?: string;
  status?: string;
}

export async function encryptLocation(key: CryptoKey, fix: LocationFix): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  // Names can be longer when they come from a list, and the server limits the size of what it stores.
  const plain = encoder.encode(
    JSON.stringify({
      i: fix.memberId,
      a: fix.lat,
      o: fix.lng,
      c: Math.round(fix.acc),
      t: fix.t,
      n: fix.name?.slice(0, MAX_MEMBER_NAME),
      k: fix.color,
      p: fix.phone && PHONE.test(fix.phone) ? fix.phone : undefined,
      s: fix.status,
    }),
  );
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const out = new Uint8Array(IV_BYTES + cipher.length);
  out.set(iv);
  out.set(cipher, IV_BYTES);
  return toBase64Url(out);
}

const finite = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

// Anything the server returns is untrusted: whoever learns the channel can write garbage to it.
export async function decryptLocation(key: CryptoKey, data: string, now = Date.now()): Promise<LocationFix | null> {
  try {
    const bytes = fromBase64Url(data);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES) }, key, bytes.slice(IV_BYTES));
    const raw = JSON.parse(new TextDecoder().decode(plain));
    if (typeof raw?.i !== 'string' || !finite(raw.a, 90) || !finite(raw.o, 180) || !finite(raw.c, 1e7)) return null;
    if (!finite(raw.t, Number.MAX_SAFE_INTEGER) || raw.t > now + CLOCK_SKEW_MS) return null;
    return {
      memberId: raw.i,
      lat: raw.a,
      lng: raw.o,
      acc: raw.c,
      t: raw.t,
      ...(typeof raw.n === 'string' && raw.n.trim() ? { name: raw.n.trim().slice(0, MAX_MEMBER_NAME) } : {}),
      ...(typeof raw.k === 'string' && HEX_COLOR.test(raw.k) ? { color: raw.k } : {}),
      ...(typeof raw.p === 'string' && PHONE.test(raw.p) ? { phone: raw.p } : {}),
      ...(typeof raw.s === 'string' && Object.prototype.hasOwnProperty.call(STATUSES, raw.s) ? { status: raw.s } : {}),
    };
  } catch {
    return null;
  }
}

export function nextSyncDelay(failures: number, jitter = Math.random()): number {
  if (failures === 0) return SYNC_INTERVAL_MS;
  return Math.min(RETRY_BASE_MS * 2 ** (failures - 1), RETRY_MAX_MS) * (0.75 + jitter * 0.5);
}

export interface SyncWrite {
  m: string;
  d: string | null;
}

// One request both writes and reads, so a moment of signal is enough for both.
export async function exchangeLocations(channel: string, write?: SyncWrite, fetcher: typeof fetch = fetch): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(LOCATION_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ c: channel, ...write }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const { e } = (await response.json()) as { e?: Record<string, unknown> };
    return Object.values(e ?? {})
      .filter((v): v is string => typeof v === 'string')
      .slice(0, MAX_ENTRIES);
  } finally {
    clearTimeout(timer);
  }
}

// The server may hand back an older copy, and a location must never move backwards in time.
export function newestLocations(
  groupId: string,
  fixes: LocationFix[],
  stored: MemberLocation[],
  me?: string,
): MemberLocation[] {
  const newest = new Map<string, { t: number; status?: string }>(stored.map((s) => [s.memberId, s]));
  const updates = new Map<string, MemberLocation>();
  for (const fix of fixes) {
    const known = newest.get(fix.memberId);
    // A still phone keeps the same fix, and its status can change anyway.
    const stale = known && (fix.t < known.t || (fix.t === known.t && fix.status === known.status));
    if (fix.memberId === me || stale) continue;
    newest.set(fix.memberId, fix);
    updates.set(fix.memberId, { groupId, ...fix });
  }
  return [...updates.values()];
}

// Must start synchronously: an iPhone can freeze the page right after it reports the lock.
export function sendWithoutWaiting(channel: string, write: SyncWrite): void {
  fetch(LOCATION_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ c: channel, ...write, w: 1 }),
    keepalive: true,
  }).catch(() => undefined);
}

// Best effort when a group is deleted: what cannot be removed now expires on the server by itself.
export async function forgetSharedLocation(groupId: string): Promise<void> {
  const memberId = localStorage.getItem(sharedAsKey(groupId));
  localStorage.removeItem(sharingKey(groupId));
  localStorage.removeItem(sharedAsKey(groupId));
  if (!memberId) return;
  const { channel } = await deriveLocationKeys(groupId);
  sendWithoutWaiting(channel, { m: await memberTag(channel, memberId), d: null });
}

export function formatAge(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 || hours >= 6 ? `hace ${hours} h` : `hace ${hours} h ${rest} min`;
}
