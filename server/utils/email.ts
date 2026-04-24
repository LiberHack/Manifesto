import * as postmark from "postmark";

function useEmailClient() {
  const config = useRuntimeConfig();
  return new postmark.ServerClient(config.postmarkToken as string);
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
  teamName: string
) {
  const subject = `New join request for ${teamName}`;
  const textBody = `${requesterName} wants to join your team "${teamName}" at LibreHack.\n\nReview the request in your team dashboard.`;
  const htmlBody = `<p><strong>${requesterName}</strong> wants to join your team <strong>${teamName}</strong> at LibreHack.</p><p>Review the request in your team dashboard.</p>`;
  await sendEmail({ to: leaderEmail, subject, htmlBody, textBody });
}

export async function sendRequestDecisionNotification(
  requesterEmail: string,
  teamName: string,
  status: "approved" | "rejected"
) {
  const approved = status === "approved";
  const subject = approved
    ? `You're in — welcome to ${teamName}!`
    : `Update on your request to join ${teamName}`;
  const textBody = approved
    ? `Your request to join "${teamName}" at LibreHack has been approved. You're now part of the team!`
    : `Your request to join "${teamName}" at LibreHack was not accepted this time. Keep hacking.`;
  const htmlBody = approved
    ? `<p>Your request to join <strong>${teamName}</strong> at LibreHack has been <strong>approved</strong>. You're now part of the team!</p>`
    : `<p>Your request to join <strong>${teamName}</strong> at LibreHack was not accepted this time. Keep hacking.</p>`;
  await sendEmail({ to: requesterEmail, subject, htmlBody, textBody });
}
