import { requireAdmin } from "#server/utils/adminAuth";

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

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = Array.isArray(value) ? value.join("; ") : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);

  const { data, error } = await supabase
    .from("teams")
    .select("id, name, description, skills_wanted, created_at, leader_id, members:participants(id, name, email)")
    .order("created_at", { ascending: true });

  if (error) {
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  const rows = [
    COLUMNS.join(","),
    ...(data ?? []).map((team) => {
      const members = (team.members as { id: string; name: string; email: string }[]) ?? [];
      const leader = members.find((m) => m.id === team.leader_id);
      return [
        escapeCsv(team.id),
        escapeCsv(team.name),
        escapeCsv(team.description),
        escapeCsv(team.skills_wanted),
        escapeCsv(members.length),
        escapeCsv(members.map((m) => m.name)),
        escapeCsv(members.map((m) => m.email)),
        escapeCsv(leader?.name ?? ""),
        escapeCsv(leader?.email ?? ""),
        escapeCsv(team.created_at),
      ].join(",");
    }),
  ].join("\n");

  setResponseHeaders(event, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="teams-${new Date().toISOString().slice(0, 10)}.csv"`,
  });

  return rows;
});
