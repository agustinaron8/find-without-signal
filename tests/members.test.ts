import { describe, expect, it } from 'vitest';
import { filterMembers, sortMembers } from '../src/lib/members';

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
