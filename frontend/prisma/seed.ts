/**
 * Seeds the Postgres database with an Admin user and one Issuer (Asia
 * Pacific University), for local development / demo login.
 *
 *   npx prisma db seed
 *
 * Both are email/password accounts only — deliberately **not** tied to a
 * login wallet. An earlier version of this script matched existing users
 * by wallet address and would silently overwrite whichever account it
 * found (including a real tester's own SIWE-created account) with the
 * seed identity and an elevated role. Matching by wallet also meant that
 * later signing in with the same wallet (e.g. Hardhat's well-known
 * Account #0/#1 — exactly what a developer would naturally use to test
 * "regular user connects a wallet") landed on the seeded admin/issuer
 * identity instead of a fresh account. Matching *only* by this script's
 * own dedicated email avoids both: it only ever touches the one row it's
 * responsible for, never a pre-existing account, and never claims a
 * wallet a real sign-in could collide with.
 *
 * Idempotent: safe to re-run, updates the same email-matched row rather
 * than creating a duplicate. The issuer's operator wallet (see
 * lib/operator-wallet.ts) is generated once and reused, not regenerated.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { Wallet, JsonRpcProvider, parseEther, formatEther } from "ethers";
import { createOperatorWallet } from "@/lib/operator-wallet";
import { getSignerContract } from "@/lib/contract";
import { RPC_URL } from "@/lib/config";

const prisma = new PrismaClient();

// The Issuer's *organisation* on-chain identity (Issuer.walletAddress) —
// distinct from any User's login wallet. This is what gets authorised as
// an institution and shown as `issuer` on anchored credentials.
const ISSUER_ORG_WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8".toLowerCase(); // Hardhat Account #1
// Known only because it's a public Hardhat test key, not a real secret — a
// real institution funds its own operator wallet from its own connected
// wallet client-side; the platform never holds a real issuer's private key.
const ISSUER_FUNDING_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const ADMIN_EMAIL = "admin@vericred.local";
const ADMIN_PASSWORD = "Admin@12345";

const ISSUER_EMAIL = "issuer@apu.edu.my";
const ISSUER_PASSWORD = "Issuer@12345";

/** Matches strictly by this script's own dedicated email — never by wallet, never a pre-existing account it didn't create. */
async function upsertSeedUser(params: {
  email: string;
  name: string;
  passwordHash: string;
  role: "ADMIN" | "ISSUER";
}) {
  const existing = await prisma.user.findUnique({ where: { email: params.email } });
  // Login is blocked until `emailVerified` is set (see lib/auth-credentials.ts,
  // docs/prds/institution-registration-prd.md Decision 5). These two addresses are
  // provisioned by this script rather than claimed by a real person, so
  // there's nothing to prove — without this, the demo accounts documented in
  // CLAUDE.md could never sign in.
  const data = {
    name: params.name,
    passwordHash: params.passwordHash,
    role: params.role,
    emailVerified: existing?.emailVerified ?? new Date(),
  };

  if (existing) {
    return prisma.user.update({ where: { id: existing.id }, data });
  }
  return prisma.user.create({ data: { ...data, email: params.email } });
}

const OPERATOR_FUNDING_AMOUNT = parseEther("1.0");
const OPERATOR_FUNDING_THRESHOLD = parseEther("0.1"); // top up if balance drops below this

/**
 * Best-effort: funds `operatorAddress` with test ETH from the *issuer's own*
 * wallet — not admin's. In a real onboarding flow, this is exactly what an
 * institution would do: send gas money from their own wallet to the
 * operator address the platform generated for them. Here it's the known
 * Hardhat Account #1 test key standing in for "the issuer's wallet," since
 * this is seed data for a single demo institution — never do this with a
 * real user's private key, which the platform never has.
 *
 * Warns rather than throwing if no local node is reachable — this is a
 * one-time setup step the operator wallet can't pay gas without, but it
 * shouldn't block the rest of seeding.
 */
