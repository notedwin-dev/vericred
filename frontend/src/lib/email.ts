import sgMail from "@sendgrid/mail";
import type { EmailContent } from "@/lib/email-templates";

/**
 * If SENDGRID_API_KEY isn't configured: in development, this warns and
 * returns without sending, so local testing doesn't require a SendGrid
 * account — but it deliberately never logs the recipient or any URL in the
 * body (verification links carry a bearer token; logs end up in aggregators,
 * CI output, and screen-shares more often than people expect). In production,
 * it throws instead, so the caller fails the request rather than reporting
 * success while sending nothing.
 */
export async function sendEmail(to: string, content: EmailContent) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SENDGRID_API_KEY / SENDGRID_FROM_EMAIL are not configured");
    }
    console.warn("[email] SENDGRID_API_KEY / SENDGRID_FROM_EMAIL not set — email not sent.");
    return;
  }

  sgMail.setApiKey(apiKey);

  await sgMail.send({
    to,
    from,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
}

export async function sendVerificationEmail(to: string, verifyUrl: string) {
  await sendEmail(to, {
    subject: "Verify your email for VeriCred",
    text: `Confirm this email address for your VeriCred account: ${verifyUrl}\n\nIf you didn't request this, you can ignore this email.`,
    html: `
      <p>Confirm this email address for your VeriCred account.</p>
      <p><a href="${verifyUrl}">Verify email address</a></p>
      <p>If you didn't request this, you can ignore this email.</p>
    `,
  });
}
