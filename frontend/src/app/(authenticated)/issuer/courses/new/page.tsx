"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CertificateTemplateDTO } from "@/types";

export default function NewCoursePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<CertificateTemplateDTO[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [templateError, setTemplateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/templates");
        if (!res.ok) {
          if (!cancelled) setTemplateError("Failed to load templates.");
          return;
        }
        const data = await res.json();
        if (!cancelled) setTemplates(data.templates ?? []);
      } catch {
        if (!cancelled) setTemplateError("Failed to load templates.");
      } finally {
        if (!cancelled) setIsLoadingTemplates(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!templateId) {
      toast.error("Select a template for this course.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined, templateId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create course");
      toast.success("Course created.");
      router.push(`/issuer/courses/${data.course.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create course");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <Link
        href="/issuer/courses"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to courses
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Course</h1>
        <p className="text-sm text-muted-foreground">
          Courses group certificates issued for a specific program or credential.
        </p>
      </div>

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Course name</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bachelor of Computer Science"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description shown to recipients"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template">Certificate template</Label>
              {isLoadingTemplates ? (
                <p className="text-sm text-muted-foreground">Loading templates...</p>
              ) : templateError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{templateError}</p>
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No templates yet.{" "}
                  <Link href="/issuer/templates/new" className="font-medium text-foreground hover:underline">
                    Create one first
                  </Link>
                  .
                </p>
              ) : (
                <Select value={templateId} onValueChange={(value) => setTemplateId(value ?? "")}>
                  <SelectTrigger id="template" className="w-full">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Button type="submit" className="mt-2 h-10 w-fit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Create Course"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
