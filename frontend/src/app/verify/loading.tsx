import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/**
 * The credential-ID search page. Note this does not cover
 * /verify/[credentialId], which has its own heavier skeleton — that route
 * resolves against both Postgres and the chain.
 */
export default function VerifyLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Card className="mt-8">
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
        </CardContent>
      </Card>
    </div>
  );
}
