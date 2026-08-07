"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Link2, Loader2, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTimestamp } from "@/lib/utils";

interface Share {
  id: string;
  token: string;
  expiresAt: string | null;
  createdAt: string;
  viewCount: number;
}

const EXPIRY_OPTIONS = [
  { value: "", label: "Never expires" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

/**
 * Lets the holder hand a specific verifier a link to the decrypted document.
 *
 * The link carries a revocable grant, not the decryption key — the content key
 * never leaves the server, which is what makes "withdraw" actually withdraw
 * access rather than politely ask someone to forget a URL. See
 * docs/prds/encrypted-certificates.md (D3).
 */
export function ShareCertificateDialog({
  certificateId,
  credentialId,
}: {
  certificateId: string;
  credentialId: string;
}) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/certificates/${certificateId}/share`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load share links");
      setShares(data.shares ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load share links");
    } finally {
      setIsLoading(false);
    }
  }, [certificateId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function createShare() {
    setIsCreating(true);
    try {
      const res = await fetch(`/api/certificates/${certificateId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(expiresInDays ? { expiresInDays: Number(expiresInDays) } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create a share link");

      await navigator.clipboard.writeText(data.share.url).catch(() => {});
      toast.success("Share link created and copied to your clipboard.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create a share link");
    } finally {
      setIsCreating(false);
    }
  }

  async function revoke(shareId: string) {
    try {
      const res = await fetch(`/api/certificates/${certificateId}/share/${shareId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not withdraw the link");
      toast.success("Link withdrawn. It no longer opens the certificate.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not withdraw the link");
    }
  }

  function shareUrl(token: string) {
    return typeof window !== "undefined" ? `${window.location.origin}/s/${token}` : `/s/${token}`;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
          />
        }
      >
        <Share2 className="size-3.5" />
        Share
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share this certificate</DialogTitle>
          <DialogDescription>
            Anyone with the link can open the full certificate for{" "}
            <span className="font-mono">{credentialId}</span> without an account. You can withdraw a
            link at any time.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="expiry">Link expiry</Label>
            <Select value={expiresInDays} onValueChange={(value) => setExpiresInDays(value ?? "")}>
              <SelectTrigger id="expiry" className="w-full">
                <SelectValue placeholder="Never expires" />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((o) => (
                  <SelectItem key={o.value || "never"} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="gap-1.5" disabled={isCreating} onClick={createShare}>
            {isCreating ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            Create link
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {isLoading && (
            <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading links…
            </p>
          )}

          {!isLoading && shares.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">
              No active links. Create one to share this certificate.
            </p>
          )}

          {shares.map((share) => (
            <div
              key={share.id}
              className="flex items-center justify-between gap-2 rounded-md border p-2"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-xs">{shareUrl(share.token)}</p>
                <p className="text-xs text-muted-foreground">
                  {share.expiresAt
                    ? `Expires ${formatTimestamp(share.expiresAt, { year: "numeric", month: "short", day: "numeric" })}`
                    : "No expiry"}
                  {` · ${share.viewCount} view${share.viewCount === 1 ? "" : "s"}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copy link"
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl(share.token));
                    toast.success("Link copied.");
                  }}
                >
                  <Copy className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Withdraw link"
                  onClick={() => revoke(share.id)}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
