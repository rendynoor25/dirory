#!/usr/bin/env node
/**
 * Generate placeholder textures for the roof / ceiling / board materials that
 * the catalogue was missing.
 *
 * These answer searches architects actually make ("zinc roof", "spandek",
 * "ceiling tile", "gypsum", "GRC") with a serviceable sample, the same way
 * `generate-kerikil-texture.mjs` answered "kerikil". They are **Dirory free
 * samples**, not brand product photographs, and they live on the platform brand
 * so nobody mistakes them for a vendor's product.
 *
 * Replace any of them with a real photograph by dropping the file over the same
 * path and re-running `scripts/upload-library.mjs --root library-additions`.
 *
 * No image library: PNG is written directly with zlib. Output is deterministic,
 * so re-running produces identical bytes.
 *
 *   node scripts/generate-material-textures.mjs
 *   node scripts/generate-material-textures.mjs --out library-additions
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const SIZE = 512;
const OUT_ROOT = String(
  (() => {
    const i = process.argv.indexOf("--out");
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : "library-additions";
  })(),
);

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
  ihdr[9] = 2; // truecolour RGB
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

// --- canvas helpers --------------------------------------------------------
class Canvas {
  constructor(seed) {
    this.px = Buffer.alloc(SIZE * SIZE * 3);
    this.random = rng(seed);
  }

  /** Paint every pixel from `fn(x, y) -> [r,g,b]`. */
  paint(fn) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const [r, g, b] = fn(x, y);
        const i = (y * SIZE + x) * 3;
        this.px[i] = clamp(r);
        this.px[i + 1] = clamp(g);
        this.px[i + 2] = clamp(b);
      }
    }
    return this;
  }

  /** Multiply every channel by a deterministic noise factor. */
  grain(amount) {
    const r = this.random;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const n = (r() - 0.5) * amount;
      this.px[i * 3] = clamp(this.px[i * 3] + n);
      this.px[i * 3 + 1] = clamp(this.px[i * 3 + 1] + n);
      this.px[i * 3 + 2] = clamp(this.px[i * 3 + 2] + n);
    }
    return this;
  }

  /** Scatter short fibres/specks — the mineral look of ceiling and GRC boards. */
  specks(count, strength) {
    const r = this.random;
    for (let i = 0; i < count; i++) {
      const x = Math.floor(r() * SIZE);
      const y = Math.floor(r() * SIZE);
      const len = 2 + Math.floor(r() * 6);
      const up = r() > 0.5;
      const d = (up ? 1 : -1) * strength * (0.5 + r() * 0.5);
      for (let k = 0; k < len; k++) {
        const xx = x + k;
        const yy = y + (r() > 0.6 ? 1 : 0);
        if (xx >= SIZE || yy >= SIZE) break;
        const idx = (yy * SIZE + xx) * 3;
        this.px[idx] = clamp(this.px[idx] + d);
        this.px[idx + 1] = clamp(this.px[idx + 1] + d);
        this.px[idx + 2] = clamp(this.px[idx + 2] + d);
      }
    }
    return this;
  }

  save(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, encodePng(SIZE, SIZE, this.px));
    return fs.statSync(file).size;
  }
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

/** Smooth low-frequency blotches, for surfaces that are not perfectly even. */
function mottle(x, y, scale, phase = 0) {
  return (
    Math.sin((x / scale) + phase) * 0.5 +
    Math.sin((y / (scale * 1.37)) + phase * 1.7) * 0.5
  );
}

// ---------------------------------------------------------------------------
// 1. Zinc roof — corrugated sheet: rounded waves, small pitch, cool metal.
// ---------------------------------------------------------------------------
function zincRoof() {
  const PITCH = 22;
  const BASE = [176, 180, 185];
  return new Canvas(20261010)
    .paint((x, y) => {
      const phase = (x % PITCH) / PITCH;
      // A rounded corrugation: highlight on the crest, shadow in the valley.
      const s = Math.sin(2 * Math.PI * phase - Math.PI / 2); // -1..1
      let shade = 0.70 + 0.34 * (s * 0.5 + 0.5);
      // Long vertical streaks from the rolling mill.
      shade *= 1 + 0.035 * Math.sin(y * 0.55 + x * 0.08) + 0.02 * mottle(x, y, 41, 1.2);
      return [BASE[0] * shade, BASE[1] * shade, BASE[2] * shade];
    })
    .grain(7);
}

