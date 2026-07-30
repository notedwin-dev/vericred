"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface VerifyFormProps {
  defaultValue?: string;
  onSubmit?: (credentialId: string) => void;
}

/**
 * Credential ID input used on `/verify`. Navigates to `/verify/[id]` on
 * submit so the result is shareable via URL, unless an `onSubmit` handler is
 * given (used when the parent wants to fetch inline instead of navigating).
 */
export function VerifyForm({ defaultValue = "", onSubmit }: VerifyFormProps) {
  const [credentialId, setCredentialId] = useState(defaultValue);
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = credentialId.trim();
    if (!trimmed) return;

    if (onSubmit) {
      onSubmit(trimmed);
    } else {
      router.push(`/verify/${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="credentialId">Credential ID</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="credentialId"
            placeholder="e.g. VC-2026-A1B2C3"
            value={credentialId}
            onChange={(e) => setCredentialId(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            className="h-11 flex-1 text-base"
          />
          <Button type="submit" size="lg" className="h-11 gap-2 px-6">
            <Search className="size-4" />
            Verify
          </Button>
        </div>
      </div>
    </form>
  );
}
