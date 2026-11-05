# HANDOFF — "Reencuentro": PWA offline para encontrarse sin señal

> **Para Claude Code:** este documento es la especificación completa. Trabajá de forma autónoma: el dueño (Agustín) te controla desde el celular y no siempre va a poder responder. **No te bloquees con preguntas**: ante una duda, elegí la opción más simple que cumpla los criterios, anotala en `DECISIONS.md` y seguí. Plazo total: **2 días**.

---

## 0. Reglas de trabajo (leer primero)

1. **Commits chicos y frecuentes**, con push a `main` después de cada tarea terminada. Vercel despliega solo, y así Agustín prueba desde el celular.
2. Mantené actualizado **`PROGRESS.md`** en la raíz: qué está hecho, qué sigue y qué está bloqueado. Es lo que Agustín lee desde el celular.
3. **`DECISIONS.md`**: una línea por cada decisión que tomes por tu cuenta.
4. La UI va **en español (Argentina)**. El código y los comentarios, en inglés.
5. **Mobile-first**: probá todo en 375×812 con DevTools. El escritorio no importa.
6. Antes de cada push: `npm run build` sin errores y `npm run lint` limpio.
7. **No agregues backend en el MVP.** Todo vive en el dispositivo; se comparte por link o QR.
8. Si algo de la sección "Stretch" no entra, no lo hagas. **Lo prioritario es que funcione offline en iPhone y Android.**

---

## 1. Qué es el producto

Una PWA que, **mientras hay señal**, te deja crear un grupo (personas, puntos de encuentro y un plan de reencuentro) y **precargar todo**: la app, el mapa de la zona y los datos. Ya **sin señal**, te guía con GPS y brújula hacia el punto de encuentro, te muestra el mapa offline, guarda tu recorrido y te deja mandar tu ubicación por **SMS**, que muchas veces sale aunque no haya datos móviles.

**Por qué funciona sin señal:** el GPS no usa la red celular. El Service Worker sirve la app y los tiles del mapa desde la caché. Los datos viven en IndexedDB.

**Qué NO hace (y no hay que intentar):** ver la ubicación en vivo de los demás sin red. Bluetooth o una malla no son posibles desde el navegador (iOS no tiene Web Bluetooth). El reemplazo es: punto de encuentro acordado, más plan horario, más SMS.

### Caso de uso típico
Un recital, un festival, una montaña o un estadio. Antes de ir, Agustín crea "Lolla 2026" con 4 amigos, marca "Punto A: torre de sonido" y "Punto B: entrada norte", y fija el plan "si nos perdemos, a cada hora en punto en el Punto A". Comparte el QR y cada amigo lo importa. En el lugar, sin señal, cualquiera abre la app y la brújula lo lleva al punto.

---

## 2. Stack (fijo, no cambiar)

| Necesidad | Elección |
|---|---|
| Build | **Vite + React 18 + TypeScript** (strict) |
| PWA / SW | **vite-plugin-pwa** (Workbox, `registerType: 'autoUpdate'`, estrategia `injectManifest` para tener SW custom) |
| Estilos | **Tailwind CSS** |
| Routing | **react-router** (HashRouter o BrowserRouter con rewrite de Vercel; ver §9) |
| Datos locales | **Dexie** (IndexedDB) |
| Mapa | **MapLibre GL JS** + tiles vectoriales de **OpenFreeMap** (gratis, sin API key) |
| Compartir datos | **lz-string** (`compressToEncodedURIComponent`) en el hash de la URL |
| QR generar | **qrcode** |
| QR escanear | **jsQR** con `getUserMedia` (no usar `BarcodeDetector`: no existe en iOS Safari) |
| IDs | `crypto.randomUUID()` |
| Deploy | **Vercel** (estático, sin funciones en el MVP) |

Sin librerías de UI pesadas. Íconos: SVG inline o `lucide-react`.

---

## 3. Modelo de datos (Dexie)

