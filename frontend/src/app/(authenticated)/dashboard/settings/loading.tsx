import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { HeaderSkeleton } from "@/components/ui/page-skeletons";

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton />
      {/* Profile, email/password, connected accounts, wallet. */}
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex flex-col gap-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full max-w-md" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-10 w-full max-w-sm rounded-md" />
              <Skeleton className="h-10 w-full max-w-sm rounded-md" />
            </div>
            <Skeleton className="h-9 w-28 rounded-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
