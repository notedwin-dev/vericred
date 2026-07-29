import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Shared query for a public profile page (`/u/[username]`) and its API
 * mirror (`/api/user/[username]`). Wrapped in React's `cache()` so a
 * request that hits both `generateMetadata` and the page component (the
 * common case for this route) only queries the database once.
 */
export const getPublicProfile = cache(async (username: string) => {
  return prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
      createdAt: true,
      certificates: {
        where: { status: { in: ["ACTIVE", "EXPIRED"] } },
        select: {
          id: true,
          credentialId: true,
          status: true,
          issuedAt: true,
          expiresAt: true,
          course: {
            select: {
              name: true,
              issuer: {
                select: { organizationName: true, logo: true },
              },
            },
          },
        },
        orderBy: { issuedAt: "desc" },
      },
    },
  });
});
