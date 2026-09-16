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