async function tryFundOperatorWallet(operatorAddress: string) {
  const provider = new JsonRpcProvider(RPC_URL);
  const issuerFunder = new Wallet(ISSUER_FUNDING_PRIVATE_KEY, provider);

  try {
    const balance = await provider.getBalance(operatorAddress);
    if (balance < OPERATOR_FUNDING_THRESHOLD) {
      const fundTx = await issuerFunder.sendTransaction({ to: operatorAddress, value: OPERATOR_FUNDING_AMOUNT });
      await fundTx.wait();
      console.log(`  ✓ Funded operator wallet with ${formatEther(OPERATOR_FUNDING_AMOUNT)} ETH from the issuer's own wallet`);
    }
  } catch (error) {
    console.warn(
      `  ⚠ Could not fund ${operatorAddress} from the issuer's wallet (is a local node running?): ` +
        (error instanceof Error ? error.message : String(error))
    );
  }
}

/**
 * Best-effort: authorises `operatorAddress` as an institution on-chain
 * using ADMIN_PRIVATE_KEY. Unlike funding, this genuinely has to be admin —
 * `authoriseInstitution` is `onlyAdmin` on the contract, no way around it.
 * Warns rather than throwing if the contract isn't deployed yet or no
 * local node is reachable.
 */
async function tryAuthoriseOperatorOnChain(operatorAddress: string) {
  const privateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!privateKey) {
    console.warn(
      "  ⚠ ADMIN_PRIVATE_KEY not set — skipping on-chain authorisation. " +
        `Run authoriseInstitution("${operatorAddress}") from the admin wallet once it's available.`
    );
    return;
  }
  try {
    const admin = new Wallet(privateKey, new JsonRpcProvider(RPC_URL));
    const contract = getSignerContract(admin);
    const tx = await contract.authoriseInstitution(operatorAddress);
    await tx.wait();
    console.log(`  ✓ Authorised operator wallet on-chain: ${operatorAddress}`);
  } catch (error) {
    console.warn(
      `  ⚠ Could not authorise ${operatorAddress} on-chain (is the contract deployed?): ` +
        (error instanceof Error ? error.message : String(error))
    );
  }
}

async function main() {
  const admin = await upsertSeedUser({
    email: ADMIN_EMAIL,
    name: "VeriCred Admin",
    passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
    role: "ADMIN",
  });

  const issuerUser = await upsertSeedUser({
    email: ISSUER_EMAIL,
    name: "Asia Pacific University Registry",
    passwordHash: await bcrypt.hash(ISSUER_PASSWORD, 12),
    role: "ISSUER",
  });

  let issuer = await prisma.issuer.upsert({
    where: { userId: issuerUser.id },
    update: { organizationName: "Asia Pacific University", walletAddress: ISSUER_ORG_WALLET },
    create: {
      userId: issuerUser.id,
      organizationName: "Asia Pacific University",
      walletAddress: ISSUER_ORG_WALLET,
    },
    select: {
      id: true,
      userId: true,
      organizationName: true,
      logo: true,
      walletAddress: true,
      operatorAddress: true,
      operatorKeyEnc: true,
      createdAt: true,
    },
  });

  if (!issuer.operatorAddress) {
    if (!process.env.ENCRYPTION_KEY) {
      console.warn(
        "  ⚠ ENCRYPTION_KEY not set — skipping operator wallet provisioning. " +
          "Certificates for this issuer will stay PENDING when anchored without an issuer browser present " +
          "(collection-link claims, later wallet links) until ENCRYPTION_KEY is set and the seed is re-run."
      );
    } else {
      const { address, operatorKeyEnc } = createOperatorWallet();
      issuer = await prisma.issuer.update({
        where: { id: issuer.id },
        data: { operatorAddress: address, operatorKeyEnc },
      });
      console.log(`  Generated operator wallet: ${address}`);
    }
  }

  // Re-checked on every run (cheap, idempotent) — tops up gas and
  // re-authorises in case a previous run's node/contract wasn't up yet.
  if (issuer.operatorAddress) {
    await tryFundOperatorWallet(issuer.operatorAddress);
    await tryAuthoriseOperatorOnChain(issuer.operatorAddress);
  }

  console.log("\nSeeded (email/password only — neither account has a login wallet):");
  console.log(`  Admin  — ${admin.email} / ${ADMIN_PASSWORD}`);
  console.log(`  Issuer — ${issuerUser.email} / ${ISSUER_PASSWORD} — ${issuer.organizationName}`);
  console.log(`  Issuer org wallet (on-chain identity, not a login method) — ${issuer.walletAddress}`);
  if (issuer.operatorAddress) {
    console.log(`  Issuer operator wallet — ${issuer.operatorAddress}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
