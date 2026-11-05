import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Share, SquarePlus } from 'lucide-react';
import { db } from '../db';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { isIOSBrowser, isStandalone } from '../lib/platform';

export default function InstallBanner() {
  const { canInstall, install } = useInstallPrompt();
  const groupCount = useLiveQuery(() => db.groups.count());

  if (isStandalone()) return null;

  if (isIOSBrowser()) {
    return (
      <section className="space-y-2 rounded-xl bg-amber-950 p-4 text-amber-50">
        <h2 className="font-bold">Instalá la app antes de crear grupos</h2>
        <p className="flex flex-wrap items-center gap-1 text-sm">
          En Safari tocá <Share size={16} aria-label="Compartir" /> Compartir y después <SquarePlus size={16} aria-label="Agregar" />{' '}
          Agregar a inicio.
        </p>
        <p className="text-sm">
          En iPhone, la app instalada guarda sus datos <strong>aparte de Safari</strong>. Creá o importá los grupos desde la
          app instalada.
        </p>
        {!!groupCount && (
          <p role="alert" className="rounded-lg bg-amber-200 p-2 text-sm font-semibold text-amber-950">
            Tenés {groupCount === 1 ? '1 grupo guardado' : `${groupCount} grupos guardados`} en Safari: no van a aparecer en la
            app instalada. Compartitelos por link y abrilo desde ahí.
          </p>
        )}
      </section>
    );
  }

  if (!canInstall) return null;

  return (
    <button
      type="button"
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 p-4 font-semibold text-slate-950"
      onClick={install}
    >
      <Download size={20} /> Instalar Reencuentro
    </button>
  );
}
