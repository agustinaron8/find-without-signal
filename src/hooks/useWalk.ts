import { useEffect, useRef, useState } from 'react';
import { normalizeDegrees, recentWalk, WALK_WINDOW_MS, type Walk, type WalkSample } from '../lib/geo';
import type { Position } from './useGeolocation';

const CORRECT_FROM_DEG = 45;
const TRUST_AGAIN_DEG = 25;

export function useWalk(position: Position | null, compassHeading: number | null) {
  const samples = useRef<WalkSample[]>([]);
  const compass = useRef(compassHeading);
  compass.current = compassHeading;
  const [walk, setWalk] = useState<Walk | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!position) return;
    const { lat, lng, accuracy, t } = position;
    samples.current = [...samples.current.filter((s) => t - s.t <= WALK_WINDOW_MS), { lat, lng, accuracy, t, heading: compass.current }];
    const next = recentWalk(samples.current);
    setWalk(next);
    if (next?.compassError == null) return;
    // Applied to the live compass, so the arrow still reacts while turning. It stays after
    // stopping, because the walk it came from is the best information there is.
    const error = next.compassError;
    if (Math.abs(error) > CORRECT_FROM_DEG) setOffset(error);
    else if (Math.abs(error) < TRUST_AGAIN_DEG) setOffset(0);
  }, [position]);

  return {
    course: walk?.course ?? null,
    correctedCompass: compassHeading === null ? null : normalizeDegrees(compassHeading + offset),
    corrected: compassHeading !== null && offset !== 0,
  };
}
