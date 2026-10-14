// Genera src/app/favicon.ico (16/32/48) - la "O" morada de Omnidance
// sobre el rounded square oscuro del icon.svg. PNG-in-ICO embebido,
// raster propio (sin deps): supersample 4x + zlib nativo.
// Uso: node apps/web/scripts/gen-favicon.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BG = [0x0a, 0x0a, 0x0f];
const FG = [0xa7, 0x8b, 0xfa];
const RADIUS = 96 / 512; // mismo rx que icon.svg
const OUTER = 152 / 512; // radio externo del anillo (~glyph de la O)
const THICK = 56 / 512; // grosor del trazo (~font-weight 800)

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
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
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

function render(size) {
  const SS = 4;
  const px = Buffer.alloc(size * size * 4);
  const r = RADIUS * size;
  const outer = OUTER * size;
  const inner = outer - THICK * size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // supersample: promedio de SS×SS subpíxeles
      let coverBg = 0;
      let coverFg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          // rounded rect: distancia al rect interior [r, size−r]² ≤ r
          // (el clamp resuelve bandas rectas y esquinas a la vez).
          const cx = Math.min(Math.max(fx, r), size - r);
          const cy = Math.min(Math.max(fy, r), size - r);
          if (Math.hypot(fx - cx, fy - cy) > r) continue;
          coverBg++;
          const d = Math.hypot(fx - size / 2, fy - size / 2);
          if (d >= inner && d <= outer) coverFg++;
        }
      }
      const total = SS * SS;
      const aBg = coverBg / total; // cobertura del rounded rect (alpha)
      const aFg = coverFg / total; // anillo encima del fondo
      const aBase = aBg - aFg;
      const i = (y * size + x) * 4;
      px[i] = Math.round(FG[0] * aFg + BG[0] * aBase);
      px[i + 1] = Math.round(FG[1] * aFg + BG[1] * aBase);
      px[i + 2] = Math.round(FG[2] * aFg + BG[2] * aBase);
      px[i + 3] = Math.round(255 * aBg);
    }
  }
  return px;
}

function png(size) {
  const rgba = render(size);
  // scanlines con filtro 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const sizes = [16, 32, 48];
const images = sizes.map(png);
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // type=icon
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + sizes.length * 16;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s === 256 ? 0 : s;
  e[1] = s === 256 ? 0 : s;
  e[4] = 1; // planes
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6); // bpp
  e.writeUInt32LE(images[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return e;
});

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/app/favicon.ico",
);
writeFileSync(out, Buffer.concat([header, ...entries, ...images]));
console.log(`favicon.ico generado (${sizes.join("/")}px) → ${out}`);
