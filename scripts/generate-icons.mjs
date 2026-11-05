// Renders the source SVG into the PNG icons referenced by the web manifest.
import { mkdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const svg = readFileSync(new URL('./icon.svg', import.meta.url));
const outDir = new URL('../public/icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const BACKGROUND = '#0f172a';

async function render(name, size, scale = 1) {
  const inner = Math.round(size * scale);
  const pad = Math.floor((size - inner) / 2);
  const image = await sharp(svg, { density: 300 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite([{ input: image, left: pad, top: pad }])
    .png()
    .toFile(new URL(name, outDir).pathname);
}

await render('icon-192.png', 192);
await render('icon-512.png', 512);
await render('apple-touch-icon-180.png', 180);
// Maskable icons need their content inside the central 80% safe zone.
await render('maskable-512.png', 512, 0.8);
