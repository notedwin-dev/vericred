import { execSync } from "child_process";
import { Client } from "pg";
import dotenv from "dotenv";

/**
 * Runs once, in a separate process, before any test file. Creates the
 * `vericred_test` database if it doesn't exist yet and applies migrations
 * to it, so `npm run test` never has to touch the dev database.
 */
export default async function globalSetup() {
  const { parsed } = dotenv.config({ path: ".env.test" });
  const testUrl = parsed?.DATABASE_URL;
  if (!testUrl) {
    throw new Error(".env.test is missing DATABASE_URL");
  }

  const url = new URL(testUrl);

  const allowedHosts = ["localhost", "127.0.0.1", "::1", "postgres", "db"];
  if (!allowedHosts.includes(url.hostname)) {
    throw new Error(
      `Refusing to run tests against remote database host "${url.hostname}". Only local PostgreSQL hosts are allowed: ${allowedHosts.join(", ")}`
    );
  }

  const dbName = url.pathname.replace(/^\//, "");
  if (!dbName || dbName === "postgres") {
    throw new Error(
      `Refusing to run tests against database "${dbName}" — .env.test's DATABASE_URL must point at a dedicated test database.`
    );
  }

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${dbName}"`);
    console.log(`[test-db] created database "${dbName}"`);
  } catch (error) {
    if ((error as { code?: string }).code !== "42P04") {
      // 42P04 = duplicate_database, i.e. it already exists — fine.
      throw error;
    }
  } finally {
    await admin.end();
  }

  execSync("npx prisma migrate deploy", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
  });
}
