import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, Award, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/credentials/status-badge";
import { prisma } from "@/lib/prisma";
import { formatTimestamp } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { name: true, username: true },
  });

  if (!user) return { title: "User Not Found — VeriCred" };

  return {
    title: `${user.name ?? user.username} — VeriCred`,
    description: `View ${user.name ?? user.username}'s verified credentials on VeriCred.`,
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
      createdAt: true,
      certificates: {
        where: { status: { in: ["ACTIVE", "EXPIRED"] } },
        select: {
          id: true,
          credentialId: true,
          recipientName: true,
          status: true,
          issuedAt: true,
          expiresAt: true,
          course: {
            select: {
              name: true,
              issuer: {
                select: { organizationName: true },
              },
            },
          },
        },
        orderBy: { issuedAt: "desc" },
      },
    },
  });

  if (!user) notFound();

  const initials = (user.name || user.username || "?").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5" />
            VeriCred
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-8">
          <div className="flex items-center gap-4">
            <Avatar size="lg">
              <AvatarImage src={user.image ?? undefined} alt={user.name ?? user.username ?? ""} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {user.name ?? user.username}
              </h1>
              <p className="text-sm text-muted-foreground">
                @{user.username}
                <span className="mx-1.5">·</span>
                Member since {formatTimestamp(user.createdAt, { year: "numeric", month: "long" })}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center gap-2">
              <Award className="size-5 text-muted-foreground" />
              <h2 className="text-lg font-medium">
                Credentials
                <Badge variant="secondary" className="ml-2">
                  {user.certificates.length}
                </Badge>
              </h2>
            </div>

            {user.certificates.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    No public credentials yet.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {user.certificates.map((cert) => (
                  <Link key={cert.id} href={`/c/${encodeURIComponent(cert.credentialId)}`}>
                    <Card className="transition-colors hover:bg-muted/50">
                      <CardContent className="flex flex-col gap-2 py-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{cert.course.name}</p>
                            <p className="truncate text-sm text-muted-foreground">
                              {cert.course.issuer.organizationName}
                            </p>
                          </div>
                          <StatusBadge status={cert.status} />
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            Issued {formatTimestamp(cert.issuedAt, { year: "numeric", month: "short", day: "numeric" })}
                          </span>
                          <ExternalLink className="size-3" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
