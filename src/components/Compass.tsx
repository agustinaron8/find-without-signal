import { Navigation } from 'lucide-react';
import { useRef } from 'react';
import { nextRotation } from '../lib/geo';

export default function Compass({ rotation }: { rotation: number }) {
  // Kept across renders so that CSS never spins the long way around when crossing north.
  const accumulated = useRef(rotation);
  accumulated.current = nextRotation(accumulated.current, rotation);

  return (
    // The margin leaves room for the tip, which sticks out of the box when pointing down.
    <div
      data-testid="compass-arrow"
      data-rotation={Math.round(rotation)}
      className="my-5 transition-transform duration-200 ease-out"
      style={{ transform: `rotate(${accumulated.current}deg)` }}
    >
      {/* The icon's own artwork points to the upper right, 45° off from north. */}
      <Navigation strokeWidth={1.5} className="h-auto w-[min(52vw,20dvh)] -rotate-45 fill-slate-950 text-slate-950" />
    </div>
  );
}
