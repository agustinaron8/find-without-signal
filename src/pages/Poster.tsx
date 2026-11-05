import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Printer } from 'lucide-react';
import QRCodeLib from 'qrcode';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '../db';
import { buildShareUrl } from '../lib/share';

// A paper backup: it also works once a phone has run out of battery.
export default function Poster() {
  const { id = '' } = useParams();
  const group = useLiveQuery(() => db.groups.get(id).then((g) => g ?? null), [id]);
  const [qr, setQr] = useState('');
  const [tooBig, setTooBig] = useState(false);

  useEffect(() => {
    if (!group) return;
    QRCodeLib.toDataURL(buildShareUrl(group), { errorCorrectionLevel: 'L', margin: 4, width: 1024 })
      .then(setQr)
      .catch(() => setTooBig(true));
  }, [group]);

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

  const points = [...group.meetingPoints].sort((a, b) => Number(!!b.isPrimary) - Number(!!a.isPrimary));

  return (
    <main className="min-h-screen bg-white p-4 text-slate-950">
      <div className="mx-auto max-w-xl space-y-4">
        <div className="space-y-2 print:hidden">
          <div className="flex items-center gap-2">
            <Link to={`/group/${id}`} aria-label="Volver" className="p-2">
              <ArrowLeft size={28} />
            </Link>
            <button type="button" className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 p-3 font-semibold text-white" onClick={() => window.print()}>
              <Printer size={20} /> Imprimir
            </button>
          </div>
          <p className="text-sm text-slate-600">Si no se abre la impresión, sacale una captura a esta pantalla y compartila.</p>
        </div>

        <h1 className="text-center text-3xl font-black">{group.name}</h1>
        {group.plan && <p className="rounded-xl border-2 border-slate-950 p-3 text-center text-xl font-bold">{group.plan}</p>}
        {!!group.planTimes?.length && <p className="text-center text-lg font-semibold">Horarios: {group.planTimes.join(' · ')}</p>}

        <section>
          <h2 className="text-lg font-bold">Puntos de encuentro</h2>
          <ul className="mt-1 space-y-1">
            {points.map((point) => (
              <li key={point.id}>
                <span className="font-semibold">{point.name}</span>
                {point.isPrimary && ' (principal)'}
                {point.description && ` · ${point.description}`}
                <span className="block text-sm text-slate-600">
                  {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {qr && <img src={qr} alt={`Código QR de ${group.name}`} className="mx-auto w-full max-w-xs" />}
        {tooBig && <p className="rounded-lg bg-amber-200 p-3 font-semibold">Este grupo tiene demasiados datos para un QR. Compartilo por link.</p>}

        <section className="text-sm">
          <h2 className="text-base font-bold">Para sumarte, con señal y antes de salir</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Abrí <strong>{window.location.host}</strong> e instalá la app. En iPhone, en Safari: Compartir → Agregar a inicio.
            </li>
            <li>Abrí la app desde su ícono, tocá Importar y escaneá este código.</li>
            <li>Escribí tu nombre y esperá a que baje el mapa.</li>
          </ol>
          <p className="mt-2 font-semibold">Si nos separamos y no hay red: andá al punto y horario acordados.</p>
        </section>
      </div>
    </main>
  );
}
