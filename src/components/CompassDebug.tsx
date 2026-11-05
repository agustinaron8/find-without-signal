import type { HeadingDebug } from '../hooks/useHeading';
import type { LatLng } from '../lib/geo';

interface Props {
  raw: HeadingDebug | null;
  source: string;
  magnetic: number | null;
  offset: number;
  heading: number | null;
  toTarget: number | null;
  position: (LatLng & { accuracy: number }) | null;
  destination?: LatLng & { accuracy?: number };
}

const num = (value: number | null | undefined, digits = 0) => (typeof value === 'number' ? value.toFixed(digits) : '–');

export default function CompassDebug({ raw, source, magnetic, offset, heading, toTarget, position, destination }: Props) {
  const rows: [string, string][] = [
    ['Fuente', source],
    ['Evento', raw?.type ?? 'ninguno'],
    ['iOS rumbo / error', `${num(raw?.ios)} / ${num(raw?.iosError)}`],
    ['alpha beta gamma', `${num(raw?.alpha)} ${num(raw?.beta)} ${num(raw?.gamma)}`],
    ['Absoluto', String(raw?.absolute ?? '–')],
    ['Ángulo informado / usado', `${num(raw?.reportedAngle)} / ${num(raw?.usedAngle)}`],
    ['Pantalla', `${window.innerWidth}×${window.innerHeight}`],
    ['Magnético', num(magnetic)],
    ['Corrección por marcha', num(offset)],
    ['Rumbo final', num(heading)],
    ['Rumbo al destino', num(toTarget)],
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
    </dl>
  );
}
