/**
 * One-off script — sends event reminder emails to all team leaders.
 * Excludes TechnoLab. Run with: bun scripts/send-event-reminder.ts
 *
 * Required env vars (same as app .env):
 *   NUXT_PUBLIC_SUPABASE_URL, NUXT_SUPABASE_SERVICE_KEY, NUXT_RESEND_API_KEY, NUXT_RESEND_FROM_EMAIL
 */

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { readFileSync } from "fs";
import { join } from "path";

const EXCLUDED_TEAMS = [];
const DRY_RUN = process.argv.includes("--dry-run");
const TO_ME = process.argv.includes("--to-me");
const REMOTE = process.argv.includes("--remote");
const MY_EMAIL = "hexchap@gmail.com";

const supabaseUrl = REMOTE
  ? process.env.SUPABASE_REMOTE_URL
  : process.env.NUXT_PUBLIC_SUPABASE_URL;
const supabaseKey = REMOTE
  ? process.env.SUPABASE_REMOTE_SERVICE_KEY
  : process.env.NUXT_SUPABASE_SERVICE_KEY;
const resendKey = process.env.NUXT_RESEND_API_KEY;
const fromEmail = process.env.NUXT_RESEND_FROM_EMAIL;

if (!supabaseUrl || !supabaseKey || !resendKey || !fromEmail) {
  const missing = REMOTE
    ? "SUPABASE_REMOTE_URL, SUPABASE_REMOTE_SERVICE_KEY, NUXT_RESEND_API_KEY, NUXT_RESEND_FROM_EMAIL"
    : "NUXT_PUBLIC_SUPABASE_URL, NUXT_SUPABASE_SERVICE_KEY, NUXT_RESEND_API_KEY, NUXT_RESEND_FROM_EMAIL";
  console.error(`Missing required env vars: ${missing}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const resend = new Resend(resendKey);

const templateHtml = readFileSync(
  join(import.meta.dirname, "../server/emails/dist/event-reminder.html"),
  "utf-8",
);

const attachment = {
  filename: "gng-cooking-straight-poison.webp",
  content: readFileSync(
    join(
      import.meta.dirname,
      "../public/images/gng-cooking-straight-poison.webp",
    ),
  ),
};

function fill(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
    template,
  );
}

type Leader = { teamName: string; leaderName: string; leaderEmail: string };

async function fetchLeaders(): Promise<Leader[]> {
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("name, leader_id");

  if (teamsError) throw new Error(`Supabase error: ${teamsError.message}`);

  const filtered = (teams ?? []).filter((team) => {
    const excluded = EXCLUDED_TEAMS.some((ex) =>
      team.name.toLowerCase().includes(ex),
    );
    if (excluded) console.log(`  ⊘ Skipping: ${team.name}`);
    return !excluded;
  });

  const leaderIds = filtered.map((t) => t.leader_id as string);

  const { data: participants, error: participantsError } = await supabase
    .from("participants")
    .select("id, name, email")
    .in("id", leaderIds);

  if (participantsError)
    throw new Error(`Supabase error: ${participantsError.message}`);

  const byId = Object.fromEntries((participants ?? []).map((p) => [p.id, p]));

  return filtered
    .map((team) => {
      const leader = byId[team.leader_id as string];
      return {
        teamName: team.name as string,
        leaderName: (leader?.name as string) ?? "хакер",
        leaderEmail: leader?.email as string,
      };
    })
    .filter((l) => Boolean(l.leaderEmail));
}

async function sendReminder(leader: Leader): Promise<void> {
  const html = fill(templateHtml, { LEADER_NAME: leader.leaderName });
  const text =
    `Хей, ${leader.leaderName},\n\n` +
    `ДНЕС избухваме с LiberHack и те чакаме с целия ти отбор.\n\n` +
    `КАКВО ТРЯБВА ДА ДОВЛЕЧЕТЕ:\n` +
    `- Лаптопи — всеки сам си носи машината, ясно е.\n` +
    `- Разклонители — сериозно, вземете колкото можете. Токът никога не стига.\n` +
    `- Заряд и хъс — кодът е от вас, другото от нас.\n\n` +
    `КАКВО ПРЕДОСТАВЯМЕ:\n` +
    `Храна, вода и тонове кафе. Няма да останете гладни или заспали.\n\n` +
    `Регламент (прочетете преди събитието): https://liberhack.org/reglament\n\n` +
    `⚡️ ВИЖ ПРОГРАМАТА ТУК: https://liberhack.org/programme\n\n` +
    `Идвайте готови. Ще бъде брутално.\n\nС нетърпение,\nЕкипът на LiberHack`;

  if (DRY_RUN) {
    console.log(
      `  [DRY RUN] Would send to: ${leader.leaderEmail} (${leader.teamName})`,
    );
    return;
  }

  const { error } = await resend.emails.send({
    from: "LiberHack <noreply@liberhack.org>",
    to: [leader.leaderEmail],
    subject: "LiberHack — reminder for tomorrow",
    html,
    text,
    attachments: [attachment],
  });

  if (error) {
    console.error(`  ✗ Failed: ${leader.leaderEmail}`, error);
  } else {
    console.log(`  ✓ Sent to: ${leader.leaderEmail} (${leader.teamName})`);
  }
}

async function main() {
  const mode = DRY_RUN ? " [DRY RUN]" : TO_ME ? " [TO ME]" : "";
  console.log(`\nLiberHack Event Reminder${mode}\n`);

  if (TO_ME) {
    await sendReminder({
      teamName: "preview",
      leaderName: "Кирил",
      leaderEmail: MY_EMAIL,
    });
    console.log("\nDone.");
    return;
  }

  const leaders = await fetchLeaders();
  console.log(`Found ${leaders.length} team leader(s) to email:\n`);

  for (const leader of leaders) {
    await sendReminder(leader);
    // Small delay to stay within Resend rate limits
    if (!DRY_RUN) await new Promise((r) => setTimeout(r, 300));
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
