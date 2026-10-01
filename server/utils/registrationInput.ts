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
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RegistrationInput {
  skills: string[];
  experience: ExperienceLevel;
  public: boolean;
  noticeVersion: string;
  /** Explicit Yes (true) / No (false) per named recipient id. */
  sponsorChoices: Record<string, boolean>;
  /** "18 or older?" — required only when at least one sponsor answer is Yes. */
  recruitmentAdult: boolean | null;
  marketingEmail: boolean;
  diet: Diet;
  dietaryNote: string | null;
}

function bad(message: string, statusCode = 400): never {
  throw createError({ statusCode, message });
}

/**
 * Validate the sponsor answers: an object mapping each recipient id shown on
 * the form to an explicit boolean. There is no default — a missing or
 * non-boolean answer is an error, and `false` is a valid, complete answer.
 * Whether the keys match the edition's current recipients is checked in the
 * database, in the same transaction as the registration.
 */
export function parseSponsorChoices(value: unknown): Record<string, boolean> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    bad("sponsor_choices must answer Yes or No for each organisation listed");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_RECIPIENTS) bad("Too many sponsor answers");
  for (const [id, answer] of entries) {
    if (!UUID_PATTERN.test(id)) bad("Unknown organisation in sponsor answers");
    if (typeof answer !== "boolean") {
      bad("Each organisation needs an explicit Yes or No");
    }
  }
  return Object.fromEntries(entries) as Record<string, boolean>;
}

/**
 * Validate an edition-registration body.
 *
 * Purposes are separate fields and none implies another:
 * - `accepted_terms` (rules + Code of Conduct) and `privacy_notice_acknowledged`
 *   must be `true`;
 * - `sponsor_choices`: an explicit Yes/No for every named organisation — No is
 *   a full answer and never affects participation;
 * - `recruitment_adult` (18 or older) is required only alongside a Yes;
 * - `marketing_email` must be an explicit boolean;
 * - a dietary note needs `dietary_note_consent: true`.
 *
 * @throws 400 on any missing or malformed field, 409 `notice_changed` when the
 *   form was rendered against another privacy-notice version.
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

  const sponsorChoices = parseSponsorChoices(body.sponsor_choices);
  const anyYes = Object.values(sponsorChoices).some(Boolean);
  const adult = body.recruitment_adult;
  if (adult !== undefined && adult !== null && typeof adult !== "boolean") {
    bad("recruitment_adult must be Yes or No");
  }
  if (anyYes && typeof adult !== "boolean") {
    bad("Please tell us whether you are 18 or older before sharing your profile");
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
    sponsorChoices,
    recruitmentAdult: typeof adult === "boolean" ? adult : null,
    marketingEmail: body.marketing_email as boolean,
    diet: body.diet as Diet,
    dietaryNote: note === "" ? null : note,
  };
}
