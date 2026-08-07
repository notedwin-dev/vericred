import { Skeleton } from "@/components/ui/skeleton";
import { CardListSkeleton } from "@/components/ui/page-skeletons";

/** Public user profile — avatar + identity block, then their credentials. */
export default function ProfileLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Skeleton className="size-24 rounded-full" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="mt-10">
        <CardListSkeleton count={3} />
      </div>
    </div>
  );
}
