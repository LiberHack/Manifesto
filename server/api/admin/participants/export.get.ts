import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";

const COLUMNS = [
  "name",
  "email",
  "team_role",
  "experience",
  "dietary",
  "skills",
  "team_id",
  "public",
  "registered_at",
] as const;

interface Row {
  role: string;
  team_id: string | null;
  skills: string[];
  dietary: string | null;
  experience: string | null;
  public: boolean;
  registered_at: string;
  participant: { name: string; email: string } | null;
}

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
  const edition = await resolveAdminEdition(event, supabase);

  const { data, error } = await supabase
    .from("registrations")
    .select(
      "role, team_id, skills, dietary, experience, public, registered_at, " +
        "participant:participants(name, email)",
    )
    .eq("edition_slug", edition.slug)
    .order("registered_at", { ascending: true });

  if (error) {
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  const rows = [
    COLUMNS.join(","),
    ...((data ?? []) as unknown as Row[]).map((r) =>
      [
        escapeCsv(r.participant?.name),
        escapeCsv(r.participant?.email),
        escapeCsv(r.role),
        escapeCsv(r.experience),
        escapeCsv(r.dietary),
        escapeCsv(r.skills),
        escapeCsv(r.team_id),
        escapeCsv(r.public),
        escapeCsv(r.registered_at),
      ].join(","),
    ),
  ].join("\n");

  setResponseHeaders(event, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="participants-${edition.slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
  });

  return rows;
});
