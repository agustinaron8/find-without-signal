import { X } from 'lucide-react';
import type { Member } from '../db';
import { isIOS } from '../lib/platform';
import { buildLocationMessage, buildSmsUri } from '../lib/sms';
import type { Position } from '../hooks/useGeolocation';

interface SmsDialogProps {
  members: Member[];
  position: Position | null;
  onClose: () => void;
}

const linkClass = 'block rounded-xl bg-slate-950 p-4 text-center text-lg font-semibold text-white';

export default function SmsDialog({ members, position, onClose }: SmsDialogProps) {
  const withPhone = members.filter((m) => m.phone?.trim());
  const ios = isIOS();

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-white p-4 text-slate-950" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
      <div className="mx-auto max-w-md space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Mandar mi ubicación</h2>
          <button type="button" aria-label="Cerrar" className="p-2" onClick={onClose}>
            <X size={28} />
          </button>
        </div>

        {!position ? (
          <p className="rounded-lg bg-amber-100 p-3 font-semibold">Todavía no tengo tu ubicación. Esperá a que el GPS la encuentre.</p>
        ) : (
          <>
            <p className="rounded-lg bg-slate-100 p-3 text-sm break-all">{buildLocationMessage(position, position.accuracy)}</p>
            {withPhone.map((member) => (
              <a key={member.id} className={linkClass} href={buildSmsUri([member.phone!], buildLocationMessage(position, position.accuracy), ios)}>
                A {member.name}
              </a>
            ))}
            {!ios && withPhone.length > 1 && (
              <a className={linkClass} href={buildSmsUri(withPhone.map((m) => m.phone!), buildLocationMessage(position, position.accuracy), false)}>
                A todos ({withPhone.length})
              </a>
            )}
            <a className="block rounded-xl bg-slate-200 p-4 text-center font-semibold" href={buildSmsUri([], buildLocationMessage(position, position.accuracy), ios)}>
              Elegir otro contacto
            </a>
            <p className="text-sm text-slate-600">
              Con mucha gente la red se satura y el SMS puede tardar o no salir. Si no sale, andá al punto y horario acordados.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
