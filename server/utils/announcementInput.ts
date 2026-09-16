import { createError } from "h3";

export const ANNOUNCEMENT_CHANNELS = ["live", "ops", "site"] as const;
export const ANNOUNCEMENT_AUDIENCES = [
  "all",
  "leaders",
  "no_team",
  "missing_profile",
] as const;
export const ANNOUNCEMENT_VARIANTS = ["info", "warning"] as const;

export type AnnouncementChannel = (typeof ANNOUNCEMENT_CHANNELS)[number];
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];
export type AnnouncementVariant = (typeof ANNOUNCEMENT_VARIANTS)[number];

const MAX_BODY_LENGTH = 300;
const MAX_HREF_LENGTH = 500;

export interface AnnouncementInput {
  body?: string;
  channel?: AnnouncementChannel;
  audience?: AnnouncementAudience;
  variant?: AnnouncementVariant;
  href?: string | null;
  dismissible?: boolean;
  active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
}

function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (!allowed.includes(value as T)) {
    throw createError({
      statusCode: 400,
      message: `${field} must be one of: ${allowed.join(", ")}`,
    });
  }
  return value as T;
}

function readDate(value: unknown, field: string): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw createError({
      statusCode: 400,
      message: `${field} must be an ISO date string`,
    });
  }
  return new Date(value).toISOString();
}

/**
 * Validate an announcement create/update payload.
 *
 * `edition_slug` and `sort_order` are owned by the server and are dropped here
 * rather than trusted from the client.
 */
export function readAnnouncementBody(
  raw: unknown,
  { requireBody }: { requireBody: boolean },
): AnnouncementInput {
  const input = (raw ?? {}) as Record<string, unknown>;
  const out: AnnouncementInput = {};

  if (input.body !== undefined || requireBody) {
    const body = typeof input.body === "string" ? input.body.trim() : "";
    if (!body) {
      throw createError({ statusCode: 400, message: "body is required" });
    }
    if (body.length > MAX_BODY_LENGTH) {
      throw createError({
        statusCode: 400,
        message: `body must be ${MAX_BODY_LENGTH} characters or fewer`,
      });
    }
    out.body = body;
  }

  if (input.channel !== undefined) {
    out.channel = readEnum(input.channel, ANNOUNCEMENT_CHANNELS, "channel");
  }
  if (input.audience !== undefined) {
    out.audience = readEnum(input.audience, ANNOUNCEMENT_AUDIENCES, "audience");
  }
  if (input.variant !== undefined) {
    out.variant = readEnum(input.variant, ANNOUNCEMENT_VARIANTS, "variant");
  }

  if (input.href !== undefined) {
    if (input.href === null || input.href === "") {
      out.href = null;
    } else if (typeof input.href !== "string") {
      throw createError({ statusCode: 400, message: "href must be a string" });
    } else {
      const href = input.href.trim();
      if (href.length > MAX_HREF_LENGTH) {
        throw createError({
          statusCode: 400,
          message: `href must be ${MAX_HREF_LENGTH} characters or fewer`,
        });
      }
      // Internal paths and absolute http(s) only — a banner link is rendered
      // with NuxtLink, so javascript: and data: must never reach it.
      const isInternal = href.startsWith("/") && !href.startsWith("//");
      const isHttp = /^https?:\/\//i.test(href);
      if (!isInternal && !isHttp) {
        throw createError({
          statusCode: 400,
          message: "href must be an internal path or an http(s) URL",
        });
      }
      out.href = href;
    }
  }

  for (const field of ["dismissible", "active"] as const) {
    if (input[field] !== undefined) {
      if (typeof input[field] !== "boolean") {
        throw createError({
          statusCode: 400,
          message: `${field} must be a boolean`,
        });
      }
      out[field] = input[field] as boolean;
    }
  }

  if (input.starts_at !== undefined) out.starts_at = readDate(input.starts_at, "starts_at");
  if (input.ends_at !== undefined) out.ends_at = readDate(input.ends_at, "ends_at");

  if (out.starts_at && out.ends_at && Date.parse(out.ends_at) <= Date.parse(out.starts_at)) {
    throw createError({ statusCode: 400, message: "ends_at must be after starts_at" });
  }

  return out;
}
