import { useCallback, useEffect, useState } from 'react';
import { circularMean, headingFromOrientation } from '../lib/geo';

const SMOOTHING_WINDOW = 5;

type PermissionableOrientation = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

const orientationApi = () =>
  typeof DeviceOrientationEvent === 'undefined' ? undefined : (DeviceOrientationEvent as PermissionableOrientation);

const screenAngle = () => screen.orientation?.angle ?? 0;

export function useHeading() {
  const [heading, setHeading] = useState<number | null>(null);
  const [granted, setGranted] = useState(() => typeof orientationApi()?.requestPermission !== 'function');
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!orientationApi()) return;
    const recent: number[] = [];

    const onOrientation = (event: DeviceOrientationEvent) => {
      const reading = headingFromOrientation(event, screenAngle());
      if (reading === null) return;
      recent.push(reading);
      if (recent.length > SMOOTHING_WINDOW) recent.shift();
      setHeading(circularMean(recent));
      // iOS keeps the grant for the session, so events can arrive without asking again.
      setGranted(true);
    };

    const start = () => {
      window.addEventListener('deviceorientationabsolute', onOrientation as EventListener);
      window.addEventListener('deviceorientation', onOrientation);
    };
    const stop = () => {
      window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener);
      window.removeEventListener('deviceorientation', onOrientation);
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // iOS only accepts this call from inside a tap handler.
  const requestPermission = useCallback(async () => {
    try {
      const result = await orientationApi()?.requestPermission?.();
      setGranted(result === 'granted');
      setDenied(result === 'denied');
      return result === 'granted';
    } catch {
      setDenied(true);
      return false;
    }
  }, []);

  return { heading, needsPermission: !granted && !denied, denied, requestPermission };
}
