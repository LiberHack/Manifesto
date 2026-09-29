import { describe, it, expect } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";

describe("Notification dispatch", () => {
  it("is admin-only", async () => {
    const res = await fetch("/api/admin/notifications/dispatch", { method: "POST" });
    expect(res.status).toBe(401);
  });
});
