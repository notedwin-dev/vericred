import Link from "next/link";
import { ArrowRight, Building2, ShieldCheck, User } from "lucide-react";

/**
 * The split-screen chooser (docs/prds/institution-registration-prd.md Decision 8).
 * Deliberately carries no form fields of its own — the two paths collect
 * genuinely different things, so each gets a focused page with its own URL,
 * back-button behaviour, and bookmark.
 */
export const metadata = {
  title: "Create an account · VeriCred",
};

const PANELS = [
  {
    href: "/register/user",
    icon: User,
    eyebrow: "For individuals",
    title: "I'm collecting credentials",
    body: "Claim, store and share the certificates institutions issue to you — each one independently verifiable by anyone you send it to.",
    bullets: ["Claim credentials issued to your email", "A public profile at /u/your-name", "Share a verified link or PDF"],
  },
  {
    href: "/register/institution",
    icon: Building2,
    eyebrow: "For institutions",
    title: "I'm issuing credentials",
    body: "Issue tamper-proof certificates to your students or staff, one at a time or a whole cohort at once.",
    bullets: ["Design reusable certificate templates", "Bulk-issue from a CSV", "Revoke with a permanent, auditable reason"],
    note: "Registrations are reviewed by an admin before you can issue.",
  },
];

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="size-5" />
        VeriCred
      </Link>

      <div className="mb-10 text-center">
        <h1 className="text-2xl font-semibold sm:text-3xl">Create an account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Which of these sounds like you?
        </p>
      </div>

      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        {PANELS.map((panel) => (
          <Link
            key={panel.href}
            href={panel.href}
            className="group flex flex-col rounded-xl border bg-card p-6 text-card-foreground transition-all hover:border-foreground/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <panel.icon className="size-6 text-muted-foreground transition-colors group-hover:text-foreground" />

            <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {panel.eyebrow}
            </p>
            <h2 className="mt-1 text-lg font-semibold">{panel.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{panel.body}</p>

            <ul className="mt-4 flex flex-col gap-1.5 text-sm text-muted-foreground">
              {panel.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2">
                  <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
                  {bullet}
                </li>
              ))}
            </ul>

            {panel.note && (
              <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{panel.note}</p>
            )}

            <span className="mt-6 flex items-center gap-1.5 text-sm font-medium">
              Continue
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
