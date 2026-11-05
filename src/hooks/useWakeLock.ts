import { useEffect, useState } from 'react';

export function useWakeLock(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;

    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request('screen');
        if (released) {
          next.release();
          return;
        }
        lock = next;
        setActive(true);
        next.addEventListener('release', () => setActive(false));
      } catch {
        // Denied on low battery, for example; the screen just follows the system timeout.
      }
    };
    // The browser drops the lock whenever the page is hidden.
    const onVisibility = () => {
      if (!document.hidden) acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      released = true;
      lock?.release();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return active;
}
