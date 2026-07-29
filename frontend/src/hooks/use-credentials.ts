"use client";

import { useCallback, useEffect, useState } from "react";
import type { CertificateDTO } from "@/types";

interface UseCredentialsOptions {
  courseId?: string;
  recipientId?: string;
  /** Skip the initial fetch (e.g. while the session is still loading). */
  enabled?: boolean;
}

/**
 * Fetches the current session's certificates from `/api/certificates`. The
 * API scopes results server-side based on the caller's role, so no
 * additional filtering is needed here beyond the optional query params.
 */
export function useCredentials(options: UseCredentialsOptions = {}) {
  const { courseId, recipientId, enabled = true } = options;
  const [certificates, setCertificates] = useState<CertificateDTO[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const fetchCredentials = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (courseId) params.set("courseId", courseId);
      if (recipientId) params.set("recipientId", recipientId);
      const qs = params.toString();
      const res = await fetch(`/api/certificates${qs ? `?${qs}` : ""}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load certificates");
      }
      const data = await res.json();
      setCertificates(data.certificates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load certificates");
    } finally {
      setIsLoading(false);
    }
  }, [courseId, recipientId, enabled]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  return { certificates, isLoading, error, refetch: fetchCredentials };
}
