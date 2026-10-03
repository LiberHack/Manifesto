import { requireAdminWithMfa, resolveAdminEdition } from "#server/utils/adminAuth";
import { setExportHeaders, toCsv } from "#server/utils/csv";
import { exportFilename, recordExport } from "#server/utils/exportAudit";

/**
 * Internal organiser export. Not for sponsors — they get
 * /api/admin/sponsors/:id/export, which enforces eligibility and limits fields.
 * Catering data has its own export.
 */
const COLUMNS = [
  "name",
  "email",
  "team_role",
  "experience",
  "skills",
  "team_id",
  "public_archive",
  "registered_at",
  "matching_status",
] as const;

// Preferred-contact columns, only with ?include_contacts=1. Audited as its own
// export kind, since it hands organizers every participant's direct contact.
const CONTACT_COLUMNS = ["contact_method", "contact_handle", "contact_reachable"] as const;

interface Row {
  role: string;
  team_id: string | null;
  skills: string[];
  experience: string | null;
  public_opted_in_at: string | null;
  registered_at: string;
  matching_status: string | null;
  participant: { id: string; name: string; email: string } | null;
  contact?: {
    method: string;
    handle: string | null;
    other_label: string | null;
    reachable_confirmed_at: string | null;
  } | null;
}

export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireAdminWithMfa(event);
  const edition = await resolveAdminEdition(event, supabase);

  const includeContacts = getQuery(event).include_contacts === "1";

  const { data, error } = await supabase
    .from("registrations")
    .select(
      "role, team_id, skills, experience, public_opted_in_at, registered_at, matching_status, " +
        "participant:participants(id, name, email)" +
        (includeContacts
          ? ", contact:registration_contacts(method, handle, other_label, reachable_confirmed_at)"
          : ""),
    )
    .eq("edition_slug", edition.slug)
    .order("registered_at", { ascending: true });

  if (error) {
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  const kind = includeContacts ? "participants_contacts" : "participants";
  const rows = (data ?? []) as unknown as Row[];
  await recordExport(supabase, {
    exportedBy: user.sub,
    kind,
    editionSlug: edition.slug,
    participantIds: rows.flatMap((r) => (r.participant ? [r.participant.id] : [])),
    rowCount: rows.length,
  });

  setExportHeaders(event, exportFilename(kind, edition.slug));
  return toCsv(
    includeContacts ? [...COLUMNS, ...CONTACT_COLUMNS] : COLUMNS,
    rows.map((r) => [
      r.participant?.name,
      r.participant?.email,
      r.role,
      r.experience,
      r.skills,
      r.team_id,
      r.public_opted_in_at ? "yes" : "no",
      r.registered_at,
      r.matching_status,
      ...(includeContacts
        ? [
            r.contact?.method === "other" ? r.contact.other_label : r.contact?.method,
            r.contact?.handle,
            r.contact?.reachable_confirmed_at,
          ]
        : []),
    ]),
  );
});
