// Team-formation vocabulary shared by the API and the pages. The value lists
// mirror the Postgres enums added in 20260930000000_team_formation_profiles.sql.

export const MATCHING_STATUSES = ["looking", "arranging", "not_needed"] as const;
export type MatchingStatus = (typeof MATCHING_STATUSES)[number];

export const MATCHING_STATUS_LABELS: Record<MatchingStatus, string> = {
  looking: "Looking for a team — show me to recruiting teams",
  arranging: "Arranging a team with friends",
  not_needed: "No help needed",
};

export const CONTRIBUTION_ROLES = [
  "frontend",
  "backend",
  "mobile",
  "design",
  "data",
  "hardware",
  "devops",
  "product",
  "pitching",
  "flexible",
] as const;
export type ContributionRole = (typeof CONTRIBUTION_ROLES)[number];

export const CONTRIBUTION_ROLE_LABELS: Record<ContributionRole, string> = {
  frontend: "Frontend",
  backend: "Backend",
  mobile: "Mobile",
  design: "Design / UX",
  data: "Data / ML",
  hardware: "Hardware",
  devops: "DevOps / infra",
  product: "Product / research",
  pitching: "Pitching / storytelling",
  flexible: "Flexible / still learning",
};

export const PARTICIPANT_GOALS = ["learning", "meeting_people", "competing"] as const;
export type ParticipantGoal = (typeof PARTICIPANT_GOALS)[number];

export const PARTICIPANT_GOAL_LABELS: Record<ParticipantGoal, string> = {
  learning: "Learning",
  meeting_people: "Meeting people",
  competing: "Competing to win",
};

/** Goals as a readable, comma-separated list. */
export function formatGoals(goals: readonly ParticipantGoal[]): string {
  return goals.map((goal) => PARTICIPANT_GOAL_LABELS[goal]).join(", ");
}

export const CONTACT_METHODS = [
  "phone",
  "viber",
  "instagram",
  "telegram",
  "signal",
  "session",
  "other",
  "email_only",
] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  phone: "Phone / SMS",
  viber: "Viber",
  instagram: "Instagram",
  telegram: "Telegram",
  signal: "Signal",
  session: "Session",
  other: "Other",
  email_only: "Email only",
};

/** Challenge interest meaning "not decided yet". */
export const UNDECIDED_INTEREST = "undecided";

export const PROFILE_LINK_FIELDS = [
  "github_url",
  "gitlab_url",
  "codeberg_url",
  "portfolio_url",
] as const;
export type ProfileLinkField = (typeof PROFILE_LINK_FIELDS)[number];

export const PROFILE_LINK_LABELS: Record<ProfileLinkField, string> = {
  github_url: "GitHub",
  gitlab_url: "GitLab (any instance)",
  codeberg_url: "Codeberg",
  portfolio_url: "Portfolio / website",
};

export const MAX_TEAM_SIZE = 6;
export const MAX_INTERESTS = 3;
export const MAX_LANGUAGES = 5;
export const INTRO_MAX_LENGTH = 500;
export const REQUEST_MESSAGE_MIN_LENGTH = 20;
export const REQUEST_MESSAGE_MAX_LENGTH = 500;

/** Places a team still wants to fill; never negative. */
export function teamVacancies(desiredSize: number, memberCount: number): number {
  return Math.max(0, Math.min(desiredSize, MAX_TEAM_SIZE) - memberCount);
}

/**
 * Public profile shown to leaders and in discovery. Deliberately excludes
 * dietary requirements and private contact details.
 */
export interface PublicProfile {
  registration_id: string;
  name: string;
  intro: string | null;
  skills: string[];
  experience: "beginner" | "intermediate" | "experienced" | null;
  preferred_roles: ContributionRole[];
  interests: string[];
  goals: ParticipantGoal[];
  languages: string[];
  github_url: string | null;
  gitlab_url: string | null;
  codeberg_url: string | null;
  portfolio_url: string | null;
}

// ── Form state shared by the onboarding, dashboard and team pages ──────────

export interface ProfileForm {
  matching_status: MatchingStatus | null;
  intro: string;
  preferred_roles: ContributionRole[];
  interests: string[];
  goals: ParticipantGoal[];
  languages: string[];
  github_url: string;
  gitlab_url: string;
  codeberg_url: string;
  portfolio_url: string;
}

type ProfileSource = Partial<{
  [K in keyof ProfileForm]: ProfileForm[K] | null;
}>;

/** Editable profile state from a registration (or prefill); nulls become blanks. */
export function profileFormFrom(source: ProfileSource | null | undefined): ProfileForm {
  return {
    matching_status: source?.matching_status ?? null,
    intro: source?.intro ?? "",
    preferred_roles: [...(source?.preferred_roles ?? [])],
    interests: [...(source?.interests ?? [])],
    goals: [...(source?.goals ?? [])],
    languages: [...(source?.languages ?? [])],
    github_url: source?.github_url ?? "",
    gitlab_url: source?.gitlab_url ?? "",
    codeberg_url: source?.codeberg_url ?? "",
    portfolio_url: source?.portfolio_url ?? "",
  };
}

export interface ContactForm {
  method: ContactMethod | "";
  handle: string;
  other_label: string;
  share_with_team: boolean;
}

export function contactFormFrom(
  source:
    | { method: string; handle: string | null; other_label: string | null; share_with_team: boolean }
    | null
    | undefined,
): ContactForm {
  return {
    method: (source?.method as ContactMethod | undefined) ?? "",
    handle: source?.handle ?? "",
    other_label: source?.other_label ?? "",
    share_with_team: source?.share_with_team ?? false,
  };
}

export interface RecruitmentForm {
  recruiting: boolean;
  wanted_roles: ContributionRole[];
  desired_size: number;
  interests: string[];
  goals: ParticipantGoal[];
  welcomes_beginners: boolean;
  languages: string[];
}

export function recruitmentFormFrom(
  team: Partial<RecruitmentForm> | null | undefined,
): RecruitmentForm {
  return {
    recruiting: team?.recruiting ?? true,
    wanted_roles: [...(team?.wanted_roles ?? [])],
    desired_size: team?.desired_size ?? MAX_TEAM_SIZE,
    interests: [...(team?.interests ?? [])],
    goals: [...(team?.goals ?? [])],
    welcomes_beginners: team?.welcomes_beginners ?? false,
    languages: [...(team?.languages ?? [])],
  };
}

/** Add `value` if absent, remove it if present; returns a new array. */
export function toggleValue<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Split comma-separated text into trimmed, non-empty tags. */
export function parseTagText(text: string): string[] {
  return text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
