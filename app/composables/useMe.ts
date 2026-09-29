import type {
  ContributionRole,
  MatchingStatus,
  ParticipantGoal,
} from "#shared/teamFormation";

export interface MeRegistration {
  id: string;
  role: "participant" | "leader";
  team_id: string | null;
  skills: string[];
  dietary: string | null;
  experience: "beginner" | "intermediate" | "experienced" | null;
  public: boolean;
  accepted_terms_at: string;
  registered_at: string;
  matching_status: MatchingStatus | null;
  intro: string | null;
  preferred_roles: ContributionRole[];
  interests: string[];
  goals: ParticipantGoal[];
  languages: string[];
  github_url: string | null;
  gitlab_url: string | null;
  codeberg_url: string | null;
  portfolio_url: string | null;
  /** Whether a preferred contact is saved; the value itself is never in /api/me. */
  contact_complete: boolean;
}

export interface MeEdition {
  slug: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  status: "draft" | "live" | "archived";
  participant_cap: number;
}

export interface Me {
  id: string;
  name: string;
  email: string;
  /** Identity-level privilege flag, not the per-edition team role. */
  role: "participant" | "admin";
  created_at: string;
  edition: MeEdition | null;
  /** null means spectator: signed in but not registered for the current edition. */
  registration: MeRegistration | null;
  team: {
    id: string;
    name: string;
    skills_wanted: string[];
    description: string | null;
    leader_id: string;
    invite_code: string;
    github_url: string | null;
    recruiting: boolean;
    wanted_roles: ContributionRole[];
    desired_size: number;
    interests: string[];
    goals: ParticipantGoal[];
    welcomes_beginners: boolean;
    languages: string[];
  } | null;
  skills?: string[];
  dietary?: string | null;
  experience?: "beginner" | "intermediate" | "experienced" | null;
}

/**
 * Shared /api/me state. Keyed so the auth middleware and every page or component
 * that needs the current user resolve it once per request rather than refetching.
 *
 * Resolves to null without a request when nobody is signed in, so components in
 * the default layout (AppBanners) can call it on public pages unconditionally.
 */
export function useMe() {
  const user = useSupabaseUser();
  const request = useRequestFetch();

  return useAsyncData<Me | null>(
    "me",
    () => (user.value ? (request("/api/me") as Promise<Me>) : Promise.resolve(null)),
    { default: () => null, watch: [user] },
  );
}
