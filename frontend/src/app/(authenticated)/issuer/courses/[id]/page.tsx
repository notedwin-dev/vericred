"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ShieldOff, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/credentials/status-badge";
import { IssueCertificateDialog } from "@/components/issuer/issue-certificate-dialog";
import { CollectionLinks } from "@/components/issuer/collection-links";
import { formatTimestamp } from "@/lib/utils";
import type { CertificateDTO, CourseDTO } from "@/types";

export default function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [course, setCourse] = useState<CourseDTO | null>(null);
  const [certificates, setCertificates] = useState<CertificateDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [courseRes, certsRes] = await Promise.all([
          fetch(`/api/courses/${id}`, { signal: controller.signal }),
          fetch(`/api/certificates?courseId=${id}`, { signal: controller.signal }),
        ]);
        if (!active) return;
        if (!courseRes.ok || !certsRes.ok) {
          setLoadError("Failed to load course data.");
          return;
        }
        const courseData = await courseRes.json();
        const certsData = await certsRes.json();
        if (!active) return;
        setCourse(courseData.course);
        setCertificates(certsData.certificates ?? []);
      } catch (err) {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLoadError("Failed to load course data.");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [id]);

  async function reloadCertificates() {
    try {
      const res = await fetch(`/api/certificates?courseId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setCertificates(data.certificates ?? []);
      }
    } catch {
      // best-effort reload
    }
  }

  async function handleRevoke(certId: string) {
    const reason = window.prompt("Reason for revocation:");
    if (!reason) return;
    setRevokingId(certId);
    try {
      const res = await fetch(`/api/certificates/${certId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke certificate");

      // The revocation is always recorded off-chain; whether it also reached
      // the chain depends on the certificate having been anchored and a
      // permitted signer being available (see lib/revoke.ts). Say which
      // happened rather than reporting an unqualified success — an issuer who
      // believes a revocation is on-chain when it is not has been misled about
      // the one property the ledger exists to provide.
      const onChain = data.onChain as
        | { status: "revoked"; txHash: string }
        | { status: "skipped"; reason: string }
        | { status: "failed"; message: string }
        | undefined;

      if (onChain?.status === "revoked") {
        toast.success("Certificate revoked and anchored on-chain.");
      } else if (onChain?.status === "skipped" && onChain.reason === "not-anchored") {
        toast.success("Certificate revoked. It was never anchored, so there is nothing on-chain to revoke.");
      } else if (onChain?.status === "skipped" && onChain.reason === "already-revoked") {
        toast.success("Certificate revoked. It was already revoked on-chain.");
      } else if (onChain?.status === "skipped") {
        toast.warning("Certificate revoked off-chain only — no wallet authorised to revoke it was available.");
      } else if (onChain?.status === "failed") {
        toast.warning("Certificate revoked off-chain, but the on-chain transaction failed.");
      } else {
        toast.success("Certificate revoked.");
      }
      setCertificates((prev) => prev.map((c) => (c.id === certId ? data.certificate : c)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke certificate");
    } finally {
      setRevokingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (loadError) {
    return <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>;
  }

  if (!course) {
    return <p className="text-sm text-muted-foreground">Course not found.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/issuer/courses"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to courses
      </Link>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{course.name}</h1>
          {course.description && (
            <p className="mt-1 text-sm text-muted-foreground">{course.description}</p>
          )}
        </div>
        <IssueCertificateDialog
          courseId={id}
          onIssued={(cert) => {
            setCertificates((prev) => [cert, ...prev]);
            reloadCertificates();
          }}
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="font-medium">Certificates</h2>
          {certificates.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No certificates issued for this course yet.
            </p>
          )}
          {certificates.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Credential ID</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certificates.map((cert) => (
                  <TableRow key={cert.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/c/${encodeURIComponent(cert.credentialId)}`} className="hover:underline">
                        {cert.credentialId}
                      </Link>
                    </TableCell>
                    <TableCell>{cert.recipientName}</TableCell>
                    <TableCell>
                      <StatusBadge status={cert.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatTimestamp(cert.issuedAt, { year: "numeric", month: "short", day: "numeric" })}
                    </TableCell>
                    <TableCell className="text-right">
                      {cert.status !== "REVOKED" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1.5"
                          disabled={revokingId === cert.id}
                          onClick={() => handleRevoke(cert.id)}
                        >
                          {revokingId === cert.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <ShieldOff className="size-3.5" />
                          )}
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CollectionLinks courseId={id} />
    </div>
  );
}
