"use client";

import Link from "next/link";
import { Award, ShieldCheck, ShieldOff, Clock, Plus } from "lucide-react";
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
import { IssuerNav } from "@/components/issuer/issuer-nav";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCredentials } from "@/hooks/use-credentials";
import { formatTimestamp } from "@/lib/utils";

export default function IssuerDashboardPage() {
  const { certificates, isLoading, error } = useCredentials();

  const total = certificates.length;
  const active = certificates.filter((c) => c.status === "ACTIVE").length;
  const revoked = certificates.filter((c) => c.status === "REVOKED").length;
  const pending = certificates.filter((c) => c.status === "PENDING").length;

  const recent = certificates.slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Issuer Panel</h1>
          <p className="text-sm text-muted-foreground">
            Manage courses, templates, and issued certificates.
          </p>
        </div>
        <Button render={<Link href="/issuer/courses/new" />} nativeButton={false} className="gap-1.5">
          <Plus className="size-4" />
          New Course
        </Button>
      </div>

      <IssuerNav />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load certificates</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Award} label="Total Certificates" value={total} isLoading={isLoading} />
        <StatCard
          icon={ShieldCheck}
          label="Active"
          value={active}
          isLoading={isLoading}
          accent="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          icon={ShieldOff}
          label="Revoked"
          value={revoked}
          isLoading={isLoading}
          accent="text-amber-600 dark:text-amber-400"
        />
        <StatCard
          icon={Clock}
          label="Pending"
          value={pending}
          isLoading={isLoading}
          accent="text-blue-600 dark:text-blue-400"
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="font-medium">Recent Certificates</h2>
          {isLoading && <Skeleton className="h-40 w-full" />}
          {!isLoading && recent.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No certificates issued yet.
            </p>
          )}
          {!isLoading && recent.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Credential ID</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((cert) => (
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  isLoading,
  accent,
}: {
  icon: typeof Award;
  label: string;
  value: number;
  isLoading: boolean;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          <Icon className={`size-5 ${accent ?? "text-foreground"}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          {isLoading ? (
            <Skeleton className="mt-1 h-6 w-10" />
          ) : (
            <p className="text-xl font-semibold">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
