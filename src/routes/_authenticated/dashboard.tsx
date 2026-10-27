import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/hanohub";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — HanoHub" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["my-cases", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select("id, reference, title, status, created_at, categories(name), areas(district, sector)")
        .eq("citizen_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const stats = [
    { label: "Total reports", value: cases.length },
    { label: "Open", value: cases.filter((c) => c.status !== "closed").length },
    { label: "Awaiting your input", value: cases.filter((c) => ["awaiting_information", "resolution_proposed"].includes(c.status)).length },
    { label: "Closed", value: cases.filter((c) => c.status === "closed").length },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">My reports</h1>
        <Button asChild variant="secondary"><Link to="/report">Report an issue</Link></Button>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-3xl font-semibold text-primary">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : cases.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No reports yet. Your submitted issues will appear here.</p>
        ) : (
          <ul className="divide-y">
            {cases.map((c) => (
              <li key={c.id}>
                <Link to="/cases/$id" params={{ id: c.id }} className="flex flex-wrap items-center gap-3 p-4 hover:bg-muted">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.reference} · {c.categories?.name} · {c.areas?.district}, {c.areas?.sector} · {formatDate(c.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
