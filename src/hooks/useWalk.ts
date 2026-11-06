import { useEffect, useRef, useState } from 'react';
import { recentWalk, WALK_WINDOW_MS, type Fix } from '../lib/geo';
import type { Position } from './useGeolocation';

// Where the person is really going, from their own positions. It only says whether they are
// getting closer; it never corrects the compass, since people walk without aiming the phone ahead.
export function useWalk(position: Position | null) {
  const samples = useRef<Fix[]>([]);
  const [course, setCourse] = useState<number | null>(null);

  useEffect(() => {
    if (!position) return;
    const { lat, lng, accuracy, t } = position;
    samples.current = [...samples.current.filter((s) => t - s.t <= WALK_WINDOW_MS), { lat, lng, accuracy, t }];
    setCourse(recentWalk(samples.current)?.course ?? null);
  }, [position]);

  return course;
}
