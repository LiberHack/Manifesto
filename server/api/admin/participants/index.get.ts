import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";

interface RegistrationRow {
  id: string;
  role: string;
  team_id: string | null;
  skills: string[];
  dietary: string | null;
  experience: string | null;
  public: boolean;
  registered_at: string;
  accepted_terms_at: string;
  participant: {
    id: string;
    name: string;
    email: string;
    role: string;
    created_at: string;
  } | null;
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);

  const { data, error } = await supabase
    .from("registrations")
    .select(
      "id, role, team_id, skills, dietary, experience, public, registered_at, accepted_terms_at, " +
        "participant:participants(id, name, email, role, created_at)",
    )
    .eq("edition_slug", edition.slug)
    .order("registered_at", { ascending: false });

  if (error) {
    console.error("[admin/participants] fetch failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  return ((data ?? []) as unknown as RegistrationRow[]).map((r) => ({
    id: r.participant?.id ?? null,
    registration_id: r.id,
    name: r.participant?.name ?? "",
    email: r.participant?.email ?? "",
    // Identity-level privilege flag, not the per-edition team role.
    role: r.participant?.role ?? "participant",
    team_role: r.role,
    team_id: r.team_id,
    skills: r.skills,
    dietary: r.dietary,
    experience: r.experience,
    public: r.public,
    registered_at: r.registered_at,
    accepted_terms_at: r.accepted_terms_at,
    created_at: r.participant?.created_at ?? r.registered_at,
  }));
});
