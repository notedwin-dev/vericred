/**
 * Deploys VeriCred to the local Hardhat node and writes the address + ABI
 * where the Next.js frontend can pick them up.
 *
 *   npx hardhat node                                  (terminal 1)
 *   npx hardhat run scripts/deploy.js --network localhost   (terminal 2)
 */
const { ethers, artifacts, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("Network :", network.name, `(chainId ${network.config.chainId})`);
  console.log("Deployer:", deployer.address);
  console.log("Balance :", ethers.formatEther(balance), "ETH\n");

  const VeriCred = await ethers.getContractFactory("VeriCred");
  const vericred = await VeriCred.deploy();
  await vericred.waitForDeployment();

  const address = await vericred.getAddress();
  const receipt = await vericred.deploymentTransaction().wait();

  console.log("VeriCred deployed to:", address);
  console.log("Gas used            :", receipt.gasUsed.toString());
  console.log("Admin               :", await vericred.admin());

  // Authorise a second signer as the Academic Registry, so the demo has a
  // distinct issuer wallet rather than everything running from the admin.
  const signers = await ethers.getSigners();
  if (signers[1]) {
    await (await vericred.authoriseInstitution(signers[1].address)).wait();
    console.log("Registry authorised :", signers[1].address);
  }

  // ── Export address + ABI for the frontend ──────────────────────
  const { abi } = await artifacts.readArtifact("VeriCred");
  const outDir = path.join(__dirname, "..", "frontend-config");
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, "contract.json"),
    JSON.stringify(
      { address, chainId: network.config.chainId, deployedAt: new Date().toISOString(), abi },
      null,
      2
    )
  );

  // Convenience .env.local for Next.js
  fs.writeFileSync(
    path.join(outDir, ".env.local"),
    `NEXT_PUBLIC_CONTRACT_ADDRESS=${address}\n` +
    `NEXT_PUBLIC_CHAIN_ID=${network.config.chainId}\n` +
    `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545\n`
  );

  console.log("\nWrote frontend-config/contract.json and .env.local");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
