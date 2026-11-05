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