// ---------------------------------------------------------------------------
// 2. Spandek roof — trapezoidal rib sheet: flat valley, angled sides, flat
//    crest, wider pitch. Reads clearly different from corrugated zinc.
// ---------------------------------------------------------------------------
function spandekRoof() {
  const VALLEY = 24;
  const SLOPE = 6;
  const CREST = 24;
  const PITCH = VALLEY + SLOPE + CREST + SLOPE; // 60
  const BASE = [175, 176, 177]; // neutral silver, not blue-grey
  return new Canvas(20261011)
    .paint((x, y) => {
      const p = x % PITCH;
      let shade;
      if (p < VALLEY) shade = 0.84; // valley (in shadow)
      else if (p < VALLEY + SLOPE) shade = 0.84 + 0.30 * ((p - VALLEY) / SLOPE); // rising
      else if (p < VALLEY + SLOPE + CREST) shade = 1.14; // crest (catching light)
      else shade = 1.14 - 0.30 * ((p - VALLEY - SLOPE - CREST) / SLOPE); // falling
      shade *= 1 + 0.02 * Math.sin(y * 0.31 + x * 0.02) + 0.015 * mottle(x, y, 55, 0.4);
      return [BASE[0] * shade, BASE[1] * shade, BASE[2] * shade];
    })
    .grain(6);
}

// ---------------------------------------------------------------------------
// 3. Ceiling tile — 2x2 mineral-fibre tiles with recessed joints.
// ---------------------------------------------------------------------------
function ceilingTile() {
  const TILE = SIZE / 2;
  const JOINT = 5;
  const BASE = [234, 232, 225];
  return new Canvas(20261012)
    .paint((x, y) => {
      const dx = x % TILE;
      const dy = y % TILE;
      const nearJoint = dx < JOINT || dy < JOINT;
      // Slight per-tile tone shift so the four panels do not look printed.
      const tileTone = 1 - 0.012 * ((x < TILE ? 0 : 1) + (y < TILE ? 0 : 1));
      const shade = nearJoint ? 0.80 : tileTone * (1 + 0.02 * mottle(x, y, 26, 0.9));
      return [BASE[0] * shade, BASE[1] * shade, BASE[2] * shade];
    })
    .specks(9000, 26)
    .grain(5);
}

// ---------------------------------------------------------------------------
// 4. Gypsum board — smooth paper-faced panel, one taped seam across the middle.
// ---------------------------------------------------------------------------
function gypsumBoard() {
  const SEAM_Y = SIZE / 2;
  const TAPE = 14;
  const BASE = [241, 239, 233];
  return new Canvas(20261013)
    .paint((x, y) => {
      const d = Math.abs(y - SEAM_Y);
      let shade = 1 + 0.012 * mottle(x, y, 38, 0.6);
      if (d < 2) shade *= 0.86; // the joint line itself
      else if (d < TAPE) shade *= 1.02; // the taped band is very slightly brighter
      return [BASE[0] * shade, BASE[1] * shade, BASE[2] * shade];
    })
    .grain(3);
}

// ---------------------------------------------------------------------------
// 5. GRC board — glass-fibre reinforced cement: light grey, matte, fibrous.
// ---------------------------------------------------------------------------
function grcBoard() {
  const BASE = [212, 212, 208];
  return new Canvas(20261014)
    .paint((x, y) => {
      const shade = 1 + 0.028 * mottle(x, y, 47, 2.1) + 0.012 * mottle(x, y, 13, 0.3);
      return [BASE[0] * shade, BASE[1] * shade, BASE[2] * shade];
    })
    .specks(14000, 20)
    .grain(7);
}

// ---------------------------------------------------------------------------
const OUTPUT = [
  ["Materials/Roof/Zinc Roof.png", zincRoof],
  ["Materials/Roof/Spandek Roof.png", spandekRoof],
  ["Materials/Ceiling/Ceiling Tile.png", ceilingTile],
  ["Materials/Board/Gypsum Board.png", gypsumBoard],
  ["Materials/Board/GRC Board.png", grcBoard],
];

let count = 0;
for (const [rel, make] of OUTPUT) {
  const file = path.resolve(OUT_ROOT, rel);
  const bytes = make().save(file);
  count++;
  console.log(`  ${file}  (${(bytes / 1024).toFixed(1)} KB)`);
}
console.log(`\nWrote ${count} texture(s) under ${path.resolve(OUT_ROOT)}.`);
console.log("Placeholders, not photographs — replace when a real image exists.");
