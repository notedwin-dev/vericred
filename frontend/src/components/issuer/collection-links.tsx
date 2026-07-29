"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, Plus, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CollectionLinkDTO } from "@/types";

export function CollectionLinks({ courseId }: { courseId: string }) {
  const [links, setLinks] = useState<CollectionLinkDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/links`);
      const data = await res.json();
      if (res.ok) setLinks(data.links ?? []);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function handleCreate() {
    setIsCreating(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create link");
      toast.success("Collection link created.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create link");
    } finally {
      setIsCreating(false);
    }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/collect/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard.");
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-medium">
            <Link2 className="size-4" /> Collection Links
          </h2>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCreate} disabled={isCreating}>
            {isCreating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            New Link
          </Button>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

        {!isLoading && links.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No collection links yet. Recipients can self-claim certificates via a link.
          </p>
        )}

        {!isLoading &&
          links.map((link) => (
            <div
              key={link.id}
              className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-mono text-xs break-all">{link.token}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {link.currentCount}
                  {link.maxCollections ? ` / ${link.maxCollections}` : ""} claimed
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={link.active ? "secondary" : "outline"}>
                  {link.active ? "Active" : "Inactive"}
                </Badge>
                <Button size="icon-sm" variant="ghost" onClick={() => copyLink(link.token)}>
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
