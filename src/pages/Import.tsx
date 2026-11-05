import { useLiveQuery } from 'dexie-react-hooks';
import { Camera } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import QRScanner from '../components/QRScanner';
import { db } from '../db';
import { isIOSBrowser } from '../lib/platform';
import { createJoinedMember, filterMembers, MAX_MEMBER_NAME, MAX_MEMBER_PHONE, MEMBER_FILTER_FROM, sortMembers } from '../lib/members';
import { OFF_PENDING, sharingKey } from '../lib/lastKnown';
import { buildShareUrl, decodeGroup, extractPayload, mergeImportedGroup, type SharedGroup } from '../lib/share';

const INVALID_MESSAGE = 'Ese código no es un grupo de Reencuentro válido.';

export default function Import() {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [group, setGroup] = useState<SharedGroup | null>(null);
  const [scanning, setScanning] = useState(false);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState('');
  const [myMemberId, setMyMemberId] = useState<string>();
  const [memberFilter, setMemberFilter] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinPhone, setJoinPhone] = useState('');
  const [shareLocation, setShareLocation] = useState(false);
  const [stayInSafari, setStayInSafari] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const existing = useLiveQuery(() => (group ? db.groups.get(group.id) : undefined), [group?.id]);

  const load = (input: string): boolean => {
    const decoded = decodeGroup(extractPayload(input));
    if (!decoded) {
      setError(INVALID_MESSAGE);
      return false;
    }
    setGroup(decoded);
    setError('');
    setScanning(false);
    return true;
  };

  useEffect(() => {
    if (!hash) return;
    const decoded = decodeGroup(hash.slice(1));
    setGroup(decoded);
    setError(decoded ? '' : INVALID_MESSAGE);
  }, [hash]);

  useEffect(() => {
    if (existing?.myMemberId) setMyMemberId(existing.myMemberId);
  }, [existing?.myMemberId]);

  // Re-importing must show the real state, or leaving it untouched would change what this phone shares.
  useEffect(() => {
    if (group?.id) setShareLocation(localStorage.getItem(sharingKey(group.id)) === '1');
  }, [group?.id]);

  const iosSafariGate = isIOSBrowser() && !stayInSafari;

  const copyLink = async () => {
    if (!group) return;
    await navigator.clipboard.writeText(buildShareUrl({ ...group }));
    setLinkCopied(true);
  };

  const save = async () => {
    if (!group) return;
    const wasSharing = localStorage.getItem(sharingKey(group.id)) === '1';
    if (shareLocation && (joinName.trim() || myMemberId)) localStorage.setItem(sharingKey(group.id), '1');
    else if (wasSharing) localStorage.setItem(sharingKey(group.id), OFF_PENDING);
    if (joinName.trim()) {
      const member = createJoinedMember(joinName, joinPhone);
      const merged = mergeImportedGroup(group, existing);
      await db.groups.put({ ...merged, members: [...merged.members, member], myMemberId: member.id });
    } else {
      await db.groups.put(mergeImportedGroup(group, existing, myMemberId));
    }
    navigate(`/group/${group.id}`, { replace: true, state: { autoDownloadMap: true } });
  };

  if (group) {
    return (
      <>
        <Header title="Importar grupo" backTo="/" />
        <main className="mx-auto max-w-md space-y-4 p-4">
          <section className="rounded-xl bg-slate-900 p-4">
            <h2 className="text-2xl font-bold">{group.name}</h2>
            <p className="text-slate-300">
              {group.members.length > 0 && `${group.members.length} ${group.members.length === 1 ? 'persona' : 'personas'} · `}
              {group.meetingPoints.length} {group.meetingPoints.length === 1 ? 'punto' : 'puntos'}
            </p>
            {group.plan && <p className="mt-2 text-sm text-slate-300">{group.plan}</p>}
          </section>

          {iosSafariGate ? (
            <>
              <section className="space-y-3 rounded-xl bg-amber-950 p-4 text-amber-50">
                <h2 className="text-lg font-bold">Falta un paso: instalar la app</h2>
                <p className="text-sm">En iPhone, lo que guardes en Safari no aparece en la app instalada.</p>
                <ol className="list-decimal space-y-2 pl-5">
                  <li>
                    <button type="button" className="rounded-lg bg-amber-200 px-3 py-2 font-semibold text-amber-950" onClick={copyLink}>
                      {linkCopied ? 'Link copiado' : 'Copiar el link'}
                    </button>
                  </li>
                  <li>Tocá Compartir, abajo en Safari, y elegí "Agregar a inicio".</li>
                  <li>Abrí Reencuentro desde el ícono nuevo.</li>
                  <li>Tocá Importar y pegá el link.</li>
                </ol>
              </section>
              <button type="button" className="w-full p-3 text-sm text-slate-400 underline" onClick={() => setStayInSafari(true)}>
                Seguir en Safari igual (no recomendado)
              </button>
            </>
          ) : (
            <>
              {!(existing?.myMemberId && existing.members.some((m) => m.joined && m.id === existing.myMemberId)) && (
                <section className="space-y-2 rounded-xl bg-slate-900 p-4">
                  <label htmlFor="join-name" className="block font-semibold">
                    {group.members.length > 0 ? 'Si no estás en la lista, escribí tu nombre' : 'Tu nombre y apellido'}
                  </label>
                  <input
                    id="join-name"
                    maxLength={MAX_MEMBER_NAME}
                    className="w-full rounded-lg bg-slate-800 p-3 text-base"
                    placeholder="Como te conocen en el grupo"
                    value={joinName}
                    onChange={(e) => {
                      setJoinName(e.target.value);
                      setMyMemberId(undefined);
                    }}
                  />
                  <input
                    aria-label="Tu teléfono"
                    type="tel"
                    maxLength={MAX_MEMBER_PHONE}
                    className="w-full rounded-lg bg-slate-800 p-3 text-base"
                    placeholder="Tu teléfono (opcional, para SMS)"
                    value={joinPhone}
                    onChange={(e) => setJoinPhone(e.target.value)}
                  />
                </section>
              )}

              {group.members.length > 0 && (
                <fieldset className="space-y-1 rounded-xl bg-slate-900 p-4">
                  <legend className="float-left mb-2 font-semibold">¿Quién sos vos?</legend>
                  {group.members.length > MEMBER_FILTER_FROM && (
                    <input
                      type="search"
                      aria-label="Buscar mi nombre"
                      placeholder="Buscá tu nombre"
                      className="clear-both mb-2 block w-full rounded-lg bg-slate-800 p-3 text-base"
                      value={memberFilter}
                      onChange={(e) => setMemberFilter(e.target.value)}
                    />
                  )}
                  {sortMembers(filterMembers(group.members, memberFilter)).map((member) => (
                    <label key={member.id} className="clear-both flex items-center gap-3 py-2">
                      <input
                        type="radio"
                        name="import-member"
                        checked={myMemberId === member.id}
                        onChange={() => {
                          setMyMemberId(member.id);
                          setJoinName('');
                        }}
                      />
                      <span className="h-3 w-3 rounded-full" style={{ background: member.color }} />
                      {member.name}
                    </label>
                  ))}
                </fieldset>
              )}

              {(joinName.trim() || myMemberId) && (
                <label className="flex items-start gap-3 rounded-xl bg-slate-900 p-4">
                  <input type="checkbox" className="mt-1 h-5 w-5" checked={shareLocation} onChange={(e) => setShareLocation(e.target.checked)} />
                  <span>
                    <span className="block font-semibold">Compartir mi ubicación con el grupo</span>
                    <span className="block text-sm text-slate-400">
                      Para que te encuentren, si hay algo de red y con el Modo Encuentro abierto. Va cifrada y se puede apagar cuando quieras.
                    </span>
                  </span>
                </label>
              )}

              {existing && <p className="text-sm text-amber-200">Ya tenés este grupo. Se actualizará con estos datos.</p>}
              <button type="button" className="w-full rounded-xl bg-sky-400 p-4 font-semibold text-slate-950" onClick={save}>
                {existing ? 'Actualizar' : 'Guardar grupo'}
              </button>
            </>
          )}
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="Importar grupo" backTo="/" />
      <main className="mx-auto max-w-md space-y-4 p-4">
        {scanning ? (
          <QRScanner onResult={load} />
        ) : (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-400 p-4 font-semibold text-slate-950"
            onClick={() => {
              setError('');
              setScanning(true);
            }}
          >
            <Camera size={20} /> Escanear QR
          </button>
        )}
        <p className="text-sm text-slate-400">El escaneo funciona sin señal. Lo único que necesita internet es bajar el mapa.</p>

        <section className="space-y-2">
          <label htmlFor="import-link" className="block font-semibold">
            O pegá el link
          </label>
          <textarea
            id="import-link"
            rows={3}
            className="w-full rounded-lg bg-slate-800 p-3 text-base"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <button type="button" className="w-full rounded-xl bg-slate-800 p-3 font-semibold" onClick={() => load(pasted)}>
            Importar link
          </button>
        </section>

        {error && (
          <p role="alert" className="rounded-lg bg-red-950 p-3 text-red-200">
            {error}
          </p>
        )}
      </main>
    </>
  );
}
