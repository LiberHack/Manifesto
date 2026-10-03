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
  experience: "beginner" | "intermediate" | "experienced" | null;
  /** Opted into the public archive. */
  public: boolean;
  public_opted_in_at: string | null;
  /** Restricted catering answer; null until the person has answered. */
  catering: { diet: "none" | "vegetarian" | "vegan" | "other"; note: string | null } | null;
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
  organizer_help_requested_at: string | null;
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
  experience?: "beginner" | "intermediate" | "experienced" | null;
}

/** How long a navigation may reuse /api/me before refetching it. */
const ME_TTL_MS = 30_000;

/**
 * Shared /api/me state. Keyed so the auth middleware and every page or component
 * that needs the current user resolve it once per request rather than refetching.
 * Across client navigations it is reused for ME_TTL_MS (useSessionCache); code
 * that changes what /api/me returns calls `refresh()`, which always refetches,
 * and signing in or out refetches through the `user` watch.
 *
 * Resolves to null without a request when nobody is signed in, so components in
 * the default layout (AppBanners) can call it on public pages unconditionally.
 */
export function useMe() {
  const user = useSupabaseUser();
  const request = useRequestFetch();
  // Watch the account, not the user object: the Supabase module replaces that
  // object on navigation, and watching it refetched /api/me on every click.
  const userId = computed(() => user.value?.sub ?? null);
  const owner = () => userId.value;
  const { cache, getCachedData, revalidateIfStale } = useSessionCache<Me | null>(
    "me",
    ME_TTL_MS,
    owner,
  );

  const me = useAsyncData<Me | null>(
    "me",
    // Explicit response type: inferring it from Nitro's route union exceeds the
    // compiler's depth limit now that there are more API routes.
    () =>
      user.value
        ? cache.load(() => request<Me>("/api/me", SHARED_READ_FETCH), owner())
        : Promise.resolve(null),
    { default: () => null, watch: [userId], getCachedData },
  );
  revalidateIfStale(me.refresh);
  return me;
}

/**
 * Whether the shared /api/me is past its TTL or invalidated by a write. The
 * auth middleware awaits a refresh in that case before deciding a redirect.
 */
export function useMeIsStale(): boolean {
  const user = useSupabaseUser();
  const owner = () => user.value?.sub ?? null;
  return useSessionCache<Me | null>("me", ME_TTL_MS, owner).cache.expired(owner());
}
