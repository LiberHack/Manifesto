import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "dist");

function load(name) {
  return readFileSync(join(dist, name), "utf-8");
}

const joinRequest = load("join-request.html");
const decisionApproved = load("decision-approved.html");
const decisionRejected = load("decision-rejected.html");
const verifyEmail = load("verify-email.html");
const magicLink = load("magic-link.html");
const resetPassword = load("reset-password.html");

const out = `// AUTO-GENERATED — edit the .mjml source files and run generate-ts.mjs to regenerate
export const joinRequestHtml = ${JSON.stringify(joinRequest)};
export const decisionApprovedHtml = ${JSON.stringify(decisionApproved)};
export const decisionRejectedHtml = ${JSON.stringify(decisionRejected)};
export const verifyEmailHtml = ${JSON.stringify(verifyEmail)};
export const magicLinkHtml = ${JSON.stringify(magicLink)};
export const resetPasswordHtml = ${JSON.stringify(resetPassword)};
`;

writeFileSync(join(dirname(__dirname), "utils/email-templates.ts"), out);
console.log("email-templates.ts generated");
