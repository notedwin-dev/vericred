"use client";

import Link from "next/link";
import { use } from "react";
import { ShieldCheck, ArrowLeft, Loader2 } from "lucide-react";
import { VerifyForm } from "@/components/credentials/verify-form";
import { VerifyResult } from "@/components/credentials/verify-result";
import { PublicAuthAction } from "@/components/layout/public-auth-action";
import { useCredential } from "@/hooks/use-credential";

export default function VerifyCredentialPage({
  params,
}: {
  params: Promise<{ credentialId: string }>;
}) {
  const { credentialId } = use(params);
  const { result, isLoading, error } = useCredential(decodeURIComponent(credentialId));

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5" />
          VeriCred
        </Link>
        <PublicAuthAction />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12 sm:px-10">
        <div>
          <Link
            href="/verify"
            className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Verify another credential
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Credential Verification</h1>
        </div>

        <VerifyForm defaultValue={decodeURIComponent(credentialId)} />

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Checking the blockchain...
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}

        {result && !isLoading && <VerifyResult result={result} />}
      </main>
    </div>
  );
}
