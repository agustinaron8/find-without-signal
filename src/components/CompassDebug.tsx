import { useState } from 'react';
import type { HeadingDebug } from '../hooks/useHeading';
import type { LatLng } from '../lib/geo';

interface Props {
  raw: HeadingDebug | null;
  source: string;
  rotation: number | null;
  speed: number | null;
  gpsHeading: number | null;
  permission: string;
  onCopyLog: () => Promise<void> | undefined;
  magnetic: number | null;
  heading: number | null;
  toTarget: number | null;
  position: (LatLng & { accuracy: number }) | null;
  destination?: LatLng & { accuracy?: number };
}

const num = (value: number | null | undefined, digits = 0) => (typeof value === 'number' ? value.toFixed(digits) : '–');

export default function CompassDebug({ raw, source, rotation, speed, gpsHeading, permission, onCopyLog, magnetic, heading, toTarget, position, destination }: Props) {
  const [copied, setCopied] = useState(false);
  const rows: [string, string][] = [
    ['Fuente', source],
    ['Permiso brújula', permission],
    ['Último dato brújula', raw ? `hace ${((performance.now() - raw.at) / 1000).toFixed(1)} s` : 'nunca'],
    ['Evento', raw?.type ?? 'ninguno'],
    ['iOS rumbo / error', `${num(raw?.ios)} / ${num(raw?.iosError)}`],
    ['alpha beta gamma', `${num(raw?.alpha)} ${num(raw?.beta)} ${num(raw?.gamma)}`],
    ['Absoluto', String(raw?.absolute ?? '–')],
    ['Ángulo informado / usado', `${num(raw?.reportedAngle)} / ${num(raw?.usedAngle)}`],
    ['Pantalla', `${window.innerWidth}×${window.innerHeight}`],
    ['Magnético', num(magnetic)],
    ['Rumbo final', num(heading)],
    ['Rumbo al destino', num(toTarget)],
    ['Rotación flecha', num(rotation)],
    ['Velocidad / rumbo GPS', `${num(speed, 1)} m/s / ${num(gpsHeading)}`],
    ['Yo', position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)} ±${Math.round(position.accuracy)}` : '–'],
    ['Destino', destination ? `${destination.lat.toFixed(5)}, ${destination.lng.toFixed(5)} ±${num(destination.accuracy)}` : '–'],
  ];
  return (
    <dl data-testid="compass-debug" className="w-full max-w-sm rounded-lg bg-slate-100 p-2 text-left font-mono text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-2">
          <dt>{label}</dt>
          <dd className="text-right font-bold">{value}</dd>
        </div>
      ))}
      <button type="button" className="mt-2 w-full rounded bg-slate-950 p-2 font-sans font-semibold text-white" onClick={() => onCopyLog()?.then(() => setCopied(true))}>
        {copied ? 'Registro copiado: pegalo en un mensaje' : 'Copiar registro'}
      </button>
    </dl>
  );
}
