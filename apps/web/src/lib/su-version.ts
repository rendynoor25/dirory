/**
 * Read the SketchUp version out of a `.skp` file header.
 *
 * A `.skp` opens with a UTF-16LE header: a byte-order mark and length, the
 * literal string "SketchUp Model", then a second length-prefixed string holding
 * the format version, e.g. `{18.0.16975}`. The number before the first dot maps
 * to the SketchUp release that saved the file (13 → 2013, 18 → 2018, 20 → 2020).
 * From 2021 SketchUp writes a single "versionless" format, so any 21 or higher
 * means "SketchUp 2021 or later".
 *
 * Why this matters: a file saved in a newer SketchUp cannot be opened or
 * imported by an older one. Recording the version lets the website show the
 * requirement and the plugin warn before inserting a file the user cannot read.
 *
 * Pure and dependency-free so both the browser upload form and the Node upload
 * script can share it.
 */

export type SuVersion = {
  /** Minimum SketchUp release year, e.g. 2018. 2021 means "2021 or later". */
  year: number;
  /** Human label, e.g. "2018" or "2021+". */
  label: string;
  /** Raw header marker, e.g. "{18.0.16975}". */
  raw: string;
};

const MODEL_MAGIC = "SketchUp Model";
const MAGIC_OFFSET = 4; // after the FF FE FF 0E header
const MAGIC_LENGTH = 14; // "SketchUp Model"
const VERSION_OFFSET = MAGIC_OFFSET + MAGIC_LENGTH * 2;

/**
 * Parse the version marker from the first bytes of a `.skp`.
 * Returns null when the bytes are not a SketchUp model, or the marker is
 * unreadable. `bytes` only needs the first ~64 bytes of the file.
 */
export function parseSuVersion(bytes: Uint8Array): SuVersion | null {
  if (readUtf16(bytes, MAGIC_OFFSET, MAGIC_LENGTH) !== MODEL_MAGIC) return null;

  // The version string is preceded by its own FF FE FF <length> header.
  const lengthByte = bytes[VERSION_OFFSET + 3];
  if (lengthByte === undefined) return null;
  const raw = readUtf16(bytes, VERSION_OFFSET + 4, lengthByte);
  if (!raw.startsWith("{") || !raw.endsWith("}")) return null;

  const major = Number.parseInt(raw.slice(1).split(".")[0], 10);
  if (!Number.isFinite(major)) return null;

  return classify(major, raw);
}

function classify(major: number, raw: string): SuVersion | null {
  // 2021+ shares one file format, so a file reports 21 or higher whichever year
  // saved it. 2021 is the oldest SketchUp that can open it.
  if (major >= 2021) return { year: 2021, label: "2021+", raw };
  if (major >= 13) return { year: 2000 + major, label: String(2000 + major), raw };
  if (major >= 3) return { year: major, label: String(major), raw };
  return null;
}

/**
 * Turn a stored label ("2018", "2021+") into the SketchUp major version the
 * plugin compares against `Sketchup.version` (18, 21). Null when unknown.
 */
export function suMajor(label: string | null | undefined): number | null {
  if (!label) return null;
  const year = Number.parseInt(label, 10);
  if (!Number.isFinite(year)) return null;
  return year >= 2000 ? year - 2000 : year;
}

/** All selectable versions for the manual override, newest first. */
export const SU_VERSION_CHOICES = [
  "2021+",
  "2020",
  "2019",
  "2018",
  "2017",
  "2016",
  "2015",
  "2014",
  "2013",
] as const;

function readUtf16(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    const lo = bytes[offset + i * 2];
    const hi = bytes[offset + i * 2 + 1];
    if (lo === undefined || hi === undefined) return out;
    out += String.fromCharCode(lo | (hi << 8));
  }
  return out;
}
