import { useLiveQuery } from 'dexie-react-hooks';
import { LocateFixed, Trash2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header';
import { db, type Group, type MeetingPoint, type Member } from '../db';
import { parseCoords } from '../lib/geo';
import { filterMembers, MEMBER_FILTER_FROM, parseMemberList } from '../lib/members';
import { MAX_MEMBERS } from '../lib/share';

const MapView = lazy(() => import('../components/MapView'));

const MEMBER_COLORS = ['#38bdf8', '#fbbf24', '#f472b6', '#34d399', '#a78bfa', '#fb923c', '#f87171', '#a3e635'];
const MAX_POINTS = 5;
const PLAN_TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;

const inputClass = 'w-full rounded-lg bg-slate-800 p-3 text-base placeholder:text-slate-500';

function newGroup(): Group {
  return { id: crypto.randomUUID(), name: '', createdAt: Date.now(), members: [], meetingPoints: [] };
}

function nextColor(members: Member[]): string {
  const used = new Set(members.map((m) => m.color));
  return MEMBER_COLORS.find((c) => !used.has(c)) ?? MEMBER_COLORS[members.length % MEMBER_COLORS.length];
}

export default function GroupEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const existing = useLiveQuery(() => (id ? db.groups.get(id).then((g) => g ?? null) : null), [id]);
  const [group, setGroup] = useState<Group | null>(id ? null : newGroup());
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [list, setList] = useState('');
  const [listStatus, setListStatus] = useState('');
  const [memberFilter, setMemberFilter] = useState('');

  useEffect(() => {
    if (existing && !group) setGroup(existing);
  }, [existing, group]);

  if (!group) {
    return <Header title={existing === null ? 'Grupo no encontrado' : 'Cargando…'} backTo="/" />;
  }

  const patch = (changes: Partial<Group>) => setGroup({ ...group, ...changes });
  const patchMember = (memberId: string, changes: Partial<Member>) =>
    patch({ members: group.members.map((m) => (m.id === memberId ? { ...m, ...changes } : m)) });
  const patchPoint = (pointId: string, changes: Partial<MeetingPoint>) =>
    patch({ meetingPoints: group.meetingPoints.map((p) => (p.id === pointId ? { ...p, ...changes } : p)) });

  const addPoint = (lat: number, lng: number) => {
    if (group.meetingPoints.length >= MAX_POINTS) {
      setError(`Podés marcar hasta ${MAX_POINTS} puntos.`);
      return;
    }
    const index = group.meetingPoints.length;
    patch({
      meetingPoints: [
        ...group.meetingPoints,
        { id: crypto.randomUUID(), name: `Punto ${String.fromCharCode(65 + index)}`, lat, lng, isPrimary: index === 0 },
      ],
    });
    setError('');
  };

  const removePoint = (pointId: string) => {
    const rest = group.meetingPoints.filter((p) => p.id !== pointId);
    if (rest.length > 0 && !rest.some((p) => p.isPrimary)) rest[0] = { ...rest[0], isPrimary: true };
    patch({ meetingPoints: rest });
  };

  const addFromPaste = () => {
    const coords = parseCoords(pasted);
    if (!coords) {
      setError('No encontré coordenadas en ese texto.');
      return;
    }
    addPoint(coords.lat, coords.lng);
    setPasted('');
  };

  const addFromLocation = () => {
    if (!navigator.geolocation) {
      setError('Este teléfono no permite obtener la ubicación.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        addPoint(coords.latitude, coords.longitude);
      },
      () => {
        setLocating(false);
        setError('No pude obtener tu ubicación. Revisá el permiso o pegá las coordenadas.');
      },
      { enableHighAccuracy: true, timeout: 20000 },
    );
  };

  const addFromList = () => {
    const { members: parsed, unreadable, duplicates } = parseMemberList(list, group.members.filter((m) => m.name.trim()));
    const named = group.members.filter((m) => m.name.trim());
    const room = MAX_MEMBERS - named.length;
    const added = parsed.slice(0, room);
    const members = [...named];
    added.forEach((person) => members.push({ id: crypto.randomUUID(), color: nextColor(members), ...person }));
    patch({ members });
    const notes = [
      `Agregué ${added.length} ${added.length === 1 ? 'persona' : 'personas'}.`,
      duplicates > 0 && `${duplicates} ya ${duplicates === 1 ? 'estaba' : 'estaban'}.`,
      unreadable > 0 && `${unreadable} ${unreadable === 1 ? 'línea' : 'líneas'} sin nombre, no ${unreadable === 1 ? 'la' : 'las'} agregué.`,
      parsed.length > room && `${parsed.length - room} quedaron afuera: el máximo es ${MAX_MEMBERS}.`,
    ];
    setListStatus(notes.filter(Boolean).join(' '));
    if (added.length > 0) setList('');
  };

  // A long list would push the meeting points far away, so it stays folded behind the search.
  const longList = group.members.length > MEMBER_FILTER_FROM;
  const shownMembers = !longList
    ? group.members
    : memberFilter.trim()
      ? filterMembers(group.members, memberFilter)
      : group.members.filter((m) => !m.name.trim() || m.id === group.myMemberId);

  const save = async () => {
    if (!group.name.trim()) return setError('Ponele un nombre al grupo.');
    if (group.meetingPoints.length === 0) return setError('Agregá al menos un punto de encuentro.');
    if (group.meetingPoints.some((p) => !p.name.trim())) return setError('Cada punto necesita un nombre.');
    const members = group.members.filter((m) => m.name.trim());
    const myMemberId = members.some((m) => m.id === group.myMemberId) ? group.myMemberId : undefined;
    const planTimes = (group.planTimes ?? []).filter(Boolean);
    if (planTimes.some((t) => !PLAN_TIME.test(t))) return setError('Escribí los horarios así: 18:00, 19:30.');
    await db.groups.put({ ...group, name: group.name.trim(), members, myMemberId, planTimes });
    navigate(`/group/${group.id}`, { replace: true });
  };

  return (
    <>
      <Header title={id ? 'Editar grupo' : 'Nuevo grupo'} backTo={id ? `/group/${id}` : '/'} />
      <main className="mx-auto max-w-md space-y-6 p-4 pb-44">
        <section>
          <label htmlFor="group-name" className="mb-1 block font-semibold">
            Nombre del grupo
          </label>
          <input
            id="group-name"
            className={inputClass}
            placeholder="Lolla 2026"
            value={group.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">Personas{group.members.length > 0 && ` (${group.members.length})`}</h2>
          {longList && (
            <input
              type="search"
              aria-label="Buscar persona"
              className={inputClass}
              placeholder="Buscá para editar o marcar quién sos"
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
            />
          )}
          {shownMembers.map((member) => (
            <div key={member.id} className="space-y-2 rounded-xl bg-slate-900 p-3">
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: member.color }} />
                <input
                  aria-label="Nombre"
                  className={inputClass}
                  placeholder="Nombre"
                  value={member.name}
                  onChange={(e) => patchMember(member.id, { name: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={`Quitar a ${member.name || 'esta persona'}`}
                  className="p-2 text-slate-400"
                  onClick={() => patch({ members: group.members.filter((m) => m.id !== member.id) })}
                >
                  <Trash2 size={20} />
                </button>
              </div>
              <input
                aria-label="Teléfono"
                type="tel"
                className={inputClass}
                placeholder="Teléfono (opcional, para SMS)"
                value={member.phone ?? ''}
                onChange={(e) => patchMember(member.id, { phone: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="my-member"
                  checked={group.myMemberId === member.id}
                  onChange={() => patch({ myMemberId: member.id })}
                />
                Soy yo
              </label>
            </div>
          ))}
          <button
            type="button"
            disabled={group.members.length >= MAX_MEMBERS}
            className="w-full rounded-xl bg-slate-800 p-3 font-semibold disabled:opacity-50"
            onClick={() =>
              patch({
                members: [...group.members, { id: crypto.randomUUID(), name: '', color: nextColor(group.members) }],
              })
            }
          >
            {group.members.length >= MAX_MEMBERS ? `Máximo ${MAX_MEMBERS} personas` : 'Agregar persona'}
          </button>
          <button type="button" className="w-full rounded-xl bg-slate-800 p-3 font-semibold" onClick={() => setListOpen(!listOpen)}>
            Pegar lista de personas
          </button>
          {listOpen && (
            <div className="space-y-2 rounded-xl bg-slate-900 p-3">
              <p className="text-sm text-slate-400">Una persona por línea. El teléfono es opcional.</p>
              <textarea
                aria-label="Lista de personas"
                rows={6}
                className={inputClass}
                placeholder={'Juan Pérez, 351 123 4567\nMaría José\nAna 3517654321'}
                value={list}
                onChange={(e) => setList(e.target.value)}
              />
              <button type="button" disabled={!list.trim()} className="w-full rounded-xl bg-sky-400 p-3 font-semibold text-slate-950 disabled:opacity-50" onClick={addFromList}>
                Agregar a la lista
              </button>
            </div>
          )}
          {listStatus && (
            <p role="status" className="text-sm text-slate-300">
              {listStatus}
            </p>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">Puntos de encuentro</h2>
          <p className="text-sm text-slate-400">Tocá el mapa para marcar un punto. Arrastralo para ajustarlo.</p>
          <Suspense fallback={<div className="h-64 rounded-xl bg-slate-900" />}>
            <MapView
              className="h-64"
              draggable
              points={group.meetingPoints}
              onTap={addPoint}
              onDragPoint={(pointId, lat, lng) => patchPoint(pointId, { lat, lng })}
            />
          </Suspense>
          {group.meetingPoints.map((point) => (
            <div key={point.id} className="space-y-2 rounded-xl bg-slate-900 p-3">
              <div className="flex items-center gap-2">
                <input
                  aria-label="Nombre del punto"
                  className={inputClass}
                  placeholder="Torre de sonido"
                  value={point.name}
                  onChange={(e) => patchPoint(point.id, { name: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={`Quitar ${point.name || 'este punto'}`}
                  className="p-2 text-slate-400"
                  onClick={() => removePoint(point.id)}
                >
                  <Trash2 size={20} />
                </button>
              </div>
              <input
                aria-label="Descripción"
                className={inputClass}
                placeholder="Debajo del cartel azul (opcional)"
                value={point.description ?? ''}
                onChange={(e) => patchPoint(point.id, { description: e.target.value })}
              />
              <p className="text-xs text-slate-400">
                {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="primary-point"
                  checked={!!point.isPrimary}
                  onChange={() =>
                    patch({ meetingPoints: group.meetingPoints.map((p) => ({ ...p, isPrimary: p.id === point.id })) })
                  }
                />
                Punto principal
              </label>
            </div>
          ))}
          <button
            type="button"
            disabled={locating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 p-3 font-semibold disabled:opacity-60"
            onClick={addFromLocation}
          >
            <LocateFixed size={20} /> {locating ? 'Buscando ubicación…' : 'Usar mi ubicación actual'}
          </button>
          <div className="flex gap-2">
            <input
              aria-label="Coordenadas o link de Google Maps"
              className={inputClass}
              placeholder="Pegá coordenadas o link de Maps"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
            <button type="button" className="shrink-0 rounded-lg bg-slate-800 px-4 font-semibold" onClick={addFromPaste}>
              Agregar
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <label htmlFor="group-plan" className="block font-semibold">
            Plan de reencuentro
          </label>
          <textarea
            id="group-plan"
            rows={3}
            className={inputClass}
            placeholder="Si nos perdemos, a cada hora en punto en el Punto A"
            value={group.plan ?? ''}
            onChange={(e) => patch({ plan: e.target.value })}
          />
          <label htmlFor="group-times" className="block text-sm text-slate-300">
            Horarios (opcional, separados por coma)
          </label>
          <input
            id="group-times"
            className={inputClass}
            placeholder="18:00, 19:00"
            value={(group.planTimes ?? []).join(', ')}
            onChange={(e) =>
              patch({ planTimes: e.target.value.split(',').map((t) => t.trim()) })
            }
          />
        </section>

        <div
          className="fixed inset-x-0 bottom-0 bg-slate-950 p-4"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          {error && (
            <p role="alert" className="mx-auto mb-2 max-w-md rounded-lg bg-red-950 p-3 text-red-200">
              {error}
            </p>
          )}
          <button type="button" className="mx-auto block w-full max-w-md rounded-xl bg-sky-400 p-4 font-semibold text-slate-950" onClick={save}>
            Guardar grupo
          </button>
        </div>
      </main>
    </>
  );
}
