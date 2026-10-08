"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        options?: {
          onSuccess?: (result: unknown) => void;
          onPending?: (result: unknown) => void;
          onError?: (result: unknown) => void;
          onClose?: () => void;
        },
      ) => void;
    };
  }
}

/** Load Snap.js once, with the client key on the script tag as Midtrans requires. */
function loadSnap(scriptUrl: string, clientKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.snap) return resolve();
    const existing = document.querySelector<HTMLScriptElement>("script[data-dirory-snap]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Could not load the payment page.")));
      return;
    }
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.setAttribute("data-client-key", clientKey);
    script.setAttribute("data-dirory-snap", "1");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment page."));
    document.body.appendChild(script);
  });
}

/**
 * "Pay online" for one invoice, using Midtrans Snap.
 *
 * The Snap token is minted server-side (the server key never reaches here). This
 * component only loads Snap.js, opens the payment page, and refreshes the page
 * afterwards — the webhook, not this callback, is what marks the invoice paid.
 */
export function MidtransPay({
  invoiceId,
  clientKey,
  scriptUrl,
  amountLabel,
}: {
  invoiceId: string;
  clientKey: string;
  scriptUrl: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "paying" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const start = useCallback(async () => {
    setStatus("loading");
    setMessage("");
    try {
      await loadSnap(scriptUrl, clientKey);

      const res = await fetch("/api/payments/midtrans/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setStatus("error");
        setMessage(data.error ?? "Could not start the payment.");
        return;
      }

      setStatus("paying");
      window.snap?.pay(data.token, {
        onSuccess: () => {
          setStatus("done");
          setMessage("Payment received. Confirming with the gateway…");
          router.refresh();
        },
        onPending: () => {
          setStatus("done");
          setMessage("Waiting for your payment to complete. This page updates once it is confirmed.");
          router.refresh();
        },
        onError: () => {
          setStatus("error");
          setMessage("The payment failed. You can try again.");
        },
        onClose: () => {
          // Closed without paying: leave the invoice unpaid, no error shown.
          setStatus("idle");
        },
      });
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not start the payment.");
    }
  }, [clientKey, invoiceId, router, scriptUrl]);

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={status === "loading" || status === "paying" || status === "done"}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "loading"
          ? "Opening…"
          : status === "paying"
            ? "Waiting for the payment page…"
            : status === "done"
              ? "Payment started"
              : `Pay ${amountLabel} online`}
      </button>
      {message ? (
        <p
          className={`mt-2 text-xs ${status === "error" ? "text-rose-700" : "text-emerald-700"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
