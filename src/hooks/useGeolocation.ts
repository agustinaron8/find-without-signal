import { useEffect, useState } from 'react';

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

    const start = () => {
      if (watchId !== null) return;
      watchId = navigator.geolocation.watchPosition(
        ({ coords, timestamp }) => {
          setError(null);
          setPosition({
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
            heading: coords.heading,
            speed: coords.speed,
            t: timestamp,
          });
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
