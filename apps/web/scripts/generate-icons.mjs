// Genera los íconos raster del PWA (public/icon-192.png, icon-512.png,
// icon-512-maskable.png) reproduciendo src/app/icon.svg — rect redondeado
// #0a0a0f con la "O" neon #a3e635 — sin depender de sharp ni ImageMagick.
//
//   node scripts/generate-icons.mjs
//
// PNG escrito a mano: IHDR (RGBA 8-bit) + IDAT (zlib deflate, filtro 0)
// + IEND. Supersample 4x para antialiasing de bordes.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public");

const NIGHT = [0x0a, 0x0a, 0x0f];
const NEON = [0xa3, 0xe6, 0x35];

// Geometría en el viewBox 512 del SVG: rect rx=96; la "O" (system-ui 800,
// font-size 300, baseline middle en y=58%) se aproxima con un anillo
// elíptico centrado en (256, 297).
const VB = 512;
const RECT_RX = 96;
const O_CX = 256;
const O_CY = 297;
const O_OUTER_RX = 118;
const O_OUTER_RY = 152;
const O_STROKE = 44; // inner = outer - stroke

function insideRoundedRect(x, y, rx) {
  // x,y en [0,VB]. Esquinas redondeadas radio rx.
  const cx = Math.min(Math.max(x, rx), VB - rx);
  const cy = Math.min(Math.max(y, rx), VB - rx);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= rx * rx;
}

function insideRing(x, y, scale, cx, cy) {
  const dx = (x - cx) / scale;
  const dy = (y - cy) / scale;
  const outer = (dx * dx) / (O_OUTER_RX * O_OUTER_RX) + (dy * dy) / (O_OUTER_RY * O_OUTER_RY);
  const irx = O_OUTER_RX - O_STROKE;
  const iry = O_OUTER_RY - O_STROKE;
  const inner = (dx * dx) / (irx * irx) + (dy * dy) / (iry * iry);
  return outer <= 1 && inner > 1;
}

// Muestrea un sub-píxel (coords en viewBox) → [r,g,b,a]
function sample(x, y, { maskable }) {
  const scale = maskable ? 0.82 : 1; // safe zone maskable ≈ 80% central
  if (insideRing(x, y, scale, O_CX, O_CY)) return [...NEON, 255];
  if (maskable || insideRoundedRect(x, y, RECT_RX)) return [...NIGHT, 255];
  return [0, 0, 0, 0];
}

function render(size, opts) {
  const SS = 4; // supersampling por eje
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let pos = 0;
  for (let py = 0; py < size; py++) {
    raw[pos++] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const vx = ((px + (sx + 0.5) / SS) / size) * VB;
          const vy = ((py + (sy + 0.5) / SS) / size) * VB;
          const [sr, sg, sb, sa] = sample(vx, vy, opts);
          r += sr * sa; g += sg * sa; b += sb * sa; a += sa;
        }
      }
      const n = SS * SS;
      const alpha = a / n / 255;
      raw[pos++] = alpha > 0 ? Math.round(r / a) : 0;
      raw[pos++] = alpha > 0 ? Math.round(g / a) : 0;
      raw[pos++] = alpha > 0 ? Math.round(b / a) : 0;
      raw[pos++] = Math.round((a / n) );
    }
  }
  return raw;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rawScanlines) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rawScanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size, maskable] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-512-maskable.png", 512, true],
  // apple-touch-icon: iOS no recorta ni usa el manifest — fondo full-bleed.
  ["apple-touch-icon.png", 180, true],
]) {
  const file = join(OUT, name);
  writeFileSync(file, png(size, render(size, { maskable })));
  console.log(`${name}: ${size}x${size}${maskable ? " (maskable)" : ""}`);
}
