"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Inline sign-in for the device-approval page.
 *
 * Kept on the same page as the device code so the OAuth round-trip never has to
 * carry the code through another redirect. `redirectTo` points straight back to
 * this page (with the code), so after Google/email the user lands on the
 * "go back to SketchUp" confirmation.
 */
export function DeviceSignIn({
  code,
  googleEnabled,
  error,
}: {
  code: string;
  googleEnabled: boolean;
  error?: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error" | "google">("idle");
  const [message, setMessage] = useState("");

  // Prefer the canonical site URL so a deploy-preview host never becomes the
  // OAuth redirect base (preview aliases are usually not allow-listed).
  const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  const origin = (): string => {
    if (siteOrigin && /^https?:\/\//.test(siteOrigin)) return siteOrigin;
    return window.location.origin;
  };
  const returnUrl = () => `${origin()}/auth/device?code=${encodeURIComponent(code)}`;

  async function onGoogle() {
    setStatus("google");
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: returnUrl() },
      });
      if (oauthError) {
        setStatus("error");
        setMessage(oauthError.message);
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not start Google sign-in.");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: true, emailRedirectTo: returnUrl() },
      });
      if (signInError) {
        setStatus("error");
        setMessage(signInError.message);
        return;
      }
      setStatus("sent");
      setMessage("Check your inbox. Open the link on this computer — it comes back to this page and finishes the connection.");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not send the link.");
    }
  }

  return (
    <>
      <p className="text-sm text-slate-600">
        Sign in to link this SketchUp session to your Dirory account.
      </p>

      {error ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      {googleEnabled ? (
        <>
          <button
            type="button"
            onClick={onGoogle}
            disabled={status === "google"}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <GoogleMark />
            {status === "google" ? "Opening Google…" : "Continue with Google"}
          </button>
          <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            or use email
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </>
      ) : (
        <div className="mt-4" />
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@gmail.com"
          aria-label="Email address"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={status === "sending" || status === "sent"}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "sending" ? "Sending..." : status === "sent" ? "Link sent" : "Email me a sign-in link"}
        </button>
      </form>

      {message ? (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            status === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {message}
        </p>
      ) : null}
    </>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
