# Reencuentro

PWA para encontrarte con tu grupo en lugares sin señal. Mientras hay señal, creás un grupo con puntos de encuentro y
un plan, y bajás el mapa de la zona. Sin señal, la app te lleva al punto con GPS y brújula, y podés mandar tu ubicación
por SMS. No hay backend: todo vive en el teléfono y se comparte por link o QR.

No muestra a los demás en vivo: un navegador no puede hacerlo sin red.

## Cómo correrlo

Requiere Node 20 o superior.

```bash
npm install
npm run dev       # desarrollo
npm test          # tests unitarios
npm run lint
npm run build     # build de producción
npm run preview   # sirve el build, con service worker
```

Con Node 18, `npm run build` falla salvo que lo corras con `NODE_OPTIONS=--experimental-global-webcrypto`.

Geolocalización, cámara y service worker requieren HTTPS, salvo en `localhost`.

## Cómo desplegarlo

Cada push a `main` despliega en Vercel como sitio estático. `vercel.json` manda todas las rutas a `index.html`.

## Arquitectura

| Parte | Dónde | Qué hace |
|---|---|---|
| Service worker | `src/sw.ts` | Precachea la app y sirve el mapa con CacheFirst desde `map-cache-v1`, que sobrevive a las actualizaciones |
| Datos | `src/db/` | Grupos, recorrido y puntos personales en IndexedDB (Dexie) |
| Mapa offline | `src/lib/tiles.ts` | Calcula la zona y baja estilo, TileJSON, sprites, glifos y tiles z10-14 |
| Última ubicación | `src/lib/lastKnown.ts`, `src/hooks/useLastKnown.ts`, `api/loc.ts` | Opcional. Necesita Upstash Redis conectado en Vercel; sin él, el resto de la app funciona igual |
| Compartir | `src/lib/share.ts` | Codifica el grupo en el hash de la URL y valida lo que se importa, porque no es confiable |
| Geo | `src/lib/geo.ts` | Distancia, rumbo, parseo de coordenadas y lógica de llegada |
| SMS | `src/lib/sms.ts` | Arma el mensaje (un solo segmento GSM-7) y el URI según la plataforma |
| Sensores | `src/hooks/` | GPS, brújula y wake lock; se pausan en segundo plano |
| Pantalla clave | `src/pages/Meet.tsx` | Modo Encuentro |

El proveedor del mapa se cambia en `src/config.ts`. Las decisiones tomadas están en `DECISIONS.md`.