```ts
// db.ts
interface Group {
  id: string;               // uuid
  name: string;
  createdAt: number;
  members: Member[];
  meetingPoints: MeetingPoint[];
  plan?: string;            // texto libre: "Si nos perdemos, cada hora en punto en Punto A"
  planTimes?: string[];     // opcional: ["18:00","19:00"] → recordatorios visuales
  notes?: string;
  offlineArea?: OfflineArea; // qué se precargó
  myMemberId?: string;      // quién soy yo en este grupo
}

interface Member {
  id: string;
  name: string;
  color: string;            // hex, para el mapa
  phone?: string;           // para SMS (formato libre, se normaliza)
}

interface MeetingPoint {
  id: string;
  name: string;             // "Torre de sonido"
  lat: number; lng: number;
  description?: string;     // "Debajo del cartel azul"
  isPrimary?: boolean;
}

interface OfflineArea {
  bbox: [number, number, number, number]; // minLng, minLat, maxLng, maxLat
  minZoom: number; maxZoom: number;
  tileCount: number;
  downloadedAt: number;
  tilesetVersionUrl: string; // URL resuelta del TileJSON de OpenFreeMap
}

// Tablas locales (no se comparten)
interface TrackPoint { id?: number; groupId: string; lat: number; lng: number; acc: number; t: number; }
interface PersonalPoint { id: string; groupId: string; name: string; lat: number; lng: number; createdAt: number; } // "mi auto", "carpa"
```

Al iniciar la app: `navigator.storage.persist()`, y mostrar el resultado en el checklist (§5.4).

---

## 4. Pantallas y rutas

```
/                    → Lista de grupos + botones "Crear grupo" / "Importar"
/group/new           → Wizard crear/editar grupo
/group/:id           → Detalle del grupo (resumen, compartir, checklist offline, botón grande "MODO ENCUENTRO")
/group/:id/edit
/group/:id/meet      → MODO ENCUENTRO (la pantalla más importante)
/import              → Escanear QR / pegar link
/i#<payload>         → Ruta de importación directa por link
/help                → Cómo instalar en iPhone / Android + cómo funciona offline
```

---

## 5. Funcionalidades del MVP (en orden de prioridad)

### 5.1 Shell PWA offline (P0)
- `manifest.webmanifest`: nombre "Reencuentro", `display: standalone`, `theme_color`, íconos 192/512 + maskable + `apple-touch-icon` 180. Generá los íconos como un SVG simple (dos pins que se juntan) y exportalos como PNG con un script (`sharp`).
- Precache de todo el bundle (JS, CSS, HTML, íconos, fuentes locales).
- Meta tags iOS: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, viewport con `viewport-fit=cover` y safe-areas en el CSS.
- **Banner de instalación:**
  - Android: capturar `beforeinstallprompt` y mostrar el botón "Instalar".
  - iOS: detectar Safari no-standalone (`!navigator.standalone`) y mostrar una instrucción con ilustración: "Compartir → Agregar a inicio".
- **Aviso crítico para iOS** (en `/help` y en el banner): *en iPhone, la app instalada en inicio tiene un almacenamiento SEPARADO del de Safari. Instalá primero y después importá o creá los grupos desde la app instalada.* Si se detecta Safari no-standalone con grupos guardados, mostrar un aviso.
- Indicador online/offline global (`navigator.onLine` + eventos), discreto en el header.

### 5.2 Crear y editar grupo (P0)
- Nombre del grupo.
- Miembros: nombre, teléfono opcional y color automático de una paleta de 8. Uno se marca "Soy yo".
- Puntos de encuentro (mínimo 1, máximo 5), cada uno con nombre y descripción. Formas de agregar un punto:
  1. Tocar el mapa (pin arrastrable).
  2. "Usar mi ubicación actual".
  3. Pegar coordenadas o un link de Google Maps (parsear `lat,lng`, `@lat,lng`, `q=lat,lng`, `geo:lat,lng`).
  4. Buscar dirección: **opcional**, solo online, con Nominatim (`nominatim.openstreetmap.org/search`, con debounce de 1 s y respetando su política de uso). Si complica, omitirlo.
