import { Badge } from "@/components/ui/badge";
import type { CertificateStatus } from "@/types";

const STATUS_STYLES: Record<CertificateStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  CLAIMED: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",
  PENDING: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  REVOKED: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  EXPIRED: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: CertificateStatus }) {
  return (
    <Badge variant="secondary" className={STATUS_STYLES[status]}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}
