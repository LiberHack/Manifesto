import { describe, it, expect } from "vitest";
import { parseRegistrationInput } from "../../server/utils/registrationInput";
import { PRIVACY_NOTICE_VERSION } from "../../shared/utils/privacy";

const RECIPIENT = "50000000-0000-0000-0000-000000000001";
const OTHER = "50000000-0000-0000-0000-000000000002";

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    skills: ["Go"],
    experience: "beginner",
    diet: "none",
    accepted_terms: true,
    privacy_notice_acknowledged: true,
    notice_version: PRIVACY_NOTICE_VERSION,
    sponsor_choices: { [RECIPIENT]: false },
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

describe("parseRegistrationInput — sponsor sharing is an explicit Yes/No", () => {
  it("accepts No without any age answer", () => {
    const input = parseRegistrationInput(body({ sponsor_choices: { [RECIPIENT]: false } }));
    expect(input.sponsorChoices).toEqual({ [RECIPIENT]: false });
    expect(input.recruitmentAdult).toBeNull();
  });

  it("accepts Yes together with the 18+ answer, per organisation", () => {
    const input = parseRegistrationInput(
      body({ sponsor_choices: { [RECIPIENT]: true, [OTHER]: false }, recruitment_adult: true }),
    );
    expect(input.sponsorChoices).toEqual({ [RECIPIENT]: true, [OTHER]: false });
    expect(input.recruitmentAdult).toBe(true);
  });

  it("rejects a missing or non-boolean answer instead of defaulting it", () => {
    for (const choices of [undefined, null, [], { [RECIPIENT]: null }, { [RECIPIENT]: "yes" }, { [RECIPIENT]: 1 }]) {
      expect(statusOf(() => parseRegistrationInput(body({ sponsor_choices: choices })))).toBe(400);
    }
  });

  it("does not accept the old acknowledgment fields as a substitute for a choice", () => {
    expect(
      statusOf(() =>
        parseRegistrationInput(
          body({ sponsor_choices: undefined, sponsor_acknowledged: true, sponsor_recipient_ids: [RECIPIENT] }),
        ),
      ),
    ).toBe(400);
  });

  it("rejects unknown organisation keys and oversized answer sets", () => {
    expect(statusOf(() => parseRegistrationInput(body({ sponsor_choices: { acme: true } })))).toBe(400);
    const many = Object.fromEntries(
      Array.from({ length: 51 }, (_, i) => [`50000000-0000-0000-0000-${String(i).padStart(12, "0")}`, false]),
    );
    expect(statusOf(() => parseRegistrationInput(body({ sponsor_choices: many })))).toBe(400);
  });

  it("requires the 18+ answer before any Yes", () => {
    expect(statusOf(() => parseRegistrationInput(body({ sponsor_choices: { [RECIPIENT]: true } })))).toBe(400);
    expect(
      statusOf(() =>
        parseRegistrationInput(body({ sponsor_choices: { [RECIPIENT]: true }, recruitment_adult: "yes" })),
      ),
    ).toBe(400);
  });

  it("accepts an empty answer set when no organisation is named", () => {
    expect(parseRegistrationInput(body({ sponsor_choices: {} })).sponsorChoices).toEqual({});
  });
});

describe("parseRegistrationInput — other purposes stay separate", () => {
  it("accepts No and Yes to marketing emails", () => {
    expect(parseRegistrationInput(body({ marketing_email: false })).marketingEmail).toBe(false);
    expect(parseRegistrationInput(body({ marketing_email: true })).marketingEmail).toBe(true);
  });

  it("requires an explicit marketing answer instead of assuming one", () => {
    expect(statusOf(() => parseRegistrationInput(body({ marketing_email: undefined })))).toBe(400);
    expect(statusOf(() => parseRegistrationInput(body({ marketing_email: "yes" })))).toBe(400);
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
    expect(statusOf(() => parseRegistrationInput(body({ diet: "other", dietary_note: "no nuts" })))).toBe(400);
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
