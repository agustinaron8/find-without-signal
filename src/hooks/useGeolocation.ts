import { useEffect, useState } from 'react';
import { filterFix, type Fix } from '../lib/geo';

export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  t: number;
}

export type GeoError = 'denied' | 'unavailable' | null;

export function useGeolocation() {
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<GeoError>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('unavailable');
      return;
    }
    let watchId: number | null = null;
    let filtered: Fix | null = null;

    const start = () => {
      if (watchId !== null) return;
      watchId = navigator.geolocation.watchPosition(
        ({ coords }) => {
          setError(null);
          // Some browsers report NaN instead of null while standing still.
          const speed = Number.isFinite(coords.speed) ? coords.speed : null;
          const heading = Number.isFinite(coords.heading) ? coords.heading : null;
          // Not the fix's own timestamp: WebKit was seen reporting it in microseconds.
          const fix = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy, t: Date.now() };
          filtered = filterFix(filtered, fix, speed);
          setPosition({ ...filtered, heading, speed });
        },
        (err) => {
          // Timeouts are normal without A-GPS; the watch keeps trying on its own.
          if (err.code === err.PERMISSION_DENIED) setError('denied');
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
      );
    };
    const stop = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    };
    // GPS is the biggest battery drain, so it only runs while the screen is in use.
    const onVisibility = () => (document.hidden ? stop() : start());

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { position, error };
}
