import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Group } from '../db';
import IdentityForm from './IdentityForm';
import { useHeading } from '../hooks/useHeading';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { isIOSBrowser, isStandalone } from '../lib/platform';
import { areaCoversPoints } from '../lib/tiles';

const actionClass = 'mt-2 block w-full rounded-lg bg-slate-800 p-2 text-center text-sm font-semibold';

function Item({ ok, label, children }: { ok: boolean; label: string; children?: ReactNode }) {
  return (
    <li>
      <p className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 size={20} aria-label="Listo" className="shrink-0 text-emerald-400" />
        ) : (
          <TriangleAlert size={20} aria-label="Pendiente" className="shrink-0 text-amber-400" />
        )}
        {label}
      </p>
      {!ok && children}
    </li>
  );
}

export default function OfflineChecklist({ group }: { group: Group }) {
  const { canInstall, install } = useInstallPrompt();
  const { heading, needsPermission, denied, requestPermission } = useHeading();
  const [persisted, setPersisted] = useState(false);
  const [location, setLocation] = useState<'unknown' | 'granted' | 'denied' | 'asking'>('unknown');
  const [compassGranted, setCompassGranted] = useState(false);
  const [showAirplane, setShowAirplane] = useState(false);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted);
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((status) => {
        if (status.state === 'granted') setLocation('granted');
        if (status.state === 'denied') setLocation('denied');
      })
      .catch(() => undefined);
  }, []);

  const askPersist = async () => setPersisted((await navigator.storage?.persist?.()) ?? false);

  const askLocation = () => {
    setLocation('asking');
    navigator.geolocation.getCurrentPosition(
      () => setLocation('granted'),
      (err) => setLocation(err.code === err.PERMISSION_DENIED ? 'denied' : 'unknown'),
      { enableHighAccuracy: true, timeout: 20000 },
    );
  };

  const askCompass = async () => setCompassGranted(await requestPermission());

  const mapReady = !!group.offlineArea && areaCoversPoints(group.offlineArea, group.meetingPoints);
  const compassOk = compassGranted || heading !== null || !needsPermission;

  return (
    <section className="rounded-xl bg-slate-900 p-4">
      <h2 className="font-semibold">Listo para usar sin señal</h2>
      <p className="mt-1 text-sm text-slate-400">
        En iPhone, ubicación y brújula se vuelven a pedir al abrir la app de nuevo. Es una regla de Apple y funciona sin señal: aceptá cuando aparezca.
      </p>
      <ul className="mt-3 space-y-3">
        <Item ok={isStandalone()} label="App instalada">
          {canInstall && (
            <button type="button" className={actionClass} onClick={install}>
              Instalar
            </button>
          )}
          {!canInstall && (
            <Link to="/help" className={actionClass}>
              {isIOSBrowser() ? 'Cómo agregarla a inicio' : 'Cómo instalarla'}
            </Link>
          )}
        </Item>
        <Item ok={persisted} label="Almacenamiento persistente">
          <button type="button" className={actionClass} onClick={askPersist}>
            Pedir que no se borre
          </button>
        </Item>
        <Item ok={mapReady} label="Mapa de la zona bajado">
          <p className="mt-1 text-sm text-slate-400">Bajalo en la tarjeta "Mapa sin señal".</p>
        </Item>
        <Item ok={location === 'granted'} label="Permiso de ubicación">
          {location === 'denied' ? (
            <p className="mt-1 text-sm text-amber-200">Está bloqueado. Activalo en los ajustes del teléfono.</p>
          ) : (
            <button type="button" disabled={location === 'asking'} className={actionClass} onClick={askLocation}>
              {location === 'asking' ? 'Pidiendo ubicación…' : 'Dar permiso de ubicación'}
            </button>
          )}
        </Item>
        <Item ok={compassOk} label="Permiso de brújula">
          {denied ? (
            <p className="mt-1 text-sm text-amber-200">Sin brújula, la flecha se orienta al caminar. Para activarla, cerrá la app del todo y volvé a abrirla.</p>
          ) : (
            <button type="button" className={actionClass} onClick={askCompass}>
              Dar permiso de brújula
            </button>
          )}
        </Item>
        <Item ok={!!group.myMemberId} label="Dijiste quién sos">
          <IdentityForm group={group} dark />
        </Item>
      </ul>

      <button type="button" className="mt-4 w-full rounded-xl bg-slate-800 p-3 font-semibold" onClick={() => setShowAirplane(!showAirplane)}>
        Probar modo avión
      </button>
      {showAirplane && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-300">
          <li>Activá el modo avión.</li>
          <li>Cerrá la app por completo y volvé a abrirla.</li>
          <li>Entrá a este grupo y abrí el Modo Encuentro.</li>
          <li>Fijate que aparezca el mapa y caminá: la flecha y la distancia tienen que cambiar.</li>
        </ol>
      )}
    </section>
  );
}
