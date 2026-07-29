"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { ContractTransactionResponse } from "ethers";
import { parseContractError } from "@/lib/errors";

interface ToastTransactionOptions {
  pending?: string;
  success?: string;
  error?: string;
}

/**
 * Wraps an async contract call (expected to return a transaction, or
 * resolve after one has been mined) with sonner toast feedback: a "pending"
 * toast while the promise is in flight, swapped for "success" or an
 * error message parsed via `parseContractError`.
 */
export function useToastTransaction() {
  const [isPending, setIsPending] = useState(false);

  const run = useCallback(
    async <T = ContractTransactionResponse | unknown>(
      fn: () => Promise<T>,
      options?: ToastTransactionOptions
    ): Promise<T | null> => {
      const toastId = toast.loading(options?.pending ?? "Waiting for confirmation...");
      setIsPending(true);
      try {
        const result = await fn();
        toast.success(options?.success ?? "Transaction confirmed", { id: toastId });
        return result;
      } catch (error) {
        const message = options?.error
          ? `${options.error}: ${parseContractError(error)}`
          : parseContractError(error);
        toast.error(message, { id: toastId });
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    []
  );

  return { run, isPending };
}
