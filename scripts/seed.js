/**
 * Seeds the deployed contract with the same four records the UI prototype
 * shows, so the demo has data the moment it loads.
 *
 *   npx hardhat run scripts/seed.js --network localhost
 *
 * Note: the CIDs below stand in for real IPFS pins. In the full system the
 * backend encrypts the certificate PDF, pins it, and anchors whatever CID
 * IPFS returns.
 */
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const RECORDS = [
  { id: "VC-2026-0001", cid: "bafybeigdyrztx4kn7yqm3lvzu6a5zzzkq7lm2b3wq5nmxfnv6c7pqyd4ke" },
  { id: "VC-2026-0002", cid: "bafybeihxwkqm2vlzcnq4d7rj6f3tzqk5s2mnbvcxza9wq8ytrfd6elhpu2" },
  { id: "VC-2026-0003", cid: "bafybeic6mfzrqnl4tdxk7wvj2yphae5s8bqgu3mzxrvd9nkt4c2yeohlwq" },
  { id: "VC-2026-0004", cid: "bafybeif2ktvzy7ldqxmnw3jr8gpc5aehs6bt9xuk4odzmvqny8rl3wsjce" },
];

// VC-2026-0003 is revoked, to demonstrate that a genuine document and a
// currently-valid award are two different things.
const REVOKE = { id: "VC-2026-0003", reason: "Issued in error - duplicate record" };

async function main() {
  const cfgPath = path.join(__dirname, "..", "frontend-config", "contract.json");
  if (!fs.existsSync(cfgPath)) {
    throw new Error("Run scripts/deploy.js first - frontend-config/contract.json is missing.");
  }
  const { address } = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

  const signers = await ethers.getSigners();
  const registry = signers[1] ?? signers[0];
  const vericred = await ethers.getContractAt("VeriCred", address, registry);

  console.log("Contract:", address);
  console.log("Issuing as registry:", registry.address, "\n");

  // Recipients: each record goes to a distinct graduate wallet.
  const recipients = [signers[2], signers[3], signers[4], signers[5]].map(
    (s) => (s ?? signers[0]).address
  );
  // Most credentials never expire; one is issued with a one-year expiry to
  // demonstrate the feature in the demo.
  const oneYearFromNow = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
  const expiresAts = [0, 0, 0, oneYearFromNow];

  const tx = await vericred.issueCredentialBatch(
    RECORDS.map((r) => r.id),
    RECORDS.map((r) => r.cid),
    recipients,
    expiresAts
  );
  const receipt = await tx.wait();
  console.log(`Anchored ${RECORDS.length} credentials in one tx - ${receipt.gasUsed} gas`);

  const rtx = await vericred.revokeCredential(REVOKE.id, REVOKE.reason);
  await rtx.wait();
  console.log(`Revoked ${REVOKE.id} - "${REVOKE.reason}"\n`);

  console.log("Ledger state");
  console.log("------------");
  const total = await vericred.totalCredentials();
  const page = await vericred.getCredentialsPaged(0, total);
  for (const c of page) {
    console.log(
      `  ${c.credentialId}  ${c.revoked ? "REVOKED" : "VALID  "}  ${c.cid.slice(0, 18)}...`
    );
  }
  console.log(`\nTotal: ${total} credentials (revoked records are retained, never deleted)`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
