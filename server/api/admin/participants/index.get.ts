import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";

interface RegistrationRow {
  id: string;
  role: string;
  team_id: string | null;
  skills: string[];
  experience: string | null;
  public: boolean;
  public_opted_in_at: string | null;
  catering: { diet: string; note: string | null } | { diet: string; note: string | null }[] | null;
  registered_at: string;
  accepted_terms_at: string;
  matching_status: string | null;
  contact: {
    method: string;
    handle: string | null;
    other_label: string | null;
    share_with_team: boolean;
    reachable_confirmed_at: string | null;
  } | null;
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
      "id, role, team_id, skills, experience, public, public_opted_in_at, registered_at, accepted_terms_at, matching_status, " +
        "catering:registration_catering(diet, note), " +
        "contact:registration_contacts(method, handle, other_label, share_with_team, reachable_confirmed_at), " +
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
    // Admin-only; catering lives in its own restricted table.
    catering: (Array.isArray(r.catering) ? r.catering[0] : r.catering) ?? null,
    experience: r.experience,
    public: r.public_opted_in_at !== null,
    registered_at: r.registered_at,
    accepted_terms_at: r.accepted_terms_at,
    matching_status: r.matching_status,
    // Organizer-only: this route is behind requireAdmin.
    contact: r.contact,
    created_at: r.participant?.created_at ?? r.registered_at,
  }));
});
