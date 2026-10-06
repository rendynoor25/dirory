"use server";

import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "@/lib/i18n";

/**
 * Remember the visitor's language choice in a cookie.
 *
 * A server action, so the cookie is written on the server and the next render
 * (triggered by the toggle's `router.refresh()`) already sees the new value.
 * Validated against the known locales; anything else becomes English.
 */
export async function setLocale(locale: string): Promise<void> {
  const store = await cookies();
  store.set(LOCALE_COOKIE, isLocale(locale) ? locale : DEFAULT_LOCALE, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
