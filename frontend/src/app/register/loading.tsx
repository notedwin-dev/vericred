import { AuthCardSkeleton } from "@/components/ui/page-skeletons";

/** Covers /register (the chooser), /register/user and /register/institution. */
export default function RegisterLoading() {
  return <AuthCardSkeleton rows={4} />;
}
