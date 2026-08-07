import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * `encKeyEnc` is omitted globally rather than per query.
 *
 * Every issuance route ends in `NextResponse.json({ certificate })` on a full
 * Prisma row, across eight call sites — so without this, the wrapped content
 * key for a certificate would be serialised straight into an API response, and
 * any new route would silently inherit the same bug. Omitting it at the client
 * means a route has to opt *in* to see it, which is the safe direction.
 *
 * The one place that legitimately needs it (lib/certificate-document.ts, which
 * decrypts the artifact for its holder) re-enables it explicitly with
 * `omit: { certificate: { encKeyEnc: false } }` on that single query.
 */
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    omit: { certificate: { encKeyEnc: true } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
