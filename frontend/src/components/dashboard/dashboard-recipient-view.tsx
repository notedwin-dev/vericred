"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Award, Loader2, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CredentialCard } from "@/components/dashboard/credential-card";
import { useCredentials } from "@/hooks/use-credentials";
import type { CertificateDTO } from "@/types";

export function DashboardRecipientView() {
  const { certificates, isLoading, error, refetch } = useCredentials();
  const {
    claimable,
    isLoading: isLoadingClaimable,
    remove: removeClaimable,
  } = useClaimableCertificates();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Credentials</h1>
        <p className="text-sm text-muted-foreground">
          Certificates issued to you, anchored on-chain for verification.
        </p>
      </div>

      {!isLoadingClaimable && claimable.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="size-4" /> Available to Claim
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {claimable.map((cert) => (
              <ClaimableCredentialCard
                key={cert.id}
                certificate={cert}
                courseName={cert.course?.name}
                issuerName={cert.course?.issuer?.organizationName}
                onClaimed={() => {
                  removeClaimable(cert.id);
                  refetch();
                }}
              />
            ))}
          </div>
        </div>
      )}

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

      {!isLoading && certificates.length === 0 && claimable.length === 0 && !error && (
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
          {certificates.map((cert) => (
            <CredentialCard
              key={cert.id}
              certificate={cert}
              courseName={cert.course?.name}
              issuerName={cert.course?.issuer?.organizationName}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Certificates issued to the current session's email that nobody has claimed yet. */
function useClaimableCertificates() {
  const [claimable, setClaimable] = useState<CertificateDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setIsLoading(true);
      try {
        const res = await fetch("/api/certificates/claimable", { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setClaimable(data.certificates ?? []);
      } catch {
        // best-effort — the "My Credentials" list is the important one
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  function remove(id: string) {
    setClaimable((prev) => prev.filter((c) => c.id !== id));
  }

  return { claimable, isLoading, remove };
}

function ClaimableCredentialCard({
  certificate,
  courseName,
  issuerName,
  onClaimed,
}: {
  certificate: CertificateDTO;
  courseName?: string;
  issuerName?: string;
  onClaimed: () => void;
}) {
  const [isClaiming, setIsClaiming] = useState(false);

  async function handleClaim() {
    setIsClaiming(true);
    try {
      const res = await fetch(`/api/certificates/${certificate.id}/claim`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to claim certificate");
      toast.success(
        data.certificate.status === "ACTIVE"
          ? "Claimed and anchored on-chain."
          : "Claimed — link a wallet in Settings to complete blockchain verification."
      );
      onClaimed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to claim certificate");
    } finally {
      setIsClaiming(false);
    }
  }

  return (
    <Card className="border-dashed">
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
            <Award className="size-4.5 text-primary" />
          </div>
        </div>

        <div>
          <h3 className="line-clamp-2 font-medium leading-snug">
            {courseName ?? certificate.credentialId}
          </h3>
          {issuerName && <p className="mt-0.5 text-xs text-muted-foreground">{issuerName}</p>}
        </div>

        <Button size="sm" className="mt-auto gap-1.5" disabled={isClaiming} onClick={handleClaim}>
          {isClaiming && <Loader2 className="size-3.5 animate-spin" />}
          Claim
        </Button>
      </CardContent>
    </Card>
  );
}
