"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Passwordless sign-in and first-time architect registration.
 *
 * Split out of `page.tsx` deliberately: a Next.js *client* component cannot be
 * `async`, and awaiting `searchParams` inside one makes React call hooks out of
 * order (React error #321, "Invalid hook call"). The page stays a server
 * component and passes the resolved values down as plain props.
 */
export function SignInForm({ next, error }: { next: string; error?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });

      if (signInError) {
        setStatus("error");
        setMessage(signInError.message);
        return;
      }
      setStatus("sent");
      setMessage("Check your inbox. The secure sign-in link is valid for a few minutes. New email addresses create a free architect account.");
    } catch (err) {
      // A misconfigured project throws here rather than returning an error,
      // which is common right after setup. Surface it instead of blanking.
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not send the link.");
    }
  }

  return (
    <>
      {error ? (
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="text-sm font-medium text-slate-700">
            Email address (Gmail works)
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@gmail.com"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
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
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            status === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {message}
        </p>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-slate-500">
        First time here? Sending a link creates your free architect account. By continuing, you
        acknowledge our <a className="underline underline-offset-2" href="/privacy">Privacy Policy</a>.
        This is an email sign-in link, not Google OAuth; no password is collected by Dirory.
      </p>
    </>
  );
}
