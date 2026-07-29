"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Loader2, Wallet, Unplug, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppKitWallet } from "@/hooks/use-appkit-wallet";
import { formatAddress } from "@/lib/utils";

const WALLETCONNECT_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);

interface ProfileData {
  name: string | null;
  username: string | null;
  email: string | null;
  image: string | null;
  walletAddress: string | null;
}

export default function SettingsPage() {
  const { update: updateSession } = useSession();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/user/profile");
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (cancelled) return;
        setProfile(data.user);
        setName(data.user.name ?? "");
        setUsername(data.user.username ?? "");
      } catch {
        if (!cancelled) toast.error("Failed to load profile.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim() || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save.");
        return;
      }
      setProfile(data.user);
      await updateSession();
      toast.success("Profile updated.");
    } catch {
      toast.error("Failed to save profile.");
    } finally {
      setIsSaving(false);
    }
  }

  const initials = (profile?.name || profile?.email || "?").slice(0, 2).toUpperCase();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile and wallet connection.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-6 pt-2">
          <h2 className="font-medium">Profile</h2>

          <div className="flex items-center gap-4">
            <Avatar size="lg">
              <AvatarImage src={profile?.image ?? undefined} alt={profile?.name ?? "User"} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="text-sm text-muted-foreground">
              Profile picture is sourced from your social login provider.
            </div>
          </div>

          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. johndoe"
                />
                <p className="text-xs text-muted-foreground">
                  {username.trim()
                    ? `Your profile will be at /u/${username.trim().toLowerCase()}`
                    : "Set a username to enable your public profile."}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input value={profile?.email ?? ""} disabled />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="size-4 animate-spin" /> : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-2">
          <h2 className="font-medium">Wallet</h2>
          <Separator />
          {WALLETCONNECT_CONFIGURED ? (
            <AppKitWalletSection linkedWallet={profile?.walletAddress ?? null} />
          ) : (
            <StaticWalletSection linkedWallet={profile?.walletAddress ?? null} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AppKitWalletSection({ linkedWallet }: { linkedWallet: string | null }) {
  const { address, isConnected, openModal, disconnect } = useAppKitWallet();

  async function handleConnect() {
    try {
      await openModal();
    } catch {
      toast.error("Failed to open wallet modal.");
    }
  }

  function handleDisconnect() {
    disconnect();
    toast.success("Wallet disconnected.");
  }

  return (
    <>
      {isConnected && address ? (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Wallet className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium font-mono">{formatAddress(address, 6)}</p>
              <p className="text-xs text-muted-foreground">Connected</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDisconnect}>
            <Unplug className="size-3.5" />
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">No wallet connected</p>
            <p className="text-xs text-muted-foreground">
              Connect a wallet to interact with on-chain credentials.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleConnect}>
            <Wallet className="size-3.5" />
            Connect
          </Button>
        </div>
      )}

      <LinkedWalletInfo address={linkedWallet} />
    </>
  );
}

function StaticWalletSection({ linkedWallet }: { linkedWallet: string | null }) {
  return (
    <>
      <div>
        <p className="text-sm font-medium">WalletConnect not configured</p>
        <p className="text-xs text-muted-foreground">
          Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local to enable wallet connections.
        </p>
      </div>
      <LinkedWalletInfo address={linkedWallet} />
    </>
  );
}

function LinkedWalletInfo({ address }: { address: string | null }) {
  if (!address) return null;

  return (
    <>
      <Separator />
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Linked wallet (on-chain identity)</p>
          <p className="text-sm font-mono">{formatAddress(address, 8)}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Copy address"
          onClick={() => {
            navigator.clipboard.writeText(address);
            toast.success("Address copied.");
          }}
        >
          <Copy className="size-3.5" />
        </Button>
      </div>
    </>
  );
}
