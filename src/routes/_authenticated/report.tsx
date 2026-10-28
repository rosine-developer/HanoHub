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
  area_id: z.string().uuid("Choose your Umudugudu (village)"),
  location_detail: z.string().trim().max(200).optional(),
});

const selectCls = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm disabled:opacity-50";

type Area = {
  id: string;
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
};

function unique(arr: string[]) {
  return Array.from(new Set(arr)).sort();
}

function ReportPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  // Cascading selection state
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [sector, setSector] = useState("");
  const [cell, setCell] = useState("");
  const [areaId, setAreaId] = useState("");

  const { data: lookups } = useQuery({
    queryKey: ["lookups-full"],
    queryFn: async () => {
      const [c, a] = await Promise.all([
        supabase.from("categories").select("id, name").eq("active", true).order("name"),
        supabase
          .from("areas")
          .select("id, province, district, sector, cell, village")
          .order("province").order("district").order("sector").order("cell").order("village"),
      ]);
      return {
        categories: c.data ?? [],
        areas: (a.data ?? []) as Area[],
      };
    },
  });

  const areas = lookups?.areas ?? [];

  // Derived lists based on prior selections
  const provinces = unique(areas.map((a) => a.province));
  const districts = unique(areas.filter((a) => a.province === province).map((a) => a.district));
  const sectors   = unique(areas.filter((a) => a.province === province && a.district === district).map((a) => a.sector));
  const cells     = unique(areas.filter((a) => a.province === province && a.district === district && a.sector === sector).map((a) => a.cell));
  const villages  = areas.filter((a) => a.province === province && a.district === district && a.sector === sector && a.cell === cell);

  function resetFrom(level: "province" | "district" | "sector" | "cell") {
    if (level === "province") { setDistrict(""); setSector(""); setCell(""); setAreaId(""); }
    if (level === "district") { setSector(""); setCell(""); setAreaId(""); }
    if (level === "sector")   { setCell(""); setAreaId(""); }
    if (level === "cell")     { setAreaId(""); }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // inject the resolved area_id
    fd.set("area_id", areaId);
    const parsed = schema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
    const files = (fd.getAll("files") as File[]).filter((f) => f.size > 0);
    if (files.length > 5) return void toast.error("Attach at most 5 files.");
    for (const f of files) {
      const err = validateEvidenceFile(f);
      if (err) return void toast.error(`${f.name}: ${err}`);
    }
    setBusy(true);
    const { data: c, error } = await supabase
      .from("complaints")
      .insert({
        ...parsed.data,
        location_detail: parsed.data.location_detail || null,
        citizen_id: user.id,
      })
      .select("id, reference")
      .single();
    if (error || !c) {
      setBusy(false);
      return void toast.error("Could not submit your report. Please try again.");
    }
    for (const f of files) {
      const path = `${c.id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
      const up = await supabase.storage.from("evidence").upload(path, f, { contentType: f.type });
      if (up.error) { toast.error(`Upload failed for ${f.name}`); continue; }
      await supabase.from("evidence").insert({
        complaint_id: c.id, uploaded_by: user.id,
        file_path: path, file_name: f.name, mime_type: f.type, size_bytes: f.size,
      });
    }
    qc.invalidateQueries();
    toast.success(`Report ${c.reference} submitted — your Umudugudu leader has been notified.`);
    navigate({ to: "/cases/$id", params: { id: c.id } });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Report an issue</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your report will be automatically sent to your <strong>Umudugudu</strong> (village) leader.
        They will resolve it or escalate it up the chain.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-5 rounded-xl border bg-card p-6 shadow-card">

        {/* Title */}
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" placeholder="e.g. Large pothole on main road" />
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <Label htmlFor="category_id">Category</Label>
          <select id="category_id" name="category_id" className={selectCls} defaultValue="">
            <option value="" disabled>Select a category…</option>
            {lookups?.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* ── Cascading location ── */}
        <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
          <p className="text-sm font-medium">Your location</p>
          <p className="text-xs text-muted-foreground">
            Select from Intara (Province) down to your Umudugudu (Village)
          </p>

          {/* Intara / Province */}
          <div className="space-y-1.5">
            <Label>Intara (Province)</Label>
            <select
              className={selectCls}
              value={province}
              onChange={(e) => { setProvince(e.target.value); resetFrom("province"); }}
            >
              <option value="">Select province…</option>
              {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Akarere / District */}
          <div className="space-y-1.5">
            <Label>Akarere (District)</Label>
            <select
              className={selectCls}
              value={district}
              disabled={!province}
              onChange={(e) => { setDistrict(e.target.value); resetFrom("district"); }}
            >
              <option value="">Select district…</option>
              {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Umurenge / Sector */}
          <div className="space-y-1.5">
            <Label>Umurenge (Sector)</Label>
            <select
              className={selectCls}
              value={sector}
              disabled={!district}
              onChange={(e) => { setSector(e.target.value); resetFrom("sector"); }}
            >
              <option value="">Select sector…</option>
              {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Akagari / Cell */}
          <div className="space-y-1.5">
            <Label>Akagari (Cell)</Label>
            <select
              className={selectCls}
              value={cell}
              disabled={!sector}
              onChange={(e) => { setCell(e.target.value); resetFrom("cell"); }}
            >
              <option value="">Select cell…</option>
              {cells.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Umudugudu / Village */}
          <div className="space-y-1.5">
            <Label>Umudugudu (Village)</Label>
            <select
              className={selectCls}
              value={areaId}
              disabled={!cell}
              onChange={(e) => setAreaId(e.target.value)}
            >
              <option value="">Select village…</option>
              {villages.map((v) => (
                <option key={v.id} value={v.id}>{v.village}</option>
              ))}
            </select>
            {!areaId && cell && (
              <p className="text-xs text-warning">Please select your Umudugudu to continue.</p>
            )}
          </div>
        </div>

        {/* Exact location */}
        <div className="space-y-1.5">
          <Label htmlFor="location_detail">Exact location detail (optional)</Label>
          <Input id="location_detail" name="location_detail" placeholder="Street name, landmark, near…" />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={5}
            placeholder="Describe the problem in detail…"
          />
        </div>

        {/* Evidence */}
        <div className="space-y-1.5">
          <Label htmlFor="files">Evidence — photos or documents (optional, max 5 files, 10 MB each)</Label>
          <Input
            id="files"
            name="files"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
          />
        </div>

        <Button type="submit" disabled={busy || !areaId} className="w-full">
          {busy ? "Submitting…" : "Submit report"}
        </Button>
      </form>
    </div>
  );
}
