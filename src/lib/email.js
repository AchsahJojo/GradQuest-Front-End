/**
 * Helpers for deliverable vs synthetic OAuth emails.
 * Matches Back-End OAuthUserService: `@github.noreply` / `@discord.noreply`.
 * Also accepts planned `emailDeliverable` from GET /api/me when present.
 */

const SYNTHETIC_SUFFIXES = [
  "@github.noreply",
  "@discord.noreply",
];

export function isSyntheticEmail(email) {
  if (email == null) return true;
  const trimmed = String(email).trim().toLowerCase();
  if (!trimmed) return true;
  return SYNTHETIC_SUFFIXES.some((s) => trimmed.endsWith(s));
}

/**
 * True when we can send deadline reminder email to this address.
 * Prefer explicit API flag when BE adds it; otherwise infer from address shape.
 */
export function isDeliverableEmail(email, me = null) {
  if (me && typeof me.emailDeliverable === "boolean") {
    return me.emailDeliverable;
  }
  if (me && typeof me.email_deliverable === "boolean") {
    return me.email_deliverable;
  }
  return !isSyntheticEmail(email ?? me?.email);
}

/** Basic client-side shape check before PATCH /api/me. */
export function looksLikeEmail(value) {
  if (value == null) return false;
  const s = String(value).trim();
  // Simple guard — BE still validates uniqueness / format.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && !isSyntheticEmail(s);
}
