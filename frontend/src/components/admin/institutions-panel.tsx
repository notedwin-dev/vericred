"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Building2, Plus, Loader2, ShieldOff, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatAddress, formatTimestamp } from "@/lib/utils";
import { useContract } from "@/hooks/use-contract";
import { useToastTransaction } from "@/hooks/use-toast-transaction";
import { parseContractError } from "@/lib/errors";
import type { InstitutionDTO } from "@/types";

export function InstitutionsPanel() {
  const [institutions, setInstitutions] = useState<InstitutionDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [address, setAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingAddress, setPendingAddress] = useState<string | null>(null);

  const { getWriteContract } = useContract();
  const { run } = useToastTransaction();

  async function load() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/institutions");
      if (!res.ok) {
        toast.error("Failed to load institutions.");
        return;
      }
      const data = await res.json();
      setInstitutions(data.institutions ?? []);
    } catch {
      toast.error("Failed to load institutions.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function authoriseOnChain(target: string) {
    setPendingAddress(target);
    try {
      await run(
        async () => {
          const contract = await getWriteContract();
          const tx = await contract.authoriseInstitution(target);
          return tx.wait();
        },
        { pending: "Authorising institution...", success: "Institution authorised on-chain." }
      );
      await load();
    } catch {
      // Toast already shown by useToastTransaction
    } finally {
      setPendingAddress(null);
    }
  }

  async function removeOnChain(target: string) {
    try {
      await run(
        async () => {
          const contract = await getWriteContract();
          const tx = await contract.removeInstitution(target);
          return tx.wait();
        },
        { pending: "Removing institution...", success: "Institution removed on-chain." }
      );
      await load();
    } catch {
      // Toast already shown by useToastTransaction
    }
  }

  async function handleAuthorise(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/institutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();

      if (res.status === 501) {
        await authoriseOnChain(address);
      } else if (!res.ok) {
        throw new Error(data.error || "Failed to authorise institution");
      } else {
        toast.success("Institution authorised.");
        await load();
      }
      setAddress("");
    } catch (err) {
      const msg = parseContractError(err);
      toast.error(msg || (err instanceof Error ? err.message : "Failed to authorise institution"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(target: string) {
    setPendingAddress(target);
    try {
      const res = await fetch(`/api/institutions?address=${encodeURIComponent(target)}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (res.status === 501) {
        await removeOnChain(target);
      } else if (!res.ok) {
        throw new Error(data.error || "Failed to remove institution");
      } else {
        toast.success("Institution removed.");
        await load();
      }
    } catch (err) {
      const msg = parseContractError(err);
      toast.error(msg || (err instanceof Error ? err.message : "Failed to remove institution"));
    } finally {
      setPendingAddress(null);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <h2 className="flex items-center gap-1.5 font-medium">
          <Building2 className="size-4" /> Institutions
        </h2>

        <form onSubmit={handleAuthorise} className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="0x wallet address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            className="flex-1 font-mono text-sm"
          />
          <Button type="submit" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Authorise
          </Button>
        </form>

        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

        {!isLoading && institutions.length === 0 && (
          <p className="text-sm text-muted-foreground">No institutions authorised yet.</p>
        )}

        {!isLoading &&
          institutions.map((inst) => (
            <div
              key={inst.address}
              className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-mono text-sm">{formatAddress(inst.address, 6)}</p>
                {inst.authorisedAt && (
                  <p className="text-xs text-muted-foreground">
                    Authorised {formatTimestamp(inst.authorisedAt)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={
                    inst.authorised
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {inst.authorised ? "Authorised" : "Removed"}
                </Badge>
                {inst.authorised && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5"
                    disabled={pendingAddress === inst.address}
                    onClick={() => handleRemove(inst.address)}
                  >
                    {pendingAddress === inst.address ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ShieldOff className="size-3.5" />
                    )}
                    Remove
                  </Button>
                )}
                {!inst.authorised && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={pendingAddress === inst.address}
                    onClick={() => authoriseOnChain(inst.address)}
                  >
                    {pendingAddress === inst.address ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="size-3.5" />
                    )}
                    Re-authorise
                  </Button>
                )}
              </div>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
