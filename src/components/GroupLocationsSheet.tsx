import { Moon, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { db, type Group, type MemberLocation } from '../db';
import type { Position } from '../hooks/useGeolocation';
import { formatDistance, haversine } from '../lib/geo';
import { formatAge, LOCATION_STALE_MS } from '../lib/lastKnown';
import { filterMembers, MEMBER_FILTER_FROM, sortMembers } from '../lib/members';

interface Props {
  group: Group;
  locations: MemberLocation[];
  position: Position | null;
  sharing: boolean;
  onSharingChange: (value: boolean) => void;
  lastSync: number | null;
  failing: boolean;
  syncing: boolean;
  onSyncNow: () => void;
  onGoTo: (memberId: string) => void;
  onPocket: () => void;
  screenStaysOn: boolean;
  onClose: () => void;
  now: number;
}

export default function GroupLocationsSheet({
  group,
  locations,
  position,
  sharing,
  onSharingChange,
  lastSync,
  failing,
  syncing,
  onSyncNow,
  onGoTo,
  onPocket,
  screenStaysOn,
  onClose,
  now,
}: Props) {
  const [filter, setFilter] = useState('');
  const others = group.members.filter((m) => m.id !== group.myMemberId);
  const lastSeen = new Map(locations.map((l) => [l.memberId, l.t]));
  // Whoever has a location comes first, newest on top: that is who can actually be found.
  const visible = sortMembers(filterMembers(others, filter)).sort((a, b) => (lastSeen.get(b.id) ?? 0) - (lastSeen.get(a.id) ?? 0));
  const status = syncing
    ? 'Buscando red…'
    : failing
      ? `Sin conexión${lastSync ? `. Último contacto: ${formatAge(now - lastSync)}` : ''}. Sigo intentando.`
      : lastSync
        ? `Actualizado ${formatAge(now - lastSync)}`
        : '';

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-white p-4 text-slate-950" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
      <div className="mx-auto max-w-md space-y-3 pb-4">
        <h2 className="text-2xl font-bold">Ubicación del grupo</h2>
        <p className="rounded-lg bg-amber-100 p-3 text-sm font-semibold text-amber-950">
          No es en vivo: es el último dato que logró salir. Si no llega nada, andá al punto y horario acordados.
        </p>

        {group.myMemberId ? (
          <label className="flex items-start gap-3 rounded-xl border-2 border-slate-950 p-3">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={sharing} onChange={(e) => onSharingChange(e.target.checked)} />
            <span>
              <span className="block font-bold">Compartir mi ubicación con el grupo</span>
              <span className="block text-sm text-slate-700">
                Se manda cada 3 minutos si hay algo de red, solo con esta pantalla abierta. Va cifrada y se borra a los 3 días.
              </span>
            </span>
          </label>
        ) : (
          <div className="rounded-xl border-2 border-slate-950 p-3">
            <p className="font-bold">¿Quién sos en este grupo?</p>
            <p className="mb-2 text-sm text-slate-700">Elegilo para poder compartir tu ubicación.</p>
            <div className="flex flex-wrap gap-2">
              {group.members.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="rounded-lg bg-slate-200 px-3 py-2 font-semibold"
                  onClick={() => db.groups.update(group.id, { myMemberId: member.id })}
                >
                  {member.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {group.myMemberId && sharing && (
          <div className="rounded-xl bg-slate-100 p-3">
            <p className="text-sm text-slate-700">
              Si bloqueás el teléfono deja de enviar. Modo bolsillo apaga la imagen y sigue enviando, pero el teléfono queda
              desbloqueado y gasta batería. Usalo solo si se separaron o te están buscando.
            </p>
            {!screenStaysOn && (
              <p data-testid="wake-warning" className="mt-2 text-sm font-semibold text-red-800">
                Este teléfono puede apagar la pantalla solo. Antes de usarlo, poné el bloqueo automático en "Nunca".
              </p>
            )}
            <button type="button" className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 p-3 font-semibold text-white" onClick={onPocket}>
              <Moon size={20} /> Modo bolsillo
            </button>
          </div>
        )}

        {others.length > MEMBER_FILTER_FROM && (
          <input
            type="search"
            aria-label="Buscar persona"
            placeholder={`Buscar entre ${others.length} personas`}
            className="w-full rounded-xl border-2 border-slate-950 p-3 text-base"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}

        <ul className="space-y-2">
          {visible.map((member) => {
            const location = locations.find((l) => l.memberId === member.id);
            const stale = !!location && now - location.t > LOCATION_STALE_MS;
            return (
              <li key={member.id} data-testid="member-location" className="flex items-center gap-3 rounded-xl bg-slate-100 p-3">
                <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: member.color }} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{member.name}</p>
                  {location ? (
                    <p className={`text-sm ${stale ? 'font-semibold text-red-800' : 'text-slate-700'}`}>
                      {position && `${formatDistance(haversine(position, location))} · `}
                      {formatAge(now - location.t)}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-700">Sin datos todavía</p>
                  )}
                </div>
                {location && (
                  <button type="button" className="rounded-lg bg-slate-950 px-4 py-2 font-semibold text-white" onClick={() => onGoTo(member.id)}>
                    Ir
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {others.length === 0 && <p className="text-slate-700">No hay otras personas cargadas en este grupo.</p>}

        <p role="status" className="min-h-5 text-sm text-slate-700">
          {status}
        </p>
        <button type="button" disabled={syncing} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-200 p-3 font-semibold disabled:opacity-50" onClick={onSyncNow}>
          <RefreshCw size={20} /> Actualizar ahora
        </button>
        <button type="button" className="w-full rounded-xl bg-slate-950 p-3 font-semibold text-white" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
