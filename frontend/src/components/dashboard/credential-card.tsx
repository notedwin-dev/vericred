import Link from "next/link";
import { Award, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/credentials/status-badge";
import { formatTimestamp } from "@/lib/utils";
import type { CertificateDTO } from "@/types";

interface CredentialCardProps {
  certificate: CertificateDTO;
  courseName?: string;
  issuerName?: string;
}

export function CredentialCard({ certificate, courseName, issuerName }: CredentialCardProps) {
  return (
    <Link href={`/c/${encodeURIComponent(certificate.credentialId)}`}>
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardContent className="flex flex-col gap-3">
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
            Issued {formatTimestamp(certificate.issuedAt, { year: "numeric", month: "short", day: "numeric" })}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
