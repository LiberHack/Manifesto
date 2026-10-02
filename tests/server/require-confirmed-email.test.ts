import { describe, it, expect } from "vitest";
import { requireConfirmedEmail } from "../../server/utils/requireConfirmedEmail";

/** Stand-in for `supabase.auth.admin.getUserById`. */
function stubAuth(result: { data: { user: unknown }; error: unknown }) {
  return { auth: { admin: { getUserById: async () => result } } } as never;
}

describe("requireConfirmedEmail", () => {
  it("passes when email_confirmed_at is set", async () => {
    await expect(
      requireConfirmedEmail(
        stubAuth({
          data: { user: { id: "user-1", email_confirmed_at: "2026-10-01T00:00:00Z" } },
          error: null,
        }),
        "user-1",
      ),
    ).resolves.toBeUndefined();
  });

  it("throws 403 email_unverified when email_confirmed_at is missing", async () => {
    await expect(
      requireConfirmedEmail(
        stubAuth({
          data: { user: { id: "user-1", email_confirmed_at: null } },
          error: null,
        }),
        "user-1",
      ),
    ).rejects.toMatchObject({ statusCode: 403, message: "email_unverified" });
  });

  it("fails closed with 503 when the auth lookup errors", async () => {
    await expect(
      requireConfirmedEmail(
        stubAuth({ data: { user: null }, error: { message: "boom" } }),
        "user-1",
      ),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
