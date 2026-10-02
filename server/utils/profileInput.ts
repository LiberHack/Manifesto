import { createError } from "h3";
import {
  CONTACT_METHODS,
  CONTRIBUTION_ROLES,
  INTRO_MAX_LENGTH,
  MATCHING_STATUSES,
  MAX_INTERESTS,
  MAX_LANGUAGES,
  PARTICIPANT_GOALS,
  PROFILE_LINK_FIELDS,
  REQUEST_MESSAGE_MAX_LENGTH,
  REQUEST_MESSAGE_MIN_LENGTH,
  type ContactMethod,
  type ContributionRole,
  type MatchingStatus,
  type ParticipantGoal,
  type ProfileLinkField,
} from "#shared/teamFormation";

// Kept free of Nitro-only imports so every parser is unit-testable.

const MAX_TAG_LENGTH = 40;
const MAX_URL_LENGTH = 300;
const MAX_HANDLE_LENGTH = 100;
const MAX_OTHER_LABEL_LENGTH = 40;
const PHONE_PATTERN = /^\+?[0-9 ()-]{6,20}$/;

function badRequest(message: string): never {
  throw createError({ statusCode: 400, message });
}

function parseEnumList<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T[] {
  if (!Array.isArray(value)) badRequest(`${field} must be an array`);
  const invalid = value.find((v) => !allowed.includes(v as T));
  if (invalid !== undefined) {
    badRequest(`${field} must only contain: ${allowed.join(", ")}`);
  }
  return [...new Set(value as T[])];
}

/** Free-text tags (interests, languages): trimmed, de-duplicated case-insensitively. */
function parseTags(value: unknown, field: string, max: number): string[] {
  if (!Array.isArray(value)) badRequest(`${field} must be an array`);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") badRequest(`${field} must contain strings`);
    const tag = raw.trim();
    if (!tag || seen.has(tag.toLowerCase())) continue;
    if (tag.length > MAX_TAG_LENGTH) {
      badRequest(`${field} entries must be ${MAX_TAG_LENGTH} characters or fewer`);
    }
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  if (tags.length > max) badRequest(`At most ${max} ${field} allowed`);
  return tags;
}

/**
 * An optional http(s) profile link. Only the shape is checked — the server
 * never fetches it.
 */
