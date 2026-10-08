"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Dynamic QRIS for one invoice.
 *
 * The QR is minted server-side (the server key never reaches here) and is unique
 * to this invoice, so it can only ever pay this one. It expires; when it does,
 * the button offers a fresh one.
 *
 * Rendering the Midtrans-hosted PNG avoids shipping a QR encoder. The payload
 * (`qr_string`) is kept in the database for reconciliation.
 */
export function QrisPay({
  invoiceId,
  qrUrl,
  expiresAt,
  amountLabel,
}: {
  invoiceId: string;
  qrUrl: string | null;
  expiresAt: string | null;
  amountLabel: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(qrUrl);
  const [expiry, setExpiry] = useState<string | null>(expiresAt);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  const expired = expiry ? new Date(expiry) <= new Date() : false;
  const usable = Boolean(url) && !expired;

  async function generate() {
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/payments/midtrans/qris", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId }),
      });
      const data = (await res.json()) as { qr_url?: string; expires_at?: string; error?: string };
      if (!res.ok || !data.qr_url) {
        setStatus("error");
        setMessage(data.error ?? "Could not create the QR.");
        return;
      }
      setUrl(data.qr_url);
      setExpiry(data.expires_at ?? null);
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not create the QR.");
    }
  }

  return (
    <div>
      {usable ? (
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url as string}
            alt={`QRIS payment code for ${amountLabel}`}
            className="mx-auto h-56 w-56 rounded-xl border border-slate-200 bg-white p-2"
          />
          <p className="mt-3 text-xs text-slate-500">
            Scan with any QRIS app. This code is unique to this invoice and pays{" "}
            <strong className="text-slate-700">{amountLabel}</strong>.
          </p>
          {expiry ? (
            <p className="mt-1 text-xs text-slate-400">
              Expires {new Date(expiry).toLocaleString("id-ID")}
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          <p className="text-xs text-slate-500">
            {expired
              ? "The previous QR expired. Create a new one — it is unique to this invoice."
              : "Create a QRIS code for this invoice. It is unique to this invoice and expires."}
          </p>
          <button
            type="button"
            onClick={generate}
            disabled={status === "loading"}
            className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? "Creating…" : `Create QRIS for ${amountLabel}`}
          </button>
        </div>
      )}

      {message ? <p className="mt-2 text-xs text-rose-700">{message}</p> : null}
    </div>
  );
}
