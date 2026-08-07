import {
  HeaderSkeleton,
  TabsSkeleton,
  CardListSkeleton,
} from "@/components/ui/page-skeletons";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton />
      <TabsSkeleton count={3} />
      <CardListSkeleton count={4} />
    </div>
  );
}
