import { AuthCardSkeleton } from "@/components/ui/page-skeletons";

/** Covers /login and /login/institution. */
export default function LoginLoading() {
  return <AuthCardSkeleton rows={2} />;
}
