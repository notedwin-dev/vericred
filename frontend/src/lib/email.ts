import sgMail from "@sendgrid/mail";

/**
 * If SENDGRID_API_KEY isn't configured (e.g. local dev), the verification
 * link is logged instead of emailed so the flow can still be exercised.
 */
export async function sendVerificationEmail(to: string, verifyUrl: string) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn(
      `[email] SENDGRID_API_KEY / SENDGRID_FROM_EMAIL not set — verification link for ${to}: ${verifyUrl}`
    );
    return;
  }

  sgMail.setApiKey(apiKey);

  await sgMail.send({
    to,
    from,
    subject: "Verify your email for VeriCred",
    text: `Confirm this email address for your VeriCred account: ${verifyUrl}\n\nIf you didn't request this, you can ignore this email.`,
    html: `
      <p>Confirm this email address for your VeriCred account.</p>
      <p><a href="${verifyUrl}">Verify email address</a></p>
      <p>If you didn't request this, you can ignore this email.</p>
    `,
  });
}
