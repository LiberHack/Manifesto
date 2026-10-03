/**
 * Whether an `Authorization` header carries the expected Basic credentials.
 *
 * `expected` is `user:password`. The comparison runs over the full length of
 * both values so its timing does not reveal how much of a guess was right.
 */
export function isBasicAuthorized(header: string | undefined, expected: string): boolean {
  if (!header?.startsWith("Basic ")) return false;

  let given: string;
  try {
    given = atob(header.slice("Basic ".length).trim());
  } catch {
    return false;
  }

  let diff = given.length ^ expected.length;
  for (let i = 0; i < Math.max(given.length, expected.length); i++) {
    diff |= (given.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}
