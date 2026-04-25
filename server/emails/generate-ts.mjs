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

const out = `// AUTO-GENERATED — edit the .mjml source files and run generate-ts.mjs to regenerate
export const joinRequestHtml = ${JSON.stringify(joinRequest)};
export const decisionApprovedHtml = ${JSON.stringify(decisionApproved)};
export const decisionRejectedHtml = ${JSON.stringify(decisionRejected)};
export const verifyEmailHtml = ${JSON.stringify(verifyEmail)};
`;

writeFileSync(join(dirname(__dirname), "utils/email-templates.ts"), out);
console.log("email-templates.ts generated");
