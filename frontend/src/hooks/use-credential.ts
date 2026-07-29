"use client";

import { useCallback, useEffect, useState } from "react";
import type { VerifyApiResult } from "@/types/verify";

/**
 * Fetches a single credential's verification result from the public
 * `/api/verify/[credentialId]` endpoint. Used by the verify pages and the
 * shareable public credential page — no auth required.
 */
export function useCredential(credentialId: string | undefined) {
  const [result, setResult] = useState<VerifyApiResult | null>(null);
  const [isLoading, setIsLoading] = useState(!!credentialId);
  const [error, setError] = useState<string | null>(null);

  const fetchCredential = useCallback(async () => {
    if (!credentialId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/verify/${encodeURIComponent(credentialId)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to verify credential");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify credential");
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }, [credentialId]);

  useEffect(() => {
    fetchCredential();
  }, [fetchCredential]);

  return { result, isLoading, error, refetch: fetchCredential };
}
