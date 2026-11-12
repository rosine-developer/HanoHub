import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/hanohub";
import { useMe } from "@/lib/use-me";

export const Route = createFileRoute("/_authenticated/announcements")({
  head: () => ({ meta: [{ title: "Announcements — HanoHub" }] }),
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const { user } = Route.useRouteContext();
  const { data: me } = useMe(user.id);
  const isAdmin = me?.roles.includes("admin");
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, body, created_at")
        .eq("published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !body.trim()) throw new Error("Title and body are required");
      const { error } = await supabase
        .from("announcements")
        .insert({ title: title.trim(), body: body.trim(), author_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Announcement published");
      setTitle(""); setBody("");
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Megaphone className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">Announcements</h1>
      </div>

      {/* Admin publish form */}
      {isAdmin && (
        <div className="rounded-xl border bg-card p-5 shadow-card space-y-3">
          <p className="font-medium text-sm">Publish a new announcement</p>
          <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
          <Textarea placeholder="Message…" rows={3} value={body} onChange={e => setBody(e.target.value)} />
          <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>
            <Plus className="mr-1.5 h-4 w-4" /> Publish
          </Button>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          No announcements yet.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(a => (
            <div key={a.id} className="rounded-xl border bg-card p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{a.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDate(a.created_at)}</p>
                </div>
                {isAdmin && (
                  <button onClick={() => { if (confirm("Delete?")) remove.mutate(a.id); }}
                    className="text-destructive hover:text-destructive/80 shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="mt-3 text-sm whitespace-pre-wrap">{a.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
