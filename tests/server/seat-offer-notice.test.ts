import { describe, it, expect } from "vitest";
import { isCurrentSeatOffer } from "../../server/utils/notifications";

const NOW = Date.parse("2027-01-10T12:00:00Z");
const OFFERED = {
  seat_state: "offered",
  offer_expires_at: "2027-01-11T12:00:00Z",
  offer_attempts: 2,
};

describe("isCurrentSeatOffer", () => {
  it("accepts the job for the offer the registration holds now", () => {
    expect(isCurrentSeatOffer({ dedup_key: "seat_offer:2027:reg-1:2" }, OFFERED, NOW)).toBe(true);
  });

  it("rejects a job left over from an earlier, expired offer", () => {
    expect(isCurrentSeatOffer({ dedup_key: "seat_offer:2027:reg-1:1" }, OFFERED, NOW)).toBe(false);
  });

  it("rejects when the offer has expired or was answered", () => {
    const key = { dedup_key: "seat_offer:2027:reg-1:2" };
    expect(isCurrentSeatOffer(key, { ...OFFERED, offer_expires_at: "2027-01-10T11:00:00Z" }, NOW)).toBe(false);
    expect(isCurrentSeatOffer(key, { ...OFFERED, seat_state: "accepted" }, NOW)).toBe(false);
  });
});
