import {
  CheckCircle2,
  XCircle,
  Clock,
  ShieldOff,
  ExternalLink,
  Copy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatAddress, formatTimestamp } from "@/lib/utils";
import type { VerifyApiResult } from "@/types/verify";

type DisplayStatus = "VALID" | "REVOKED" | "EXPIRED" | "NOT_FOUND";

function resolveStatus(result: VerifyApiResult): DisplayStatus {
  if (!result.exists) return "NOT_FOUND";
  if (result.valid) return "VALID";

  const cert = result.certificate;
  if (cert?.status === "EXPIRED") return "EXPIRED";
  if (cert?.expiresAt && new Date(cert.expiresAt).getTime() < Date.now()) {
    return "EXPIRED";
  }
  return "REVOKED";
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
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Issuer Wallet</dt>
              <dd className="font-mono text-sm">{formatAddress(result.issuer)}</dd>
            </div>
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
            {cert?.revokedAt && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Revoked</dt>
                <dd className="text-sm">{formatTimestamp(cert.revokedAt)}</dd>
              </div>
            )}
            {cert?.revocationReason && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">Revocation Reason</dt>
                <dd className="text-sm">{cert.revocationReason}</dd>
              </div>
            )}
          </dl>

          {result.cid && (
            <>
              <Separator />
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">IPFS Content ID</span>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-md bg-muted px-2 py-1 text-xs break-all">
                    {result.cid}
                  </code>
                  <a
                    href={`https://ipfs.io/ipfs/${result.cid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    View on IPFS <ExternalLink className="size-3" />
                  </a>
                </div>
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

export function CopyableId({ value }: { value: string }) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(value)}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <Copy className="size-3" /> Copy
    </button>
  );
}
