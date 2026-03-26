import { Resend } from "resend";
import fs from "fs";
import path from "path";
import { Env } from "@workspace/constants";

// Initialize Resend with API key from environment
const resend = new Resend(Env.RESEND_API_KEY || "re_123456789");

/**
 * Generic helper to render a template and replace placeholders.
 */
function renderTemplate(templateName: string, variables: Record<string, string>): string {
  const templatePath = path.join(__dirname, `templates/${templateName}.html`);
  let html = "";

  try {
    if (fs.existsSync(templatePath)) {
      html = fs.readFileSync(templatePath, "utf-8");
    } else {
      throw new Error(`Template ${templateName} not found at ${templatePath}`);
    }
  } catch (e) {
    console.warn(`Could not read email template ${templateName}, using minimal fallback`, e);
    // Minimal fallback for critical cases
    return Object.entries(variables).reduce(
      (acc, [key, val]) => acc.replace(new RegExp(`{{${key}}}`, "g"), val),
      "<p>Oewang Notification: " + templateName + "</p>"
    );
  }

  // Replace placeholders
  Object.entries(variables).forEach(([key, value]) => {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), value);
  });

  return html;
}

/**
 * Send an invitation email to a new workspace member.
 */
export async function sendInvitationEmail(
  to: string,
  workspaceName: string,
  inviteLink: string,
) {
  const html = renderTemplate("invite", {
    workspaceName,
    inviteLink,
  });

  return sendEmail(to, `Invitation to join ${workspaceName}`, html);
}

/**
 * Send a "thank you" email after a successful purchase.
 */
export async function sendPurchaseSuccessEmail(
  to: string,
  userName: string,
  workspaceName: string,
  planName: string,
) {
  const appUrl = Env.NEXT_PUBLIC_APP_URL || "https://app.okane.ai";
  const html = renderTemplate("purchase-success", {
    userName,
    workspaceName,
    planName,
    appUrl,
  });

  return sendEmail(to, "Thank you for your purchase!", html);
}

/**
 * Send an alert when a trial or package has expired.
 */
export async function sendPackageExpiredEmail(
  to: string,
  userName: string,
  workspaceName: string,
) {
  const upgradeUrl = `${Env.NEXT_PUBLIC_APP_URL || "https://app.okane.ai"}/en/settings/billing`;
  const html = renderTemplate("package-expired", {
    userName,
    workspaceName,
    upgradeUrl,
  });

  return sendEmail(to, "Your Oewang Trial Has Ended", html);
}

/**
 * Internal helper to send email via Resend.
 */
async function sendEmail(to: string, subject: string, html: string) {
  if (!Env.RESEND_API_KEY) {
    console.log("Mock Sending Email:", { to, subject, html });
    return { success: true, id: "mock-id" };
  }

  try {
    const data = await resend.emails.send({
      from: "Oewang <noreply@lazlanrafar.com>",
      to,
      subject,
      html,
    });
    return { success: true, data };
  } catch (error) {
    console.error("Failed to send email", error);
    return { success: false, error };
  }
}
