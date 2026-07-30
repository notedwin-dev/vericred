"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusBadge } from "@/components/credentials/status-badge";
import { InstitutionsPanel } from "@/components/admin/institutions-panel";
import { useCredentials } from "@/hooks/use-credentials";
import { formatTimestamp } from "@/lib/utils";

export default function AdminPage() {
  const { certificates, isLoading, error } = useCredentials();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin Panel</h1>
        <p className="text-sm text-muted-foreground">
          Manage authorised institutions and oversee all issued credentials.
        </p>
      </div>

      <InstitutionsPanel />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load credentials</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="font-medium">All Credentials</h2>
          {isLoading && <Skeleton className="h-48 w-full" />}
          {!isLoading && certificates.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No credentials have been issued yet.
            </p>
          )}
          {!isLoading && certificates.length > 0 && (
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
