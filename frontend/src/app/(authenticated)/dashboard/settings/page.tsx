"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { signIn, useSession } from "next-auth/react";
import { toast } from "sonner";
import { Loader2, Camera, Link2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GitHubIcon, GoogleIcon, LinkedInIcon } from "@/components/icons/brand-icons";
import { LinkedWalletInfo } from "@/components/dashboard/linked-wallet-info";

/**
 * Loaded lazily on purpose: this page's only route to @reown/appkit. Eager
 * import put the whole AppKit + Lit graph in this route's compilation unit.
 * See docs/prds/dev-performance.md.
 */
const AppKitWalletSection = dynamic(
  () => import("@/components/dashboard/appkit-wallet-section"),
  { ssr: false, loading: () => <Skeleton className="h-16 w-full rounded-md" /> }
);

const WALLETCONNECT_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);

const SOCIAL_PROVIDERS = [
  { id: "github", label: "GitHub", icon: GitHubIcon },
  { id: "google", label: "Google", icon: GoogleIcon },
  { id: "linkedin", label: "LinkedIn", icon: LinkedInIcon },
] as const;

interface ProfileData {
  name: string | null;
  username: string | null;
  email: string | null;
  pendingEmail: string | null;
  image: string | null;
  walletAddress: string | null;
  linkedProviders: string[];
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const { update: updateSession } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const emailVerified = searchParams.get("emailVerified");
    const emailError = searchParams.get("emailError");
    if (!emailVerified && !emailError) return;

    if (emailVerified) {
      toast.success("Email verified.");
    } else if (emailError === "taken") {
      toast.error("That email was verified by another account in the meantime.");
    } else if (emailError === "expired") {
      toast.error("That verification link expired. Send a new one.");
    } else {
      toast.error("That verification link is invalid.");
    }
    router.replace("/dashboard/settings");
  }, [searchParams, router]);

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
      setProfile((prev) => (prev ? { ...prev, ...data.user } : data.user));
      await updateSession();
      toast.success("Profile updated.");
    } catch {
      toast.error("Failed to save profile.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/user/avatar", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        toast.error(uploadData.error || "Failed to upload image.");
        return;
      }

      const saveRes = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: uploadData.url }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        toast.error(saveData.error || "Failed to save profile picture.");
        return;
      }

      setProfile((prev) => (prev ? { ...prev, ...saveData.user } : saveData.user));
      await updateSession();
      toast.success("Profile picture updated.");
    } catch {
      toast.error("Failed to upload image.");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  const refreshWalletStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/user/profile");
      if (!res.ok) return;
      const data = await res.json();
      setProfile((prev) => (prev ? { ...prev, ...data.user } : data.user));
    } catch {
      // best-effort — the wallet section falls back to its own connection state
    }
  }, []);

  const initials = (profile?.name || profile?.email || "?").slice(0, 2).toUpperCase();
  const isWalletFirst = Boolean(profile?.walletAddress) && !profile?.email;

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
          Manage your profile, sign-in methods, and wallet connection.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-6 pt-2">
          <h2 className="font-medium">Profile</h2>

          <div className="flex items-center gap-4">
            <button
              type="button"
              className="group relative"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              aria-label="Change profile picture"
            >
              <Avatar size="lg">
                <AvatarImage src={profile?.image ?? undefined} alt={profile?.name ?? "User"} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                {isUploadingAvatar ? (
                  <Loader2 className="size-4 animate-spin text-white" />
                ) : (
                  <Camera className="size-4 text-white" />
                )}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <div className="text-sm text-muted-foreground">
              Click your avatar to upload a new picture (PNG, JPEG, WEBP, or GIF, up to 5MB).
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
          <h2 className="font-medium">Email & Password</h2>
          <Separator />
          {isWalletFirst ? (
            <EmailPasswordSection
              pendingEmail={profile?.pendingEmail ?? null}
              onSaved={(updated) => setProfile((prev) => (prev ? { ...prev, ...updated } : prev))}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input value={profile?.email ?? ""} disabled />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-2">
          <h2 className="font-medium">Connected Accounts</h2>
          <Separator />
          <ConnectedAccountsSection
            linkedProviders={profile?.linkedProviders ?? []}
            onUnlinked={(provider) =>
              setProfile((prev) =>
                prev
                  ? { ...prev, linkedProviders: prev.linkedProviders.filter((p) => p !== provider) }
                  : prev
              )
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-2">
          <h2 className="font-medium">Wallet</h2>
          <Separator />
          {WALLETCONNECT_CONFIGURED ? (
            <AppKitWalletSection
              linkedWallet={profile?.walletAddress ?? null}
              onWalletConnected={refreshWalletStatus}
            />
          ) : (
            <StaticWalletSection linkedWallet={profile?.walletAddress ?? null} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmailPasswordSection({
  pendingEmail,
  onSaved,
}: {
  pendingEmail: string | null;
  onSaved: (updated: { pendingEmail: string | null }) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/user/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: password || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save.");
        return;
      }
      onSaved({ pendingEmail: data.pendingEmail });
      setPassword("");
      toast.success("Check your inbox to verify this email address.");
    } catch {
      toast.error("Failed to save email.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Your account was created with a wallet, so it has no email yet. Set one (and
        optionally a password) to also sign in with email + password.
      </p>
      {pendingEmail && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Verification email sent to <span className="font-medium">{pendingEmail}</span> —
          click the link in that email to confirm it.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wallet-email">Email</Label>
          <Input
            id="wallet-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wallet-password">Password (optional)</Label>
          <Input
            id="wallet-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to skip"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Send Verification Email"}
        </Button>
      </div>
    </form>
  );
}

function ConnectedAccountsSection({
  linkedProviders,
  onUnlinked,
}: {
  linkedProviders: string[];
  onUnlinked: (provider: string) => void;
}) {
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);

  async function handleLink(provider: string) {
    setPendingProvider(provider);
    try {
      const res = await fetch("/api/user/link-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to start linking.");
        setPendingProvider(null);
        return;
      }
      await signIn(provider, { callbackUrl: "/dashboard/settings" });
    } catch {
      toast.error("Failed to start linking.");
      setPendingProvider(null);
    }
  }

  async function handleUnlink(provider: string) {
    setPendingProvider(provider);
    try {
      const res = await fetch("/api/user/unlink-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to unlink.");
        return;
      }
      onUnlinked(provider);
      toast.success("Account unlinked.");
    } catch {
      toast.error("Failed to unlink.");
    } finally {
      setPendingProvider(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {SOCIAL_PROVIDERS.map(({ id, label, icon: Icon }) => {
        const isLinked = linkedProviders.includes(id);
        const isPending = pendingProvider === id;
        return (
          <div key={id} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                <Icon className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {isLinked ? "Linked" : "Not linked"}
                </p>
              </div>
            </div>
            {isLinked ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={isPending}
                onClick={() => handleUnlink(id)}
              >
                {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Unplug className="size-3.5" />}
                Unlink
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={isPending}
                onClick={() => handleLink(id)}
              >
                {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
                Link
              </Button>
            )}
          </div>
        );
      })}
    </div>
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

