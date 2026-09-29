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
  "matching_status",
] as const;

// Private contact columns, only with ?include_contacts=1. The default export
// is the one that may be handed to sponsors.
const CONTACT_COLUMNS = ["contact_method", "contact_handle", "contact_reachable"] as const;

interface Row {
  role: string;
  team_id: string | null;
  skills: string[];
  dietary: string | null;
  experience: string | null;
  public: boolean;
  registered_at: string;
  matching_status: string | null;
  participant: { name: string; email: string } | null;
  contact?: {
    method: string;
    handle: string | null;
    other_label: string | null;
    reachable_confirmed_at: string | null;
  } | null;
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

  const includeContacts = getQuery(event).include_contacts === "1";

  const { data, error } = await supabase
    .from("registrations")
    .select(
      "role, team_id, skills, dietary, experience, public, registered_at, matching_status, " +
        "participant:participants(name, email)" +
        (includeContacts
          ? ", contact:registration_contacts(method, handle, other_label, reachable_confirmed_at)"
          : ""),
    )
    .eq("edition_slug", edition.slug)
    .order("registered_at", { ascending: true });

  if (error) {
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  const header = includeContacts ? [...COLUMNS, ...CONTACT_COLUMNS] : [...COLUMNS];

  const rows = [
    header.join(","),
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
        escapeCsv(r.matching_status),
        ...(includeContacts
          ? [
              escapeCsv(
                r.contact?.method === "other" ? r.contact.other_label : r.contact?.method,
              ),
              escapeCsv(r.contact?.handle),
              escapeCsv(r.contact?.reachable_confirmed_at),
            ]
          : []),
      ].join(","),
    ),
  ].join("\n");

  setResponseHeaders(event, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="participants-${edition.slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
  });

  return rows;
});
