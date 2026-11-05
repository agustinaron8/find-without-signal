import { useState } from 'react';
import { db, type Group } from '../db';
import { createJoinedMember, filterMembers, MAX_MEMBER_NAME, MEMBER_FILTER_FROM, sortMembers } from '../lib/members';

export default function IdentityForm({ group, dark = false }: { group: Group; dark?: boolean }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [filter, setFilter] = useState('');
  const input = dark ? 'w-full rounded-lg bg-slate-800 p-3 text-base' : 'w-full rounded-xl border-2 border-slate-950 p-3 text-base';
  const choice = dark ? 'rounded-lg bg-slate-800 px-3 py-2 font-semibold' : 'rounded-lg bg-slate-200 px-3 py-2 font-semibold';
  const submit = dark ? 'w-full rounded-xl bg-sky-400 p-3 font-semibold text-slate-950 disabled:opacity-50' : 'w-full rounded-xl bg-slate-950 p-3 font-semibold text-white disabled:opacity-50';

  const join = () => {
    const member = createJoinedMember(name, phone);
    db.groups.update(group.id, { members: [...group.members, member], myMemberId: member.id });
  };

  return (
    <div className="mt-2 space-y-2">
      {group.members.length > MEMBER_FILTER_FROM && (
        <input type="search" aria-label="Buscar mi nombre" placeholder="Buscá tu nombre" className={input} value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}
      {group.members.length > 0 && (
        <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
          {sortMembers(filterMembers(group.members, filter)).map((member) => (
            <button key={member.id} type="button" className={choice} onClick={() => db.groups.update(group.id, { myMemberId: member.id })}>
              {member.name}
            </button>
          ))}
        </div>
      )}
      <input aria-label="Tu nombre" maxLength={MAX_MEMBER_NAME} placeholder={group.members.length ? 'Si no estás, escribí tu nombre y apellido' : 'Tu nombre y apellido'} className={input} value={name} onChange={(e) => setName(e.target.value)} />
      <input aria-label="Tu teléfono" type="tel" placeholder="Tu teléfono (opcional, para SMS)" className={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
      <button type="button" disabled={!name.trim()} className={submit} onClick={join}>
        Unirme con este nombre
      </button>
    </div>
  );
}
