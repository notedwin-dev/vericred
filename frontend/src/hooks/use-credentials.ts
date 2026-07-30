"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CertificateDTO } from "@/types";

interface UseCredentialsOptions {
  courseId?: string;
  recipientId?: string;
  enabled?: boolean;
}

export function useCredentials(options: UseCredentialsOptions = {}) {
  const { courseId, recipientId, enabled = true } = options;
  const [certificates, setCertificates] = useState<CertificateDTO[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchCredentials = useCallback(async () => {
    if (!enabled) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (courseId) params.set("courseId", courseId);
      if (recipientId) params.set("recipientId", recipientId);
      const qs = params.toString();
      const res = await fetch(`/api/certificates${qs ? `?${qs}` : ""}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load certificates");
      }
      const data = await res.json();
      if (controllerRef.current !== controller) return;
      setCertificates(data.certificates ?? []);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controllerRef.current !== controller) return;
      setError(err instanceof Error ? err.message : "Failed to load certificates");
    } finally {
      if (controllerRef.current === controller) setIsLoading(false);
    }
  }, [courseId, recipientId, enabled]);

  useEffect(() => {
    fetchCredentials();
    return () => {
      controllerRef.current?.abort();
    };
  }, [fetchCredentials]);

  return { certificates, isLoading, error, refetch: fetchCredentials };
}
