import { describe, it, expect } from "vitest";
import { parseRegistrationInput } from "../../server/utils/registrationInput";
import { PRIVACY_NOTICE_VERSION } from "../../shared/utils/privacy";

const RECIPIENT = "50000000-0000-0000-0000-000000000001";

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    skills: ["Go"],
    experience: "beginner",
    diet: "none",
    accepted_terms: true,
    privacy_notice_acknowledged: true,
    notice_version: PRIVACY_NOTICE_VERSION,
    sponsor_acknowledged: true,
    sponsor_recipient_ids: [RECIPIENT],
    marketing_email: false,
    ...overrides,
  };
}

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { statusCode?: number }).statusCode;
  }
  return undefined;
}

describe("parseRegistrationInput — separate purposes", () => {
  it("accepts a registration that says No to marketing emails", () => {
    const input = parseRegistrationInput(body({ marketing_email: false }));
    expect(input.marketingEmail).toBe(false);
    expect(input.sponsorRecipientIds).toEqual([RECIPIENT]);
  });

  it("accepts Yes to marketing emails", () => {
    expect(parseRegistrationInput(body({ marketing_email: true })).marketingEmail).toBe(true);
  });

  it("requires an explicit marketing answer instead of assuming one", () => {
    expect(statusOf(() => parseRegistrationInput(body({ marketing_email: undefined })))).toBe(400);
    expect(statusOf(() => parseRegistrationInput(body({ marketing_email: "yes" })))).toBe(400);
  });

  it("rejects a missing or false sponsor acknowledgment", () => {
    expect(statusOf(() => parseRegistrationInput(body({ sponsor_acknowledged: undefined })))).toBe(400);
    expect(statusOf(() => parseRegistrationInput(body({ sponsor_acknowledged: false })))).toBe(400);
    expect(statusOf(() => parseRegistrationInput(body({ sponsor_acknowledged: "true" })))).toBe(400);
  });

  it("rejects a sponsor acknowledgment without a valid recipient list", () => {
    expect(statusOf(() => parseRegistrationInput(body({ sponsor_recipient_ids: undefined })))).toBe(400);
    expect(statusOf(() => parseRegistrationInput(body({ sponsor_recipient_ids: ["acme"] })))).toBe(400);
    expect(
      statusOf(() => parseRegistrationInput(body({ sponsor_recipient_ids: Array(51).fill(RECIPIENT) }))),
    ).toBe(400);
  });

  it("accepts an empty recipient list when no sponsor is named yet", () => {
    expect(parseRegistrationInput(body({ sponsor_recipient_ids: [] })).sponsorRecipientIds).toEqual([]);
  });

  it("never turns a legacy terms-only body into any optional choice", () => {
    expect(statusOf(() => parseRegistrationInput({ accepted_terms: true, experience: "beginner" }))).toBe(400);
  });

  it("requires terms and the privacy-notice acknowledgment separately", () => {
    expect(statusOf(() => parseRegistrationInput(body({ accepted_terms: false })))).toBe(400);
    expect(statusOf(() => parseRegistrationInput(body({ privacy_notice_acknowledged: false })))).toBe(400);
  });

  it("refuses a form rendered against another notice version", () => {
    expect(statusOf(() => parseRegistrationInput(body({ notice_version: "2020-01" })))).toBe(409);
  });

  it("keeps the public archive off unless explicitly opted in", () => {
    expect(parseRegistrationInput(body()).public).toBe(false);
    expect(parseRegistrationInput(body({ public: true })).public).toBe(true);
  });

  it("stores a dietary note only with explicit consent", () => {
    expect(
      statusOf(() => parseRegistrationInput(body({ diet: "other", dietary_note: "no nuts" }))),
    ).toBe(400);
    const input = parseRegistrationInput(
      body({ diet: "other", dietary_note: " no nuts ", dietary_note_consent: true }),
    );
    expect(input.dietaryNote).toBe("no nuts");
  });

  it("requires a structured diet answer and limits the note", () => {
    expect(statusOf(() => parseRegistrationInput(body({ diet: undefined })))).toBe(400);
    expect(statusOf(() => parseRegistrationInput(body({ diet: "keto" })))).toBe(400);
    expect(
      statusOf(() =>
        parseRegistrationInput(
          body({ diet: "other", dietary_note: "x".repeat(201), dietary_note_consent: true }),
        ),
      ),
    ).toBe(400);
  });
});
