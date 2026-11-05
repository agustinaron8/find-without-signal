import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Chrome can fire the event before React mounts, so it is captured at module load.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  listeners.forEach((listener) => listener());
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  listeners.forEach((listener) => listener());
});

export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(deferredPrompt !== null);

  useEffect(() => {
    const update = () => setCanInstall(deferredPrompt !== null);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    const prompt = deferredPrompt;
    await prompt.prompt();
    await prompt.userChoice;
    deferredPrompt = null;
    setCanInstall(false);
  }, []);

  return { canInstall, install };
}
