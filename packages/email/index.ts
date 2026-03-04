import { Resend } from "resend";
import fs from "fs";
import path from "path";
import { Env } from "@workspace/constants";

// Initialize Resend with API key from environment
const resend = new Resend(Env.RESEND_API_KEY || "re_123456789");

export async function sendInvitationEmail(
  to: string,
  workspaceName: string,
  inviteLink: string,
) {
  // Read the HTML template
  // Note: specific path resolution might depend on build/runtime
  const templatePath = path.join(__dirname, "templates/invite.html");
  let html = "";

  try {
    // For simplicity in this monorepo setup, we might need to adjust how we read assets.
    // If fs read fails (e.g. in edge), we should fallback or use a different strategy.
    if (fs.existsSync(templatePath)) {
      html = fs.readFileSync(templatePath, "utf-8");
    } else {
      // Fallback for now if path resolution is tricky in dev vs prod
      html = `
        <p>You have been invited to join <strong>{{workspaceName}}</strong>.</p>
        <a href="{{inviteLink}}">Accept Invitation</a>
        `;
    }
  } catch (e) {
    console.warn("Could not read email template file, using fallback", e);
    html = `
      <p>You have been invited to join <strong>{{workspaceName}}</strong>.</p>
      <a href="{{inviteLink}}">Accept Invitation</a>
      `;
  }

  // Replace placeholders
  html = html
    .replace("{{workspaceName}}", workspaceName)
    .replace("{{inviteLink}}", inviteLink);

  if (!Env.RESEND_API_KEY) {
    console.log("Mock Sending Email:", {
      to,
      subject: "Invitation to join " + workspaceName,
      html,
    });
    return { success: true, id: "mock-id" };
  }

  try {
    const data = await resend.emails.send({
      from: "Okane <noreply@lazlanrafar.com>", // Configure this in real app
      to,
      subject: `Invitation to join ${workspaceName}`,
      html,
    });
    return { success: true, data };
  } catch (error) {
    console.error("Failed to send email", error);
    return { success: false, error };
  }
}
