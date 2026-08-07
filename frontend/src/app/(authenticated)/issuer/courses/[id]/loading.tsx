import {
  HeaderSkeleton,
  StatGridSkeleton,
  CardListSkeleton,
} from "@/components/ui/page-skeletons";

export default function CourseDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton withAction />
      <StatGridSkeleton count={3} />
      <CardListSkeleton count={4} />
    </div>
  );
}
