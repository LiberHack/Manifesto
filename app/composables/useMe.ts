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
