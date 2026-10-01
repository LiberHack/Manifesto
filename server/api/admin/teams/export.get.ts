import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";
import { setExportHeaders, toCsv } from "#server/utils/csv";
import { exportFilename, recordExport } from "#server/utils/exportAudit";

/** Internal organiser export of teams and their members. Not for sponsors. */
const COLUMNS = [
  "id",
  "name",
  "description",
  "skills_wanted",
  "member_count",
  "member_names",
  "member_emails",
  "leader_name",
  "leader_email",
  "created_at",
] as const;

interface MemberRow {
  id: string;
  participant: { id: string; name: string; email: string } | null;
}

interface TeamRow {
  id: string;
  name: string;
  description: string | null;
  skills_wanted: string[];
  created_at: string;
  leader_id: string;
  members: MemberRow[] | null;
}

export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);

  const { data, error } = await supabase
    .from("teams")
    .select(
      "id, name, description, skills_wanted, created_at, leader_id, " +
        "members:registrations!registrations_team_id_fkey(id, participant:participants(id, name, email))",
    )
    .eq("edition_slug", edition.slug)
    .order("created_at", { ascending: true });

  if (error) {
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  const teams = (data ?? []) as unknown as TeamRow[];
  const participantIds = teams.flatMap((team) =>
    (team.members ?? []).flatMap((m) =>
      m.participant ? [m.participant.id] : [],
    ),
  );
  await recordExport(supabase, {
    exportedBy: user.sub,
    kind: "teams",
    editionSlug: edition.slug,
    participantIds,
    rowCount: teams.length,
  });

  setExportHeaders(event, exportFilename("teams", edition.slug));
  return toCsv(
    COLUMNS,
    teams.map((team) => {
      const members = team.members ?? [];
      const leader = members.find((m) => m.id === team.leader_id);
      return [
        team.id,
        team.name,
        team.description,
        team.skills_wanted,
        members.length,
        members.map((m) => m.participant?.name ?? ""),
        members.map((m) => m.participant?.email ?? ""),
        leader?.participant?.name ?? "",
        leader?.participant?.email ?? "",
        team.created_at,
      ];
    }),
  );
});
