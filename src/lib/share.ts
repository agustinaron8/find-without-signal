import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Group, MeetingPoint, Member } from '../db';

const PAYLOAD_VERSION = 1;
export const MAX_MEMBERS = 100;
const MAX_POINTS = 20;
const MAX_TEXT = 2000;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_COLOR = '#38bdf8';
const PLAN_TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;

export const QR_SAFE_LENGTH = 1500;

export type SharedGroup = Omit<Group, 'offlineArea' | 'myMemberId'>;

export function encodeGroup(group: Group): string {
  const shared: SharedGroup & { v: number } = {
    v: PAYLOAD_VERSION,
    id: group.id,
    name: group.name,
    createdAt: group.createdAt,
    members: group.members.filter((m) => !m.joined),
    meetingPoints: group.meetingPoints,
    plan: group.plan,
    planTimes: group.planTimes,
    notes: group.notes,
  };
  return compressToEncodedURIComponent(JSON.stringify(shared));
}

export function buildShareUrl(group: Group, origin = window.location.origin): string {
  return `${origin}/i#${encodeGroup(group)}`;
}

// Most mistakes happen here: on iPhone a tapped link opens Safari, whose data the installed app cannot see.
export function buildInvitation(group: Group, url = buildShareUrl(group)): string {
  return [
    `Sumate a "${group.name}" en Reencuentro, para encontrarnos aunque no haya señal.`,
    'iPhone: abrí el link en Safari, seguí los pasos para instalar la app y, desde la app, tocá Importar y pegá este mensaje.',
    'Android: abrí el link en Chrome, instalá la app y unite.',
    'Hacelo con señal y antes de salir.',
    url,
  ].join('\n\n');
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.slice(0, MAX_TEXT) : undefined;

const inRange = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

function parseMember(raw: Record<string, unknown>): Member | null {
  const id = text(raw?.id);
  const name = text(raw?.name);
  if (!id || !name) return null;
  const color = typeof raw.color === 'string' && HEX_COLOR.test(raw.color) ? raw.color : FALLBACK_COLOR;
  return { id, name, color, phone: text(raw.phone) };
}

function parsePoint(raw: Record<string, unknown>): MeetingPoint | null {
  const id = text(raw?.id);
  const name = text(raw?.name);
  if (!id || !name || !inRange(raw.lat, 90) || !inRange(raw.lng, 180)) return null;
  return { id, name, lat: raw.lat, lng: raw.lng, description: text(raw.description), isPrimary: raw.isPrimary === true };
}

// Payloads come from links and QR codes, so nothing in them can be trusted.
export function decodeGroup(payload: string): SharedGroup | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(decompressFromEncodedURIComponent(payload) ?? '');
  } catch {
    return null;
  }
  if (raw?.v !== PAYLOAD_VERSION) return null;

  const id = text(raw.id);
  const name = text(raw.name);
  if (!id || !name || !Array.isArray(raw.members) || !Array.isArray(raw.meetingPoints)) return null;

  const members = raw.members.slice(0, MAX_MEMBERS).map(parseMember);
  const meetingPoints = raw.meetingPoints.slice(0, MAX_POINTS).map(parsePoint);
  if (members.includes(null) || meetingPoints.includes(null) || meetingPoints.length === 0) return null;

  const planTimes = Array.isArray(raw.planTimes)
    ? raw.planTimes.filter((t): t is string => typeof t === 'string' && PLAN_TIME.test(t))
    : undefined;

  return {
    id,
    name,
    createdAt: inRange(raw.createdAt, Number.MAX_SAFE_INTEGER) ? raw.createdAt : Date.now(),
    members: members as Member[],
    meetingPoints: meetingPoints as MeetingPoint[],
    plan: text(raw.plan),
    planTimes,
    notes: text(raw.notes),
  };
}

// People paste the whole invitation, not just the link, and a group name may contain a "#".
export function extractPayload(input: string): string {
  const trimmed = input.trim();
  const links = [...trimmed.matchAll(/\/i#(\S+)/g)];
  if (links.length > 0) return links[links.length - 1][1];
  const hash = trimmed.indexOf('#');
  return hash === -1 ? trimmed : trimmed.slice(hash + 1);
}

// An update must keep this phone's own data: the downloaded map and who "I" am.
export function mergeImportedGroup(imported: SharedGroup, existing: Group | undefined, myMemberId?: string): Group {
  const joined = (existing?.members ?? []).filter((m) => m.joined && !imported.members.some((i) => i.id === m.id));
  const members = [...imported.members, ...joined];
  return {
    ...imported,
    members,
    offlineArea: existing?.offlineArea,
    myMemberId: members.some((m) => m.id === myMemberId) ? myMemberId : undefined,
  };
}
