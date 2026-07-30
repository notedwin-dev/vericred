"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function NewTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [body, setBody] = useState("");
  const [accentColor, setAccentColor] = useState("#4f46e5");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          layout: { title, subtitle, body, accentColor },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create template");
      toast.success("Template created.");
      router.push("/issuer/templates");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <Link
        href="/issuer/templates"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to templates
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Template</h1>
        <p className="text-sm text-muted-foreground">
          Define the layout used to render certificates for this template.
        </p>
      </div>

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Template name</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard Certificate"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Certificate of Completion"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subtitle">Subtitle</Label>
              <Input
                id="subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="This certifies that"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="body">Body text</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="has successfully completed the requirements of..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accentColor">Accent color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="accentColor"
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-9 w-16 p-1"
                />
                <span className="text-sm text-muted-foreground">{accentColor}</span>
              </div>
            </div>

            <Button type="submit" className="mt-2 h-10 w-fit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Create Template"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
