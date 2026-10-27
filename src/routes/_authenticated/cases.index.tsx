import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_LABEL, formatDate, type ComplaintStatus } from "@/lib/hanohub";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cases/")({
  head: () => ({ meta: [{ title: "Case management — HanoHub" }] }),
  component: CasesPage,
});

const PAGE_SIZE = 25;
type Tab = "mine" | "unassigned" | "all";

function CasesPage() {
  const { user } = Route.useRouteContext();
  const [tab, setTab] = useState<Tab>("mine");
  const [status, setStatus] = useState<ComplaintStatus | "">("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  // Reset page when filters change
  function setTabAndReset(t: Tab) { setTab(t); setPage(1); }
  function setStatusAndReset(s: ComplaintStatus | "") { setStatus(s); setPage(1); }
  function setQAndReset(v: string) { setQ(v); setPage(1); }

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["staff-cases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select("id, reference, title, status, created_at, due_at, assigned_officer_id, categories(name), areas(district, sector)")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });

  const now = Date.now();
  const mine = cases.filter((c) => c.assigned_officer_id === user.id);
  const stats = [
    { label: "Assigned to me", value: mine.filter((c) => c.status !== "closed").length },
    { label: "Unassigned", value: cases.filter((c) => !c.assigned_officer_id && c.status !== "closed").length },
    { label: "Needs action", value: mine.filter((c) => ["submitted", "under_review", "reopened"].includes(c.status)).length },
    { label: "Overdue", value: mine.filter((c) => c.status !== "closed" && c.due_at && new Date(c.due_at).getTime() < now).length },
  ];

  const term = q.trim().toLowerCase();
  const filtered = (tab === "mine" ? mine : tab === "unassigned" ? cases.filter((c) => !c.assigned_officer_id) : cases)
    .filter((c) => !status || c.status === status)
    .filter((c) => !term || c.reference.toLowerCase().includes(term) || c.title.toLowerCase().includes(term));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold">Case management</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-3xl font-semibold text-primary">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border bg-card p-1">
          {(["mine", "unassigned", "all"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTabAndReset(t)}
              className={cn("rounded-md px-3 py-1.5 text-sm capitalize", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {t === "mine" ? "My cases" : t}
            </button>
          ))}
        </div>
        <select value={status} onChange={(e) => setStatusAndReset(e.target.value as ComplaintStatus | "")}
          className="h-10 rounded-md border border-input bg-card px-3 text-sm">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Input value={q} onChange={(e) => setQAndReset(e.target.value)} placeholder="Search reference or title" className="max-w-xs bg-card" />
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted text-left text-muted-foreground">
            <tr><th className="p-3">Reference</th><th className="p-3">Title</th><th className="p-3">Category</th><th className="p-3">Location</th><th className="p-3">Due</th><th className="p-3">Status</th></tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={6} className="p-4 text-muted-foreground">Loading…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={6} className="p-4 text-muted-foreground">No cases match.</td></tr>}
            {rows.map((c) => {
              const overdue = c.status !== "closed" && c.due_at && new Date(c.due_at).getTime() < now;
              return (
                <tr key={c.id} className="hover:bg-muted">
                  <td className="p-3"><Link to="/cases/$id" params={{ id: c.id }} className="font-medium text-secondary hover:underline">{c.reference}</Link></td>
                  <td className="p-3">{c.title}</td>
                  <td className="p-3">{c.categories?.name}</td>
                  <td className="p-3">{c.areas?.district}, {c.areas?.sector}</td>
                  <td className={cn("p-3", overdue && "font-medium text-destructive")}>{c.due_at ? formatDate(c.due_at) : "—"}</td>
                  <td className="p-3"><StatusBadge status={c.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {safePage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
