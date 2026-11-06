import { useCallback, useEffect, useRef, useState } from 'react';
import { angleBetween, effectiveScreenAngle, headingFromOrientation, normalizeDegrees, type OrientationReading } from '../lib/geo';

const SMOOTHING_MS = 250;
const MAX_SMOOTHING_MS = 1000;
const SMOOTHING_PER_JITTER_DEG = 25;
// iOS sends readings many times per second, so a silence this long means the sensor stopped.
const STALL_MS = 3000;
const MIN_CHANGE_DEG = 1;
// iOS reports its error in degrees; past this the arrow can point to the wrong side of a person.
const WEAK_COMPASS_DEG = 25;

type PermissionableOrientation = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

const orientationApi = () =>
  typeof DeviceOrientationEvent === 'undefined' ? undefined : (DeviceOrientationEvent as PermissionableOrientation);

// `window.orientation` goes first: WebKit can report an angle that contradicts its own orientation type.
const reportedAngle = () => (typeof window.orientation === 'number' ? window.orientation : (screen.orientation?.angle ?? 0));
const screenAngle = () => effectiveScreenAngle(reportedAngle(), window.innerWidth, window.innerHeight);

export interface HeadingDebug {
  type: string;
  ios: number | undefined;
  iosError: number | undefined;
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute: boolean;
  reportedAngle: number;
  usedAngle: number;
  at: number;
}

export function useHeading() {
  const [heading, setHeading] = useState<number | null>(null);
  const [granted, setGranted] = useState(() => typeof orientationApi()?.requestPermission !== 'function');
  const [denied, setDenied] = useState(false);
  const [weak, setWeak] = useState(false);
  const debug = useRef<HeadingDebug | null>(null);

  useEffect(() => {
    if (!orientationApi()) return;
    let smoothed: number | null = null;
    let shown: number | null = null;
    let lastEvent = 0;
    let jitter = 0;

    const onOrientation = (event: DeviceOrientationEvent) => {
      const iosError = (event as OrientationReading).webkitCompassAccuracy;
      const reading = headingFromOrientation(event, screenAngle());
      // Android's relative events and empty events must not hide a reading that worked.
      if (reading !== null || iosError !== undefined || !debug.current) {
        debug.current = {
          type: event.type,
          ios: (event as OrientationReading).webkitCompassHeading,
          iosError,
          alpha: event.alpha,
          beta: event.beta,
          gamma: event.gamma,
          absolute: event.absolute,
          reportedAngle: reportedAngle(),
          usedAngle: screenAngle(),
          at: performance.now(),
        };
      }
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
      if (smoothed === null || !Number.isFinite(smoothed)) {
        smoothed = reading;
        jitter = 0;
      } else {
        const delta = angleBetween(reading, smoothed);
        // A shaky sensor gets a calmer arrow; a steady one stays quick to follow turns.
        jitter = jitter * 0.9 + Math.abs(delta) * 0.1;
        const tau = Math.min(MAX_SMOOTHING_MS, SMOOTHING_MS + jitter * SMOOTHING_PER_JITTER_DEG);
        smoothed = normalizeDegrees(smoothed + delta * (1 - Math.exp((lastEvent - now) / tau)));
      }
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
    const onVisibility = () => {
      lastEvent = performance.now();
      return document.hidden ? stop() : start();
    };

    // A heading that stops updating would leave the arrow frozen on an old direction.
    const watchdog = window.setInterval(() => {
      if (document.hidden || smoothed === null || performance.now() - lastEvent < STALL_MS) return;
      smoothed = shown = null;
      setHeading(null);
      // On iPhone a new grant from the next tap brings the readings back.
      if (typeof orientationApi()?.requestPermission === 'function') setGranted(false);
    }, 1000);

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      window.clearInterval(watchdog);
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
      // Thrown when not called from a tap, which says nothing about what the person wants.
      return false;
    }
  }, []);

  return { heading, weak, debug, needsPermission: !granted && !denied, denied, requestPermission };
}
