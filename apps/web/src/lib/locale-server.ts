import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./i18n";

/**
 * The visitor's language, from the `locale` cookie. Server-only (uses
 * `next/headers`), so keep it out of client components — pass the value down as
 * a prop instead.
 *
 * Defaults to English, and treats any unknown value as English.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
