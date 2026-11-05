import { describe, expect, it } from 'vitest';
import type { MemberLocation } from '../src/db';
import { createJoinedMember, filterMembers, groupRoster, parseMemberList, sortMembers } from '../src/lib/members';

const at = (memberId: string, extra: Partial<MemberLocation> = {}): MemberLocation => ({ groupId: 'g', memberId, lat: 1, lng: 1, acc: 5, t: 1, ...extra });

describe('groupRoster', () => {
  const listed = { id: 'a', name: 'Ana', color: '#38bdf8' };

  it('adds people known only by their location, without me', () => {
    const roster = groupRoster([listed, { id: 'me', name: 'Yo', color: '#fff' }], [at('new', { name: 'Nueva', color: '#fbbf24' }), at('me', { name: 'Yo' })], 'me');
    expect(roster.map((m) => m.name)).toEqual(['Ana', 'Nueva']);
  });

  it('skips a location with no name to show, and prefers the listed name', () => {
    expect(groupRoster([], [at('ghost')])).toEqual([]);
    expect(groupRoster([listed], [at('a', { name: 'Otro', phone: '351123456' })])).toEqual([{ ...listed, phone: '351123456' }]);
  });
});

describe('createJoinedMember', () => {
  it('trims input, marks it as joined and omits an empty phone', () => {
    const member = createJoinedMember('  Ana  ', ' ');
    expect(member).toMatchObject({ name: 'Ana', joined: true });
    expect(member.phone).toBeUndefined();
  });
});

const people = [{ name: 'Lucía 10' }, { name: 'María José' }, { name: 'lucia 2' }, { name: 'Ángel' }];

describe('filterMembers', () => {
  it('ignores accents, case and surrounding spaces', () => {
    expect(filterMembers(people, ' LUCIA ').map((p) => p.name)).toEqual(['Lucía 10', 'lucia 2']);
    expect(filterMembers(people, 'angel').map((p) => p.name)).toEqual(['Ángel']);
    expect(filterMembers(people, 'jose').map((p) => p.name)).toEqual(['María José']);
  });

  it('returns everyone on an empty query and nobody on no match', () => {
    expect(filterMembers(people, '  ')).toHaveLength(4);
    expect(filterMembers(people, 'zzz')).toEqual([]);
  });
});

describe('sortMembers', () => {
  it('sorts naturally without mutating the input', () => {
    const input = [{ name: 'Persona 10' }, { name: 'Ángel' }, { name: 'Persona 2' }];
    expect(sortMembers(input).map((p) => p.name)).toEqual(['Ángel', 'Persona 2', 'Persona 10']);
    expect(input[0].name).toBe('Persona 10');
  });
});

describe('parseMemberList', () => {
  const names = (text: string) => parseMemberList(text).members;

  it('reads the formats lists are usually written in', () => {
    expect(names('Juan Pérez')).toEqual([{ name: 'Juan Pérez' }]);
    expect(names('Juan Pérez, 351 123 4567')).toEqual([{ name: 'Juan Pérez', phone: '351 123 4567' }]);
    expect(names('Juan - +54 9 351 123-4567')).toEqual([{ name: 'Juan', phone: '+54 9 351 123-4567' }]);
    expect(names('María José: (351) 123-4567')).toEqual([{ name: 'María José', phone: '(351) 123-4567' }]);
    expect(names('Ana\t3511234567')).toEqual([{ name: 'Ana', phone: '3511234567' }]);
    expect(names('3511234567 Ana')).toEqual([{ name: 'Ana', phone: '3511234567' }]);
  });

  it('strips list markers without eating phones or names', () => {
    expect(names('1. Juan\n2) Ana\n- Luz\n• Sol')).toEqual([{ name: 'Juan' }, { name: 'Ana' }, { name: 'Luz' }, { name: 'Sol' }]);
    expect(names('12. Juan 3511234567')).toEqual([{ name: 'Juan', phone: '3511234567' }]);
    expect(names('Pérez, Juan')).toEqual([{ name: 'Pérez, Juan' }]);
  });

  it('does not take a short number for a phone', () => {
    expect(names('Juan 2')).toEqual([{ name: 'Juan 2' }]);
    expect(names('Grupo 2026')).toEqual([{ name: 'Grupo 2026' }]);
  });

  it('counts lines without a name, and skips blanks and windows line ends', () => {
    const result = parseMemberList('Juan\r\n\r\n3511234567\r\n---\r\nAna');
    expect(result.members.map((m) => m.name)).toEqual(['Juan', 'Ana']);
    expect(result.unreadable).toBe(2);
  });

  it('skips repeated people but keeps namesakes with another phone', () => {
    const result = parseMemberList('Juan 3511234567\nJUAN 351-123-4567\nJuan 3517654321\nAna', [{ name: 'ana' }]);
    expect(result.members).toEqual([{ name: 'Juan', phone: '3511234567' }, { name: 'Juan', phone: '3517654321' }]);
    expect(result.duplicates).toBe(2);
  });
});
