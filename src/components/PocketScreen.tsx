import { useEffect, useRef, useState, type PointerEvent } from 'react';

const HOLD_TO_EXIT_MS = 3000;

interface Props {
  lastSyncLabel: string;
  onClose: () => void;
}

// Keeps the app open and unlocked with a black screen, because a web app stops as soon as the phone locks.
export default function PocketScreen({ lastSyncLabel, onClose }: Props) {
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<number | undefined>(undefined);

  // Android's back button would leave Modo Encuentro, and with it the GPS.
  useEffect(() => {
    const stay = () => window.history.pushState(null, '');
    stay();
    window.addEventListener('popstate', stay);
    return () => {
      window.removeEventListener('popstate', stay);
      window.history.back();
    };
  }, []);

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  const startHold = (event: PointerEvent) => {
    event.preventDefault();
    setHolding(true);
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(onClose, HOLD_TO_EXIT_MS);
  };

  const stopHold = () => {
    setHolding(false);
    window.clearTimeout(holdTimer.current);
  };

  return (
    <div
      data-testid="pocket-screen"
      role="dialog"
      aria-label="Modo bolsillo"
      className="fixed inset-0 z-50 flex select-none flex-col items-center justify-center gap-2 bg-black p-8 text-center text-slate-600"
      style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
      onPointerDown={startHold}
      onPointerUp={stopHold}
      onPointerCancel={stopHold}
      onPointerLeave={stopHold}
      onContextMenu={(event) => event.preventDefault()}
    >
      <p className="font-semibold">{holding ? 'Seguí apretando para salir…' : 'Modo bolsillo'}</p>
      <p className="text-sm">Mantené apretado 3 segundos para salir. No bloquees el teléfono.</p>
      {lastSyncLabel && <p className="text-sm">{lastSyncLabel}</p>}
    </div>
  );
}
