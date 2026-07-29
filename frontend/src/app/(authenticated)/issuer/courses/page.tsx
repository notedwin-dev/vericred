"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { IssuerNav } from "@/components/issuer/issuer-nav";
import type { CourseDTO } from "@/types";

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const res = await fetch("/api/courses");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load courses");
        if (!cancelled) setCourses(data.courses ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load courses");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
          <p className="text-sm text-muted-foreground">
            Certificate programs your institution issues.
          </p>
        </div>
        <Button render={<Link href="/issuer/courses/new" />} className="gap-1.5">
          <Plus className="size-4" />
          New Course
        </Button>
      </div>

      <IssuerNav />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load courses</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && courses.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <BookOpen className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No courses yet</p>
            <p className="text-sm text-muted-foreground">
              Create a course to start issuing certificates.
            </p>
          </div>
          <Button render={<Link href="/issuer/courses/new" />} size="sm" className="mt-1 gap-1.5">
            <Plus className="size-4" />
            New Course
          </Button>
        </div>
      )}

      {!isLoading && courses.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Link key={course.id} href={`/issuer/courses/${course.id}`}>
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardContent className="flex flex-col gap-2">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                    <BookOpen className="size-4.5 text-primary" />
                  </div>
                  <h3 className="font-medium leading-snug">{course.name}</h3>
                  {course.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {course.description}
                    </p>
                  )}
                  <p className="mt-auto text-xs text-muted-foreground">
                    {course.certificateCount ?? 0} certificate
                    {course.certificateCount === 1 ? "" : "s"} issued
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
