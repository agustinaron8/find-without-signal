export const MEMBER_FILTER_FROM = 12;

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Typed on a phone in a crowd, so accents and case must not matter.
export function filterMembers<T extends { name: string }>(members: T[], query: string): T[] {
  const wanted = normalize(query.trim());
  return wanted ? members.filter((m) => normalize(m.name).includes(wanted)) : members;
}

export function sortMembers<T extends { name: string }>(members: T[]): T[] {
  return [...members].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
}

export interface ParsedMember {
  name: string;
  phone?: string;
}

const LIST_MARKER = /^(?:\d{1,3}[.)-]\s+|[-*•·]\s+)/;
const TRAILING_PHONE = /^(.*?)[\s,;:–-]*(\+?\(?\d[\d\s().-]{6,})$/;
const LEADING_PHONE = /^(\+?\(?\d[\d\s().-]{6,}\d)[\s,;:–-]+(\D.*)$/;
const MIN_PHONE_DIGITS = 7;
const MAX_NAME = 60;

const hasPhoneDigits = (phone: string) => phone.replace(/\D/g, '').length >= MIN_PHONE_DIGITS;

function parseLine(raw: string): ParsedMember | null {
  const line = raw.trim().replace(LIST_MARKER, '').trim();
  let name = line;
  let phone: string | undefined;
  const trailing = line.match(TRAILING_PHONE);
  const leading = line.match(LEADING_PHONE);
  if (trailing && hasPhoneDigits(trailing[2])) {
    name = trailing[1];
    phone = trailing[2].trim();
  } else if (leading && hasPhoneDigits(leading[1])) {
    name = leading[2];
    phone = leading[1].trim();
  }
  name = name.replace(/[\s,;:–-]+$/, '').trim().slice(0, MAX_NAME);
  return /\p{L}/u.test(name) ? { name, ...(phone ? { phone } : {}) } : null;
}

export interface ParsedList {
  members: ParsedMember[];
  unreadable: number;
  duplicates: number;
}

// One person per line, as lists come out of WhatsApp or Notes: "Juan Pérez, 351 123 4567".
export function parseMemberList(text: string, existing: ParsedMember[] = []): ParsedList {
  const key = (m: ParsedMember) => `${normalize(m.name)}|${(m.phone ?? '').replace(/\D/g, '')}`;
  const seen = new Set(existing.map(key));
  const members: ParsedMember[] = [];
  let unreadable = 0;
  let duplicates = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const parsed = parseLine(raw);
    if (!parsed) unreadable++;
    else if (seen.has(key(parsed))) duplicates++;
    else {
      seen.add(key(parsed));
      members.push(parsed);
    }
  }
  return { members, unreadable, duplicates };
}