- Un punto marcado como principal.
- Plan de reencuentro: texto libre más horarios opcionales.
- Validación mínima y guardado en Dexie.

### 5.3 Compartir e importar (P0)
- **Payload compartible** = Group sin `offlineArea`, sin `myMemberId` y sin tablas locales → `JSON` → `lz-string.compressToEncodedURIComponent` → `https://<dominio>/i#<payload>`.
- Agregar `v: 1` al payload para versionar.
- Botones en el detalle del grupo:
  - **Compartir link:** `navigator.share` si existe; si no, copiar al portapapeles.
  - **Mostrar QR:** pantalla completa, con brillo y contraste altos. Si el payload hace al QR ilegible (más de unos 1500 caracteres), avisar.
- **Importar:**
  - Desde `/i#...`: decodificar, mostrar una vista previa ("Grupo X, 4 personas, 2 puntos"), preguntar "¿Quién sos vos?" (elegir miembro) y guardar. Si el `id` ya existe, ofrecer "Actualizar".
  - Desde `/import`: escanear QR con la cámara (jsQR) o pegar el link.
  - **El escaneo de QR funciona offline**: permite pasar grupos en el lugar, sin red. Lo único que no se puede bajar offline es el mapa.

### 5.4 Precarga offline del mapa + checklist "Listo para offline" (P0)
**Mapa:**
- MapLibre con estilo OpenFreeMap `https://tiles.openfreemap.org/styles/liberty`.
- El estilo referencia un **TileJSON** cuya URL de tiles tiene una versión fechada. Hay que resolverla en el momento de la descarga y cachear **todo** lo que el estilo necesita:
  1. `style.json`
  2. El TileJSON (`/planet`) y su URL resuelta
  3. `sprite.json` + `sprite.png` (y `@2x`)
  4. **Glyphs**: los rangos de fuentes que usa el estilo (`{fontstack}/{range}.pbf`). Cachear al menos `0-255` y `256-511` para cada fontstack del estilo, que alcanza para el español.
  5. **Vector tiles**: OpenFreeMap tiene maxzoom 14 y MapLibre hace *overzoom* más allá, así que alcanza con bajar **z10 a z14**.
- Área: bbox de todos los puntos de encuentro + **2 km de margen** (configurable a 1, 2 o 5 km en la UI). Calcular los tiles con la fórmula slippy-map estándar. **Máximo 800 tiles**: si se supera, reducir el margen y avisar.
- Descarga con **concurrencia 4**, reintentos ×2, barra de progreso y botón cancelar. Guardar en un Cache Storage propio (`map-cache-v1`).
- El SW intercepta las requests de `tiles.openfreemap.org` con **CacheFirst** sobre `map-cache-v1` (también cachea lo que el usuario navegue estando online).
- Mostrar el tamaño descargado (`navigator.storage.estimate()`).
- **Fallback:** si el mapa no carga offline, el Modo Encuentro sigue funcionando en modo **Radar** (§5.5). El mapa nunca debe ser un punto único de falla.

**Checklist "Listo para offline"** (en el detalle del grupo, con ✅/⚠️ por ítem y una acción para resolver cada uno):
1. App instalada (`display-mode: standalone`).
2. Almacenamiento persistente concedido.
3. Mapa de la zona descargado (X tiles, Y MB, fecha).
4. Permiso de ubicación concedido (pedirlo con un botón: `getCurrentPosition`).
5. Permiso de brújula (iOS: `DeviceOrientationEvent.requestPermission()` **desde un tap**).
6. "Elegiste quién sos" en el grupo.
7. Botón **"Probar modo avión"**: instrucciones para activar el modo avión y abrir el Modo Encuentro.

### 5.5 MODO ENCUENTRO (P0, la pantalla clave)
Diseño: alto contraste, textos grandes y legibles al sol, controles grandes para usar con una mano.

