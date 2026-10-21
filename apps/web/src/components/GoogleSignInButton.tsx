"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Google's own "Continue with Google" button (Google Identity Services).
 *
 * The Google sign-in runs on this site, so Google's account chooser says "to
 * continue to dirory.com". Supabase's redirect flow (signInWithOAuth) sent the
 * browser through the Supabase project's address, which is what Google named.
 * Google returns an ID token here and Supabase turns it into a session
 * (signInWithIdToken), so accounts stay exactly as they were.
 *
 * Replay protection: Google signs the SHA-256 of a one-time nonce into the
 * token; Supabase gets the raw nonce and checks the two match.
 */

type Credential = { credential?: string };

type GoogleId = {
  initialize(options: {
    client_id: string;
    callback: (response: Credential) => void;
    nonce?: string;
    ux_mode?: "popup" | "redirect";
    use_fedcm_for_button?: boolean;
    itp_support?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill";
      logo_alignment?: "left" | "center";
      width?: number;
      locale?: string;
    },
  ): void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let scriptLoad: Promise<GoogleId> | null = null;

/** Load Google's script once per page. */
function loadGoogle(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (!scriptLoad) {
    scriptLoad = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () =>
        window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error("Google sign-in did not load."));
      script.onerror = () => {
        scriptLoad = null;
        reject(new Error("Could not reach Google. Check your connection, or use the email link."));
      };
      document.head.appendChild(script);
    });
  }
  return scriptLoad;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function GoogleSignInButton({
  clientId,
  locale,
  onSignedIn,
  onError,
  busyLabel,
}: {
  clientId: string;
  locale: "en" | "id";
  /** Called once Supabase has a session (cookies are set). */
  onSignedIn: () => void;
  onError: (message: string) => void;
  /** Shown while the session is being created. */
  busyLabel: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  // The latest callbacks, so Google's one-time initialize never holds stale ones.
  const handlers = useRef({ onSignedIn, onError });
  handlers.current = { onSignedIn, onError };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const google = await loadGoogle();
        const nonce = randomNonce();
        const hashed = await sha256Hex(nonce);
        if (cancelled || !box.current) return;
        google.initialize({
          client_id: clientId,
          nonce: hashed,
          // Google's popup, not the browser's FedCM dialog, which failed in
          // testing with a bare "NetworkError" and no reason.
          ux_mode: "popup",
          use_fedcm_for_button: false,
          itp_support: true,
          callback: async ({ credential }) => {
            if (!credential) {
              handlers.current.onError("Google did not return a sign-in. Please try again.");
              return;
            }
            setBusy(true);
            const supabase = createSupabaseBrowserClient();
            const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: credential, nonce });
            if (error) {
              setBusy(false);
              handlers.current.onError(error.message);
              return;
            }
            handlers.current.onSignedIn();
          },
        });
        // Google's button is 200–400 px wide; fill the form up to that.
        const width = Math.max(200, Math.min(400, Math.floor(box.current.clientWidth || 400)));
        box.current.replaceChildren();
        google.renderButton(box.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "center",
          width,
          // A hint only: Google may still use the visitor's own Google language.
          locale: locale === "id" ? "id" : "en_US",
        });
      } catch (err) {
        if (!cancelled) handlers.current.onError(err instanceof Error ? err.message : "Could not start Google sign-in.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, locale]);

  return (
    <div className="flex min-h-[44px] w-full flex-col items-center justify-center">
      <div ref={box} className={busy ? "hidden" : "flex w-full justify-center"} />
      {busy ? <p className="py-2.5 text-sm text-slate-600">{busyLabel}</p> : null}
    </div>
  );
}
