import { useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';

export default function UpdateToast() {
  const { pathname } = useLocation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  // Never offer a reload while someone is navigating to a meeting point.
  if (!needRefresh || pathname.endsWith('/meet')) return null;

  return (
    <button
      type="button"
      onClick={() => updateServiceWorker(true)}
      className="fixed inset-x-4 bottom-4 z-50 rounded-xl bg-sky-400 p-4 font-semibold text-slate-950 shadow-lg"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      Nueva versión, tocá para actualizar
    </button>
  );
}
