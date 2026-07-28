const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const CID_1 = "bafybeigdyrztx4kn7yqm3lvzu6a5zzzkq7lm2b3wq5nmxfnv6c7pqyd4ke";
const CID_2 = "bafybeihxwkqm2vlzcnq4d7rj6f3tzqk5s2mnbvcxza9wq8ytrfd6elhpu2";

describe("VeriCred", function () {
  async function deployFixture() {
    const [admin, registry, otherUni, employer, graduate, recipientA, recipientB] =
      await ethers.getSigners();
    const VeriCred = await ethers.getContractFactory("VeriCred");
    const vericred = await VeriCred.deploy();
    await vericred.waitForDeployment();
    await vericred.authoriseInstitution(registry.address);
    return { vericred, admin, registry, otherUni, employer, graduate, recipientA, recipientB };
  }

  // ───────────────────────────────────────────────
  describe("Deployment", function () {
    it("sets the deployer as admin", async function () {
      const { vericred, admin } = await loadFixture(deployFixture);
      expect(await vericred.admin()).to.equal(admin.address);
    });

    it("makes the deployer an authorised institution", async function () {
      const { vericred, admin } = await loadFixture(deployFixture);
      expect(await vericred.isInstitution(admin.address)).to.equal(true);
    });

    it("starts with no credentials", async function () {
      const { vericred } = await loadFixture(deployFixture);
      expect(await vericred.totalCredentials()).to.equal(0);
    });
  });

  // ───────────────────────────────────────────────
  describe("Access control", function () {
    it("lets the admin authorise an institution", async function () {
      const { vericred, otherUni } = await loadFixture(deployFixture);
      await expect(vericred.authoriseInstitution(otherUni.address))
        .to.emit(vericred, "InstitutionAuthorised");
      expect(await vericred.isInstitution(otherUni.address)).to.equal(true);
    });

    it("stops a non-admin authorising anyone", async function () {
      const { vericred, registry, otherUni } = await loadFixture(deployFixture);
      await expect(
        vericred.connect(registry).authoriseInstitution(otherUni.address)
      ).to.be.revertedWithCustomError(vericred, "NotAdmin");
    });

    it("rejects the zero address as an institution", async function () {
      const { vericred } = await loadFixture(deployFixture);
      await expect(
        vericred.authoriseInstitution(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vericred, "ZeroAddress");
    });

    it("transfers admin", async function () {
      const { vericred, registry } = await loadFixture(deployFixture);
      await vericred.transferAdmin(registry.address);
      expect(await vericred.admin()).to.equal(registry.address);
    });

    it("leaves already-issued credentials valid after an institution is removed", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      await vericred.removeInstitution(registry.address);

      // it can no longer issue...
      await expect(
        vericred.connect(registry).issueCredential("VC-2026-0002", CID_2, graduate.address, 0)
      ).to.be.revertedWithCustomError(vericred, "NotAuthorisedInstitution");

      // ...but the degree it already conferred still stands
      expect(await vericred.isValid("VC-2026-0001")).to.equal(true);
    });
  });

  // ───────────────────────────────────────────────
  describe("Issuing", function () {
    it("anchors a credential and emits the event", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      const idHash = ethers.keccak256(ethers.toUtf8Bytes("VC-2026-0001"));

      await expect(vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0))
        .to.emit(vericred, "CredentialIssued")
        .withArgs(idHash, registry.address, graduate.address, "VC-2026-0001", CID_1, anyUint(), 0);

      expect(await vericred.totalCredentials()).to.equal(1);
    });

    it("stores the CID exactly as given", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      const rec = await vericred.getCredential("VC-2026-0001");
      expect(rec.cid).to.equal(CID_1);
      expect(rec.issuer).to.equal(registry.address);
      expect(rec.revoked).to.equal(false);
      expect(rec.revokedAt).to.equal(0);
    });

    it("blocks an unauthorised wallet from issuing", async function () {
      const { vericred, graduate } = await loadFixture(deployFixture);
      await expect(
        vericred.connect(graduate).issueCredential("VC-2026-0001", CID_1, graduate.address, 0)
      ).to.be.revertedWithCustomError(vericred, "NotAuthorisedInstitution");
    });

    it("refuses a duplicate credential ID", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      await expect(
        vericred.connect(registry).issueCredential("VC-2026-0001", CID_2, graduate.address, 0)
      ).to.be.revertedWithCustomError(vericred, "CredentialAlreadyExists");
    });

    it("refuses a duplicate even from a different institution", async function () {
      const { vericred, registry, otherUni, graduate } = await loadFixture(deployFixture);
      await vericred.authoriseInstitution(otherUni.address);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      await expect(
        vericred.connect(otherUni).issueCredential("VC-2026-0001", CID_2, graduate.address, 0)
      ).to.be.revertedWithCustomError(vericred, "CredentialAlreadyExists");
    });

    it("rejects an empty credential ID", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await expect(
        vericred.connect(registry).issueCredential("", CID_1, graduate.address, 0)
      ).to.be.revertedWithCustomError(vericred, "EmptyCredentialId");
    });

    it("rejects an empty CID", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await expect(
        vericred.connect(registry).issueCredential("VC-2026-0001", "", graduate.address, 0)
      ).to.be.revertedWithCustomError(vericred, "EmptyCid");
    });
  });

  // ───────────────────────────────────────────────
  describe("Batch issuing", function () {
    it("anchors a whole cohort in one transaction", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      const ids = ["VC-2026-0001", "VC-2026-0002", "VC-2026-0003"];
      const cids = [CID_1, CID_2, CID_1];
      const recipients = Array(3).fill(graduate.address);
      const expiresAts = Array(3).fill(0);

      await vericred.connect(registry).issueCredentialBatch(ids, cids, recipients, expiresAts);
      expect(await vericred.totalCredentials()).to.equal(3);
      expect(await vericred.isValid("VC-2026-0002")).to.equal(true);
    });

    it("rejects mismatched array lengths", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await expect(
        vericred.connect(registry).issueCredentialBatch(
          ["A", "B"],
          [CID_1],
          [graduate.address, graduate.address],
          [0, 0]
        )
      ).to.be.revertedWithCustomError(vericred, "LengthMismatch");
    });

    it("reverts the whole batch if one entry is a duplicate", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0002", CID_1, graduate.address, 0);

      await expect(
        vericred.connect(registry).issueCredentialBatch(
          ["VC-2026-0001", "VC-2026-0002"],
          [CID_1, CID_2],
          [graduate.address, graduate.address],
          [0, 0]
        )
      ).to.be.revertedWithCustomError(vericred, "CredentialAlreadyExists");

      // atomic: nothing from the failed batch was written
      expect(await vericred.totalCredentials()).to.equal(1);
      expect(await vericred.isValid("VC-2026-0001")).to.equal(false);
    });

    it("costs less gas per credential than issuing one by one", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      const n = 5;
      const idsA = Array.from({ length: n }, (_, i) => `VC-2026-1${i}00`);
      const idsB = Array.from({ length: n }, (_, i) => `VC-2026-2${i}00`);
      const cids = Array(n).fill(CID_1);
      const recipients = Array(n).fill(graduate.address);
      const expiresAts = Array(n).fill(0);

      let single = 0n;
      for (let i = 0; i < n; i++) {
        const tx = await vericred.connect(registry).issueCredential(idsA[i], cids[i], graduate.address, 0);
        single += (await tx.wait()).gasUsed;
      }
      const txB = await vericred.connect(registry).issueCredentialBatch(idsB, cids, recipients, expiresAts);
      const batch = (await txB.wait()).gasUsed;

      console.log(`        individually: ${single} gas | batched: ${batch} gas ` +
                  `(saved ${single - batch}, ${(Number(single - batch) * 100 / Number(single)).toFixed(1)}%)`);
      expect(batch).to.be.lessThan(single);
    });
  });

  // ───────────────────────────────────────────────
  describe("Verifying", function () {
    it("confirms a genuine, unrevoked credential", async function () {
      const { vericred, registry, employer, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);

      const [exists, valid, cid, issuer, , recipient, expiresAt] =
        await vericred.connect(employer).verifyCredential("VC-2026-0001");

      expect(exists).to.equal(true);
      expect(valid).to.equal(true);
      expect(cid).to.equal(CID_1);
      expect(issuer).to.equal(registry.address);
      expect(recipient).to.equal(graduate.address);
      expect(expiresAt).to.equal(0);
    });

    it("returns exists=false for an identifier never anchored", async function () {
      const { vericred, employer } = await loadFixture(deployFixture);
      const [exists, valid, cid, issuer, issuedAt, recipient, expiresAt] =
        await vericred.connect(employer).verifyCredential("VC-2026-9999");

      expect(exists).to.equal(false);
      expect(valid).to.equal(false);
      expect(cid).to.equal("");
      expect(issuer).to.equal(ethers.ZeroAddress);
      expect(issuedAt).to.equal(0);
      expect(recipient).to.equal(ethers.ZeroAddress);
      expect(expiresAt).to.equal(0);
    });

    it("distinguishes 'never issued' from 'issued then revoked'", async function () {
      const { vericred, registry, employer, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0003", CID_1, graduate.address, 0);
      await vericred.connect(registry).revokeCredential("VC-2026-0003", "Issued in error");

      const forged = await vericred.connect(employer).verifyCredential("VC-2026-9999");
      const revoked = await vericred.connect(employer).verifyCredential("VC-2026-0003");

      // a forgery was never anchored at all
      expect(forged.exists).to.equal(false);
      // a revoked credential genuinely exists, but no longer stands
      expect(revoked.exists).to.equal(true);
      expect(revoked.valid).to.equal(false);
      expect(revoked.cid).to.equal(CID_1);
    });

    it("costs no gas — anyone can verify without a wallet balance", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);

      const stranger = ethers.Wallet.createRandom().connect(ethers.provider);
      expect(await ethers.provider.getBalance(stranger.address)).to.equal(0);

      const [exists, valid] = await vericred.connect(stranger).verifyCredential("VC-2026-0001");
      expect(exists).to.equal(true);
      expect(valid).to.equal(true);
    });

    it("reverts getCredential for an unknown identifier", async function () {
      const { vericred } = await loadFixture(deployFixture);
      await expect(
        vericred.getCredential("VC-2026-9999")
      ).to.be.revertedWithCustomError(vericred, "CredentialNotFound");
    });
  });

  // ───────────────────────────────────────────────
  describe("Revoking", function () {
    it("lets the issuing institution revoke, with a reason", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0003", CID_1, graduate.address, 0);

      await expect(
        vericred.connect(registry).revokeCredential("VC-2026-0003", "Duplicate record")
      ).to.emit(vericred, "CredentialRevoked");

      expect(await vericred.isValid("VC-2026-0003")).to.equal(false);
    });

    it("lets the admin revoke too", async function () {
      const { vericred, registry, admin, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0003", CID_1, graduate.address, 0);
      await vericred.connect(admin).revokeCredential("VC-2026-0003", "Court order");
      expect(await vericred.isValid("VC-2026-0003")).to.equal(false);
    });

    it("stops an unrelated institution revoking someone else's credential", async function () {
      const { vericred, registry, otherUni, graduate } = await loadFixture(deployFixture);
      await vericred.authoriseInstitution(otherUni.address);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);

      await expect(
        vericred.connect(otherUni).revokeCredential("VC-2026-0001", "Malicious")
      ).to.be.revertedWithCustomError(vericred, "NotIssuerOrAdmin");
    });

    it("stops a graduate revoking their own credential", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      await expect(
        vericred.connect(graduate).revokeCredential("VC-2026-0001", "I disagree")
      ).to.be.revertedWithCustomError(vericred, "NotIssuerOrAdmin");
    });

    it("requires a reason", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      await expect(
        vericred.connect(registry).revokeCredential("VC-2026-0001", "")
      ).to.be.revertedWithCustomError(vericred, "EmptyReason");
    });

    it("refuses to revoke twice", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      await vericred.connect(registry).revokeCredential("VC-2026-0001", "First");
      await expect(
        vericred.connect(registry).revokeCredential("VC-2026-0001", "Second")
      ).to.be.revertedWithCustomError(vericred, "CredentialAlreadyRevoked");
    });

    it("refuses to revoke something never issued", async function () {
      const { vericred, registry } = await loadFixture(deployFixture);
      await expect(
        vericred.connect(registry).revokeCredential("VC-2026-9999", "Nope")
      ).to.be.revertedWithCustomError(vericred, "CredentialNotFound");
    });

    it("PRESERVES the record — revocation appends, never deletes", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0003", CID_1, graduate.address, 0);
      const before = await vericred.getCredential("VC-2026-0003");

      await vericred.connect(registry).revokeCredential("VC-2026-0003", "Issued in error");
      const after = await vericred.getCredential("VC-2026-0003");

      // everything about the original issuance survives untouched
      expect(after.cid).to.equal(before.cid);
      expect(after.issuer).to.equal(before.issuer);
      expect(after.issuedAt).to.equal(before.issuedAt);
      expect(after.credentialId).to.equal(before.credentialId);
      // only the status is added on top
      expect(after.revoked).to.equal(true);
      expect(after.revocationReason).to.equal("Issued in error");
      expect(after.revokedAt).to.be.greaterThan(0);
      // and it still counts in the registry
      expect(await vericred.totalCredentials()).to.equal(1);
    });

    it("keeps the original CredentialIssued event on the chain after revocation", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0003", CID_1, graduate.address, 0);
      await vericred.connect(registry).revokeCredential("VC-2026-0003", "Issued in error");

      const issued = await vericred.queryFilter(vericred.filters.CredentialIssued());
      const revoked = await vericred.queryFilter(vericred.filters.CredentialRevoked());

      expect(issued).to.have.lengthOf(1);
      expect(revoked).to.have.lengthOf(1);
      // both remain permanently readable — the full history of the award
      expect(issued[0].args.cid).to.equal(CID_1);
      expect(revoked[0].args.reason).to.equal("Issued in error");
    });
  });

  // ───────────────────────────────────────────────
  describe("Tamper detection", function () {
    it("an altered certificate produces a CID that does not match the anchor", async function () {
      const { vericred, registry, employer, graduate } = await loadFixture(deployFixture);

      // Registry anchors the CID of the genuine encrypted file
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);

      // Employer is handed a file that was edited after issuance; because a CID
      // is a hash of the file's own bytes, it now derives a different CID.
      const recomputedFromTamperedFile = CID_2;

      const [, , anchoredCid] = await vericred.connect(employer).verifyCredential("VC-2026-0001");
      expect(recomputedFromTamperedFile).to.not.equal(anchoredCid);

      // The genuine file still matches
      expect(CID_1).to.equal(anchoredCid);
    });

    it("nobody can overwrite an anchored CID — not even the issuer", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);

      // there is no setter, and re-issuing is rejected
      await expect(
        vericred.connect(registry).issueCredential("VC-2026-0001", CID_2, graduate.address, 0)
      ).to.be.revertedWithCustomError(vericred, "CredentialAlreadyExists");

      const rec = await vericred.getCredential("VC-2026-0001");
      expect(rec.cid).to.equal(CID_1);
    });
  });

  // ───────────────────────────────────────────────
  describe("Enumeration", function () {
    it("pages through credentials", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      const ids = Array.from({ length: 7 }, (_, i) => `VC-2026-000${i + 1}`);
      await vericred.connect(registry).issueCredentialBatch(
        ids, Array(7).fill(CID_1), Array(7).fill(graduate.address), Array(7).fill(0)
      );

      const page1 = await vericred.getCredentialsPaged(0, 3);
      const page2 = await vericred.getCredentialsPaged(3, 3);
      const page3 = await vericred.getCredentialsPaged(6, 3);

      expect(page1).to.have.lengthOf(3);
      expect(page2).to.have.lengthOf(3);
      expect(page3).to.have.lengthOf(1); // clamped to the end
      expect(page1[0].credentialId).to.equal("VC-2026-0001");
      expect(page3[0].credentialId).to.equal("VC-2026-0007");
    });

    it("returns an empty page past the end", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      expect(await vericred.getCredentialsPaged(50, 10)).to.have.lengthOf(0);
    });
  });

  // ───────────────────────────────────────────────
  describe("Expiry", function () {
    it("is valid before the expiry date", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      const future = (await time.latest()) + 3600;
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, future);
      expect(await vericred.isValid("VC-2026-0001")).to.equal(true);

      const [, valid] = await vericred.verifyCredential("VC-2026-0001");
      expect(valid).to.equal(true);
    });

    it("becomes invalid once the expiry date passes", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      const future = (await time.latest()) + 3600;
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, future);

      await time.increase(3601);

      expect(await vericred.isValid("VC-2026-0001")).to.equal(false);
      const [exists, valid] = await vericred.verifyCredential("VC-2026-0001");
      expect(exists).to.equal(true);
      expect(valid).to.equal(false);
    });

    it("expiresAt=0 means it never expires", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);

      await time.increase(365 * 24 * 60 * 60 * 50); // 50 years

      expect(await vericred.isValid("VC-2026-0001")).to.equal(true);
    });

    it("rejects an expiry date in the past", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      const past = (await time.latest()) - 3600;
      await expect(
        vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, past)
      ).to.be.revertedWithCustomError(vericred, "InvalidExpiryDate");
    });

    it("isValid returns false for an expired credential", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      const future = (await time.latest()) + 100;
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, future);
      await time.increase(200);
      expect(await vericred.isValid("VC-2026-0001")).to.equal(false);
    });

    it("an expired credential can still be revoked", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      const future = (await time.latest()) + 100;
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, future);
      await time.increase(200);

      await expect(
        vericred.connect(registry).revokeCredential("VC-2026-0001", "Expired but formally revoked")
      ).to.emit(vericred, "CredentialRevoked");

      const rec = await vericred.getCredential("VC-2026-0001");
      expect(rec.revoked).to.equal(true);
    });

    it("getCredential returns the full record for an expired credential", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      const future = (await time.latest()) + 100;
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, future);
      await time.increase(200);

      const rec = await vericred.getCredential("VC-2026-0001");
      expect(rec.cid).to.equal(CID_1);
      expect(rec.expiresAt).to.equal(future);
      expect(rec.revoked).to.equal(false);
    });
  });

  // ───────────────────────────────────────────────
  describe("Recipient tracking", function () {
    it("rejects the zero address as a recipient", async function () {
      const { vericred, registry } = await loadFixture(deployFixture);
      await expect(
        vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, ethers.ZeroAddress, 0)
      ).to.be.revertedWithCustomError(vericred, "ZeroRecipient");
    });

    it("getCredential returns the correct recipient", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      const rec = await vericred.getCredential("VC-2026-0001");
      expect(rec.recipient).to.equal(graduate.address);
    });

    it("verifyCredential returns the correct recipient and expiresAt", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      const future = (await time.latest()) + 3600;
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, future);
      const [, , , , , recipient, expiresAt] = await vericred.verifyCredential("VC-2026-0001");
      expect(recipient).to.equal(graduate.address);
      expect(expiresAt).to.equal(future);
    });

    it("recipientCredentialCount returns the correct count", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      expect(await vericred.recipientCredentialCount(graduate.address)).to.equal(0);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      await vericred.connect(registry).issueCredential("VC-2026-0002", CID_2, graduate.address, 0);
      expect(await vericred.recipientCredentialCount(graduate.address)).to.equal(2);
    });

    it("getCredentialsByRecipient returns the correct results", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      await vericred.connect(registry).issueCredential("VC-2026-0002", CID_2, graduate.address, 0);

      const page = await vericred.getCredentialsByRecipient(graduate.address, 0, 10);
      expect(page).to.have.lengthOf(2);
      expect(page[0].credentialId).to.equal("VC-2026-0001");
      expect(page[1].credentialId).to.equal("VC-2026-0002");
    });

    it("getCredentialsByRecipient returns an empty page for an unknown address", async function () {
      const { vericred, employer } = await loadFixture(deployFixture);
      const page = await vericred.getCredentialsByRecipient(employer.address, 0, 10);
      expect(page).to.have.lengthOf(0);
    });

    it("tracks multiple credentials for the same recipient across separate issuances", async function () {
      const { vericred, registry, otherUni, graduate } = await loadFixture(deployFixture);
      await vericred.authoriseInstitution(otherUni.address);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      await vericred.connect(otherUni).issueCredential("VC-2026-0002", CID_2, graduate.address, 0);

      expect(await vericred.recipientCredentialCount(graduate.address)).to.equal(2);
      const page = await vericred.getCredentialsByRecipient(graduate.address, 0, 10);
      const ids = page.map((c) => c.credentialId);
      expect(ids).to.include.members(["VC-2026-0001", "VC-2026-0002"]);
    });
  });

  // ───────────────────────────────────────────────
  describe("Transferring", function () {
    it("lets the recipient transfer their own credential", async function () {
      const { vericred, registry, graduate, recipientA } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      const idHash = ethers.keccak256(ethers.toUtf8Bytes("VC-2026-0001"));

      await expect(
        vericred.connect(graduate).transferCredential("VC-2026-0001", recipientA.address)
      )
        .to.emit(vericred, "CredentialTransferred")
        .withArgs(idHash, graduate.address, recipientA.address, "VC-2026-0001");
    });

    it("lets the admin transfer any credential", async function () {
      const { vericred, registry, admin, graduate, recipientA } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);

      await expect(
        vericred.connect(admin).transferCredential("VC-2026-0001", recipientA.address)
      ).to.emit(vericred, "CredentialTransferred");

      const rec = await vericred.getCredential("VC-2026-0001");
      expect(rec.recipient).to.equal(recipientA.address);
    });

    it("stops a non-recipient, non-admin from transferring", async function () {
      const { vericred, registry, graduate, employer, recipientA } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);

      await expect(
        vericred.connect(employer).transferCredential("VC-2026-0001", recipientA.address)
      ).to.be.revertedWithCustomError(vericred, "NotRecipientOrAdmin");
    });

    it("rejects transferring to the zero address", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);

      await expect(
        vericred.connect(graduate).transferCredential("VC-2026-0001", ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vericred, "ZeroAddress");
    });

    it("rejects a self-transfer", async function () {
      const { vericred, registry, graduate } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);

      await expect(
        vericred.connect(graduate).transferCredential("VC-2026-0001", graduate.address)
      ).to.be.revertedWithCustomError(vericred, "SelfTransfer");
    });

    it("reverts transferring a credential that was never issued", async function () {
      const { vericred, graduate, recipientA } = await loadFixture(deployFixture);
      await expect(
        vericred.connect(graduate).transferCredential("VC-2026-9999", recipientA.address)
      ).to.be.revertedWithCustomError(vericred, "CredentialNotFound");
    });

    it("removes the credential from the old recipient's list after transfer", async function () {
      const { vericred, registry, graduate, recipientA } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      await vericred.connect(graduate).transferCredential("VC-2026-0001", recipientA.address);

      expect(await vericred.recipientCredentialCount(graduate.address)).to.equal(0);
      const page = await vericred.getCredentialsByRecipient(graduate.address, 0, 10);
      expect(page).to.have.lengthOf(0);
    });

    it("adds the credential to the new recipient's list after transfer", async function () {
      const { vericred, registry, graduate, recipientA } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      await vericred.connect(graduate).transferCredential("VC-2026-0001", recipientA.address);

      expect(await vericred.recipientCredentialCount(recipientA.address)).to.equal(1);
      const page = await vericred.getCredentialsByRecipient(recipientA.address, 0, 10);
      expect(page).to.have.lengthOf(1);
      expect(page[0].credentialId).to.equal("VC-2026-0001");
    });

    it("shows the new recipient via getCredential after transfer", async function () {
      const { vericred, registry, graduate, recipientA } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      await vericred.connect(graduate).transferCredential("VC-2026-0001", recipientA.address);

      const rec = await vericred.getCredential("VC-2026-0001");
      expect(rec.recipient).to.equal(recipientA.address);
    });

    it("allows transferring a revoked credential", async function () {
      const { vericred, registry, graduate, recipientA } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);
      await vericred.connect(registry).revokeCredential("VC-2026-0001", "Issued in error");

      await expect(
        vericred.connect(graduate).transferCredential("VC-2026-0001", recipientA.address)
      ).to.emit(vericred, "CredentialTransferred");

      const rec = await vericred.getCredential("VC-2026-0001");
      expect(rec.recipient).to.equal(recipientA.address);
      expect(rec.revoked).to.equal(true);
    });

    it("allows transferring an expired credential", async function () {
      const { vericred, registry, graduate, recipientA } = await loadFixture(deployFixture);
      const future = (await time.latest()) + 100;
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, future);
      await time.increase(200);

      await expect(
        vericred.connect(graduate).transferCredential("VC-2026-0001", recipientA.address)
      ).to.emit(vericred, "CredentialTransferred");

      const rec = await vericred.getCredential("VC-2026-0001");
      expect(rec.recipient).to.equal(recipientA.address);
    });

    it("chain-transfers A to B to C, leaving only C holding it", async function () {
      const { vericred, registry, graduate, recipientA, recipientB } = await loadFixture(deployFixture);
      await vericred.connect(registry).issueCredential("VC-2026-0001", CID_1, graduate.address, 0);

      await vericred.connect(graduate).transferCredential("VC-2026-0001", recipientA.address);
      await vericred.connect(recipientA).transferCredential("VC-2026-0001", recipientB.address);

      expect(await vericred.recipientCredentialCount(graduate.address)).to.equal(0);
      expect(await vericred.recipientCredentialCount(recipientA.address)).to.equal(0);
      expect(await vericred.recipientCredentialCount(recipientB.address)).to.equal(1);

      const rec = await vericred.getCredential("VC-2026-0001");
      expect(rec.recipient).to.equal(recipientB.address);
    });
  });
});

// helper: match any uint (timestamps vary per run)
function anyUint() {
  const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
  return anyValue;
}
