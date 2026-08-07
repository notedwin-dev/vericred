import {
  HeaderSkeleton,
  StatGridSkeleton,
  CardListSkeleton,
} from "@/components/ui/page-skeletons";

export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton />
      <StatGridSkeleton count={4} />
      <CardListSkeleton count={3} />
    </div>
  );
}
