/**
 * The four occupation options, shared by the picker, the server action and the
 * admin dashboard.
 *
 * Kept out of `lib/actions/occupation.ts` on purpose: a `"use server"` file may
 * only export async functions, and these are plain values.
 */
export const OCCUPATIONS = ["architect", "designer", "student", "other"] as const;

export type Occupation = (typeof OCCUPATIONS)[number];

export function isOccupation(value: unknown): value is Occupation {
  return typeof value === "string" && (OCCUPATIONS as readonly string[]).includes(value);
}
