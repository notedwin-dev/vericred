"use client";

import { useEffect, useRef, useState } from "react";
import type { VerifyApiResult } from "@/types/verify";

export function useCredential(credentialId: string | undefined) {
  const [result, setResult] = useState<VerifyApiResult | null>(null);
  const [isLoading, setIsLoading] = useState(!!credentialId);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);

  useEffect(() => {
    if (!credentialId) {
      setResult(null);
      setIsLoading(false);
      return;
    }

    const version = ++versionRef.current;
    const controller = new AbortController();

    setIsLoading(true);
    setError(null);

    fetch(`/api/verify/${encodeURIComponent(credentialId)}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (version !== versionRef.current) return;
        if (!res.ok) throw new Error(data.error || "Failed to verify credential");
        setResult(data);
      })
      .catch((err) => {
        if (version !== versionRef.current) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to verify credential");
        setResult(null);
      })
      .finally(() => {
        if (version === versionRef.current) setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [credentialId]);

  return { result, isLoading, error };
}
