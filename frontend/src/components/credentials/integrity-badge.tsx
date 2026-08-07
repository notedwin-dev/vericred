"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

type Report = {
  status: "verified" | "mismatch" | "unavailable";
  method?: "cid" | "content-hash";
  reason?: "legacy" | "gateway" | "no-cid";
};

const REASON_COPY: Record<string, string> = {
  legacy: "This credential was issued before document fingerprints were recorded, so there is nothing to check it against.",
  gateway: "The IPFS gateway did not respond. The document may still be fine — try again shortly.",
  "no-cid": "This credential has no document pinned to IPFS yet.",
};

const METHOD_COPY: Record<string, string> = {
  cid: "The stored file re-derives the exact fingerprint anchored on the blockchain.",
  "content-hash": "The stored file matches the fingerprint recorded when it was issued.",
};

/**
 * On-demand integrity check for the artifact behind a credential.
 *
 * Fetches on click rather than on mount: the endpoint reaches out to a public
 * IPFS gateway, and doing that automatically for every visitor to a public
 * page would put a third-party network call on the critical path of a page
 * that otherwise renders entirely from our own data.
 */
export function IntegrityBadge({ credentialId }: { credentialId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  async function check() {
    setIsChecking(true);
    try {
      const res = await fetch(`/api/verify/${encodeURIComponent(credentialId)}/integrity`);
      setReport(res.ok ? await res.json() : { status: "unavailable", reason: "gateway" });
    } catch {
      setReport({ status: "unavailable", reason: "gateway" });
    } finally {
      setIsChecking(false);
    }
  }

  if (!report) {
    return (
      <Button variant="outline" size="sm" className="w-fit gap-1.5" disabled={isChecking} onClick={check}>
        {isChecking ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldQuestion className="size-3.5" />}
        Check document integrity
      </Button>
    );
  }

  if (report.status === "verified") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">Document verified</span>
          <span className="text-xs text-muted-foreground">
            {METHOD_COPY[report.method ?? "content-hash"]}
          </span>
        </div>
      </div>
    );
  }

  if (report.status === "mismatch") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-destructive">Document does not match</span>
          <span className="text-xs text-muted-foreground">
            The file stored on IPFS is not the one this credential was issued with. Treat it as
            untrustworthy and contact the issuing institution.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
      <ShieldQuestion className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">Integrity could not be checked</span>
        <span className="text-xs text-muted-foreground">
          {REASON_COPY[report.reason ?? "gateway"]}
        </span>
      </div>
    </div>
  );
}
