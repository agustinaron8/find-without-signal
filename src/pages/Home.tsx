import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, CircleHelp, Plus, QrCode } from 'lucide-react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import { db } from '../db';

const countLabel = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

export default function Home() {
  const groups = useLiveQuery(() => db.groups.orderBy('createdAt').reverse().toArray());

  return (
    <>
      <Header title="Reencuentro" />
      <main className="mx-auto max-w-md space-y-4 p-4">
        {groups?.length === 0 && (
          <div className="rounded-xl bg-slate-900 p-5 text-slate-300">
            <p className="font-semibold text-slate-50">Todavía no tenés grupos</p>
            <p className="mt-1 text-sm">
              Creá uno mientras tengas señal: marcá los puntos de encuentro y compartilo con tu gente.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {groups?.map((group) => (
            <li key={group.id}>
              <Link
                to={`/group/${group.id}`}
                className="flex items-center justify-between rounded-xl bg-slate-900 p-4"
              >
                <span className="min-w-0">
                  <span className="block truncate text-lg font-semibold">{group.name}</span>
                  <span className="block text-sm text-slate-400">
                    {countLabel(group.members.length, 'persona', 'personas')} ·{' '}
                    {countLabel(group.meetingPoints.length, 'punto', 'puntos')}
                  </span>
                </span>
                <ChevronRight className="shrink-0 text-slate-500" />
              </Link>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/group/new"
            className="flex items-center justify-center gap-2 rounded-xl bg-sky-400 p-4 font-semibold text-slate-950"
          >
            <Plus size={20} /> Crear grupo
          </Link>
          <Link
            to="/import"
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-800 p-4 font-semibold"
          >
            <QrCode size={20} /> Importar
          </Link>
        </div>

        <Link to="/help" className="flex items-center justify-center gap-2 p-2 text-sm text-slate-400">
          <CircleHelp size={16} /> Cómo funciona e instalación
        </Link>
      </main>
    </>
  );
}
