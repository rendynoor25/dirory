"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { t, type Locale } from "@/lib/i18n";

/**
 * Passwordless sign-in and first-time architect registration.
 *
 * Two paths, both landing on `/auth/callback` with a `next` target:
 *   * Google OAuth — one click, no inbox round-trip (the easy path).
 *   * Email magic link — the fallback for people without Google.
 *
 * Split out of `page.tsx` deliberately: a Next.js *client* component cannot be
 * `async`, and awaiting `searchParams` inside one makes React call hooks out of
 * order (React error #321, "Invalid hook call").
 */
export function SignInForm({
  next,
  error,
  googleEnabled = true,
  locale,
}: {
  next: string;
  error?: string;
  googleEnabled?: boolean;
  locale: Locale;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error" | "google">("idle");
  const [message, setMessage] = useState("");

  // Prefer the configured canonical site URL over window.location.origin.
  // On a deploy-preview host the origin is an ephemeral alias that is usually
  // NOT in Supabase's allow-list, so OAuth/magic-link returns fail with a
  // confusing "back on the sign-in page" result. The canonical URL avoids that.
  const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  const origin = (): string => {
    if (siteOrigin && /^https?:\/\//.test(siteOrigin)) return siteOrigin;
    return window.location.origin;
  };

  const callbackUrl = (target: string) => `${origin()}/auth/callback?next=${encodeURIComponent(target)}`;

  async function onGoogle() {
    setStatus("google");
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl(next) },
      });
      // On success the browser is redirected to Google; only errors return here.
      if (oauthError) {
        setStatus("error");
        setMessage(t(locale, "login.googleError", { message: oauthError.message }));
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : t(locale, "login.googleFail"));
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
        options: { shouldCreateUser: true, emailRedirectTo: callbackUrl(next) },
      });

      if (signInError) {
        setStatus("error");
        setMessage(signInError.message);
        return;
      }
      setStatus("sent");
      setMessage(t(locale, "login.sentBody"));
    } catch (err) {
      // A misconfigured project throws here rather than returning an error,
      // which is common right after setup. Surface it instead of blanking.
      setStatus("error");
      setMessage(err instanceof Error ? err.message : t(locale, "login.sendFail"));
    }
  }

  return (
    <>
      {error ? <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {googleEnabled ? (
        <>
          <button
            type="button"
            onClick={onGoogle}
            disabled={status === "google"}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <GoogleMark />
            {status === "google" ? t(locale, "login.googleOpening") : t(locale, "login.google")}
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            {t(locale, "login.orEmail")}
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </>
      ) : (
        <div className="mt-6" />
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="text-sm font-medium text-slate-700">
            {t(locale, "login.emailLabel")}
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t(locale, "login.emailPlaceholder")}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <button
          type="submit"
          disabled={status === "sending" || status === "sent"}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "sending"
            ? t(locale, "login.sending")
            : status === "sent"
              ? t(locale, "login.sent")
              : t(locale, "login.emailButton")}
        </button>
      </form>

      {message ? (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            status === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {message}
        </p>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-slate-500">
        {t(locale, "login.terms")}{" "}
        <a className="underline underline-offset-2" href="/privacy">
          {t(locale, "login.privacyLink")}
        </a>
        . {t(locale, "login.noPassword")}
      </p>
    </>
  );
}

/** Google's official "G" mark, inline so there is no extra asset request. */
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
