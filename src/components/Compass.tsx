import { Navigation } from 'lucide-react';
import { useRef } from 'react';
import { nextRotation } from '../lib/geo';

export default function Compass({ rotation }: { rotation: number }) {
  // Kept across renders so that CSS never spins the long way around when crossing north.
  const accumulated = useRef(rotation);
  accumulated.current = nextRotation(accumulated.current, rotation);

  return (
    <div
      data-testid="compass-arrow"
      data-rotation={Math.round(rotation)}
      className="transition-transform duration-200 ease-out"
      style={{ transform: `rotate(${accumulated.current}deg)` }}
    >
      {/* The icon's own artwork points to the upper right, 45° off from north. */}
      <Navigation size={208} strokeWidth={1.5} className="-rotate-45 fill-slate-950 text-slate-950" />
    </div>
  );
}
