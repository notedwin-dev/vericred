import { prisma } from "@/lib/prisma";

export type ShareRejection = "not-found" | "revoked" | "expired";

/**
 * Resolves a share token to the certificate it grants access to.
 *
 * Sharing is a *database grant*, not a key hand-off. The content key never
 * leaves the server, so a share can be withdrawn and genuinely stops working —
 * unlike the alternative of putting the raw key in a URL, which cannot be
 * revoked once sent and leaks into browser history. This deviates from the
 * proposal's "the graduate is issued the key to unwrap the certificate"; see
 * docs/prds/encrypted-certificates.md (D3) for why the deviation is the stronger
 * design and why the write-up should say so rather than claim otherwise.
 */
export async function resolveShareToken(token: string) {
  const share = await prisma.certificateShare.findUnique({
    where: { token },
    include: {
      certificate: {
        omit: { encKeyEnc: false },
        include: { course: { include: { issuer: true, template: true } } },
      },
    },
  });

  if (!share) return { ok: false as const, reason: "not-found" as ShareRejection };
  if (share.revokedAt) return { ok: false as const, reason: "revoked" as ShareRejection };
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    return { ok: false as const, reason: "expired" as ShareRejection };
  }

  return { ok: true as const, share };
}

/**
 * Whether this session may create or withdraw shares for a certificate.
 * The holder decides who sees their own document; admins can act on their
 * behalf. The issuer deliberately cannot — they authored the certificate, but
 * onward disclosure is the recipient's call.
 */
export function canManageShares(
  certificate: { recipientId: string | null },
  session: { user: { id: string; role: string } }
): boolean {
  return session.user.role === "ADMIN" || certificate.recipientId === session.user.id;
}
