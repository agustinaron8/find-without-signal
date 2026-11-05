# Decisiones

- Repo llamado `find-without-signal` (nombre de la carpeta local); el producto sigue siendo "Reencuentro".
- Versiones fijadas para Node 18 local: Vite 6, Vitest 3, Tailwind 3, MapLibre 4.
- BrowserRouter con rewrite de Vercel (no HashRouter), para que `/i#payload` funcione como pide §9.
- `registerType: 'prompt'` en vez de `autoUpdate`: §9 pide toast y no actualizar en Modo Encuentro, y `autoUpdate` recarga solo.
- `engines.node >= 20`: el build de Workbox necesita `crypto` global. Con el Node 18 de esta PC se compila con `NODE_OPTIONS=--experimental-global-webcrypto`; Vercel no lo necesita.
- El descargador reutiliza la versión de tiles ya guardada mientras siga disponible; si cambia, las zonas de otros grupos se marcan para volver a bajar.
- Si los puntos están muy lejos, además de reducir el margen se baja el zoom máximo (hasta z12); si igual no entra, se avisa y no se descarga.
- Se bajan también los tiles raster de baja resolución y el rango de glifos 8192-8447, que usan el estilo y los nombres de lugares.
