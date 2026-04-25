import * as postmark from "postmark";
import {
  joinRequestHtml,
  decisionApprovedHtml,
  decisionRejectedHtml,
} from "./email-templates";

function useEmailClient() {
  const config = useRuntimeConfig();
  return new postmark.ServerClient(config.postmarkToken as string);
}

function fill(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
    template,
  );
}

interface EmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}

async function sendEmail(options: EmailOptions) {
  const config = useRuntimeConfig();
  const client = useEmailClient();
  try {
    await client.sendEmail({
      From: config.postmarkFromEmail as string,
      To: options.to,
      Subject: options.subject,
      HtmlBody: options.htmlBody,
      TextBody: options.textBody,
      MessageStream: "outbound",
    });
  } catch (err) {
    console.error("[email] failed to send to", options.to, err);
  }
}

export async function sendJoinRequestNotification(
  leaderEmail: string,
  requesterName: string,
  teamName: string,
) {
  const config = useRuntimeConfig();
  const htmlBody = fill(joinRequestHtml, {
    REQUESTER_NAME: requesterName,
    TEAM_NAME: teamName,
    BASE_URL: config.siteUrl as string,
  });
  const textBody = `${requesterName} wants to join your team "${teamName}" at LiberHack.\n\nReview the request: ${config.siteUrl}/ops/dashboard`;
  await sendEmail({
    to: leaderEmail,
    subject: `New join request for ${teamName}`,
    htmlBody,
    textBody,
  });
}

export async function sendRequestDecisionNotification(
  requesterEmail: string,
  teamName: string,
  status: "approved" | "rejected",
) {
  const config = useRuntimeConfig();
  const approved = status === "approved";
  const htmlBody = fill(approved ? decisionApprovedHtml : decisionRejectedHtml, {
    TEAM_NAME: teamName,
    BASE_URL: config.siteUrl as string,
  });
  const textBody = approved
    ? `Your request to join "${teamName}" at LiberHack has been approved. You're now part of the team!\n\n${config.siteUrl}/ops/dashboard`
    : `Your request to join "${teamName}" at LiberHack was not accepted this time. Keep hacking.\n\nBrowse other teams: ${config.siteUrl}/ops/teams`;
  await sendEmail({
    to: requesterEmail,
    subject: approved
      ? `You're in — welcome to ${teamName}!`
      : `Update on your request to join ${teamName}`,
    htmlBody,
    textBody,
  });
}
