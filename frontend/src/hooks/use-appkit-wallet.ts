"use client";

import { useAppKit, useAppKitAccount, useDisconnect } from "@reown/appkit/react";

export function useAppKitWallet() {
  const { address, isConnected } = useAppKitAccount();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();

  return {
    address: address ?? null,
    isConnected,
    openModal: open,
    disconnect,
  };
}
