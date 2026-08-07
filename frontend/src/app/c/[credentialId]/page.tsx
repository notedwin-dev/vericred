"use client";

import Link from "next/link";
import { use } from "react";
import {
  ShieldCheck,
  Loader2,
  ArrowLeft,
  Blocks,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/credentials/status-badge";
import { CredentialQr } from "@/components/credentials/credential-qr";
import { CertificatePreview } from "@/components/credentials/certificate-preview";
import { IntegrityBadge } from "@/components/credentials/integrity-badge";
import { LinkedInIcon } from "@/components/icons/brand-icons";
import { PublicAuthAction } from "@/components/layout/public-auth-action";
import { useCredential } from "@/hooks/use-credential";
import { formatAddress, formatTimestamp } from "@/lib/utils";
import { CONTRACT_ADDRESS, getExplorerTxUrl } from "@/lib/config";

export default function PublicCredentialPage({
  params,
}: {
  params: Promise<{ credentialId: string }>;
}) {
  const { credentialId } = use(params);
  const decodedId = decodeURIComponent(credentialId);
  const { result, isLoading, error } = useCredential(decodedId);

  const verifyUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/verify/${encodeURIComponent(decodedId)}`
      : `/verify/${encodeURIComponent(decodedId)}`;

  const explorerUrl = result?.txHash ? getExplorerTxUrl(result.txHash) : null;

  const linkedInUrl = result?.certificate
    ? `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
        result.certificate.course.name
      )}&organizationName=${encodeURIComponent(
        result.certificate.issuer.organizationName
      )}&certUrl=${encodeURIComponent(verifyUrl)}&certId=${encodeURIComponent(decodedId)}`
    : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5" />
          VeriCred
        </Link>
        <PublicAuthAction />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10 sm:px-10">
        <Link
          href="/verify"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Verify another credential
        </Link>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading credential...
          </div>
        )}

        {error && !isLoading && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}

        {!isLoading && result && !result.exists && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
              <h1 className="text-xl font-semibold">Credential not found</h1>
              <p className="text-sm text-muted-foreground">
                No credential exists on-chain with ID{" "}
                <span className="font-mono">{decodedId}</span>.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && result?.exists && (
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-primary/10 via-transparent to-transparent px-6 py-8 sm:px-10">
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  {result.certificate ? (
                    <>
                      <p className="text-sm font-medium text-muted-foreground">
                        {result.certificate.issuer.organizationName}
                      </p>
                      <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                        {result.certificate.course.name}
                      </h1>
                      <p className="mt-1 text-muted-foreground">
                        Awarded to {result.certificate.recipientName}
                      </p>
                    </>
                  ) : (
                    <h1 className="text-2xl font-bold tracking-tight">{decodedId}</h1>
                  )}
                </div>
                {result.certificate && <StatusBadge status={result.certificate.status} />}
              </div>
            </div>

            <CardContent className="flex flex-col gap-6 px-6 pb-8 sm:px-10">
              <Separator />

              <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Credential ID</dt>
                    <dd className="font-mono text-sm">{result.credentialId}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Issued</dt>
                    <dd className="text-sm">{formatTimestamp(result.issuedAt)}</dd>
                  </div>
                  {result.certificate?.expiresAt && (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Expires</dt>
                      <dd className="text-sm">{formatTimestamp(result.certificate.expiresAt)}</dd>
                    </div>
                  )}
                  {result.certificate?.revocationReason && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-medium text-muted-foreground">
                        Revocation Reason
                      </dt>
                      <dd className="text-sm">{result.certificate.revocationReason}</dd>
                    </div>
                  )}
                </dl>

                <div className="flex flex-col items-center gap-2">
                  <CredentialQr value={verifyUrl} size={128} />
                  <span className="text-xs text-muted-foreground">Scan to verify</span>
                </div>
              </div>

              {/* Gated on the record existing, not on a CID: the preview is
                  rendered from Postgres, so it works for a credential that has
                  been issued but not yet anchored. */}
              {result.exists && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-3">
                    <h2 className="text-sm font-medium">Certificate Document</h2>
                    <CertificatePreview credentialId={decodedId} cid={result.cid} />
                    {result.cidAgreement === "mismatch" && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <span className="text-muted-foreground">
                          The fingerprint recorded off-chain differs from the one anchored on the
                          blockchain. The blockchain record is authoritative.
                        </span>
                      </div>
                    )}
                    <IntegrityBadge credentialId={decodedId} />
                  </div>
                </>
              )}

              <Separator />

              <div className="flex flex-col gap-3">
                <h2 className="flex items-center gap-1.5 text-sm font-medium">
                  <Blocks className="size-4" /> Blockchain record
                </h2>
                {result.onChain ? (
                  <div className="flex flex-col gap-3">
                    <dl className="grid gap-3 rounded-lg bg-muted/50 p-4 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-muted-foreground">Contract Address</dt>
                        <dd className="font-mono">{formatAddress(CONTRACT_ADDRESS)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Issuer Wallet</dt>
                        <dd className="font-mono">{formatAddress(result.issuer)}</dd>
                      </div>
                    </dl>
                    {explorerUrl && (
                      <Button
                        render={<a href={explorerUrl} target="_blank" rel="noreferrer" />}
                        nativeButton={false}
                        variant="outline"
                        size="sm"
                        className="w-fit gap-1.5"
                      >
                        <ExternalLink className="size-3.5" />
                        View on Blockchain Explorer
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                    {result.txHash
                      ? // A recorded transaction the chain has never heard of. On a
                        // local Hardhat node this is almost always a node restart,
                        // which discards every anchored credential while the
                        // off-chain rows survive. Saying "nobody has claimed it"
                        // here would be flatly wrong — it was claimed and anchored.
                        "This certificate was anchored on-chain, but the blockchain node has no record of that transaction. On a local development chain this means the node was restarted, which discards previously anchored credentials — re-anchor it to restore verification."
                      : result.certificate?.status === "CLAIMED"
                        ? "Not yet anchored on-chain. The recipient has claimed this certificate — their account and email are confirmed — but blockchain verification completes once they link a wallet."
                        : "Not yet anchored on-chain. This certificate's encrypted PDF is already pinned to IPFS — the fingerprint above won't change — but nobody has claimed it yet. Blockchain verification completes once the recipient signs in and claims it."}
                  </p>
                )}
              </div>

              {linkedInUrl && (
                <>
                  <Separator />
                  <Button
                    render={<a href={linkedInUrl} target="_blank" rel="noreferrer" />}
                    nativeButton={false}
                    className="w-fit gap-2 bg-[#0A66C2] text-white hover:bg-[#0A66C2]/90"
                  >
                    <LinkedInIcon className="size-4" />
                    Add to LinkedIn Profile
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
