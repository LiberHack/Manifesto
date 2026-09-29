import {
  joinRequestHtml,
  decisionApprovedHtml,
  decisionRejectedHtml,
} from "./email-templates";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

/**
 * Substitute `{{KEY}}` placeholders in an HTML template. Values are escaped,
 * since names and team names are participant-controlled.
 */
export function fill(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, escapeHtml(value)),
    template,
  );
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// Plain HTTP call instead of the resend SDK: the SDK drags in an optional
// @react-email/render peer that cannot be bundled for Cloudflare Workers.
async function sendEmail(options: EmailOptions) {
  const config = useRuntimeConfig();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey as string}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.resendFromEmail as string,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
    }),
  });
  if (!res.ok) {
    console.error("[email] failed to send to", options.to, res.status, await res.text());
  }
}

export async function sendJoinRequestNotification(
  leaderEmail: string,
  requesterName: string,
  teamName: string,
) {
  const config = useRuntimeConfig();
  const html = fill(joinRequestHtml, {
    REQUESTER_NAME: requesterName,
    TEAM_NAME: teamName,
    BASE_URL: config.siteUrl as string,
  });
  const text = `${requesterName} wants to join your team "${teamName}" at LiberHack.\n\nReview the request: ${config.siteUrl}/ops/dashboard`;
  await sendEmail({
    to: leaderEmail,
    subject: `New join request for ${teamName}`,
    html,
    text,
  });
}

export async function sendRequestDecisionNotification(
  requesterEmail: string,
  teamName: string,
  status: "approved" | "rejected",
) {
  const config = useRuntimeConfig();
  const approved = status === "approved";
  const html = fill(approved ? decisionApprovedHtml : decisionRejectedHtml, {
    TEAM_NAME: teamName,
    BASE_URL: config.siteUrl as string,
  });
  const text = approved
    ? `Your request to join "${teamName}" at LiberHack has been approved. You're now part of the team!\n\n${config.siteUrl}/ops/dashboard`
    : `Your request to join "${teamName}" at LiberHack was not accepted this time. Keep hacking.\n\nBrowse other teams: ${config.siteUrl}/ops/teams`;
  await sendEmail({
    to: requesterEmail,
    subject: approved
      ? `You're in — welcome to ${teamName}!`
      : `Update on your request to join ${teamName}`,
    html,
    text,
  });
}

// Plain layout for notices that do not have an MJML template yet.
const SIMPLE_HTML =
  '<div style="font-family:monospace;max-width:560px;margin:0 auto;padding:24px">' +
  "<p>{{BODY}}</p>" +
  '<p><a href="{{LINK}}" style="font-weight:bold">{{LINK_LABEL}}</a></p>' +
  "</div>";

export async function sendInvitationNotification(
  inviteeEmail: string,
  teamName: string,
) {
  const config = useRuntimeConfig();
  const link = `${config.siteUrl}/ops/dashboard#my-requests`;
  const body = `The team "${teamName}" invited you to join them at LiberHack. Read their message and accept or decline from your dashboard.`;
  await sendEmail({
    to: inviteeEmail,
    subject: `${teamName} invited you to their team`,
    html: fill(SIMPLE_HTML, { BODY: body, LINK: link, LINK_LABEL: "Open your dashboard" }),
    text: `${body}\n\n${link}`,
  });
}

export async function sendInvitationAcceptedNotification(
  leaderEmail: string,
  inviteeName: string,
  teamName: string,
) {
  const config = useRuntimeConfig();
  const link = `${config.siteUrl}/ops/dashboard`;
  const body = `${inviteeName} accepted your invitation and joined "${teamName}".`;
  await sendEmail({
    to: leaderEmail,
    subject: `${inviteeName} joined ${teamName}`,
    html: fill(SIMPLE_HTML, { BODY: body, LINK: link, LINK_LABEL: "Open your dashboard" }),
    text: `${body}\n\n${link}`,
  });
}

export async function sendProposalNotification(email: string, teamName: string) {
  const config = useRuntimeConfig();
  const link = `${config.siteUrl}/ops/dashboard#proposals`;
  const body = `The LiberHack organizers suggested a new team, "${teamName}", with you in it. Meet the others and accept or decline from your dashboard — nothing happens until everyone agrees.`;
  await sendEmail({
    to: email,
    subject: `The organizers suggested a team for you`,
    html: fill(SIMPLE_HTML, { BODY: body, LINK: link, LINK_LABEL: "Open your dashboard" }),
    text: `${body}\n\n${link}`,
  });
}
