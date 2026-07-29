import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardRecipientView } from "@/components/dashboard/dashboard-recipient-view";

/**
 * Issuer/Admin already have role-appropriate stat dashboards at /issuer and
 * /admin — send them there instead of this recipient-focused "My
 * Credentials" view, which every authenticated user's Dashboard nav link
 * points to by default. Scoped to this exact page (not a layout) so
 * /dashboard/settings stays reachable for every role.
 */
export default async function DashboardPage() {
  const session = await auth();

  if (session?.user.role === "ISSUER") redirect("/issuer");
  if (session?.user.role === "ADMIN") redirect("/admin");

  return <DashboardRecipientView />;
}
