import { createError } from "h3";
import {
  DIETS,
  MAX_DIETARY_NOTE_LENGTH,
  PRIVACY_NOTICE_VERSION,
  type Diet,
} from "#shared/utils/privacy";

export const EXPERIENCE_VALUES = ["beginner", "intermediate", "experienced"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_VALUES)[number];

export const MAX_SKILLS = 10;
export const MAX_SKILL_LENGTH = 30;
const MAX_RECIPIENTS = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RegistrationInput {
  skills: string[];
  experience: ExperienceLevel;
  public: boolean;
  noticeVersion: string;
  sponsorRecipientIds: string[];
  marketingEmail: boolean;
  diet: Diet;
  dietaryNote: string | null;
}

function bad(message: string, statusCode = 400): never {
  throw createError({ statusCode, message });
}

/**
 * Validate an edition-registration body.
 *
 * Every purpose is a separate field and none implies another:
 * - `accepted_terms` (rules + Code of Conduct) and `privacy_notice_acknowledged`
 *   must be `true`;
 * - `sponsor_acknowledged` must be `true` together with the exact recipient
 *   list the form showed — the organiser has made sharing a condition of
 *   taking part, recorded as an acknowledgment (see docs/privacy/README.md
 *   for why that is not "consent" and the open legal decision);
 * - `marketing_email` is optional in substance but must be an explicit boolean;
 * - a dietary note needs `dietary_note_consent: true`.
 *
 * @throws 400 on any missing or malformed field, 409 `notice_changed` when the
 *   form was rendered against an older privacy notice.
 */
export function parseRegistrationInput(body: Record<string, unknown> | null): RegistrationInput {
  if (!body || typeof body !== "object") bad("Invalid body");

  if (body.accepted_terms !== true) {
    bad("You must agree to the event rules and the Code of Conduct");
  }
  if (body.privacy_notice_acknowledged !== true) {
    bad("You must confirm you have read the Privacy Notice");
  }
  if (body.notice_version !== PRIVACY_NOTICE_VERSION) {
    bad("notice_changed", 409);
  }
  if (body.sponsor_acknowledged !== true) {
    bad("You must acknowledge the sponsor sharing described in the Privacy Notice");
  }

  const recipients = body.sponsor_recipient_ids;
  if (
    !Array.isArray(recipients) ||
    recipients.length > MAX_RECIPIENTS ||
    !recipients.every((id) => typeof id === "string" && UUID_PATTERN.test(id))
  ) {
    bad("sponsor_recipient_ids must be the list of sponsor ids shown on the form");
  }

  if (typeof body.marketing_email !== "boolean") {
    bad("marketing_email must be answered yes or no");
  }

  if (!EXPERIENCE_VALUES.includes(body.experience as ExperienceLevel)) {
    bad(`experience must be one of: ${EXPERIENCE_VALUES.join(", ")}`);
  }

  if (body.skills !== undefined && !Array.isArray(body.skills)) {
    bad("skills must be an array");
  }
  const skills = ((body.skills as unknown[] | undefined) ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
  if (skills.length > MAX_SKILLS) bad(`Maximum ${MAX_SKILLS} skills allowed`);
  const longSkill = skills.find((s) => s.length > MAX_SKILL_LENGTH);
  if (longSkill) bad(`Skill "${longSkill}" exceeds ${MAX_SKILL_LENGTH} characters`);

  if (body.public !== undefined && typeof body.public !== "boolean") {
    bad("public must be a boolean");
  }

  if (!DIETS.includes(body.diet as Diet)) {
    bad(`diet must be one of: ${DIETS.join(", ")}`);
  }
  if (
    body.dietary_note !== undefined &&
    body.dietary_note !== null &&
    typeof body.dietary_note !== "string"
  ) {
    bad("dietary_note must be a string");
  }
  const note = typeof body.dietary_note === "string" ? body.dietary_note.trim() : "";
  if (note.length > MAX_DIETARY_NOTE_LENGTH) {
    bad(`The dietary note must be ${MAX_DIETARY_NOTE_LENGTH} characters or fewer`);
  }
  if (note !== "" && body.dietary_note_consent !== true) {
    bad("A dietary note needs your explicit consent to store it");
  }

  return {
    skills,
    experience: body.experience as ExperienceLevel,
    // Public archive is opt-in: absent means no.
    public: body.public === true,
    noticeVersion: PRIVACY_NOTICE_VERSION,
    sponsorRecipientIds: recipients as string[],
    marketingEmail: body.marketing_email as boolean,
    diet: body.diet as Diet,
    dietaryNote: note === "" ? null : note,
  };
}
