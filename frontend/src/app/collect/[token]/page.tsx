"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { ShieldCheck, Loader2, Building2, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface CollectionLinkView {
  token: string;
  active: boolean;
  maxCollections: number | null;
  currentCount: number;
  course: {
    id: string;
    name: string;
    description: string | null;
    issuer: { organizationName: string; logo: string | null };
  };
}

export default function CollectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { status } = useSession();
  const router = useRouter();

  const [link, setLink] = useState<CollectionLinkView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimed, setClaimed] = useState<{ credentialId: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/collect/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Collection link not found");
        if (!cancelled) setLink(data.link);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load link");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleClaim() {
    setIsClaiming(true);
    try {
      const res = await fetch(`/api/collect/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to claim certificate");
      setClaimed(data.certificate);
      toast.success("Certificate claimed successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to claim certificate");
    } finally {
      setIsClaiming(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="size-5" />
        VeriCred
      </Link>

      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 pt-2 text-center">
          {isLoading && (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading...
            </div>
          )}

          {!isLoading && error && (
            <div className="py-10">
              <p className="font-medium">This link is unavailable</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
          )}

          {!isLoading && link && !claimed && (
            <>
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
                <Building2 className="size-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {link.course.issuer.organizationName}
                </p>
                <h1 className="mt-1 text-xl font-semibold">{link.course.name}</h1>
                {link.course.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{link.course.description}</p>
                )}
              </div>

              {!link.active && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  This collection link is no longer active.
                </p>
              )}

              {link.active && status === "unauthenticated" && (
                <div className="flex w-full flex-col gap-2">
                  <p className="text-sm text-muted-foreground">Sign in to claim this certificate.</p>
                  <Button render={<Link href={`/login?callbackUrl=/collect/${token}`} />} nativeButton={false} className="w-full">
                    Sign in to claim
                  </Button>
                </div>
              )}

              {link.active && status === "authenticated" && (
                <Button className="w-full" onClick={handleClaim} disabled={isClaiming}>
                  {isClaiming ? <Loader2 className="size-4 animate-spin" /> : "Claim Certificate"}
                </Button>
              )}

              {status === "loading" && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
            </>
          )}

          {claimed && (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 className="size-10 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="font-medium">Certificate claimed</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your credential ID is <span className="font-mono">{claimed.credentialId}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => router.push("/dashboard")}>
                  Go to Dashboard
                </Button>
                <Button render={<Link href={`/c/${encodeURIComponent(claimed.credentialId)}`} />} nativeButton={false}>
                  View Credential
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
