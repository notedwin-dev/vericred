"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, LayoutTemplate } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { IssuerNav } from "@/components/issuer/issuer-nav";
import { formatTimestamp } from "@/lib/utils";
import type { CertificateTemplateDTO } from "@/types";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<CertificateTemplateDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const res = await fetch("/api/templates");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load templates");
        if (!cancelled) setTemplates(data.templates ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load templates");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Certificate layouts used when issuing credentials.
          </p>
        </div>
        <Button render={<Link href="/issuer/templates/new" />} className="gap-1.5">
          <Plus className="size-4" />
          New Template
        </Button>
      </div>

      <IssuerNav />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load templates</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && templates.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <LayoutTemplate className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No templates yet</p>
            <p className="text-sm text-muted-foreground">
              Create a template before setting up a course.
            </p>
          </div>
          <Button render={<Link href="/issuer/templates/new" />} size="sm" className="mt-1 gap-1.5">
            <Plus className="size-4" />
            New Template
          </Button>
        </div>
      )}

      {!isLoading && templates.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardContent className="flex flex-col gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                  <LayoutTemplate className="size-4.5 text-primary" />
                </div>
                <h3 className="font-medium">{template.name}</h3>
                <p className="text-xs text-muted-foreground">
                  Created {formatTimestamp(template.createdAt, { year: "numeric", month: "short", day: "numeric" })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
