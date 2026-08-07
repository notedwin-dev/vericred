import Link from "next/link";
import { Award, Building2, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/credentials/status-badge";
import { ShareCertificateDialog } from "@/components/dashboard/share-certificate-dialog";
import { formatTimestamp } from "@/lib/utils";
import type { CertificateDTO } from "@/types";

interface CredentialCardProps {
  certificate: CertificateDTO;
  courseName?: string;
  issuerName?: string;
}

export function CredentialCard({ certificate, courseName, issuerName }: CredentialCardProps) {
  return (
    // The <Link> wraps only the card body, not the whole card: the download
    // below is itself an anchor, and nesting one inside a Link is invalid HTML
    // that browsers resolve unpredictably.
    <Card className="flex h-full flex-col transition-colors hover:bg-muted/40">
      <CardContent className="flex flex-1 flex-col gap-3">
        <Link
          href={`/c/${encodeURIComponent(certificate.credentialId)}`}
          className="flex flex-1 flex-col gap-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
              <Award className="size-4.5 text-primary" />
            </div>
            <StatusBadge status={certificate.status} />
          </div>

          <div>
            <h3 className="line-clamp-2 font-medium leading-snug">
              {courseName ?? certificate.credentialId}
            </h3>
            {issuerName && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="size-3" />
                {issuerName}
              </p>
            )}
          </div>

          <p className="mt-auto text-xs text-muted-foreground">
            Issued{" "}
            {formatTimestamp(certificate.issuedAt, { year: "numeric", month: "short", day: "numeric" })}
          </p>
        </Link>

        <div className="flex items-center gap-4">
          {/* The authoritative document, decrypted server-side — unlike the
              public preview this carries the award grade. */}
          <a
            href={`/api/certificates/${certificate.id}/document`}
            className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Download className="size-3.5" />
            Download certificate
          </a>
          <ShareCertificateDialog
            certificateId={certificate.id}
            credentialId={certificate.credentialId}
          />
        </div>
      </CardContent>
    </Card>
  );
}