export function parseProfileUrl(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") badRequest(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_URL_LENGTH) {
    badRequest(`${field} must be ${MAX_URL_LENGTH} characters or fewer`);
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    badRequest(`${field} must be a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    badRequest(`${field} must be an http(s) URL`);
  }
  return url.toString();
}

export interface ProfileFields {
  matching_status?: MatchingStatus | null;
  intro?: string | null;
  preferred_roles?: ContributionRole[];
  interests?: string[];
  goals?: ParticipantGoal[];
  languages?: string[];
  github_url?: string | null;
  gitlab_url?: string | null;
  codeberg_url?: string | null;
  portfolio_url?: string | null;
}

/**
 * Validate the matching-profile fields present in `body`. Absent fields are
 * left out of the result, so it doubles as a partial update.
 */
export function parseProfileFields(body: Record<string, unknown>): ProfileFields {
  const out: ProfileFields = {};

  if (body.matching_status !== undefined) {
    if (
      body.matching_status !== null &&
      !MATCHING_STATUSES.includes(body.matching_status as MatchingStatus)
    ) {
      badRequest(`matching_status must be one of: ${MATCHING_STATUSES.join(", ")}`);
    }
    out.matching_status = body.matching_status as MatchingStatus | null;
  }

  if (body.intro !== undefined) {
    if (body.intro !== null && typeof body.intro !== "string") {
      badRequest("intro must be a string");
    }
    const intro = ((body.intro as string | null) ?? "").trim();
    if (intro.length > INTRO_MAX_LENGTH) {
      badRequest(`intro must be ${INTRO_MAX_LENGTH} characters or fewer`);
    }
    out.intro = intro || null;
  }

  if (body.preferred_roles !== undefined) {
    out.preferred_roles = parseEnumList(
      body.preferred_roles,
      CONTRIBUTION_ROLES,
      "preferred_roles",
    );
  }
  if (body.goals !== undefined) {
    out.goals = parseEnumList(body.goals, PARTICIPANT_GOALS, "goals");
  }
  if (body.interests !== undefined) {
    out.interests = parseTags(body.interests, "interests", MAX_INTERESTS);
  }
  if (body.languages !== undefined) {
    out.languages = parseTags(body.languages, "languages", MAX_LANGUAGES);
  }

  for (const field of PROFILE_LINK_FIELDS) {
    if (body[field] !== undefined) {
      out[field as ProfileLinkField] = parseProfileUrl(body[field], field);
    }
  }

  return out;
}

export interface TeamRecruitmentFields {
  recruiting?: boolean;
  wanted_roles?: ContributionRole[];
  desired_size?: number;
  interests?: string[];
  goals?: ParticipantGoal[];
  welcomes_beginners?: boolean;
  languages?: string[];
}

/** Validate the team recruitment fields present in `body`. */
export function parseTeamRecruitmentFields(
  body: Record<string, unknown>,
): TeamRecruitmentFields {
  const out: TeamRecruitmentFields = {};

  for (const field of ["recruiting", "welcomes_beginners"] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "boolean") badRequest(`${field} must be a boolean`);
      out[field] = body[field] as boolean;
    }
  }
  if (body.desired_size !== undefined) {
    const size = body.desired_size;
    if (typeof size !== "number" || !Number.isInteger(size) || size < 1 || size > 6) {
      badRequest("desired_size must be a whole number from 1 to 6");
    }
    out.desired_size = size;
  }
  if (body.wanted_roles !== undefined) {
    out.wanted_roles = parseEnumList(body.wanted_roles, CONTRIBUTION_ROLES, "wanted_roles");
  }
  if (body.goals !== undefined) {
    out.goals = parseEnumList(body.goals, PARTICIPANT_GOALS, "goals");
  }
  if (body.interests !== undefined) {
    out.interests = parseTags(body.interests, "interests", MAX_INTERESTS);
  }
  if (body.languages !== undefined) {
    out.languages = parseTags(body.languages, "languages", MAX_LANGUAGES);
  }

  return out;
}

export interface ContactInput {
  method: ContactMethod;
  handle: string | null;
  other_label: string | null;
  share_with_team: boolean;
}

/**
 * The preferred direct-contact method. Every method except `email_only`
 * needs a handle or number; `other` also needs the channel's name.
 */
export function parseContact(value: unknown): ContactInput {
  if (!value || typeof value !== "object") badRequest("contact is required");
  const body = value as Record<string, unknown>;

  const method = body.method as ContactMethod;
  if (!CONTACT_METHODS.includes(method)) {
    badRequest(`contact.method must be one of: ${CONTACT_METHODS.join(", ")}`);
  }

  const share = body.share_with_team ?? false;
  if (typeof share !== "boolean") badRequest("contact.share_with_team must be a boolean");

  if (method === "email_only") {
    return { method, handle: null, other_label: null, share_with_team: share };
  }

  const handle = typeof body.handle === "string" ? body.handle.trim() : "";
  if (!handle) badRequest("Enter the number or handle for your contact method");
  if (handle.length > MAX_HANDLE_LENGTH) {
    badRequest(`contact.handle must be ${MAX_HANDLE_LENGTH} characters or fewer`);
  }
  if (method === "phone" && !PHONE_PATTERN.test(handle)) {
    badRequest("Enter a valid phone number");
  }

  let otherLabel: string | null = null;
  if (method === "other") {
    otherLabel = typeof body.other_label === "string" ? body.other_label.trim() : "";
    if (!otherLabel) badRequest("Name the contact channel you chose");
    if (otherLabel.length > MAX_OTHER_LABEL_LENGTH) {
      badRequest(`contact.other_label must be ${MAX_OTHER_LABEL_LENGTH} characters or fewer`);
    }
  }

  return { method, handle, other_label: otherLabel, share_with_team: share };
}

/** A required application/invitation message, trimmed. */
export function parseRequestMessage(value: unknown): string {
  const message = typeof value === "string" ? value.trim() : "";
  if (
    message.length < REQUEST_MESSAGE_MIN_LENGTH ||
    message.length > REQUEST_MESSAGE_MAX_LENGTH
  ) {
    badRequest(
      `Write a message of ${REQUEST_MESSAGE_MIN_LENGTH}–${REQUEST_MESSAGE_MAX_LENGTH} characters`,
    );
  }
  return message;
}
