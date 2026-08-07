import {
  CheckCircle2,
  XCircle,
  Clock,
  ShieldOff,
  BadgeCheck,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CertificatePreview } from "@/components/credentials/certificate-preview";
import { IntegrityBadge } from "@/components/credentials/integrity-badge";
import { formatAddress, formatTimestamp } from "@/lib/utils";
import { getExplorerTxUrl } from "@/lib/config";
import type { VerifyApiResult } from "@/types/verify";

type DisplayStatus = "VALID" | "REVOKED" | "EXPIRED" | "CLAIMED" | "PENDING" | "NOT_FOUND";

function resolveStatus(result: VerifyApiResult): DisplayStatus {
  if (!result.exists) return "NOT_FOUND";
  if (result.valid) return "VALID";

  const cert = result.certificate;

  // The chain is authoritative on why a credential is invalid, and is the only
  // source at all when there is no off-chain row. Consulted before the
  // off-chain fields so a revoked credential is never reported as expired.
  if (result.chainRevoked) return "REVOKED";

  if (cert?.status === "EXPIRED") return "EXPIRED";
  if (cert?.expiresAt && new Date(cert.expiresAt).getTime() < Date.now()) {
    return "EXPIRED";
  }
  if (cert?.status === "REVOKED" || cert?.revokedAt) return "REVOKED";
  if (cert?.status === "CLAIMED") return "CLAIMED";
  if (!result.onChain) return "PENDING";

  // Chain-anchored and invalid, but not revoked: an elapsed expiry is the only
  // remaining cause the contract admits.
  return "EXPIRED";
}

const STATUS_CONFIG: Record<
  DisplayStatus,
  {
    label: string;
    icon: typeof CheckCircle2;
    badgeClass: string;
    cardClass: string;
    iconClass: string;
  }
> = {
  VALID: {
    label: "Valid Credential",
    icon: CheckCircle2,
    badgeClass:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    cardClass: "border-emerald-200 dark:border-emerald-900",
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
  REVOKED: {
    label: "Revoked",
    icon: ShieldOff,
    badgeClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    cardClass: "border-amber-200 dark:border-amber-900",
    iconClass: "text-amber-600 dark:text-amber-400",
  },
  EXPIRED: {
    label: "Expired",
    icon: Clock,
    badgeClass: "bg-muted text-muted-foreground",
    cardClass: "border-border",
    iconClass: "text-muted-foreground",
  },
  CLAIMED: {
    label: "Claimed — Awaiting Wallet",
    icon: BadgeCheck,
    badgeClass:
      "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",
    cardClass: "border-purple-200 dark:border-purple-900",
    iconClass: "text-purple-600 dark:text-purple-400",
  },
  PENDING: {
    label: "Pending Anchoring",
    icon: Clock,
    badgeClass: "bg-muted text-muted-foreground",
    cardClass: "border-border",
    iconClass: "text-muted-foreground",
  },
  NOT_FOUND: {
    label: "Not Found",
    icon: XCircle,
    badgeClass:
      "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
    cardClass: "border-red-200 dark:border-red-900",
    iconClass: "text-red-600 dark:text-red-400",
  },
};

export function VerifyResult({ result }: { result: VerifyApiResult }) {
  const status = resolveStatus(result);
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const cert = result.certificate;
  const explorerUrl = result.txHash ? getExplorerTxUrl(result.txHash) : null;

  return (
    <Card className={`${config.cardClass} border-2`}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Icon className={`size-8 ${config.iconClass}`} />
            <div>
              <CardTitle className="text-lg">{config.label}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Credential ID: <span className="font-mono">{result.credentialId}</span>
              </p>
            </div>
          </div>
          <Badge className={config.badgeClass} variant="secondary">
            {status === "NOT_FOUND" ? "No record" : status.charAt(0) + status.slice(1).toLowerCase()}
          </Badge>
        </div>
      </CardHeader>

      {status !== "NOT_FOUND" && (
        <CardContent className="flex flex-col gap-4">
          <Separator />

          {status === "PENDING" && result.txHash && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/40">
              This certificate has an anchoring transaction on record, but the blockchain node
              has no such transaction. On a local development chain that means the node was
              restarted, discarding previously anchored credentials; the certificate needs
              re-anchoring before it will verify again.
            </p>
          )}

          {status === "PENDING" && !result.txHash && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              This certificate has been issued and its encrypted PDF is pinned to IPFS —
              untamperable from this point on — but nobody has claimed it yet, and it isn&apos;t
              blockchain-verified. The recipient completes both steps by signing in and
              claiming it from their dashboard.
            </p>
          )}

          {status === "CLAIMED" && (
            <p className="rounded-md bg-purple-50 px-3 py-2 text-sm text-purple-700 dark:bg-purple-950/40 dark:text-purple-400">
              The recipient has claimed this certificate — their account and email address
              are confirmed — but it isn&apos;t blockchain-verified yet. That completes
              automatically once they link a wallet.
            </p>
          )}

          <dl className="grid gap-4 sm:grid-cols-2">
            {cert && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Recipient</dt>
                <dd className="text-sm">{cert.recipientName}</dd>
              </div>
            )}
            {cert && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Course / Credential</dt>
                <dd className="text-sm">{cert.course.name}</dd>
              </div>
            )}
            {cert && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Issuing Institution</dt>
                <dd className="text-sm">{cert.issuer.organizationName}</dd>
              </div>
            )}
            {result.onChain && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Issuer Wallet</dt>
                <dd className="font-mono text-sm">{formatAddress(result.issuer)}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Issued</dt>
              <dd className="text-sm">{formatTimestamp(result.issuedAt)}</dd>
            </div>
            {cert?.expiresAt && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Expires</dt>
                <dd className="text-sm">{formatTimestamp(cert.expiresAt)}</dd>
              </div>
            )}
            {/* Prefer the off-chain timestamp when present, but fall back to the
                chain's so a credential with no local row still shows when and
                why it was withdrawn — that detail is published to the ledger
                precisely so a verifier can read it. */}
            {(cert?.revokedAt || result.chainRevokedAt) && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Revoked</dt>
                <dd className="text-sm">
                  {cert?.revokedAt
                    ? formatTimestamp(cert.revokedAt)
                    : formatTimestamp(result.chainRevokedAt!)}
                </dd>
              </div>
            )}
            {(cert?.revocationReason || result.chainRevocationReason) && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">Revocation Reason</dt>
                <dd className="text-sm">{cert?.revocationReason ?? result.chainRevocationReason}</dd>
              </div>
            )}
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

          {/* Not gated on the CID — the preview renders from Postgres, so an
              issued-but-unanchored credential still shows one. The CID is only
              displayed when there is one to show. */}
          {result.exists && (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">Certificate Document</span>
                <CertificatePreview credentialId={result.credentialId} cid={result.cid} />
                {result.cid && (
                  <code className="w-fit rounded-md bg-muted px-2 py-1 text-xs break-all">
                    {result.cid}
                  </code>
                )}
                <IntegrityBadge credentialId={result.credentialId} />
              </div>
            </>
          )}
        </CardContent>
      )}

      {status === "NOT_FOUND" && (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No credential was found on-chain with this ID. Double-check the ID and try again.
          </p>
        </CardContent>
      )}
    </Card>
  );
}

