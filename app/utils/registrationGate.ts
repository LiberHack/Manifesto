/**
 * Routes a signed-in but unregistered account may still reach. Everything else
 * edition-scoped redirects to /ops/register-edition.
 */
export const REGISTRATION_EXEMPT_PATHS = [
  "/ops/register-edition",
  "/ops/verify-email",
  "/ops/login",
  "/ops/confirm",
  "/ops/forgot-password",
  "/ops/reset-password",
] as const;

export function isRegistrationExempt(path: string): boolean {
  return REGISTRATION_EXEMPT_PATHS.some((exempt) => path.startsWith(exempt));
}

/**
 * Routes that stay reachable while the participant area is closed. An admin
 * has to be able to sign in to open it, and the auth flows a signed-out
 * visitor can land in (a confirmation link, a password reset) must not break.
 */
export const OPS_CLOSED_EXEMPT_PATHS = [
  "/ops/admin",
  "/ops/login",
  "/ops/logout",
  "/ops/confirm",
  "/ops/verify-email",
  "/ops/forgot-password",
  "/ops/reset-password",
] as const;

export function isOpsClosedExempt(path: string): boolean {
  return OPS_CLOSED_EXEMPT_PATHS.some((exempt) => path.startsWith(exempt));
}
