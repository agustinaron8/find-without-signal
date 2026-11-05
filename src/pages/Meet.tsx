import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Bookmark, ClipboardPaste, Compass as CompassIcon, Flashlight, Map as MapIcon, MessageSquare, RotateCcw, Undo2, Users } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Compass from '../components/Compass';
import CompassDebug from '../components/CompassDebug';
import GroupLocationsSheet from '../components/GroupLocationsSheet';
import type { MapPoint } from '../components/MapView';
import PocketScreen from '../components/PocketScreen';
import SignalScreen from '../components/SignalScreen';
import SmsDialog from '../components/SmsDialog';
import { db, type TrackPoint } from '../db';
import { useGeolocation } from '../hooks/useGeolocation';
import { useHeading } from '../hooks/useHeading';
import { useLastKnown } from '../hooks/useLastKnown';
import { useWalk } from '../hooks/useWalk';
import { useWakeLock } from '../hooks/useWakeLock';
import {
  bearing,
  cardinalName,
  combinedAccuracy,
  currentTripStart,
  formatDistance,
  formatWalkTime,
  hasArrived,
  haversine,
  isPoorFix,
  magneticDeclination,
  nextPlanTime,
  normalizeDegrees,
  parseCoords,
  SAVE_MAX_ACCURACY_M,
  shouldRecordTrackPoint,
  walkTrend,
} from '../lib/geo';
import { formatAge, LOCATION_STALE_MS, STATUSES } from '../lib/lastKnown';
import { groupRoster, MEMBER_FILTER_FROM, sortMembers } from '../lib/members';

const MapView = lazy(() => import('../components/MapView'));

const TRACK_START_ID = 'track-start';
const MEMBER_PREFIX = 'member-';
const PERSONAL_COLOR = '#16a34a';
const GPS_HEADING_MIN_SPEED_MS = 0.5;
const TRACK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const GPS_STALE_MS = 30000;
const ROUGH_ARROW_RATIO = 0.5;

const TREND_TEXT = {
  closer: { text: 'Vas bien: te estás acercando', color: 'text-green-800' },
  sideways: { text: 'Vas de costado', color: 'text-amber-800' },
  away: { text: 'Te estás alejando: date vuelta', color: 'text-red-800' },
};

const buttonBase = 'flex items-center justify-center gap-2 rounded-xl p-2 font-semibold';
const bigButton = `${buttonBase} bg-slate-200 text-slate-950`;
const primaryButton = `${buttonBase} bg-slate-950 py-3 text-white`;

