import { Resend } from "resend";
import {
  joinRequestHtml,
  decisionApprovedHtml,
  decisionRejectedHtml,
} from "./email-templates";

function fill(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
    template,
  );
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendEmail(options: EmailOptions) {
  const config = useRuntimeConfig();
  const resend = new Resend(config.resendApiKey as string);
  const { error } = await resend.emails.send({
    from: config.resendFromEmail as string,
    to: [options.to],
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
  if (error) {
    console.error("[email] failed to send to", options.to, error);
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
