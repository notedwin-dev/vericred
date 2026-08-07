import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/**
 * This route resolves a credential against both Postgres and the chain, so it
 * is one of the slowest navigations in the app and the one most likely to be
 * hit cold by an outside verifier following a QR code.
 */
export default function VerifyCredentialLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <Card className="mt-8">
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-md" />
            <Skeleton className="h-7 w-40 rounded-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-40 max-w-full" />
              </div>
            ))}
          </div>
          <Skeleton className="h-10 w-full rounded-md" />
        </CardContent>
      </Card>
    </div>
  );
}
