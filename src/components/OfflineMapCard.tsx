import { CheckCircle2, Download, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { db, type Group } from '../db';
import { useOnline } from '../hooks/useOnline';
import { isIOSBrowser } from '../lib/platform';
import {
  areaCoversPoints,
  DEFAULT_MARGIN_KM,
  downloadArea,
  type DownloadProgress,
  isAreaCurrent,
  MARGIN_OPTIONS_KM,
  planArea,
} from '../lib/tiles';

const formatMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

export default function OfflineMapCard({ group }: { group: Group }) {
  const online = useOnline();
  const autoStart = (useLocation().state as { autoDownloadMap?: boolean } | null)?.autoDownloadMap === true;
  const autoStarted = useRef(false);
  const [marginKm, setMarginKm] = useState(DEFAULT_MARGIN_KM);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [message, setMessage] = useState('');
  const [usage, setUsage] = useState<number>();
  const [current, setCurrent] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const area = group.offlineArea;
  const coversPoints = area ? areaCoversPoints(area, group.meetingPoints) : false;
  const ready = !!area && coversPoints && current;

  useEffect(() => {
    let active = true;
    if (area) isAreaCurrent(area).then((value) => active && setCurrent(value));
    navigator.storage?.estimate?.().then((estimate) => active && setUsage(estimate.usage));
    return () => {
      active = false;
    };
  }, [area]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    const plan = planArea(group.meetingPoints, marginKm);
    if (!plan) {
      setMessage('Los puntos están demasiado lejos entre sí para bajar el mapa. Quitá alguno.');
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setMessage('');
    setProgress({ done: 0, total: plan.tileCount });
    try {
      const offlineArea = await downloadArea(plan, { onProgress: setProgress, signal: controller.signal });
      await db.groups.update(group.id, { offlineArea });
      setCurrent(true);
      setMessage(
        plan.reduced
          ? `Bajé una zona más chica para no pasar el límite (margen de ${plan.marginKm} km).`
          : 'Mapa listo para usar sin señal.',
      );
    } catch (err) {
      if (controller.signal.aborted) setMessage('Descarga cancelada.');
      else if ((err as Error).name === 'QuotaExceededError') setMessage('No hay espacio suficiente en el teléfono.');
      else setMessage('No se pudo completar la descarga. Tocá de nuevo para retomarla.');
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  };

  // Whoever just joined should not have to remember this; Safari on iPhone is excluded because that data stays behind.
  useEffect(() => {
    if (!autoStart || autoStarted.current || !online || coversPoints || isIOSBrowser()) return;
    autoStarted.current = true;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, online, coversPoints]);

  return (
    <section className="space-y-3 rounded-xl bg-slate-900 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        {ready ? <CheckCircle2 size={20} className="text-emerald-400" /> : <TriangleAlert size={20} className="text-amber-400" />}
        Mapa sin señal
      </h2>

      {area && (
        <p className="text-sm text-slate-300">
          {area.tileCount} partes del mapa, bajadas el {new Date(area.downloadedAt).toLocaleDateString('es-AR')}
          {usage !== undefined && ` · ${formatMB(usage)} usados en total`}
        </p>
      )}
      {!area && <p className="text-sm text-slate-300">Bajalo con WiFi antes de ir. Sin esto, la brújula funciona igual.</p>}
      {area && !coversPoints && <p className="text-sm text-amber-200">Cambió un punto de lugar: volvé a bajar el mapa.</p>}
      {area && coversPoints && !current && (
        <p className="text-sm text-amber-200">El mapa se actualizó por otro grupo: volvé a bajar esta zona.</p>
      )}

      {progress ? (
        <div className="space-y-2">
          <div
            role="progressbar"
            aria-label="Descarga del mapa"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            className="h-3 overflow-hidden rounded-full bg-slate-800"
          >
            <div className="h-full bg-sky-400" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
          <p className="text-sm text-slate-300">
            {progress.done} de {progress.total}
          </p>
          <button type="button" className="w-full rounded-xl bg-slate-800 p-3 font-semibold" onClick={() => abortRef.current?.abort()}>
            Cancelar
          </button>
        </div>
      ) : (
        <>
          <label className="flex items-center justify-between gap-2 text-sm">
            Margen alrededor de los puntos
            <select
              className="rounded-lg bg-slate-800 p-2"
              value={marginKm}
              onChange={(e) => setMarginKm(Number(e.target.value))}
            >
              {MARGIN_OPTIONS_KM.map((km) => (
                <option key={km} value={km}>
                  {km} km
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!online}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-400 p-3 font-semibold text-slate-950 disabled:bg-slate-800 disabled:text-slate-500"
            onClick={start}
          >
            <Download size={20} /> {area ? 'Volver a bajar el mapa' : 'Bajar mapa de la zona'}
          </button>
          {!online && <p className="text-sm text-slate-400">Necesitás conexión para bajar el mapa.</p>}
        </>
      )}

      {message && (
        <p role="status" className="text-sm text-slate-200">
          {message}
        </p>
      )}
    </section>
  );
}
