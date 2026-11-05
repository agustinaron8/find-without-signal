# Decisiones

- Repo llamado `find-without-signal` (nombre de la carpeta local); el producto sigue siendo "Reencuentro".
- Versiones fijadas para Node 18 local: Vite 6, Vitest 3, Tailwind 3, MapLibre 4.
- BrowserRouter con rewrite de Vercel (no HashRouter), para que `/i#payload` funcione como pide §9.
- `registerType: 'prompt'` en vez de `autoUpdate`: §9 pide toast y no actualizar en Modo Encuentro, y `autoUpdate` recarga solo.
- `engines.node >= 20`: el build de Workbox necesita `crypto` global. Con el Node 18 de esta PC se compila con `NODE_OPTIONS=--experimental-global-webcrypto`; Vercel no lo necesita.
- El descargador reutiliza la versión de tiles ya guardada mientras siga disponible; si cambia, las zonas de otros grupos se marcan para volver a bajar.
- Si los puntos están muy lejos, además de reducir el margen se baja el zoom máximo (hasta z12); si igual no entra, se avisa y no se descarga.
- Se bajan también los tiles raster de baja resolución y el rango de glifos 8192-8447, que usan el estilo y los nombres de lugares.
- SMS en texto GSM-7 ("Estoy aca", "+-") y coordenadas con 5 decimales, para que entre en un solo segmento y sea preciso entre mucha gente.
- Con GPS impreciso (>50 m) se muestra "≈ distancia" junto con "Buscando GPS…" en vez de ocultar el dato; nunca se anuncia llegada con esa precisión.
- "Volver por donde vine" usa el inicio del recorrido actual: se corta solo tras 12 h sin puntos, para servir en eventos de varios días sin mandarte a donde probaste la app en casa.
- Modo Encuentro en fondo blanco y texto negro: es lo que mejor se lee al sol.
- La flecha toma primero `window.orientation`: en WebKit se observó `screen.orientation.angle` en 90 con tipo `portrait-primary`.
- Última ubicación conocida: la clave y el canal se derivan del id del grupo, que solo viaja en el hash del link. Así funciona con grupos ya compartidos, sin rehacer el QR, y el servidor solo ve texto cifrado.
- Compartir la ubicación es opcional para cada persona y arranca apagado. Al apagarlo se borra del servidor; si no hay red, se reintenta hasta lograrlo.
- Un solo POST escribe y lee, para aprovechar un momento de señal. Se manda cada 3 minutos y solo con el Modo Encuentro abierto; los datos expiran a las 72 h.
- `/api/loc` no tiene rate limit: un abuso solo agotaría la cuota de la base, y eso apaga esta función sin afectar puntos, flecha ni mapa.
