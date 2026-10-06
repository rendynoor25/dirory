/**
 * Read the SketchUp version from a `.skp` header (Node side).
 *
 * Mirrors `apps/web/src/lib/su-version.ts`, which the browser upload form uses.
 * This plain-JS copy exists so the Node scripts can share the same logic without
 * a TypeScript loader; keep the two in step. (The library uploader already
 * mirrors `scan_library` in Ruby the same way.)
 *
 * A `.skp` opens with: FF FE FF 0E, the UTF-16LE string "SketchUp Model", then
 * FF FE FF <len> and the version marker, e.g. "{18.0.16975}". The number before
 * the first dot is the SketchUp release (13 → 2013 … 20 → 2020); 21 and above
 * are the single "versionless" 2021+ format.
 */
import fs from "node:fs";

/** Parse the version marker from the first bytes of a `.skp`. */
export function parseSuVersion(bytes) {
  if (readUtf16(bytes, 4, 14) !== "SketchUp Model") return null;

  const lenOffset = 4 + 14 * 2;
  const length = bytes[lenOffset + 3];
  if (length === undefined) return null;
  const raw = readUtf16(bytes, lenOffset + 4, length);
  if (!raw.startsWith("{") || !raw.endsWith("}")) return null;

  const major = Number.parseInt(raw.slice(1).split(".")[0], 10);
  if (!Number.isFinite(major)) return null;
  if (major >= 2021) return { year: 2021, label: "2021+", raw };
  if (major >= 13) return { year: 2000 + major, label: String(2000 + major), raw };
  if (major >= 3) return { year: major, label: String(major), raw };
  return null;
}

/** Convenience: read the first 64 bytes of a file and parse them. */
export function suVersionForFile(file) {
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(64);
    const read = fs.readSync(fd, buf, 0, 64, 0);
    fs.closeSync(fd);
    return parseSuVersion(buf.subarray(0, read));
  } catch {
    return null;
  }
}

function readUtf16(bytes, offset, length) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    const lo = bytes[offset + i * 2];
    const hi = bytes[offset + i * 2 + 1];
    if (lo === undefined || hi === undefined) return out;
    out += String.fromCharCode(lo | (hi << 8));
  }
  return out;
}
