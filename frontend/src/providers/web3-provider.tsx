"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BrowserProvider, type JsonRpcSigner } from "ethers";
import { CHAIN_ID } from "@/lib/config";

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
}

/**
 * Cast rather than augment the global `Window` interface — `@reown/appkit-utils`
 * already declares a (differently-shaped, non-optional) global `Window.ethereum`,
 * and a second declaration with different modifiers is a TS2687 conflict.
 */
function getEthereum(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum;
}

interface Web3ContextValue {
  address: string | null;
  chainId: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  isWrongNetwork: boolean;
  hasProvider: boolean;
  provider: BrowserProvider | null;
  connect: () => Promise<string | null>;
  disconnect: () => void;
  getSigner: () => Promise<JsonRpcSigner>;
  switchNetwork: () => Promise<void>;
}

const Web3Context = createContext<Web3ContextValue | undefined>(undefined);

const DISCONNECT_KEY = "vericred:wallet-disconnected";

function createProvider(): BrowserProvider | null {
  const ethereum = getEthereum();
  if (ethereum) {
    return new BrowserProvider(ethereum);
  }
  return null;
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [hasProvider, setHasProvider] = useState(false);

  useEffect(() => {
    if (getEthereum()) {
      setHasProvider(true);
      setProvider(createProvider());
    }
  }, []);

  const refresh = useCallback(async () => {
    const ethereum = getEthereum();
    if (!ethereum) return;
    try {
      const accounts = (await ethereum.request({
        method: "eth_accounts",
      })) as string[];
      const network = (await ethereum.request({
        method: "eth_chainId",
      })) as string;
      setChainId(parseInt(network, 16));
      setAddress(accounts?.[0] ?? null);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const ethereum = getEthereum();
    if (!ethereum) return;
    if (localStorage.getItem(DISCONNECT_KEY) !== "1") {
      refresh();
    }

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setAddress(accounts?.[0] ?? null);
    };
    const handleChainChanged = (...args: unknown[]) => {
      const newChainId = args[0] as string;
      setChainId(parseInt(newChainId, 16));
      setProvider(createProvider());
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);

    return () => {
      ethereum.removeListener("accountsChanged", handleAccountsChanged);
      ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [refresh]);

  const connect = useCallback(async (): Promise<string | null> => {
    const ethereum = getEthereum();
    if (!ethereum) {
      return null;
    }
    setIsConnecting(true);
    try {
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      localStorage.removeItem(DISCONNECT_KEY);
      setProvider(createProvider());
      await refresh();
      return accounts?.[0] ?? null;
    } finally {
      setIsConnecting(false);
    }
  }, [refresh]);

  const disconnect = useCallback(() => {
    setAddress(null);
    localStorage.setItem(DISCONNECT_KEY, "1");
  }, []);

  const getSigner = useCallback(async (): Promise<JsonRpcSigner> => {
    if (!provider) {
      throw new Error("No wallet provider detected. Please install MetaMask.");
    }
    return provider.getSigner();
  }, [provider]);

  const switchNetwork = useCallback(async () => {
    const ethereum = getEthereum();
    if (!ethereum) return;
    const hexChainId = `0x${CHAIN_ID.toString(16)}`;
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
    } catch (error) {
      const err = error as { code?: number };
      if (err?.code === 4902) {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexChainId,
              chainName: "Hardhat Localhost",
              rpcUrls: ["http://127.0.0.1:8545"],
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            },
          ],
        });
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: hexChainId }],
        });
      }
    }
  }, []);

  const value = useMemo<Web3ContextValue>(
    () => ({
      address,
      chainId,
      isConnected: !!address,
      isConnecting,
      isWrongNetwork: !!address && chainId !== null && chainId !== CHAIN_ID,
      hasProvider,
      provider,
      connect,
      disconnect,
      getSigner,
      switchNetwork,
    }),
    [address, chainId, isConnecting, hasProvider, provider, connect, disconnect, getSigner, switchNetwork]
  );

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3Context() {
  const ctx = useContext(Web3Context);
  if (!ctx) {
    throw new Error("useWeb3Context must be used within a Web3Provider");
  }
  return ctx;
}