- **Selector de destino** arriba: los puntos de encuentro del grupo + los puntos personales. Por defecto, el principal.
- **Vista Radar/Brújula** (default, sin dependencias de red):
  - Flecha grande que apunta al destino = `bearing(yo→destino) − heading`.
  - **Distancia** grande ("320 m" / "1,2 km") con Haversine.
  - Tiempo estimado caminando (1,3 m/s).
  - Precisión GPS ("±15 m"). Si la precisión es peor que 50 m, mostrar "Buscando GPS…" con una animación.
  - Cuando la distancia es menor a la precisión o a 25 m: "¡Estás en el punto!" con vibración (`navigator.vibrate`).
- **Vista Mapa** (toggle): mi posición (punto azul + círculo de precisión), puntos del grupo con nombre, puntos personales, el recorrido y una línea recta al destino.
- **Heading (brújula):**
  - iOS: `deviceorientation` → `e.webkitCompassHeading`.
  - Android: `deviceorientationabsolute` → `360 − e.alpha`.
  - Ajustar por la orientación de pantalla (`screen.orientation.angle`).
  - Suavizar con un promedio circular (ventana de unos 5 valores).
  - Si no hay brújula o el permiso fue denegado: usar el **heading del GPS** (`coords.heading`) en movimiento y mostrar "Caminá unos pasos para orientar la flecha". Último fallback: mostrar el rumbo en texto ("al noreste, 45°").
- **GPS:** `watchPosition` con `enableHighAccuracy: true, maximumAge: 2000, timeout: 20000`. Avisar que sin señal el primer fix puede tardar 30–60 s, porque no hay A-GPS.
- **Wake Lock** (`navigator.wakeLock.request('screen')`) mientras la pantalla está activa. Re-solicitarlo en `visibilitychange`.
- **Recorrido (breadcrumbs):** guardar un TrackPoint cada 15 s o 10 m (lo que pase después), solo si la precisión es menor a 40 m. Botón "Volver por donde vine": pone como destino el primer punto del track.
- **"Guardar este lugar"**: crea un PersonalPoint offline ("Mi auto", "Carpa").
- **Plan visible:** franja con el texto del plan y el próximo horario de reencuentro, con cuenta regresiva si hay `planTimes`.

### 5.6 SMS de ubicación (P0, gran valor offline)
- En el Modo Encuentro, botón **"Mandar mi ubicación por SMS"** → elegir uno o varios miembros con teléfono.
- Cuerpo: `Estoy acá: -31.4201,-64.1888 (±12m) https://maps.google.com/?q=-31.4201,-64.1888 – Reencuentro`
- URI:
  - iOS: `sms:+5493511234567&body=...` (varios destinatarios: `sms:/open?addresses=a,b&body=` es poco confiable; usar uno solo por vez en iOS)
  - Android: `sms:+5493511234567?body=...` (varios: separados por `,`)
- **"Pegar ubicación recibida"**: textarea donde se pega un SMS recibido. Se parsean las coordenadas y se crea un PersonalPoint ("Juan – 18:42"), que queda como destino. Esto cierra el ciclo sin datos: Juan te manda un SMS, lo pegás y la brújula te lleva hasta él.

### 5.7 Pantalla de ayuda (P1)
- Instalación en iPhone y Android con pasos.
- Qué funciona sin señal y qué no (honesto: no se ve a los demás en vivo).
- Consejos: descargar el mapa con WiFi, abrir la app una vez estando offline en casa para probar, llevar batería externa.

---

## 6. Stretch (solo si sobra tiempo, en este orden)
1. **Última ubicación conocida del grupo (online):** Vercel Function + Upstash Redis. Cada miembro publica su posición cada 2 min mientras hay red, y la app muestra "Juan, hace 12 min" en el mapa. Requiere env vars; si no están, la feature se oculta.
2. Modo nocturno o linterna (pantalla blanca a pantalla completa para hacerse ver).
3. Compartir el grupo por SMS (link compacto).
4. Exportar el recorrido como GPX.

