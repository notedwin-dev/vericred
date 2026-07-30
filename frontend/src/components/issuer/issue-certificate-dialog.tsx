"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { parseRecipientCsv, type ParsedRecipientRow } from "@/lib/csv";
import type { CertificateDTO } from "@/types";

interface IssueCertificateDialogProps {
  courseId: string;
  onIssued?: (certificate: CertificateDTO) => void;
}

export function IssueCertificateDialog({ courseId, onIssued }: IssueCertificateDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-1.5" />}>
        <Plus className="size-4" />
        Issue Certificate
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue Certificate</DialogTitle>
          <DialogDescription>
            Generates the certificate PDF and pins it to IPFS automatically. If a wallet is
            connected and a recipient wallet address is known, it&apos;s also anchored on-chain
            immediately — otherwise it stays pending until one is.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="single">
          <TabsList className="w-full">
            <TabsTrigger value="single" className="flex-1">
              Single
            </TabsTrigger>
            <TabsTrigger value="csv" className="flex-1">
              CSV Batch
            </TabsTrigger>
          </TabsList>
          <TabsContent value="single">
            <SingleIssueForm
              courseId={courseId}
              onIssued={onIssued}
              onDone={() => setOpen(false)}
            />
          </TabsContent>
          <TabsContent value="csv">
            <CsvBatchIssueForm
              courseId={courseId}
              onIssued={onIssued}
              onDone={() => setOpen(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── Single ────────────────────────────────────────────────────────────

function SingleIssueForm({
  courseId,
  onIssued,
  onDone,
}: {
  courseId: string;
  onIssued?: (certificate: CertificateDTO) => void;
  onDone: () => void;
}) {
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isConnected } = useWallet();
  const { getWriteContract } = useContract();
  const { run } = useToastTransaction();

  function reset() {
    setRecipientName("");
    setRecipientEmail("");
    setWalletAddress("");
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
          walletAddress: walletAddress || undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create certificate record");

      const certificate: CertificateDTO = data.certificate;
      toast.success(`Certificate record created (${certificate.credentialId}). PDF pinned to IPFS.`);

      reset();
      onDone();
      onIssued?.(certificate);

      if (isConnected && certificate.cid && walletAddress) {
        const expiresAtUnix = expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : 0;
        try {
          await run(
            async () => {
              const contract = await getWriteContract();
              const tx = await contract.issueCredential(
                certificate.credentialId,
                certificate.cid,
                walletAddress,
                expiresAtUnix
              );
              const receipt = await tx.wait();
              await fetch(`/api/certificates/${certificate.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ txHash: receipt?.hash ?? tx.hash }),
              });
              onIssued?.({ ...certificate, status: "ACTIVE", txHash: receipt?.hash ?? tx.hash });
              return receipt;
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 pt-2">
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
        <Label htmlFor="walletAddress">Recipient wallet address (optional)</Label>
        <Input
          id="walletAddress"
          placeholder="0x..."
          value={walletAddress}
          onChange={(e) => setWalletAddress(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Leave blank if unknown yet — the certificate is anchored automatically once the
          recipient links or claims with a wallet.
        </p>
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
  );
}

// ── CSV Batch ────────────────────────────────────────────────────────

function CsvBatchIssueForm({
  courseId,
  onIssued,
  onDone,
}: {
  courseId: string;
  onIssued?: (certificate: CertificateDTO) => void;
  onDone: () => void;
}) {
  const [rows, setRows] = useState<ParsedRecipientRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isConnected } = useWallet();
  const { getWriteContract } = useContract();
  const { run } = useToastTransaction();

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_FILE_SIZE = 1024 * 1024; // 1 MB
    const MAX_ROWS = 100;

    if (file.size > MAX_FILE_SIZE) {
      setParseErrors([`File is too large (${Math.round(file.size / 1024)} KB). Maximum file size is ${MAX_FILE_SIZE / 1024} KB.`]);
      setRows([]);
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setFileName(file.name);
    const text = await file.text();
    const parsed = parseRecipientCsv(text);

    if (parsed.rows.length > MAX_ROWS) {
      setParseErrors([`Too many rows (${parsed.rows.length}). Maximum is ${MAX_ROWS} rows per batch.`]);
      setRows([]);
    } else {
      setRows(parsed.rows);
      setParseErrors(parsed.errors);
    }
  }

  function reset() {
    setRows([]);
    setParseErrors([]);
    setFileName(null);
    setExpiresAt("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (rows.length === 0) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/certificates/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          rows,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to issue batch");

      const certificates: CertificateDTO[] = data.certificates;
      certificates.forEach((c) => onIssued?.(c));
      toast.success(`${certificates.length} certificate(s) created. PDFs pinned to IPFS.`);

      const anchorable = certificates.filter((c) => c.cid && c.walletAddress);
      reset();
      onDone();

      if (isConnected && anchorable.length > 0) {
        const expiresAtUnix = expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : 0;
        try {
          await run(
            async () => {
              const contract = await getWriteContract();
              const tx = await contract.issueCredentialBatch(
                anchorable.map((c) => c.credentialId),
                anchorable.map((c) => c.cid),
                anchorable.map((c) => c.walletAddress),
                anchorable.map(() => expiresAtUnix)
              );
              const receipt = await tx.wait();
              const txHash = receipt?.hash ?? tx.hash;
              await Promise.all(
                anchorable.map((c) =>
                  fetch(`/api/certificates/${c.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ txHash }),
                  })
                )
              );
              anchorable.forEach((c) => onIssued?.({ ...c, status: "ACTIVE", txHash }));
              return receipt;
            },
            {
              pending: `Anchoring ${anchorable.length} credential(s) on-chain...`,
              success: "Credentials anchored on-chain.",
              error: "On-chain anchoring failed",
            }
          );
        } catch {
          // Toast already shown — records exist in DB for manual retry
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to issue batch");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 pt-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="csvFile">CSV file</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5" />
            Choose file
          </Button>
          <span className="truncate text-sm text-muted-foreground">
            {fileName || "No file chosen"}
          </span>
        </div>
        <input
          ref={fileInputRef}
          id="csvFile"
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileChange}
        />
        <p className="text-xs text-muted-foreground">
          Columns: <code>name</code> (required), <code>email</code>, <code>wallet</code>{" "}
          (both optional). Rows without a wallet stay pending until one is known.
        </p>
      </div>

      {parseErrors.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
          {parseErrors.map((err, i) => (
            <p key={i}>{err}</p>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Wallet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{row.recipientName}</TableCell>
                  <TableCell className="text-muted-foreground">{row.recipientEmail || "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.walletAddress ? `${row.walletAddress.slice(0, 10)}…` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="batchExpiresAt">Expiry date (optional, applies to all rows)</Label>
        <Input
          id="batchExpiresAt"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || rows.length === 0} className="gap-1.5">
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Issue {rows.length > 0 ? rows.length : ""} Certificate{rows.length === 1 ? "" : "s"}
        </Button>
      </DialogFooter>
    </form>
  );
}
