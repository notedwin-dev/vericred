"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useContract } from "@/hooks/use-contract";
import { useToastTransaction } from "@/hooks/use-toast-transaction";
import { useWallet } from "@/hooks/use-wallet";
import type { CertificateDTO } from "@/types";

interface IssueCertificateDialogProps {
  courseId: string;
  onIssued?: (certificate: CertificateDTO) => void;
}

export function IssueCertificateDialog({ courseId, onIssued }: IssueCertificateDialogProps) {
  const [open, setOpen] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [cid, setCid] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isConnected } = useWallet();
  const { getWriteContract } = useContract();
  const { run } = useToastTransaction();

  function reset() {
    setRecipientName("");
    setRecipientEmail("");
    setWalletAddress("");
    setCid("");
    setExpiresAt("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientName,
          recipientEmail: recipientEmail || undefined,
          courseId,
          cid: cid || undefined,
          walletAddress: walletAddress || undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create certificate record");

      const certificate: CertificateDTO = data.certificate;
      toast.success(`Certificate record created (${certificate.credentialId}).`);

      reset();
      setOpen(false);
      onIssued?.(certificate);

      if (isConnected && cid && walletAddress) {
        const expiresAtUnix = expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : 0;
        try {
          await run(
            async () => {
              const contract = await getWriteContract();
              const tx = await contract.issueCredential(
                certificate.credentialId,
                cid,
                walletAddress,
                expiresAtUnix
              );
              return tx.wait();
            },
            {
              pending: "Anchoring credential on-chain...",
              success: "Credential anchored on-chain.",
              error: "On-chain anchoring failed",
            }
          );
        } catch {
          // Toast already shown by useToastTransaction — dialog is closed,
          // cert record exists in DB for manual retry
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to issue certificate");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-1.5" />}>
        <Plus className="size-4" />
        Issue Certificate
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Issue Certificate</DialogTitle>
          <DialogDescription>
            Creates a certificate record. If a wallet is connected and both a CID and recipient
            wallet address are provided, it will also be anchored on-chain.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recipientName">Recipient name</Label>
            <Input
              id="recipientName"
              required
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recipientEmail">Recipient email</Label>
            <Input
              id="recipientEmail"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="walletAddress">Recipient wallet address</Label>
            <Input
              id="walletAddress"
              placeholder="0x..."
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cid">IPFS CID</Label>
            <Input
              id="cid"
              placeholder="bafy..."
              value={cid}
              onChange={(e) => setCid(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expiresAt">Expiry date (optional)</Label>
            <Input
              id="expiresAt"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} className="gap-1.5">
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Issue Certificate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