---

## 7. Plan de 2 días

### Día 1 — Base, datos, compartir, mapa offline
| # | Tarea | Hecho cuando… |
|---|---|---|
| 1 | Scaffold Vite+React+TS+Tailwind+router+Dexie, ESLint, `vercel.json`, push inicial | Deploy en Vercel abre la home |
| 2 | vite-plugin-pwa con SW custom (`injectManifest`), manifest, íconos, meta iOS | Lighthouse marca la PWA como instalable; con DevTools en *Offline*, recargar funciona |
| 3 | Modelo Dexie + lista de grupos + wizard crear/editar (sin mapa todavía: coords por "mi ubicación" o pegado) | Se crea, edita y borra un grupo; persiste al recargar |
| 4 | Componente de mapa MapLibre + selección de puntos tocando el mapa | Se agregan y arrastran puntos en el mapa |
| 5 | Compartir (link + QR) e importar (`/i#`, pegar link, escanear QR con jsQR) | Grupo creado en el teléfono A, importado en el B por QR |
| 6 | Descarga offline del área (style, TileJSON, sprites, glyphs, tiles z10–14) + SW CacheFirst + progreso | En modo avión el mapa de la zona se ve completo, con calles y nombres |
| 7 | Actualizar `PROGRESS.md` | — |

### Día 2 — Modo Encuentro, SMS, pulido, pruebas
| # | Tarea | Hecho cuando… |
|---|---|---|
| 8 | Hooks `useGeolocation`, `useHeading` (iOS/Android + fallbacks), `useWakeLock`; utilidades geo (haversine, bearing, formateo) **con tests unitarios (Vitest)** | Tests de haversine y bearing pasan contra valores conocidos |
| 9 | Pantalla Modo Encuentro: radar/flecha, distancia, precisión, llegada, selector de destino, toggle a mapa | Funciona en el celular caminando |
| 10 | Breadcrumbs + "Volver por donde vine" + "Guardar este lugar" | — |
| 11 | SMS enviar + "Pegar ubicación recibida" | En el celular se abre la app de mensajes con el texto listo |
| 12 | Checklist "Listo para offline" + banners de instalación + aviso iOS de almacenamiento separado | — |
| 13 | Pantalla de ayuda, estados vacíos, errores amables, safe-areas | — |
| 14 | Pasada de QA (§8) y fixes | Todo el checklist pasa en Chrome DevTools (emulación) |
| 15 | `README.md` (cómo correr, desplegar y arquitectura) + `PROGRESS.md` final con lo pendiente | — |

**Si vas atrasado**, recortá en este orden: búsqueda de direcciones → breadcrumbs → vista Mapa dentro del Modo Encuentro (dejar solo el Radar) → selector de margen. **Nunca recortes:** offline shell, compartir/importar, radar con brújula y SMS.

---

## 8. QA

### Automatizable (lo hacés vos)
- `vitest`: geo utils (haversine, bearing, parseo de coordenadas desde Google Maps, geo: y SMS), codificar/decodificar el payload (round-trip), cálculo de tiles por bbox.
- Build de producción + `vite preview` + Chrome DevTools: Application → Service Workers → *Offline*; recargar todas las rutas.
- Emular geolocalización y orientación con DevTools → Sensors.

### Manual en dispositivos reales (lo hace Agustín; dejalo como checklist en `PROGRESS.md`)
- [ ] iPhone: abrir en Safari → Agregar a inicio → abrir desde inicio → crear grupo → descargar mapa → **modo avión** → cerrar la app por completo → reabrir → el mapa se ve, la flecha apunta y la distancia cambia al caminar.
- [ ] Android (Chrome): lo mismo, con el botón Instalar.
- [ ] Compartir por QR de iPhone a Android y viceversa (estando offline los dos).
- [ ] SMS: enviar desde A, pegar en B y navegar hacia ese punto.
- [ ] La pantalla no se apaga en el Modo Encuentro.
- [ ] Brújula: comparar contra la brújula nativa del teléfono (±15°).

