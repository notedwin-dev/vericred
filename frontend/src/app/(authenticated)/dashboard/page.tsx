"use client";

import { useEffect, useMemo, useState } from "react";
import { Award } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CredentialCard } from "@/components/dashboard/credential-card";
import { useCredentials } from "@/hooks/use-credentials";
import type { VerifyApiResult } from "@/types/verify";

export default function DashboardPage() {
  const { certificates, isLoading, error } = useCredentials();
  const [enrichment, setEnrichment] = useState<Record<string, VerifyApiResult["certificate"]>>({});

  const credentialIds = useMemo(
    () => certificates.map((c) => c.credentialId).join(","),
    [certificates]
  );

  useEffect(() => {
    if (!credentialIds) return;
    let cancelled = false;
    const controller = new AbortController();

    async function enrich() {
      const ids = credentialIds.split(",");
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/verify/${encodeURIComponent(id)}`, {
              signal: controller.signal,
            });
            if (!res.ok) return [id, null] as const;
            const data: VerifyApiResult = await res.json();
            return [id, data.certificate] as const;
          } catch {
            return [id, null] as const;
          }
        })
      );
      if (!cancelled) {
        setEnrichment(Object.fromEntries(results));
      }
    }

    enrich();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [credentialIds]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Credentials</h1>
        <p className="text-sm text-muted-foreground">
          Certificates issued to you, anchored on-chain for verification.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load credentials</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && certificates.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Award className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No credentials yet</p>
            <p className="text-sm text-muted-foreground">
              Credentials issued to you will show up here.
            </p>
          </div>
        </div>
      )}

      {!isLoading && certificates.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {certificates.map((cert) => {
            const enriched = enrichment[cert.credentialId];
            return (
              <CredentialCard
                key={cert.id}
                certificate={cert}
                courseName={enriched?.course.name}
                issuerName={enriched?.issuer.organizationName}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
