import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { CaseActions } from "@/components/CaseActions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_LABEL, formatDate } from "@/lib/hanohub";
import { useMe } from "@/lib/use-me";

export const Route = createFileRoute("/_authenticated/cases/$id")({
  head: () => ({ meta: [{ title: "Case details — HanoHub" }] }),
  component: CasePage,
});

function CasePage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [msg, setMsg] = useState("");

  const { data: me } = useMe(user.id);

  const { data, isLoading } = useQuery({
    queryKey: ["case", id],
    queryFn: async () => {
      const [c, h, m, e] = await Promise.all([
        supabase.from("complaints")
          .select("*, categories(name), areas(province, district, sector, cell, village)")
          .eq("id", id).maybeSingle(),
        supabase.from("status_history").select("*").eq("complaint_id", id).order("created_at"),
        supabase.from("messages").select("*").eq("complaint_id", id).order("created_at"),
        supabase.from("evidence").select("*").eq("complaint_id", id).order("created_at"),
      ]);
      let officer: string | null = null;
      if (c.data?.assigned_officer_id) {
        const { data: p } = await supabase.from("profiles").select("full_name").eq("id", c.data.assigned_officer_id).maybeSingle();
        officer = p?.full_name ?? null;
      }
      let leader: string | null = null;
      if (c.data?.current_leader_id) {
        const { data: p } = await supabase.from("profiles").select("full_name").eq("id", c.data.current_leader_id).maybeSingle();
        leader = p?.full_name ?? null;
      }
      return { c: c.data, history: h.data ?? [], messages: m.data ?? [], evidence: e.data ?? [], officer, leader };
    },
  });

  async function send() {
    const body = msg.trim();
    if (!body || body.length > 2000) return void toast.error("Message must be 1–2000 characters.");
    const { error } = await supabase.from("messages").insert({ complaint_id: id, author_id: user.id, body });
    if (error) return void toast.error("Could not send message.");
    setMsg("");
    qc.invalidateQueries({ queryKey: ["case", id] });
  }

  async function openFile(path: string) {
    const { data: s, error } = await supabase.storage.from("evidence").createSignedUrl(path, 60);
    if (error || !s) return void toast.error("Could not open file.");
    window.open(s.signedUrl, "_blank", "noopener");
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data?.c) return <p>Case not found or you don't have access.</p>;
  const c = data.c;

  const isOwner    = c.citizen_id === user.id;
  const isOfficer  = me?.roles.includes("officer") ?? false;
  const isSupervisor = me?.isSupervisor ?? false;

  const area = c.areas as { province: string; district: string; sector: string; cell?: string; village?: string } | null;
  const locationStr = [area?.village, area?.cell, area?.sector, area?.district]
    .filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* Header card */}
      <div className="rounded-xl border bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-secondary">{c.reference}</p>
            <h1 className="mt-1 text-2xl font-semibold">{c.title}</h1>
          </div>
          <StatusBadge status={c.status} />
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-muted-foreground">Category</dt><dd>{c.categories?.name}</dd></div>
          <div><dt className="text-muted-foreground">Location</dt><dd>{locationStr || "—"}{c.location_detail ? ` · ${c.location_detail}` : ""}</dd></div>
          <div><dt className="text-muted-foreground">Assigned officer</dt><dd>{data.officer ?? "Not assigned"}</dd></div>
          <div><dt className="text-muted-foreground">Current leader</dt><dd>{data.leader ?? "Not assigned"}</dd></div>
          <div><dt className="text-muted-foreground">Level</dt><dd className="capitalize">{c.current_level ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Submitted</dt><dd>{formatDate(c.created_at)}</dd></div>
        </dl>
        <p className="mt-5 whitespace-pre-wrap text-sm">{c.description}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">

        {/* Communication */}
        <section className="rounded-xl border bg-card p-6 shadow-card lg:col-span-2">
          <h2 className="font-semibold">Communication</h2>
          <ul className="mt-4 space-y-3 max-h-72 overflow-y-auto">
            {data.messages.length === 0 && <li className="text-sm text-muted-foreground">No messages yet.</li>}
            {data.messages.map((m) => (
              <li key={m.id} className={m.author_id === user.id ? "ml-8 rounded-lg bg-accent p-3" : "mr-8 rounded-lg bg-muted p-3"}>
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">{m.author_id === user.id ? "You" : "Officer"} · {formatDate(m.created_at)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-2">
            <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Write a message…" rows={3} maxLength={2000} />
            <Button onClick={send} size="sm">Send</Button>
          </div>
        </section>

        <div className="space-y-6">
          {/* Actions — the key part that was missing! */}
          <CaseActions
            caseId={id}
            status={c.status}
            assignedTo={c.assigned_officer_id ?? null}
            userId={user.id}
            isOwner={isOwner}
            isOfficer={isOfficer}
            isSupervisor={isSupervisor}
          />

          {/* Timeline */}
          <section className="rounded-xl border bg-card p-6 shadow-card">
            <h2 className="font-semibold">Timeline</h2>
            <ol className="mt-4 space-y-4 border-l pl-4">
              {data.history.length === 0 && <li className="text-sm text-muted-foreground">No history yet.</li>}
              {data.history.map((h) => (
                <li key={h.id} className="text-sm">
                  <p className="font-medium">{STATUS_LABEL[h.to_status]}</p>
                  {h.note && <p className="text-muted-foreground">{h.note}</p>}
                  <p className="text-xs text-muted-foreground">{formatDate(h.created_at)}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* Evidence */}
          <section className="rounded-xl border bg-card p-6 shadow-card">
            <h2 className="font-semibold">Evidence</h2>
            {data.evidence.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No files.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.evidence.map((ev) => (
                  <li key={ev.id}>
                    <button onClick={() => openFile(ev.file_path)} className="flex items-center gap-2 text-left text-sm text-secondary hover:underline">
                      <FileText className="h-4 w-4 shrink-0" />
                      {ev.file_name}{ev.version > 1 ? ` (v${ev.version})` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
