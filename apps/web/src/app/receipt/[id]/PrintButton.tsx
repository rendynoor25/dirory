"use client";

/**
 * Print button for the kuitansi.
 *
 * The "PDF" is the browser's own print dialog (Print → Save as PDF). That keeps
 * the receipt a plain HTML document with no PDF library, no headless browser and
 * no extra dependency in the image, and it prints exactly what is on screen.
 */
export function PrintButton({ label = "Cetak / Simpan PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-800"
    >
      {label}
    </button>
  );
}