---

## 9. Detalles técnicos y trampas conocidas

- **HTTPS obligatorio** para geolocalización, cámara, SW y Wake Lock. Vercel ya lo da; en local usá `vite --host` con `@vitejs/plugin-basic-ssl` para probar desde el celular en la LAN.
- **Routing en Vercel:** si usás BrowserRouter, agregá `vercel.json` con `"rewrites": [{"source": "/(.*)", "destination": "/index.html"}]` y `navigateFallback: 'index.html'` en Workbox. La ruta `/i#payload` funciona igual porque el hash no viaja al servidor.
- **iOS:**
  - El almacenamiento de la PWA instalada es distinto del de Safari (ver §5.1).
  - El permiso de brújula se pide solo desde un gesto del usuario.
  - Safari puede borrar datos de sitios **no instalados** tras unos 7 días sin uso. Instalada y con `persist()` no hay problema.
  - `navigator.vibrate` no existe en iOS: hacé feature-detect y no rompas.
  - Wake Lock existe desde iOS 16.4: feature-detect.
- **SW updates:** con `autoUpdate`, mostrá un toast "Nueva versión, tocá para actualizar". **No actualices solo en el Modo Encuentro.**
- **Versionado de cachés:** el precache lo maneja Workbox; `map-cache-v1` es manual y **no** debe borrarse cuando se actualiza la app.
- **OpenFreeMap:** usalo de forma respetuosa (concurrencia 4, máximo 800 tiles por área). Dejá la URL del estilo en `src/config.ts` para poder cambiar de proveedor.
- **Nominatim** (si lo implementás): máximo 1 request por segundo y header/Referer identificable. Es solo online.
- **Batería:** en el Modo Encuentro, al pasar a segundo plano (`visibilitychange` hidden) frená `watchPosition` y los sensores, y reanudalos al volver.
- **Privacidad:** nada sale del dispositivo salvo lo que el usuario comparte explícitamente. Decilo en `/help`.

---

## 10. Estructura sugerida

```
src/
  main.tsx, App.tsx, config.ts
  sw.ts                      # service worker custom (Workbox injectManifest)
  db/                        # dexie schema + repos
  lib/geo.ts                 # haversine, bearing, format, parseCoords
  lib/tiles.ts               # bbox→tiles, downloader
  lib/share.ts               # encode/decode payload
  lib/sms.ts                 # build sms URIs per platform
  hooks/useGeolocation.ts, useHeading.ts, useWakeLock.ts, useOnline.ts, useInstallPrompt.ts
  components/MapView.tsx, Compass.tsx, QRCode.tsx, QRScanner.tsx, OfflineChecklist.tsx, InstallBanner.tsx
  pages/Home.tsx, GroupEdit.tsx, GroupDetail.tsx, Meet.tsx, Import.tsx, Help.tsx
tests/
PROGRESS.md  DECISIONS.md  README.md  vercel.json
```

---

## 11. Definición de "terminado"
1. Desplegado en Vercel e instalable en iPhone y Android.
2. Con el teléfono en **modo avión**, la app abre, muestra el grupo, el mapa de la zona, y la flecha y la distancia al punto de encuentro funcionan.
3. Un grupo se puede pasar a otro teléfono por QR, incluso sin red.
4. Se puede mandar la ubicación por SMS y cargar una ubicación recibida.
5. `PROGRESS.md` deja claro qué quedó afuera y el checklist manual para Agustín.

---

## 12. Lo que Agustín tiene que hacer antes de arrancar (5 min)
- Crear un repo vacío en GitHub y clonarlo en la PC.
- Conectar el repo a Vercel (Import Project → framework: Vite). Cada push a `main` despliega solo.
- Pegarle a Claude Code: *"Leé HANDOFF.md y ejecutalo completo siguiendo las reglas de la sección 0."*
