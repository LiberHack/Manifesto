import { requireRegistration } from "#server/utils/requireRegistration";

interface MemberRow {
  id: string;
  skills: string[];
  participant: { id: string; name: string } | null;
}

export default defineEventHandler(async (event) => {
  const { registration, edition, supabase } = await requireRegistration(event);

  const id = getRouterParam(event, "id");

  const [{ data: team, error }, { data: config }] = await Promise.all([
    supabase
      .from("teams")
      .select(
        "id, name, leader_id, skills_wanted, description, created_at, github_url, " +
          "members:registrations!registrations_team_id_fkey(id, skills, participant:participants(id, name))",
      )
      .eq("id", id!)
      .eq("edition_slug", edition.slug)
      .maybeSingle(),
    supabase
      .from("event_config")
      .select("github_urls_public")
      .eq("edition_slug", edition.slug)
      .maybeSingle(),
  ]);

  if (error || !team)
    throw createError({ statusCode: 404, message: "Team not found" });

  // Members are exposed by registration id (which is what leader_id points at),
  // with the display name pulled from the identity mirror.
  const members = ((team.members ?? []) as unknown as MemberRow[]).map((m) => ({
    id: m.id,
    participant_id: m.participant?.id ?? null,
    name: m.participant?.name ?? "",
    skills: m.skills,
  }));

  const isMember = registration.team_id === id;
  const urlsPublic = config?.github_urls_public === true;

  if (!isMember && !urlsPublic) {
    const { github_url: _omitted, ...rest } = team;
    return { ...rest, members };
  }

  return { ...team, members };
});
