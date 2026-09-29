import { requireRegistration } from "#server/utils/requireRegistration";
import { teamVacancies } from "#shared/teamFormation";

interface MemberRow {
  id: string;
  skills: string[];
  participant: { id: string; name: string } | null;
  contact: {
    method: string;
    handle: string | null;
    other_label: string | null;
    share_with_team: boolean;
  } | null;
}

export default defineEventHandler(async (event) => {
  const { registration, edition, supabase } = await requireRegistration(event);

  const id = getRouterParam(event, "id");

  const [{ data: team, error }, { data: config }] = await Promise.all([
    supabase
      .from("teams")
      .select(
        "id, name, leader_id, skills_wanted, description, created_at, github_url, " +
          "recruiting, wanted_roles, desired_size, interests, goals, welcomes_beginners, languages, " +
          "members:registrations!registrations_team_id_fkey(id, skills, participant:participants(id, name), " +
          "contact:registration_contacts(method, handle, other_label, share_with_team))",
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

  const isMember = registration.team_id === id;

  // Members are exposed by registration id (which is what leader_id points at),
  // with the display name pulled from the identity mirror. A member's contact
  // reaches fellow members only, and only when that member chose to share it.
  const members = ((team.members ?? []) as unknown as MemberRow[]).map((m) => ({
    id: m.id,
    participant_id: m.participant?.id ?? null,
    name: m.participant?.name ?? "",
    skills: m.skills,
    shared_contact:
      isMember && m.contact?.share_with_team && m.contact.method !== "email_only"
        ? {
            method: m.contact.method,
            handle: m.contact.handle,
            other_label: m.contact.other_label,
          }
        : null,
  }));

  const urlsPublic = config?.github_urls_public === true;
  const { members: _rows, github_url, ...rest } = team as unknown as Record<
    string,
    unknown
  > & { github_url: string | null; desired_size: number };

  return {
    ...rest,
    ...(isMember || urlsPublic ? { github_url } : {}),
    members,
    vacancies: teamVacancies(rest.desired_size, members.length),
  };
});
