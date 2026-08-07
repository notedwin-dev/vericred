export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Numbered so the email doubles as a first-run checklist — an institution
 * reading this has just been approved and has never seen the issuer panel.
 */
const CAPABILITIES = [
  {
    title: "Set up a course and a certificate template",
    body: "Design the certificate once; every credential you issue for that course inherits the layout.",
  },
  {
    title: "Issue credentials — one at a time, or a whole cohort by CSV",
    body: "We generate the certificate PDF, pin it to IPFS, and anchor its fingerprint on-chain for you.",
  },
  {
    title: "Share a collection link",
    body: "Send one link to your graduates and let them claim their own credentials — no wallet needed on your side.",
  },
  {
    title: "Revoke with a reason, permanently on the record",
    body: "Revocation is append-only: the history stays verifiable instead of quietly disappearing.",
  },
];

const BENEFITS =
  "Every credential you issue is independently verifiable by anyone, forever — no phone calls to your registry, " +
  "no PDFs that can be edited in a text editor, and no dependence on VeriCred staying online.";

/**
 * The email an institution receives once an admin approves its registration
 * and its wallet is authorised on-chain (docs/institution-registration-prd.md
 * Decision 6). Sent only after the on-chain calls succeed (Decision 7) — an
 * institution is never told it's ready before it actually is.
 */
export function buildInstitutionWelcomeEmail(params: {
  organizationName: string;
  getStartedUrl: string;
}): EmailContent {
  const { organizationName, getStartedUrl } = params;
  const safeName = escapeHtml(organizationName);
  const safeUrl = escapeHtml(getStartedUrl);

  const listHtml = CAPABILITIES.map(
    (item) => `
        <li style="margin:0 0 14px 0;">
          <strong style="color:#18181b;">${escapeHtml(item.title)}</strong><br />
          <span style="color:#52525b;">${escapeHtml(item.body)}</span>
        </li>`
  ).join("");

  const html = `
<div style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
    <div style="padding:28px 32px;background:#18181b;color:#ffffff;">
      <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#a1a1aa;">VeriCred</p>
      <h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.3;font-weight:600;">
        ${safeName} is approved to issue credentials
      </h1>
    </div>

    <div style="padding:32px;">
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#3f3f46;">
        Your institution's wallet is now authorised on the VeriCred registry, which means any credential you issue
        can be anchored on-chain under ${safeName}'s name. Here's what you can do:
      </p>

      <ol style="margin:0 0 24px 0;padding-left:20px;font-size:15px;line-height:1.55;">
        ${listHtml}
      </ol>

      <p style="margin:0 0 28px 0;font-size:15px;line-height:1.6;color:#3f3f46;">
        ${escapeHtml(BENEFITS)}
      </p>

      <div style="text-align:center;">
        <a href="${safeUrl}"
           style="display:inline-block;padding:13px 32px;background:#ffffff;color:#18181b;border:1px solid #18181b;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">
          Get Started
        </a>
      </div>

      <p style="margin:28px 0 0 0;font-size:13px;line-height:1.5;color:#71717a;">
        Signing in as an institution needs both your password and a signature from your registered wallet, so keep
        that wallet to hand.
      </p>
    </div>
  </div>
</div>`.trim();

  const text = [
    `${organizationName} is approved to issue credentials on VeriCred.`,
    "",
    "Your institution's wallet is now authorised on the VeriCred registry, which means any credential you issue can be anchored on-chain under your name. Here's what you can do:",
    "",
    ...CAPABILITIES.map((item, i) => `${i + 1}. ${item.title}\n   ${item.body}`),
    "",
    BENEFITS,
    "",
    `Get started: ${getStartedUrl}`,
    "",
    "Signing in as an institution needs both your password and a signature from your registered wallet, so keep that wallet to hand.",
  ].join("\n");

  return {
    subject: `${organizationName} is approved to issue credentials on VeriCred`,
    html,
    text,
  };
}
