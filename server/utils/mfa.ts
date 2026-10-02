/**
 * Whether the session's JWT says the user completed multi-factor
 * authentication. Supabase Auth sets `aal` to `aal2` only after a TOTP (or
 * other second-factor) verification in this session.
 */
export function hasVerifiedMfa(claims: { aal?: unknown } | null | undefined): boolean {
  return claims?.aal === "aal2";
}
