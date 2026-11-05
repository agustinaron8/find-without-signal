import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header';
import { db, deleteGroup } from '../db';

export default function GroupDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const group = useLiveQuery(() => db.groups.get(id).then((g) => g ?? null), [id]);

  if (group === undefined) return <Header title="Cargando…" backTo="/" />;
  if (group === null) {
    return (
      <>
        <Header title="Grupo no encontrado" backTo="/" />
        <p className="p-4 text-slate-300">Este grupo no está guardado en este teléfono.</p>
      </>
    );
  }

  const remove = async () => {
    if (!window.confirm(`¿Borrar "${group.name}" de este teléfono?`)) return;
    await deleteGroup(group.id);
    navigate('/', { replace: true });
  };

  return (
    <>
      <Header title={group.name} backTo="/" />
      <main className="mx-auto max-w-md space-y-4 p-4">
        <Link
          to={`/group/${group.id}/meet`}
          className="block rounded-xl bg-sky-400 p-5 text-center text-xl font-bold text-slate-950"
        >
          MODO ENCUENTRO
        </Link>

        {group.plan && (
          <section className="rounded-xl bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-400">Plan</h2>
            <p className="mt-1">{group.plan}</p>
          </section>
        )}

        <section className="rounded-xl bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-slate-400">Puntos de encuentro</h2>
          <ul className="mt-2 space-y-2">
            {group.meetingPoints.map((point) => (
              <li key={point.id}>
                <p className="font-semibold">
                  {point.name} {point.isPrimary && <span className="text-xs text-sky-300">Principal</span>}
                </p>
                {point.description && <p className="text-sm text-slate-400">{point.description}</p>}
              </li>
            ))}
          </ul>
        </section>

        {group.members.length > 0 && (
          <section className="rounded-xl bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-400">Personas</h2>
            <ul className="mt-2 space-y-1">
              {group.members.map((member) => (
                <li key={member.id} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: member.color }} />
                  {member.name}
                  {member.id === group.myMemberId && <span className="text-xs text-sky-300">Vos</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Link to={`/group/${group.id}/edit`} className="rounded-xl bg-slate-800 p-3 text-center font-semibold">
            Editar
          </Link>
          <button type="button" className="rounded-xl bg-slate-800 p-3 font-semibold text-red-300" onClick={remove}>
            Borrar
          </button>
        </div>
      </main>
    </>
  );
}
