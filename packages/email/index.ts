import { Resend } from "resend";
import fs from "fs";
import path from "path";
import { Env } from "@workspace/constants";

// Initialize Resend with API key from environment
const resend = new Resend(Env.RESEND_API_KEY || "re_123456789");

/**
 * Generic helper to render a template and replace placeholders.
 */
function renderTemplate(
  templateName: string,
  variables: Record<string, string>,
): string {
  const templatePath = path.join(__dirname, `templates/${templateName}.html`);
  let html = "";

  try {
    if (fs.existsSync(templatePath)) {
      html = fs.readFileSync(templatePath, "utf-8");
    } else {
      throw new Error(`Template ${templateName} not found at ${templatePath}`);
    }
  } catch (e) {
    console.warn(
      `Could not read email template ${templateName}, using minimal fallback`,
      e,
    );
    // Minimal fallback for critical cases
    return Object.entries(variables).reduce(
      (acc, [key, val]) => acc.replace(new RegExp(`{{${key}}}`, "g"), val),
      "<p>Oewang Notification: " + templateName + "</p>",
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
  const appUrl = Env.NEXT_PUBLIC_APP_URL || "https://app.oewang.com";
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
  const upgradeUrl = `${Env.NEXT_PUBLIC_APP_URL || "https://app.oewang.com"}/en/settings/billing`;
  const html = renderTemplate("package-expired", {
    userName,
    workspaceName,
    upgradeUrl,
  });

  return sendEmail(to, "Your Oewang Trial Has Ended", html);
}

export async function sendSubscriptionPaymentReminderEmail(
  to: string,
  userName: string,
  workspaceName: string,
  dueDate: Date,
) {
  const billingUrl = `${Env.NEXT_PUBLIC_APP_URL || "https://app.oewang.com"}/en/settings/billing`;
  const html = renderTemplate("subscription-payment-reminder", {
    userName,
    workspaceName,
    dueDate: dueDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    billingUrl,
  });

  return sendEmail(to, "Payment overdue for your Oewang subscription", html);
}

export async function sendSubscriptionDowngradedEmail(
  to: string,
  userName: string,
  workspaceName: string,
) {
  const billingUrl = `${Env.NEXT_PUBLIC_APP_URL || "https://app.oewang.com"}/en/settings/billing`;
  const html = renderTemplate("subscription-downgraded", {
    userName,
    workspaceName,
    billingUrl,
  });

  return sendEmail(to, "Your Oewang workspace has been downgraded", html);
}

/**
 * Send a payment failed notification to the workspace owner.
 */
export async function sendPaymentFailedEmail(
  to: string,
  userName: string,
  workspaceName: string,
) {
  const billingUrl = `${Env.NEXT_PUBLIC_APP_URL || "https://app.oewang.com"}/en/settings/billing`;
  const html = renderTemplate("payment-failed", {
    userName,
    workspaceName,
    billingUrl,
  });

  return sendEmail(to, `Payment failed for ${workspaceName}`, html);
}

/**
 * Send the invoice/bill to the owner when a checkout session is created.
 */
export async function sendInvoiceSentEmail(
  to: string,
  userName: string,
  workspaceName: string,
  planName: string,
  billing: string,
  amount: string,
  checkoutUrl: string,
) {
  const html = renderTemplate("invoice-sent", {
    userName,
    workspaceName,
    planName,
    billing,
    amount,
    checkoutUrl,
  });

  return sendEmail(to, `Invoice for ${workspaceName} — ${planName}`, html);
}

/**
 * Send a confirmation email after a successful add-on purchase.
 */
export async function sendAddonPurchaseSuccessEmail(
  to: string,
  userName: string,
  workspaceName: string,
  addonName: string,
) {
  const appUrl = Env.NEXT_PUBLIC_APP_URL || "https://app.oewang.com";
  const html = renderTemplate("purchase-success", {
    userName,
    workspaceName,
    planName: addonName,
    appUrl,
  });

  return sendEmail(to, `Add-on activated for ${workspaceName}`, html);
}

/**
 * Send a congratulations email when an admin changes a workspace's plan.
 */
export async function sendWorkspaceUpgradedEmail(
  to: string,
  userName: string,
  workspaceName: string,
  planName: string,
) {
  const appUrl = Env.NEXT_PUBLIC_APP_URL || "https://app.oewang.com";
  const html = renderTemplate("workspace-upgraded", {
    userName,
    workspaceName,
    planName,
    appUrl,
  });

  return sendEmail(
    to,
    `Your workspace ${workspaceName} is now on ${planName}`,
    html,
  );
}

/**
 * Notify the user that a receipt was automatically processed from their connected inbox.
 */
export async function sendReceiptProcessedEmail(
  to: string,
  receiptName: string,
  amount: string,
  source: "Gmail" | "Outlook",
) {
  const appUrl = Env.NEXT_PUBLIC_APP_URL || "https://app.oewang.com";
  const html = renderTemplate("receipt-processed", {
    receiptName,
    amount,
    source,
    appUrl,
  });
  return sendEmail(to, `Receipt from ${source} processed — ${receiptName}`, html);
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