export default function Meet() {
  const { id = '' } = useParams();
  const group = useLiveQuery(() => db.groups.get(id).then((g) => g ?? null), [id]);
  const personal = useLiveQuery(() => db.personalPoints.where('groupId').equals(id).toArray(), [id]);
  const track = useLiveQuery(
    () => db.trackPoints.where('t').above(Date.now() - TRACK_RETENTION_MS).filter((p) => p.groupId === id).sortBy('t'),
    [id],
  );

  const { position, error: geoError } = useGeolocation();
  const { heading: magneticHeading, weak: weakCompass, debug: headingDebug, needsPermission, denied, requestPermission } = useHeading();
  const compassHeading = magneticHeading !== null && position ? normalizeDegrees(magneticHeading + magneticDeclination(position)) : magneticHeading;
  const walk = useWalk(position, compassHeading);
  const screenStaysOn = useWakeLock();
  const lastKnown = useLastKnown(group, position);

  const storageKey = `meet-destination-${id}`;
  // Persisted because opening the SMS app can make iOS reload this page.
  const [destinationId, setDestinationId] = useState<string | null>(() => localStorage.getItem(storageKey));
  const [view, setView] = useState<'radar' | 'map'>('radar');
  const [sheet, setSheet] = useState<'sms' | 'paste' | 'save' | 'signal' | 'group' | 'pocket' | null>(null);
  const [draftName, setDraftName] = useState('');
  const [pasted, setPasted] = useState('');
  const [sheetError, setSheetError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [showDebug, setShowDebug] = useState(false);
  const lastTrackRef = useRef<TrackPoint | undefined>(undefined);
  const arrivedAt = useRef<string | null>(null);

  const chooseDestination = (value: string) => {
    setDestinationId(value);
    localStorage.setItem(storageKey, value);
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!position || !track) return;
    const last = lastTrackRef.current ?? track[track.length - 1];
    const next = { groupId: id, lat: position.lat, lng: position.lng, acc: position.accuracy, t: position.t };
    if (!shouldRecordTrackPoint(last, next)) return;
    lastTrackRef.current = next;
    db.trackPoints.add(next);
  }, [position, track, id]);

  const trackStart = track && currentTripStart(track);
  const locations = lastKnown.locations;
  const roster = useMemo(() => groupRoster(group?.members ?? [], locations, group?.myMemberId), [group, locations]);
  const destinations = useMemo(() => {
    const list = (group?.meetingPoints ?? []).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, description: p.description, accuracy: undefined as number | undefined }));
    (personal ?? []).forEach((p) => list.push({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, description: undefined, accuracy: p.acc }));
    if (trackStart) list.push({ id: TRACK_START_ID, name: 'Donde arranqué', lat: trackStart.lat, lng: trackStart.lng, description: undefined, accuracy: trackStart.acc });
    const named = locations.flatMap((l) => {
      const member = roster.find((m) => m.id === l.memberId);
      return member ? [{ id: MEMBER_PREFIX + l.memberId, name: member.name, lat: l.lat, lng: l.lng, description: undefined, accuracy: l.acc as number | undefined }] : [];
    });
    list.push(...sortMembers(named));
    return list;
  }, [group, personal, trackStart, locations, roster]);

  const destination =
    destinations.find((d) => d.id === destinationId) ??
    destinations.find((d) => group?.meetingPoints.some((p) => p.id === d.id && p.isPrimary)) ??
    destinations[0];

  const mapPoints: MapPoint[] = useMemo(
    () => [
      ...(group?.meetingPoints ?? []).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, color: '#dc2626' })),
      ...(personal ?? []).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, color: PERSONAL_COLOR })),
      // With a big group the labels would bury the meeting points, so only the chosen person stays.
      ...locations
        .filter((l) => locations.length <= MEMBER_FILTER_FROM || MEMBER_PREFIX + l.memberId === destination?.id)
        .flatMap((l) => {
          const member = roster.find((m) => m.id === l.memberId);
          return member ? [{ id: MEMBER_PREFIX + l.memberId, name: member.name, lat: l.lat, lng: l.lng, color: member.color }] : [];
        }),
    ],
    [group, personal, locations, roster, destination?.id],
  );

  const overlay = useMemo(
    () => ({
      position: position ?? undefined,
      track: track ?? [],
      destination: destination ? { lat: destination.lat, lng: destination.lng } : undefined,
    }),
    [position, track, destination],
  );

  if (group === undefined) return <div className="min-h-screen bg-white" />;
  if (group === null) {
    return (
      <main className="min-h-screen bg-white p-4 text-slate-950">
        <p className="text-xl font-semibold">Este grupo no está guardado en este teléfono.</p>
        <Link to="/" className="mt-4 block underline">
          Volver al inicio
        </Link>
      </main>
    );
  }

  const movingHeading = position?.speed != null && position.speed > GPS_HEADING_MIN_SPEED_MS ? position.heading : null;
  const heading = walk.correctedCompass ?? walk.course ?? movingHeading;
  const headingSource = walk.correctedCompass !== null ? 'brújula' : walk.course !== null ? 'marcha' : movingHeading !== null ? 'GPS' : 'ninguna';
  const distance = position && destination ? haversine(position, destination) : null;
  const toTarget = position && destination ? bearing(position, destination) : null;
  const poorFix = !!position && isPoorFix(position.accuracy);
  const gpsAge = position ? now.getTime() - position.t : 0;
  const gpsStale = gpsAge > GPS_STALE_MS;
  // Both ends can be off: where I am now, and where the point was when it was saved.
  const totalAccuracy = position ? combinedAccuracy(position.accuracy, destination?.accuracy) : 0;
  const arrived = distance !== null && !gpsStale && hasArrived(distance, totalAccuracy, arrivedAt.current === destination?.id);
  arrivedAt.current = arrived ? (destination?.id ?? null) : null;
  const roughArrow = distance !== null && totalAccuracy > distance * ROUGH_ARROW_RATIO;
  const trend = walk.course !== null && toTarget !== null && !arrived && !gpsStale ? TREND_TEXT[walkTrend(walk.course, toTarget)] : null;
  const canSaveHere = !!position && !gpsStale && position.accuracy <= SAVE_MAX_ACCURACY_M;
  const plan = group.planTimes?.length ? nextPlanTime(group.planTimes, now) : null;
  const destinationLocation = destination?.id.startsWith(MEMBER_PREFIX)
    ? locations.find((l) => MEMBER_PREFIX + l.memberId === destination.id)
    : undefined;
  const locationAge = destinationLocation ? now.getTime() - destinationLocation.t : 0;

  const openSheet = (next: 'paste' | 'save' | 'sms') => {
    setDraftName('');
    setPasted('');
    setSheetError('');
    setSheet(next);
  };

  const savePersonal = async (name: string, lat: number, lng: number, acc?: number) => {
    const pointId = crypto.randomUUID();
    await db.personalPoints.add({ id: pointId, groupId: id, name, lat, lng, acc, createdAt: Date.now() });
    chooseDestination(pointId);
    setSheet(null);
  };

  const resetTrack = async () => {
    if (!window.confirm('¿Borrar la línea de tu recorrido? "Donde arranqué" pasa a ser el lugar donde estás ahora.')) return;
    await db.trackPoints.where('groupId').equals(id).delete();
    lastTrackRef.current = undefined;
    // Otherwise the arrow would point to the new start, which is right here.
    if (destinationId === TRACK_START_ID) {
      setDestinationId(null);
      localStorage.removeItem(storageKey);
    }
  };

  const saveHere = () => {
    if (!position) return setSheetError('Todavía no tengo tu ubicación.');
    savePersonal(draftName.trim() || 'Mi lugar', position.lat, position.lng, position.accuracy);
  };

  const savePasted = () => {
    const coords = parseCoords(pasted);
    if (!coords) return setSheetError('No encontré coordenadas en ese mensaje.');
    const time = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    savePersonal(`${draftName.trim() || 'Ubicación recibida'} – ${time}`, coords.lat, coords.lng);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-950" style={{ minHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }}>
      <header className="flex items-center gap-2 p-3">
        <Link to={`/group/${id}`} aria-label="Volver" className="p-2">
          <ArrowLeft size={28} />
        </Link>
        <select
          aria-label="Destino"
          className="min-w-0 flex-1 rounded-xl border-2 border-slate-950 bg-white p-3 text-lg font-bold"
          value={destination?.id ?? ''}
          onChange={(e) => chooseDestination(e.target.value)}
        >
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button type="button" aria-label="Hacerme ver" className="p-2" onClick={() => setSheet('signal')}>
          <Flashlight size={28} />
        </button>
      </header>

      {(group.plan || plan) && (
        <div className="bg-slate-950 px-4 py-2 text-white">
          {group.plan && <p className="font-semibold">{group.plan}</p>}
          {plan && (
            <p data-testid="plan-next" className="text-sm">
              Próximo reencuentro: {plan.time} (en {formatMinutes(plan.minutes)})
            </p>
          )}
        </div>
      )}

      {view === 'radar' ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          {geoError === 'denied' && (
            <p role="alert" className="rounded-lg bg-red-100 p-3 font-semibold text-red-900">
              Necesito permiso de ubicación. Activalo en los ajustes del teléfono para esta app.
            </p>
          )}
          {geoError === 'unavailable' && (
            <p role="alert" className="rounded-lg bg-red-100 p-3 font-semibold text-red-900">
              Este teléfono no da ubicación.
            </p>
          )}

          {arrived ? (
            <>
              <p className="text-6xl" aria-hidden>
                📍
              </p>
              <p className="text-4xl font-black">
                {totalAccuracy > SAVE_MAX_ACCURACY_M ? 'Estás cerca' : destinationLocation ? `Estás donde estaba ${destination?.name}` : '¡Estás en el punto!'}
              </p>
              {totalAccuracy > SAVE_MAX_ACCURACY_M && (
                <p data-testid="arrival-limit" className="text-lg font-semibold">
                  El GPS no da más precisión (±{Math.round(totalAccuracy)} m). Seguí con la vista.
                </p>
              )}
              <ArrivalBuzz />
            </>
          ) : (
            <>
              {toTarget !== null && heading !== null && (
                <>
                  <Compass rotation={normalizeDegrees(toTarget - heading)} />
                  <p data-testid="arrow-hint" className="font-semibold">
                    Caminá hacia donde apunta la flecha
                  </p>
                </>
              )}
              {heading !== null && headingSource !== 'brújula' && (
                <p data-testid="no-compass" className="font-semibold text-amber-800">
                  {denied ? 'Sin permiso de brújula' : 'Sin brújula'}: la flecha solo vale mientras caminás, y según tu dirección de marcha
                </p>
              )}
              {trend && (
                <p data-testid="walk-trend" className={`text-xl font-black ${trend.color}`}>
                  {trend.text}
                </p>
              )}
              {roughArrow && toTarget !== null && (
                <p data-testid="rough-arrow" className="font-semibold text-amber-800">
                  Flecha aproximada: estás cerca y el error es de ±{Math.round(totalAccuracy)} m
                </p>
              )}
              {weakCompass && (
                <p data-testid="weak-compass" className="font-semibold text-amber-800">
                  Brújula imprecisa: mové el teléfono dibujando un 8
                </p>
              )}
              {walk.corrected && (
                <p data-testid="compass-corrected" className="font-semibold text-amber-800">
                  La brújula estaba desviada: la corregí con tu dirección al caminar
                </p>
              )}
              {toTarget !== null && heading === null && (
                <p className="text-lg font-semibold">
                  {denied || !needsPermission ? 'Caminá unos pasos para orientar la flecha' : 'Activá la brújula para ver la flecha'}
                </p>
              )}
              {toTarget !== null && (heading === null || poorFix) && (
                <p data-testid="cardinal" className="text-2xl font-bold">
                  Al {cardinalName(toTarget)}, {Math.round(toTarget)}°
                </p>
              )}
            </>
          )}

          {needsPermission && (
            <button type="button" className="flex items-center gap-2 rounded-xl bg-sky-300 p-4 text-lg font-bold" onClick={requestPermission}>
              <CompassIcon size={24} /> Activar brújula
            </button>
          )}

          {distance !== null && (
            // Tapping it opens the raw sensor values, to diagnose a wrong arrow on a real phone.
            <button type="button" onClick={() => setShowDebug(!showDebug)}>
              <p data-testid="distance" className="text-6xl font-black tracking-tight">
                {poorFix && '≈ '}
                {formatDistance(distance)}
              </p>
            </button>
          )}
          {showDebug && (
            <CompassDebug
              raw={headingDebug.current}
              source={headingSource}
              magnetic={magneticHeading}
              offset={walk.offset}
              heading={heading}
              toTarget={toTarget}
              position={position}
              destination={destination}
            />
          )}
          {distance !== null && !arrived && <p className="text-xl font-semibold">{formatWalkTime(distance)} caminando</p>}
          {destination?.description && <p className="text-lg">{destination.description}</p>}
          {!destinationLocation && destination?.accuracy !== undefined && destination.accuracy > SAVE_MAX_ACCURACY_M && (
            <p data-testid="saved-accuracy" className="font-semibold text-amber-800">
              Este punto se guardó con un error de ±{Math.round(destination.accuracy)} m
            </p>
          )}
          {destinationLocation && (
            <p data-testid="location-age" className={`text-lg font-bold ${locationAge > LOCATION_STALE_MS ? 'text-red-800' : ''}`}>
              {destinationLocation.status && STATUSES[destinationLocation.status] ? `"${STATUSES[destinationLocation.status]}". ` : ''}
              Estaba ahí {formatAge(locationAge)}, puede haberse movido
            </p>
          )}

          {gpsStale && (
            <p data-testid="gps-stale" role="alert" className="rounded-lg bg-red-100 p-3 font-semibold text-red-900">
              El GPS no se actualiza ({gpsAge < 60000 ? 'menos de 1 min' : formatAge(gpsAge)}). La flecha y la distancia pueden estar mal.
            </p>
          )}
          {position && !poorFix && (
            <p data-testid="accuracy" className="text-slate-700">
              Precisión ±{Math.round(position.accuracy)} m
            </p>
          )}
          {!geoError && (!position || poorFix) && (
            <div data-testid="searching" className="flex flex-col items-center gap-1">
              <p className="flex items-center gap-2 text-xl font-bold">
                <span className="h-3 w-3 animate-ping rounded-full bg-sky-500" /> Buscando GPS…
              </p>
              <p className="text-sm text-slate-700">Sin señal puede tardar hasta un minuto. Mejor a cielo abierto.</p>
            </div>
          )}
        </main>
      ) : (
        <main className="flex flex-1 flex-col p-3">
          <Suspense fallback={<div className="flex-1 rounded-xl bg-slate-200" />}>
            <MapView className="min-h-80 flex-1" points={mapPoints} overlay={overlay} />
          </Suspense>
          {distance !== null && (
            <p data-testid="distance" className="pt-2 text-center text-2xl font-black">
              {poorFix && '≈ '}
              {formatDistance(distance)} · {formatWalkTime(distance)}
            </p>
          )}
          {!!track?.length && (
            <button type="button" className="mt-2 flex items-center justify-center gap-2 self-center p-2 font-semibold underline" onClick={resetTrack}>
              <RotateCcw size={18} /> Reiniciar recorrido
            </button>
          )}
        </main>
      )}

      <nav className="grid grid-cols-2 gap-2 p-3">
        <button type="button" className={primaryButton} onClick={() => openSheet('sms')}>
          <MessageSquare size={22} className="shrink-0" /> Mandar mi ubicación por SMS
        </button>
        <button type="button" className={primaryButton} onClick={() => setSheet('group')}>
          <Users size={22} className="shrink-0" /> Ubicación del grupo
        </button>
        <button type="button" className={bigButton} onClick={() => setView(view === 'radar' ? 'map' : 'radar')}>
          {view === 'radar' ? <MapIcon size={20} /> : <CompassIcon size={20} />}
          {view === 'radar' ? 'Ver mapa' : 'Ver brújula'}
        </button>
        <button type="button" className={bigButton} onClick={() => openSheet('paste')}>
          <ClipboardPaste size={20} /> Pegar ubicación
        </button>
        <button type="button" className={bigButton} onClick={() => openSheet('save')}>
          <Bookmark size={20} /> Guardar este lugar
        </button>
        <button
          type="button"
          disabled={!trackStart}
          className={`${bigButton} disabled:opacity-50`}
          onClick={() => chooseDestination(TRACK_START_ID)}
        >
          <Undo2 size={20} /> Volver por donde vine
        </button>
      </nav>

      {sheet === 'signal' && <SignalScreen onClose={() => setSheet(null)} />}

      {sheet === 'pocket' && (
        <PocketScreen
          lastSyncLabel={lastKnown.lastSync ? `Último contacto: ${formatAge(now.getTime() - lastKnown.lastSync)}` : 'Todavía sin conexión'}
          onClose={() => setSheet('group')}
        />
      )}

      {sheet === 'group' && (
        <GroupLocationsSheet
          group={group}
          roster={roster}
          locations={locations}
          position={position}
          sharing={lastKnown.sharing}
          status={lastKnown.status}
          onStatusChange={lastKnown.setStatus}
          onSharingChange={lastKnown.setSharing}
          lastSync={lastKnown.lastSync}
          failing={lastKnown.failing}
          syncing={lastKnown.syncing}
          onSyncNow={lastKnown.syncNow}
          onGoTo={(memberId) => {
            chooseDestination(MEMBER_PREFIX + memberId);
            setSheet(null);
          }}
          onPocket={() => setSheet('pocket')}
          screenStaysOn={screenStaysOn}
          onClose={() => setSheet(null)}
          now={now.getTime()}
        />
      )}

      {sheet === 'sms' && <SmsDialog members={roster} position={position} onClose={() => setSheet(null)} />}

      {(sheet === 'save' || sheet === 'paste') && (
        <div className="fixed inset-0 z-40 bg-white p-4" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
          <div className="mx-auto max-w-md space-y-3">
            <h2 className="text-2xl font-bold">{sheet === 'save' ? 'Guardar este lugar' : 'Pegar ubicación recibida'}</h2>
            {sheet === 'paste' && (
              <textarea
                aria-label="Mensaje recibido"
                rows={5}
                className="w-full rounded-xl border-2 border-slate-950 p-3 text-base"
                placeholder="Pegá acá el SMS con la ubicación"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
              />
            )}
            <input
              aria-label="Nombre"
              className="w-full rounded-xl border-2 border-slate-950 p-3 text-base"
              placeholder={sheet === 'save' ? 'Mi auto, carpa…' : '¿De quién es? (Juan)'}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
            {sheet === 'save' && (
              <p data-testid="save-accuracy" className={`rounded-lg p-3 font-semibold ${canSaveHere ? 'bg-green-100 text-green-900' : 'bg-amber-100 text-amber-900'}`}>
                {!position
                  ? 'Buscando GPS…'
                  : canSaveHere
                    ? `Precisión ±${Math.round(position.accuracy)} m: buen momento para guardar.`
                    : `GPS con ±${Math.round(position.accuracy)} m. Si podés, esperá a que baje de ${SAVE_MAX_ACCURACY_M} m: si no, el punto queda corrido.`}
              </p>
            )}
            {sheetError && (
              <p role="alert" className="rounded-lg bg-red-100 p-3 font-semibold text-red-900">
                {sheetError}
              </p>
            )}
            <button type="button" className={`${primaryButton} w-full`} onClick={sheet === 'save' ? saveHere : savePasted}>
              {sheet === 'paste' ? 'Ir a esa ubicación' : canSaveHere || !position ? 'Guardar' : 'Guardar igual'}
            </button>
            <button type="button" className={`${bigButton} w-full`} onClick={() => setSheet(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

function ArrivalBuzz() {
  useEffect(() => {
    // Absent on iOS, hence the optional call.
    navigator.vibrate?.([200, 100, 200]);
  }, []);
  return null;
}
