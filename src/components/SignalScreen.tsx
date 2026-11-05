import { useEffect, useState } from 'react';

// Slower than three flashes per second, the limit for photosensitive viewers.
const BLINK_INTERVAL_MS = 700;

export default function SignalScreen({ onClose }: { onClose: () => void }) {
  const [on, setOn] = useState(true);

  useEffect(() => {
    const timer = window.setInterval(() => setOn((value) => !value), BLINK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <button
      type="button"
      data-testid="signal-screen"
      className="fixed inset-0 z-50 flex items-end justify-center p-8 text-lg font-bold text-slate-950"
      style={{ background: on ? '#ffffff' : '#facc15', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      onClick={onClose}
    >
      Levantá el teléfono para que te vean. Tocá para salir.
    </button>
  );
}
