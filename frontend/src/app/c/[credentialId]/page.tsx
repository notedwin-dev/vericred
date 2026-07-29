"use client";

import Link from "next/link";
import { use } from "react";
import {
  ShieldCheck,
  ExternalLink,
  Loader2,
  ArrowLeft,
  Blocks,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/credentials/status-badge";
import { CredentialQr } from "@/components/credentials/credential-qr";
import { LinkedInIcon } from "@/components/icons/brand-icons";
import { useCredential } from "@/hooks/use-credential";
import { formatAddress, formatTimestamp } from "@/lib/utils";
import { CONTRACT_ADDRESS } from "@/lib/config";

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
        <Link
          href="/login"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Sign In
        </Link>
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

              <Separator />

              <div className="flex flex-col gap-3">
                <h2 className="flex items-center gap-1.5 text-sm font-medium">
                  <Blocks className="size-4" /> Blockchain record
                </h2>
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
                {result.cid && (
                  <a
                    href={`https://ipfs.io/ipfs/${result.cid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    View source document on IPFS <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>

              {linkedInUrl && (
                <>
                  <Separator />
                  <Button
                    render={<a href={linkedInUrl} target="_blank" rel="noreferrer" />}
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
