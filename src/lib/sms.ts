import type { LatLng } from './geo';

export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  return (trimmed.startsWith('+') ? '+' : '') + trimmed.replace(/\D/g, '');
}

// Plain GSM-7 text fits one SMS segment; accents, "±" or "–" would force 70-character
// segments and split the message, which is more fragile on a saturated network.
export function buildLocationMessage({ lat, lng }: LatLng, accuracy: number): string {
  const coords = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  return `Estoy aca: ${coords} (+-${Math.round(accuracy)}m) https://maps.google.com/?q=${coords} Reencuentro`;
}

export function buildSmsUri(phones: string[], body: string, ios: boolean): string {
  const recipients = phones.map(normalizePhone).join(',');
  return `sms:${recipients}${ios ? '&' : '?'}body=${encodeURIComponent(body)}`;
}
