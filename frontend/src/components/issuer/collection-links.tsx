"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Link2, Plus, Copy, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CollectionLinkDTO } from "@/types";

/** ISO string -> local "YYYY-MM-DDTHH:mm" for a datetime-local input's value. */
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function CollectionLinks({ courseId }: { courseId: string }) {
  const [links, setLinks] = useState<CollectionLinkDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [open, setOpen] = useState(false);

  const [maxCollections, setMaxCollections] = useState("");
  const [linkExpiresAt, setLinkExpiresAt] = useState("");
  const [certExpiresAt, setCertExpiresAt] = useState("");

  const [editingLink, setEditingLink] = useState<CollectionLinkDTO | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editMaxCollections, setEditMaxCollections] = useState("");
  const [editLinkExpiresAt, setEditLinkExpiresAt] = useState("");
  const [editCertExpiresAt, setEditCertExpiresAt] = useState("");
  const [editActive, setEditActive] = useState(true);

  async function load() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/links`);
      if (!res.ok) {
        toast.error("Failed to load collection links.");
        return;
      }
      const data = await res.json();
      setLinks(data.links ?? []);
    } catch {
      toast.error("Failed to load collection links.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  function reset() {
    setMaxCollections("");
    setLinkExpiresAt("");
    setCertExpiresAt("");
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setIsCreating(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxCollections: maxCollections ? Number(maxCollections) : undefined,
          linkExpiresAt: linkExpiresAt ? new Date(linkExpiresAt).toISOString() : undefined,
          certExpiresAt: certExpiresAt ? new Date(certExpiresAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        let errorMessage = "Failed to create link";
        try {
          const data = await res.json();
          errorMessage = data.error || errorMessage;
        } catch {
          // Non-JSON error response, use default message
        }
        throw new Error(errorMessage);
      }
      toast.success("Collection link created.");
      reset();
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create link");
    } finally {
      setIsCreating(false);
    }
  }

  function openEdit(link: CollectionLinkDTO) {
    setEditingLink(link);
    setEditMaxCollections(link.maxCollections?.toString() ?? "");
    setEditLinkExpiresAt(toDatetimeLocalValue(link.linkExpiresAt));
    setEditCertExpiresAt(toDatetimeLocalValue(link.certExpiresAt));
    setEditActive(link.active);
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingLink) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/links/${editingLink.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxCollections: editMaxCollections ? Number(editMaxCollections) : null,
          linkExpiresAt: editLinkExpiresAt ? new Date(editLinkExpiresAt).toISOString() : null,
          certExpiresAt: editCertExpiresAt ? new Date(editCertExpiresAt).toISOString() : null,
          active: editActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update link");
      toast.success("Collection link updated.");
      setEditingLink(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update link");
    } finally {
      setIsSaving(false);
    }
  }

  async function copyLink(token: string) {
    const url = `${window.location.origin}/collect/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard.");
    } catch {
      toast.error("Failed to copy link to clipboard.");
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-medium">
            <Link2 className="size-4" /> Collection Links
          </h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1.5" />}>
              <Plus className="size-4" />
              New Link
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>New Collection Link</DialogTitle>
                <DialogDescription>
                  Recipients who visit this link can sign in and self-claim a certificate for
                  this course. All fields are optional — leave blank for unlimited collections
                  and no expiry.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleCreate} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="maxCollections">Max collections</Label>
                  <Input
                    id="maxCollections"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Unlimited"
                    value={maxCollections}
                    onChange={(e) => setMaxCollections(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="linkExpiresAt">Link expires</Label>
                  <Input
                    id="linkExpiresAt"
                    type="datetime-local"
                    value={linkExpiresAt}
                    onChange={(e) => setLinkExpiresAt(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">When the link itself stops working.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="certExpiresAt">Certificate expires</Label>
                  <Input
                    id="certExpiresAt"
                    type="datetime-local"
                    value={certExpiresAt}
                    onChange={(e) => setCertExpiresAt(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    When credentials claimed via this link expire on-chain.
                  </p>
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={isCreating} className="gap-1.5">
                    {isCreating && <Loader2 className="size-4 animate-spin" />}
                    Create Link
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
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
                  {link.linkExpiresAt &&
                    ` · link expires ${new Date(link.linkExpiresAt).toLocaleDateString()}`}
                  {link.certExpiresAt &&
                    ` · cert expires ${new Date(link.certExpiresAt).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={link.active ? "secondary" : "outline"}>
                  {link.active ? "Active" : "Inactive"}
                </Badge>
                <Button size="icon-sm" variant="ghost" onClick={() => openEdit(link)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => copyLink(link.token)}>
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}

        <Dialog open={editingLink !== null} onOpenChange={(next) => !next && setEditingLink(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Collection Link</DialogTitle>
              <DialogDescription>
                {editingLink?.currentCount ?? 0} certificate(s) already claimed via this link.
                Leave a field blank to clear that limit.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveEdit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="editMaxCollections">Max collections</Label>
                <Input
                  id="editMaxCollections"
                  type="number"
                  min={editingLink?.currentCount || 1}
                  step={1}
                  placeholder="Unlimited"
                  value={editMaxCollections}
                  onChange={(e) => setEditMaxCollections(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="editLinkExpiresAt">Link expires</Label>
                <Input
                  id="editLinkExpiresAt"
                  type="datetime-local"
                  value={editLinkExpiresAt}
                  onChange={(e) => setEditLinkExpiresAt(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="editCertExpiresAt">Certificate expires</Label>
                <Input
                  id="editCertExpiresAt"
                  type="datetime-local"
                  value={editCertExpiresAt}
                  onChange={(e) => setEditCertExpiresAt(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="editActive">Active</Label>
                  <p className="text-xs text-muted-foreground">
                    Turn off to stop new claims without changing limits.
                  </p>
                </div>
                <Switch id="editActive" checked={editActive} onCheckedChange={setEditActive} />
              </div>

              <DialogFooter>
                <Button type="submit" disabled={isSaving} className="gap-1.5">
                  {isSaving && <Loader2 className="size-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
