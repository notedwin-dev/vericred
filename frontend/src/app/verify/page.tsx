"use client";

import Link from "next/link";
import { useState } from "react";
import { ShieldCheck, ArrowLeft, Loader2 } from "lucide-react";
import { VerifyForm } from "@/components/credentials/verify-form";
import { VerifyResult } from "@/components/credentials/verify-result";
import { PublicAuthAction } from "@/components/layout/public-auth-action";
import type { VerifyApiResult } from "@/types/verify";

export default function VerifyPage() {
  const [result, setResult] = useState<VerifyApiResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify(credentialId: string) {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/verify/${encodeURIComponent(credentialId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to verify credential");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify credential");
    } finally {
      setIsLoading(false);
    }
  }

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
            href="/"
            className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back home
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Verify a Credential</h1>
          <p className="mt-2 text-muted-foreground">
            Enter a credential ID to check its authenticity directly against the blockchain.
          </p>
        </div>

        <VerifyForm onSubmit={handleVerify} />

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
