import { HeaderSkeleton, CardListSkeleton } from "@/components/ui/page-skeletons";

export default function CoursesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton withAction />
      <CardListSkeleton count={4} />
    </div>
  );
}
