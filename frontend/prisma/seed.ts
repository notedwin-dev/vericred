/**
 * Seeds the Postgres database with an Admin user and one Issuer (Asia
 * Pacific University), for local development / demo login.
 *
 *   npx prisma db seed
 *
 * The wallet addresses used here are derived from the standard Hardhat
 * test private keys documented in CLAUDE.md (Account #0 / #1) — the same
 * accounts `scripts/deploy.js` sets up as admin/authorised-institution
 * on-chain, so signing in with either MetaMask account lands on the
 * matching DB user instead of creating a new one.
 *
 * Idempotent: if a user already exists with the target wallet address
 * (e.g. from a prior SIWE sign-in during testing) or email, that row is
 * promoted/updated in place rather than creating a duplicate. The
 * issuer's operator wallet (see lib/operator-wallet.ts) is generated once
 * and reused on subsequent runs, not regenerated.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { Wallet, JsonRpcProvider, parseEther, formatEther } from "ethers";
import { createOperatorWallet } from "@/lib/operator-wallet";
import { getSignerContract } from "@/lib/contract";
import { RPC_URL } from "@/lib/config";

const prisma = new PrismaClient();

const ADMIN_WALLET = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase(); // Hardhat Account #0
const ISSUER_WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8".toLowerCase(); // Hardhat Account #1
// Known only because it's a public Hardhat test key, not a real secret — a
// real institution funds its own operator wallet from its own connected
// wallet client-side; the platform never holds a real issuer's private key.
const ISSUER_PRIVATE_KEY_HARDHAT = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const ADMIN_EMAIL = "admin@vericred.local";
const ADMIN_PASSWORD = "Admin@12345";

const ISSUER_EMAIL = "issuer@apu.edu.my";
const ISSUER_PASSWORD = "Issuer@12345";

/**
 * Finds an existing user by wallet address first (a prior SIWE sign-in may
 * already have created a bare USER row for this wallet), falling back to
 * email, then updates or creates as appropriate.
 */
async function upsertUser(params: {
  wallet: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "ADMIN" | "ISSUER";
}) {
  const existing =
    (await prisma.user.findUnique({ where: { walletAddress: params.wallet } })) ??
    (await prisma.user.findUnique({ where: { email: params.email } }));

  const data = {
    name: params.name,
    email: params.email,
    passwordHash: params.passwordHash,
    walletAddress: params.wallet,
    role: params.role,
  };

  if (existing) {
    return prisma.user.update({ where: { id: existing.id }, data });
  }
  return prisma.user.create({ data });
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
  const issuerFunder = new Wallet(ISSUER_PRIVATE_KEY_HARDHAT, provider);

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
  const admin = await upsertUser({
    wallet: ADMIN_WALLET,
    email: ADMIN_EMAIL,
    name: "VeriCred Admin",
    passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
    role: "ADMIN",
  });

  const issuerUser = await upsertUser({
    wallet: ISSUER_WALLET,
    email: ISSUER_EMAIL,
    name: "Asia Pacific University Registry",
    passwordHash: await bcrypt.hash(ISSUER_PASSWORD, 12),
    role: "ISSUER",
  });

  let issuer = await prisma.issuer.upsert({
    where: { userId: issuerUser.id },
    update: { organizationName: "Asia Pacific University", walletAddress: ISSUER_WALLET },
    create: {
      userId: issuerUser.id,
      organizationName: "Asia Pacific University",
      walletAddress: ISSUER_WALLET,
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

  console.log("\nSeeded:");
  console.log(`  Admin  — ${admin.email} / ${ADMIN_PASSWORD}  (wallet ${ADMIN_WALLET})`);
  console.log(
    `  Issuer — ${issuerUser.email} / ${ISSUER_PASSWORD}  (wallet ${ISSUER_WALLET}) — ${issuer.organizationName}`
  );
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
