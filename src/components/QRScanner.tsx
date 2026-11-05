import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';

interface QRScannerProps {
  onResult: (text: string) => void;
}

const SCAN_INTERVAL_MS = 200;

export default function QRScanner({ onResult }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onResultRef = useRef(onResult);
  const [error, setError] = useState('');

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const scan = () => {
      if (stopped) return;
      const video = videoRef.current;
      if (context && video && video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);
        const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(data, width, height, { inversionAttempts: 'dontInvert' });
        if (code?.data) onResultRef.current(code.data);
      }
      timer = window.setTimeout(scan, SCAN_INTERVAL_MS);
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no permite usar la cámara. Pegá el link.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        scan();
      } catch {
        if (!stopped) setError('No pude abrir la cámara. Revisá el permiso o pegá el link.');
      }
    };
    start();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (error) return <p className="rounded-lg bg-red-950 p-3 text-red-200">{error}</p>;

  // iOS Safari only plays camera video inline when it is muted and playsInline.
  return <video ref={videoRef} muted playsInline className="aspect-square w-full rounded-xl bg-black object-cover" />;
}
