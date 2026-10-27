import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { validateEvidenceFile } from "@/lib/hanohub";

export const Route = createFileRoute("/_authenticated/report")({
  head: () => ({ meta: [{ title: "Report an issue — HanoHub" }] }),
  component: ReportPage,
});

const schema = z.object({
  title: z.string().trim().min(5, "Title needs at least 5 characters").max(150),
  description: z.string().trim().min(10, "Describe the issue in at least 10 characters").max(4000),
  category_id: z.string().uuid("Choose a category"),
  area_id: z.string().uuid("Choose a location"),
  location_detail: z.string().trim().max(200).optional(),
});

const selectCls = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

function ReportPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: lookups } = useQuery({
    queryKey: ["lookups"],
    queryFn: async () => {
      const [c, a] = await Promise.all([
        supabase.from("categories").select("id, name").eq("active", true).order("name"),
        supabase.from("areas").select("id, province, district, sector").order("district"),
      ]);
      return { categories: c.data ?? [], areas: a.data ?? [] };
    },
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    const files = (fd.getAll("files") as File[]).filter((f) => f.size > 0);
    if (files.length > 5) return toast.error("Attach at most 5 files.");
    for (const f of files) {
      const err = validateEvidenceFile(f);
      if (err) return toast.error(`${f.name}: ${err}`);
    }
    setBusy(true);
    const { data: c, error } = await supabase
      .from("complaints")
      .insert({ ...parsed.data, citizen_id: user.id })
      .select("id, reference")
      .single();
    if (error || !c) {
      setBusy(false);
      return toast.error("Could not submit your report. Please try again.");
    }
    for (const f of files) {
      const path = `${c.id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
      const up = await supabase.storage.from("evidence").upload(path, f, { contentType: f.type });
      if (up.error) {
        toast.error(`Upload failed for ${f.name}`);
        continue;
      }
      await supabase.from("evidence").insert({
        complaint_id: c.id, uploaded_by: user.id, file_path: path, file_name: f.name, mime_type: f.type, size_bytes: f.size,
      });
    }
    qc.invalidateQueries();
    toast.success(`Report ${c.reference} submitted`);
    navigate({ to: "/cases/$id", params: { id: c.id } });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Report an issue</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-5 rounded-xl border bg-card p-6 shadow-card">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" placeholder="e.g. Large pothole on KG 11 Ave" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="category_id">Category</Label>
            <select id="category_id" name="category_id" className={selectCls} defaultValue="">
              <option value="" disabled>Select…</option>
              {lookups?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="area_id">Sector</Label>
            <select id="area_id" name="area_id" className={selectCls} defaultValue="">
              <option value="" disabled>Select…</option>
              {lookups?.areas.map((a) => <option key={a.id} value={a.id}>{a.district} — {a.sector}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location_detail">Exact location (optional)</Label>
          <Input id="location_detail" name="location_detail" placeholder="Street, landmark, village" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={5} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="files">Evidence (JPG, PNG, WEBP, PDF · max 10 MB each, up to 5)</Label>
          <Input id="files" name="files" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" />
        </div>
        <Button type="submit" disabled={busy} className="w-full">{busy ? "Submitting…" : "Submit report"}</Button>
      </form>
    </div>
  );
}
