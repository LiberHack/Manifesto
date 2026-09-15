import type { Me } from "~/composables/useMe";

export type AnnouncementChannel = "live" | "ops" | "site";
export type AnnouncementAudience = "all" | "leaders" | "no_team" | "missing_profile";
export type AnnouncementVariant = "info" | "warning";

export interface Announcement {
  id: string;
  channel: AnnouncementChannel;
  audience: AnnouncementAudience;
  variant: AnnouncementVariant;
  body: string;
  href: string | null;
  dismissible: boolean;
  sort_order: number;
}

/**
 * The only code-owned part of the banner system: adding an audience is one enum
 * value in the migration and one predicate here.
 *
 * Every predicate reads the caller's registration in the *current* edition, so
 * a banner re-evaluates as soon as /api/me refreshes.
 */
const PREDICATES: Record<
  AnnouncementAudience,
  (registration: NonNullable<Me["registration"]>, me: Me) => boolean
> = {
  all: () => true,
  leaders: (registration) => registration.role === "leader",
  no_team: (registration) => registration.team_id === null,
  missing_profile: (registration) =>
    registration.dietary == null || registration.experience == null,
};

/**
 * Whether a banner should render for the given viewer.
 *
 * `site` rows show to everyone. `ops` rows show only inside /ops, and only to a
 * viewer registered for the current edition — a spectator has nothing to act on.
 */
export function shouldShowAnnouncement(
  announcement: Announcement,
  me: Me | null,
  onOpsRoute: boolean,
): boolean {
  if (announcement.channel === "site") return true;
  if (announcement.channel !== "ops") return false;
  if (!onOpsRoute) return false;

  const registration = me?.registration;
  if (!registration) return false;

  return PREDICATES[announcement.audience](registration, me);
}

/**
 * Ordering: `site` rows first, then `ops`, each group by `sort_order`.
 */
export function sortAnnouncements(rows: Announcement[]): Announcement[] {
  const channelRank = { site: 0, ops: 1, live: 2 } as const;
  return [...rows].sort(
    (a, b) =>
      channelRank[a.channel] - channelRank[b.channel] ||
      a.sort_order - b.sort_order,
  );
}
