import { requireAdmin } from "#server/utils/adminAuth";

const COLUMNS = [
  "name",
  "email",
  "role",
  "experience",
  "dietary",
  "skills",
  "team_id",
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
    .from("participants")
    .select("name, email, role, experience, dietary, skills, team_id, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  const rows = [
    COLUMNS.join(","),
    ...(data ?? []).map((row) =>
      COLUMNS.map((col) => escapeCsv(row[col])).join(",")
    ),
  ].join("\n");

  setResponseHeaders(event, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="participants-${new Date().toISOString().slice(0, 10)}.csv"`,
  });

  return rows;
});
