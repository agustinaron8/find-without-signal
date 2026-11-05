import QRCodeLib from 'qrcode';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { QR_SAFE_LENGTH } from '../lib/share';

interface QRCodeProps {
  value: string;
  title: string;
  onClose: () => void;
}

export default function QRCode({ value, title, onClose }: QRCodeProps) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    QRCodeLib.toDataURL(value, { errorCorrectionLevel: 'L', margin: 4, width: 1024 })
      .then((url) => active && setSrc(url))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [value]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white p-4 text-slate-950">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute right-4 p-2"
        style={{ top: 'calc(1rem + env(safe-area-inset-top))' }}
        onClick={onClose}
      >
        <X size={32} />
      </button>
      <h2 className="text-center text-2xl font-bold">{title}</h2>
      {src && <img src={src} alt={`Código QR de ${title}`} className="w-full max-w-md" />}
      {failed && <p className="text-center font-semibold">Este grupo tiene demasiados datos para un QR. Compartilo por link.</p>}
      {!failed && <p className="text-center text-slate-700">Subí el brillo al máximo y escanealo desde Reencuentro → Importar.</p>}
      {!failed && value.length > QR_SAFE_LENGTH && (
        <p className="rounded-lg bg-amber-200 p-3 text-center font-semibold">
          Este QR es muy denso y puede costar leerlo. Si falla, compartí el link.
        </p>
      )}
    </div>
  );
}
