import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MapPin, ArrowUpCircle, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, type ComplaintStatus } from "@/lib/hanohub";
import { cn } from "@/lib/utils";

// All 5 leader roles
const LEADER_ROLES = [
  "umudugudu_leader",
  "akagari_leader",
  "umurenge_leader",
  "akarere_leader",
  "intara_leader",
] as const;

const LEVEL_LABEL: Record<string, string> = {
  umudugudu: "Umudugudu (Village)",
  akagari:   "Akagari (Cell)",
  umurenge:  "Umurenge (Sector)",
  akarere:   "Akarere (District)",
  intara:    "Intara (Province)",
};

const NEXT_LEVEL: Record<string, string | null> = {
  umudugudu: "Akagari (Cell)",
  akagari:   "Umurenge (Sector)",
  umurenge:  "Akarere (District)",
  akarere:   "Intara (Province)",
  intara:    null,
};

export const Route = createFileRoute("/_authenticated/leader")({
  head: () => ({ meta: [{ title: "Leader Dashboard — HanoHub" }] }),
  beforeLoad: async ({ context }) => {
    const uid = (context as { user: { id: string } }).user.id;
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .in("role", LEADER_ROLES as unknown as string[]);
    if (!data || data.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: LeaderPage,
});

type Complaint = {
  id: string;
  reference: string;
  title: string;
  description: string;
  status: ComplaintStatus;
  current_level: string;
  category_name: string;
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
  location_detail: string | null;
  created_at: string;
  due_at: string | null;
};

function LeaderPage() {
  const qc = useQueryClient();
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  // My area assignment
  const { data: myArea } = useQuery({
    queryKey: ["my-leader-area"],
    queryFn: async () => {
      const { data } = await supabase.rpc("my_leader_area");
      return data?.[0] ?? null;
    },
  });

  // My assigned complaints
  const { data: complaints = [], isLoading } = useQuery({
    queryKey: ["leader-complaints"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_leader_complaints");
      if (error) throw error;
      return (data ?? []) as Complaint[];
    },
  });

  const stats = [
    { label: "Total assigned",   value: complaints.length },
    { label: "New / Submitted",  value: complaints.filter((c) => c.status === "submitted").length },
    { label: "In progress",      value: complaints.filter((c) => c.status === "in_progress").length },
    { label: "Overdue",          value: complaints.filter((c) => c.due_at && new Date(c.due_at) < new Date()).length },
  ];

  // Resolve mutation
  const resolve = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await supabase.rpc("leader_resolve", { _cid: id, _note: note });
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      toast.success("Resolution proposed — citizen will be notified.");
      setNoteMap((m) => { const n = { ...m }; delete n[id]; return n; });
      qc.invalidateQueries({ queryKey: ["leader-complaints"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Escalate mutation
  const escalate = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await supabase.rpc("escalate_to_next_level", {
        _cid: id,
        _note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      toast.success("Complaint escalated to next level.");
      setNoteMap((m) => { const n = { ...m }; delete n[id]; return n; });
      qc.invalidateQueries({ queryKey: ["leader-complaints"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const now = Date.now();

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Leader Dashboard</h1>
        {myArea && (
          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            <span>
              <span className="font-medium text-foreground capitalize">
                {myArea.role.replace("_", " ")}
              </span>
              {" — "}
              {[myArea.village, myArea.cell, myArea.sector, myArea.district, myArea.province]
                .filter(Boolean)
                .join(", ")}
            </span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-3xl font-semibold text-primary">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Complaints list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : complaints.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success/50" />
          <p className="mt-3 font-medium">All clear!</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No complaints assigned to your area right now.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {complaints.map((c) => {
            const overdue = c.due_at && new Date(c.due_at).getTime() < now;
            const isExpanded = expanded === c.id;
            const note = noteMap[c.id] ?? "";

            return (
              <div
                key={c.id}
                className="rounded-xl border bg-card shadow-card overflow-hidden"
              >
                {/* Summary row */}
                <button
                  className="w-full flex flex-wrap items-start gap-3 p-5 text-left hover:bg-muted/40 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : c.id)}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{c.reference}</span>
                      <StatusBadge status={c.status} />
                      {overdue && (
                        <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                          <Clock className="h-3 w-3" /> Overdue
                        </span>
                      )}
                    </div>
                    <p className="font-semibold">{c.title}</p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{c.category_name}</span>
                      <span>·</span>
                      <span>
                        {LEVEL_LABEL[c.current_level] ?? c.current_level}
                      </span>
                      <span>·</span>
                      <span>
                        {[c.village, c.cell, c.sector].filter(Boolean).join(", ")}
                        {c.location_detail ? ` — ${c.location_detail}` : ""}
                      </span>
                      <span>·</span>
                      <span>{formatDate(c.created_at)}</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{isExpanded ? "▲" : "▼"}</span>
                </button>

                {/* Expanded actions */}
                {isExpanded && (
                  <div className="border-t p-5 space-y-4 bg-muted/20">
                    {/* Description */}
                    <div className="rounded-lg bg-card border p-4 text-sm">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                      <p className="whitespace-pre-wrap">{c.description}</p>
                    </div>

                    {/* Links */}
                    <Link
                      to="/cases/$id"
                      params={{ id: c.id }}
                      className="text-xs text-secondary hover:underline"
                    >
                      View full case details, evidence and messages →
                    </Link>

                    {/* Note input */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        Note{" "}
                        <span className="text-muted-foreground font-normal">
                          (required for resolution, optional for escalation)
                        </span>
                      </label>
                      <Textarea
                        rows={3}
                        value={note}
                        onChange={(e) => setNoteMap((m) => ({ ...m, [c.id]: e.target.value }))}
                        placeholder="Describe what was done or why you are escalating…"
                        maxLength={2000}
                      />
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-3">
                      {/* Resolve */}
                      <Button
                        size="sm"
                        onClick={() => resolve.mutate({ id: c.id, note })}
                        disabled={resolve.isPending || escalate.isPending}
                        className="gap-2"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Mark as resolved
                      </Button>

                      {/* Escalate */}
                      {NEXT_LEVEL[c.current_level] && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => escalate.mutate({ id: c.id, note })}
                          disabled={resolve.isPending || escalate.isPending}
                          className="gap-2"
                        >
                          <ArrowUpCircle className="h-4 w-4" />
                          Escalate to {NEXT_LEVEL[c.current_level]}
                        </Button>
                      )}

                      {!NEXT_LEVEL[c.current_level] && (
                        <p className="text-xs text-muted-foreground self-center">
                          This complaint is at the highest level (Intara). It can only be resolved here.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
