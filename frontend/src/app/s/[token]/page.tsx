import { notFound } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, FileText, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/credentials/status-badge";
import { resolveShareToken } from "@/lib/certificate-share";
import { formatTimestamp } from "@/lib/utils";

/**
 * Public landing page for a share link.
 *
 * The document itself is streamed by /api/share/[token]/document; this page
 * exists so the recipient of a link sees who issued the credential and what it
 * is before opening a PDF, rather than a raw download appearing.
 */
export default async function SharedCertificatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolveShareToken(token);

  if (!resolved.ok && resolved.reason === "not-found") {
    notFound();
  }

  if (!resolved.ok) {
    const message =
      resolved.reason === "revoked"
        ? "This share link has been withdrawn by the credential holder."
        : "This share link has expired.";

    return (
      <Shell>
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <h1 className="text-xl font-semibold">Link no longer available</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const { certificate } = resolved.share;

  return (
    <Shell>
      <Card>
        <CardContent className="flex flex-col gap-6 py-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {certificate.course.issuer.organizationName}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">{certificate.course.name}</h1>
              <p className="mt-1 text-muted-foreground">Awarded to {certificate.recipientName}</p>
            </div>
            <StatusBadge status={certificate.status} />
          </div>

          <Separator />

          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Credential ID</dt>
              <dd className="font-mono text-sm">{certificate.credentialId}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Issued</dt>
              <dd className="text-sm">{formatTimestamp(certificate.issuedAt)}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            <Button
              render={
                <a href={`/api/share/${encodeURIComponent(token)}/document`} target="_blank" rel="noreferrer" />
              }
              nativeButton={false}
              className="gap-1.5"
            >
              <FileText className="size-4" />
              Open certificate
            </Button>
            <Button
              render={<Link href={`/verify/${encodeURIComponent(certificate.credentialId)}`} />}
              nativeButton={false}
              variant="outline"
              className="gap-1.5"
            >
              <ExternalLink className="size-4" />
              Verify independently
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            This link was shared by the credential holder and can be withdrawn by them at any time.
          </p>
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center px-6 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5" />
          VeriCred
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 sm:px-10">{children}</main>
    </div>
  );
}
