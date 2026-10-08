#!/usr/bin/env node
/**
 * Generate a "kerikil" (river-stone gravel) material texture as a PNG.
 *
 * Why generated: the catalogue had stone, andesite and limestone, but nothing
 * that answers a search for "kerikil" or "batu" — the demand came from an
 * architect who needed hardscape gravel and found nothing. Rather than leave the
 * search unanswered until a photograph arrives, this produces a serviceable
 * sample so the term resolves, and it is clearly a **Dirory free sample** so
 * nobody mistakes it for a brand's product photo.
 *
 * Replace it with a real photo when one exists — drop the file over
 * `library-additions/Materials/Stone/kerikil-sungai.png` and re-run
 * `scripts/upload-library.mjs` (or remove the item and re-add it).
 *
 * No image library: PNG is written directly with zlib. Output is deterministic,
 * so re-running produces the identical file.
 *
 *   node scripts/generate-kerikil-texture.mjs
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const SIZE = 512;
const SEED = 20261009;

// --- deterministic RNG (mulberry32) ----------------------------------------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- PNG encoding ----------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgb) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgb.copy(raw, y * stride + 1, y * width * 3, (y + 1) * width * 3);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- the texture -----------------------------------------------------------
const random = rng(SEED);

// River stone runs from cool grey through warm brown; the gaps between stones
// are darker, damp sand.
const PEBBLE_COLOURS = [
  [128, 126, 122],
  [110, 108, 104],
  [146, 140, 130],
  [96, 94, 92],
  [138, 128, 112],
  [118, 112, 104],
  [156, 152, 146],
  [104, 100, 96],
  [150, 138, 122],
  [88, 86, 84],
];
const BASE = [64, 60, 56];

const px = Buffer.alloc(SIZE * SIZE * 3);
for (let i = 0; i < SIZE * SIZE; i++) {
  px[i * 3] = BASE[0];
  px[i * 3 + 1] = BASE[1];
  px[i * 3 + 2] = BASE[2];
}

function put(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 3;
  px[i] = Math.max(0, Math.min(255, Math.round(r)));
  px[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
  px[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
}

// Light from the upper left, as in a photo taken outdoors.
const L = (() => {
  const v = [-0.55, -0.62, 0.56];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();

/**
 * Draw a rounded pebble: an ellipse, shaded as if it were a sphere so the
 * surface reads as three-dimensional gravel rather than flat blobs.
 */
function drawPebble(cx, cy, rx, ry, angle, colour) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const reach = Math.ceil(Math.max(rx, ry)) + 2;

  for (let y = Math.floor(cy - reach); y <= cy + reach; y++) {
    for (let x = Math.floor(cx - reach); x <= cx + reach; x++) {
      // Rotate the sample point into the ellipse's own frame.
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const ux = (dx * cos + dy * sin) / rx;
      const uy = (-dx * sin + dy * cos) / ry;
      const d2 = ux * ux + uy * uy;
      if (d2 > 1) continue;

      // Sphere normal; the visible surface only.
      const z = Math.sqrt(Math.max(0, 1 - d2));
      const lambert = ux * L[0] + uy * L[1] + z * L[2];
      // Ambient plus diffuse, with a soft rim so edges darken.
      const light = 0.42 + 0.68 * Math.max(0, lambert);
      const rim = 1 - 0.28 * Math.pow(d2, 3);

      put(
        x,
        y,
        colour[0] * light * rim,
        colour[1] * light * rim,
        colour[2] * light * rim,
      );
    }
  }
}

// Pack pebbles roughly largest-first so smaller stones settle into the gaps,
// the way a real bed of river stone sorts itself.
const pebbles = [];
for (let i = 0; i < 2200; i++) {
  const r = 6 + Math.pow(random(), 2.4) * 22;
  pebbles.push({
    cx: random() * SIZE,
    cy: random() * SIZE,
    rx: r,
    ry: r * (0.72 + random() * 0.5),
    angle: random() * Math.PI,
    colour: PEBBLE_COLOURS[Math.floor(random() * PEBBLE_COLOURS.length)],
  });
}
pebbles.sort((a, b) => b.rx * b.ry - a.rx * a.ry);
for (const p of pebbles) drawPebble(p.cx, p.cy, p.rx, p.ry, p.angle, p.colour);

// Fine grain, so the surface does not look like flat vector shapes.
for (let i = 0; i < SIZE * SIZE; i++) {
  const n = (random() - 0.5) * 16;
  px[i * 3] += n;
  px[i * 3 + 1] += n;
  px[i * 3 + 2] += n;
}

const outPath = path.resolve(
  process.argv[2] ?? "library-additions/Materials/Stone/kerikil-sungai.png",
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, encodePng(SIZE, SIZE, px));

console.log(`Wrote ${outPath}`);
console.log(`  ${SIZE}x${SIZE}, ${fs.statSync(outPath).size} bytes`);
console.log("  Replace with a real photograph when one is available.");
