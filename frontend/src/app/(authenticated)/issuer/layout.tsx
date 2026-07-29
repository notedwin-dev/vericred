import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function IssuerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user || (session.user.role !== "ISSUER" && session.user.role !== "ADMIN")) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
