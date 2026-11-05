import { useCallback, useEffect, useState } from 'react';
import { angleBetween, headingFromOrientation, normalizeDegrees, type OrientationReading } from '../lib/geo';

const SMOOTHING_MS = 250;
const MIN_CHANGE_DEG = 1;
// iOS reports its error in degrees; past this the arrow can point to the wrong side of a person.
const WEAK_COMPASS_DEG = 25;

type PermissionableOrientation = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

const orientationApi = () =>
  typeof DeviceOrientationEvent === 'undefined' ? undefined : (DeviceOrientationEvent as PermissionableOrientation);

// `window.orientation` goes first: WebKit can report an angle that contradicts its own orientation type.
const screenAngle = () => (typeof window.orientation === 'number' ? window.orientation : (screen.orientation?.angle ?? 0));

export function useHeading() {
  const [heading, setHeading] = useState<number | null>(null);
  const [granted, setGranted] = useState(() => typeof orientationApi()?.requestPermission !== 'function');
  const [denied, setDenied] = useState(false);
  const [weak, setWeak] = useState(false);

  useEffect(() => {
    if (!orientationApi()) return;
    let smoothed: number | null = null;
    let shown: number | null = null;
    let lastEvent = 0;

    const onOrientation = (event: DeviceOrientationEvent) => {
      const iosError = (event as OrientationReading).webkitCompassAccuracy;
      const reading = headingFromOrientation(event, screenAngle());
      if (reading === null) {
        // Android's relative events also land here, and those say nothing about the compass.
        if (iosError !== undefined && iosError < 0) {
          smoothed = shown = null;
          setHeading(null);
          setWeak(true);
        }
        return;
      }
      setWeak(iosError !== undefined && iosError > WEAK_COMPASS_DEG);
      const now = performance.now();
      smoothed =
        smoothed === null
          ? reading
          : normalizeDegrees(smoothed + angleBetween(reading, smoothed) * (1 - Math.exp((lastEvent - now) / SMOOTHING_MS)));
      lastEvent = now;
      // Sensors fire about 60 times per second; redrawing for noise only spends battery.
      if (shown === null || Math.abs(angleBetween(smoothed, shown)) >= MIN_CHANGE_DEG) {
        shown = smoothed;
        setHeading(smoothed);
      }
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

  return { heading, weak, needsPermission: !granted && !denied, denied, requestPermission };
}
