import { beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

// Order matters: children before parents, to satisfy FK constraints without
// needing CASCADE (keeps this honest about what references what).
const TABLES_IN_DELETE_ORDER = [
  "CertificateShare",
  "CollectionLink",
  "Certificate",
  "Course",
  "CertificateTemplate",
  "Issuer",
  "VerificationToken",
  "Session",
  "Account",
  "User",
];

beforeEach(async () => {
  for (const table of TABLES_IN_DELETE_ORDER) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
