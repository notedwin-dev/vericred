import { ShieldCheck, FileCheck2, Link2, Search, ArrowRight } from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";
import { PublicAuthAction } from "@/components/layout/public-auth-action";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      {/* No navbar on the landing page — just a sign-in link top-right. */}
      <header className="flex items-center justify-between px-6 py-6 sm:px-10">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5" />
          VeriCred
        </div>
        <PublicAuthAction />
      </header>

      <main className="flex flex-1 flex-col items-center">
        {/* Hero */}
        <section className="flex w-full max-w-4xl flex-col items-center gap-6 px-6 py-24 text-center sm:px-10">
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            Built on blockchain &middot; Anchored to IPFS
          </span>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-balance sm:text-6xl">
            Tamper-proof academic credentials, verified in seconds
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground text-pretty">
            VeriCred anchors every certificate to the blockchain so anyone — employers,
            universities, or you — can verify authenticity instantly, without ever
            contacting the issuer.
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/verify" size="lg" className="h-11 gap-2 px-6 text-base">
              <Search className="size-4" />
              Verify a Credential
            </LinkButton>
            <LinkButton
              href="/login"
              size="lg"
              variant="outline"
              className="h-11 gap-2 px-6 text-base"
            >
              Get Started <ArrowRight className="size-4" />
            </LinkButton>
          </div>
        </section>

        {/* How it works */}
        <section className="w-full border-t bg-background px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
              How it works
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-muted-foreground">
              Three simple steps take a certificate from creation to publicly verifiable proof.
            </p>

            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                  <FileCheck2 className="size-6 text-primary" />
                </div>
                <h3 className="font-medium">1. Issue</h3>
                <p className="text-sm text-muted-foreground">
                  Institutions create certificates and upload the encrypted document to IPFS.
                </p>
              </div>
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                  <Link2 className="size-6 text-primary" />
                </div>
                <h3 className="font-medium">2. Anchor</h3>
                <p className="text-sm text-muted-foreground">
                  The IPFS fingerprint is anchored on-chain, permanently and tamper-proof.
                </p>
              </div>
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                  <Search className="size-6 text-primary" />
                </div>
                <h3 className="font-medium">3. Verify</h3>
                <p className="text-sm text-muted-foreground">
                  Anyone can verify a credential&apos;s authenticity in seconds — no account needed.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t px-6 py-8 text-center text-sm text-muted-foreground sm:px-10">
        <p>VeriCred &middot; Academic Credential Verification System</p>
      </footer>
    </div>
  );
}
