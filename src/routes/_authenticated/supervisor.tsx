import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, STATUS_LABEL, type ComplaintStatus } from "@/lib/hanohub";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/supervisor")({
  head: () => ({ meta: [{ title: "Supervisor Dashboard — HanoHub" }] }),
  beforeLoad: async ({ context }) => {
    const uid = (context as { user: { id: string } }).user.id;
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .in("role", ["supervisor", "admin"]);
    if (!data || data.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: SupervisorPage,
});

const CHART_COLORS = [
  "#163B65", "#0F766E", "#B45309", "#15803D", "#B91C1C",
  "#6366F1", "#EC4899", "#F59E0B", "#10B981", "#EF4444",
];

type Tab = "overview" | "challenges" | "escalations" | "resolutions";

function SupervisorPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");

  // ── Analytics data ───────────────────────────────────────────
  const { data: statsByStatus = [] } = useQuery({
    queryKey: ["stats-status"],
    queryFn: async () => {
      const { data } = await supabase.rpc("complaint_stats");
      return (data ?? []).map((r) => ({
        name: STATUS_LABEL[r.status as ComplaintStatus] ?? r.status,
        value: Number(r.count),
      }));
    },
  });

  const { data: statsByCategory = [] } = useQuery({
    queryKey: ["stats-category"],
    queryFn: async () => {
      const { data } = await supabase.rpc("complaints_by_category");
      return (data ?? []).map((r) => ({ name: r.name, count: Number(r.count) }));
    },
  });

  const { data: statsOverTime = [] } = useQuery({
    queryKey: ["stats-time"],
    queryFn: async () => {
      const { data } = await supabase.rpc("complaints_over_time");
      return (data ?? []).map((r) => ({ month: r.month, count: Number(r.count) }));
    },
  });

  const totalComplaints = statsByStatus.reduce((s, r) => s + r.value, 0);
  const closedCount = statsByStatus.find((r) => r.name === STATUS_LABEL["closed"])?.value ?? 0;
  const escalatedCount = statsByStatus.find((r) => r.name === STATUS_LABEL["escalated"])?.value ?? 0;
  const challengedCount = statsByStatus.find((r) => r.name === STATUS_LABEL["challenged"])?.value ?? 0;

  // ── Challenges ───────────────────────────────────────────────
  const { data: challenges = [] } = useQuery({
    queryKey: ["challenges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("challenges")
        .select("*, complaints(reference, title, status)")
        .is("review_decision", null)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // ── Escalations ──────────────────────────────────────────────
  const { data: escalations = [] } = useQuery({
    queryKey: ["escalations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select("id, reference, title, status, created_at, categories(name), areas(district, sector), assigned_officer_id")
        .eq("status", "escalated")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // ── Pending resolution reviews ────────────────────────────────
  const { data: pendingReviews = [] } = useQuery({
    queryKey: ["pending-reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select("id, reference, title, status, created_at, categories(name), areas(district, sector)")
        .in("status", ["under_resolution_review", "resolution_proposed"])
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // ── Officers list (for assignment) ───────────────────────────
  const { data: officers = [] } = useQuery({
    queryKey: ["officers"],
    queryFn: async () => {
      const { data } = await supabase.rpc("list_officers");
      return data ?? [];
    },
  });

  // ── Challenge review mutation ────────────────────────────────
  const [reviewState, setReviewState] = useState<Record<string, { note: string }>>({});
  const reviewChallenge = useMutation({
    mutationFn: async ({ id, decision, note }: { id: string; decision: "upheld" | "overruled"; note: string }) => {
      const { error } = await supabase.rpc("review_challenge", {
        _challenge_id: id,
        _decision: decision,
        _note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Challenge reviewed");
      qc.invalidateQueries({ queryKey: ["challenges"] });
      qc.invalidateQueries({ queryKey: ["escalations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Case transition mutation (for escalations / resolution reviews) ──
  const transition = useMutation({
    mutationFn: async ({ cid, to, note }: { cid: string; to: ComplaintStatus; note: string }) => {
      const { error } = await supabase.rpc("transition_complaint", {
        _cid: cid,
        _to: to,
        _note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Case updated");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [transitionNote, setTransitionNote] = useState<Record<string, string>>({});

  // ── Assignment mutation ──────────────────────────────────────
  const assign = useMutation({
    mutationFn: async ({ cid, officerId }: { cid: string; officerId: string }) => {
      const { error } = await supabase.rpc("assign_complaint", {
        _cid: cid,
        _officer: officerId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Case assigned");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: "overview", label: "Overview & Analytics" },
    { key: "challenges", label: "Challenges", badge: challenges.length },
    { key: "escalations", label: "Escalations", badge: escalations.length },
    { key: "resolutions", label: "Resolution Reviews", badge: pendingReviews.length },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold">Supervisor Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total complaints", value: totalComplaints },
          { label: "Closed", value: closedCount },
          { label: "Escalated", value: escalatedCount },
          { label: "Challenged", value: challengedCount },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-3xl font-semibold text-primary">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2 border-b pb-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview & Analytics ── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Status distribution */}
          <div className="rounded-xl border bg-card p-6 shadow-card">
            <h2 className="mb-4 font-semibold">Complaints by status</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={statsByStatus} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#163B65" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Category breakdown */}
            <div className="rounded-xl border bg-card p-6 shadow-card">
              <h2 className="mb-4 font-semibold">Complaints by category</h2>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={statsByCategory}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {statsByCategory.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Submissions over time */}
            <div className="rounded-xl border bg-card p-6 shadow-card">
              <h2 className="mb-4 font-semibold">Submissions over time</h2>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={statsOverTime} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#0F766E"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#0F766E" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Challenges ── */}
      {tab === "challenges" && (
        <div className="space-y-4">
          {challenges.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending challenges.</p>
          ) : (
            challenges.map((ch) => (
              <div key={ch.id} className="rounded-xl border bg-card p-6 shadow-card space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      to="/cases/$id"
                      params={{ id: ch.complaint_id }}
                      className="font-semibold text-secondary hover:underline"
                    >
                      {ch.complaints?.reference} — {ch.complaints?.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Challenge submitted {formatDate(ch.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={(ch.complaints?.status ?? "challenged") as ComplaintStatus} />
                </div>
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p className="font-medium text-xs text-muted-foreground mb-1">Citizen's reason</p>
                  <p>{ch.reason}</p>
                </div>
                <div className="space-y-2">
                  <Textarea
                    placeholder="Add a review note (optional)"
                    rows={2}
                    value={reviewState[ch.id]?.note ?? ""}
                    onChange={(e) =>
                      setReviewState((s) => ({ ...s, [ch.id]: { note: e.target.value } }))
                    }
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        reviewChallenge.mutate({
                          id: ch.id,
                          decision: "upheld",
                          note: reviewState[ch.id]?.note ?? "",
                        })
                      }
                      disabled={reviewChallenge.isPending}
                    >
                      Uphold challenge (reopen)
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        reviewChallenge.mutate({
                          id: ch.id,
                          decision: "overruled",
                          note: reviewState[ch.id]?.note ?? "",
                        })
                      }
                      disabled={reviewChallenge.isPending}
                    >
                      Overrule (close)
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Escalations ── */}
      {tab === "escalations" && (
        <div className="space-y-4">
          {escalations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No escalated cases.</p>
          ) : (
            escalations.map((c) => (
              <div key={c.id} className="rounded-xl border bg-card p-6 shadow-card space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      to="/cases/$id"
                      params={{ id: c.id }}
                      className="font-semibold text-secondary hover:underline"
                    >
                      {c.reference} — {c.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.categories?.name} · {c.areas?.district}, {c.areas?.sector} · {formatDate(c.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                {/* Re-assign officer */}
                <select
                  defaultValue={c.assigned_officer_id ?? ""}
                  onChange={(e) => e.target.value && assign.mutate({ cid: c.id, officerId: e.target.value })}
                  className="h-9 rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">Re-assign officer…</option>
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>{o.full_name || "Unnamed"}</option>
                  ))}
                </select>
                <div className="space-y-2">
                  <Textarea
                    placeholder="Note (required for most actions)"
                    rows={2}
                    value={transitionNote[c.id] ?? ""}
                    onChange={(e) => setTransitionNote((s) => ({ ...s, [c.id]: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { to: "in_progress" as ComplaintStatus, label: "Return to officer" },
                        { to: "reopened" as ComplaintStatus, label: "Reopen" },
                        { to: "closed" as ComplaintStatus, label: "Close" },
                      ] as { to: ComplaintStatus; label: string }[]
                    ).map((a) => (
                      <Button
                        key={a.to}
                        size="sm"
                        variant={a.to === "closed" ? "secondary" : a.to === "reopened" ? "destructive" : "default"}
                        disabled={transition.isPending}
                        onClick={() =>
                          transition.mutate({ cid: c.id, to: a.to, note: transitionNote[c.id] ?? "" })
                        }
                      >
                        {a.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Resolution Reviews ── */}
      {tab === "resolutions" && (
        <div className="space-y-4">
          {pendingReviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending resolution reviews.</p>
          ) : (
            pendingReviews.map((c) => (
              <div key={c.id} className="rounded-xl border bg-card p-6 shadow-card space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      to="/cases/$id"
                      params={{ id: c.id }}
                      className="font-semibold text-secondary hover:underline"
                    >
                      {c.reference} — {c.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.categories?.name} · {c.areas?.district}, {c.areas?.sector} · {formatDate(c.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="space-y-2">
                  <Textarea
                    placeholder="Verification note"
                    rows={2}
                    value={transitionNote[c.id] ?? ""}
                    onChange={(e) => setTransitionNote((s) => ({ ...s, [c.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        transition.mutate({ cid: c.id, to: "closed", note: transitionNote[c.id] ?? "" })
                      }
                      disabled={transition.isPending}
                    >
                      Verify & Close
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        transition.mutate({ cid: c.id, to: "reopened", note: transitionNote[c.id] ?? "" })
                      }
                      disabled={transition.isPending}
                    >
                      Reject & Reopen
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
