import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { validateEvidenceFile, type ComplaintStatus } from "@/lib/hanohub";

type Action = { to: ComplaintStatus; label: string; needsNote?: boolean };

const OFFICER: Partial<Record<ComplaintStatus, Action[]>> = {
  submitted: [{ to: "under_review", label: "Start review" }],
  under_review: [
    { to: "in_progress", label: "Start work" },
    { to: "awaiting_information", label: "Request information", needsNote: true },
    { to: "escalated", label: "Escalate", needsNote: true },
  ],
  awaiting_information: [
    { to: "under_review", label: "Back to review" },
    { to: "in_progress", label: "Start work" },
  ],
  in_progress: [
    { to: "resolution_proposed", label: "Propose resolution", needsNote: true },
    { to: "awaiting_information", label: "Request information", needsNote: true },
    { to: "escalated", label: "Escalate", needsNote: true },
  ],
  reopened: [
    { to: "in_progress", label: "Resume work" },
    { to: "escalated", label: "Escalate", needsNote: true },
  ],
};
const SUPERVISOR: Partial<Record<ComplaintStatus, Action[]>> = {
  under_resolution_review: [
    { to: "closed", label: "Verify & close", needsNote: true },
    { to: "reopened", label: "Reject & reopen", needsNote: true },
  ],
  escalated: [
    { to: "in_progress", label: "Return to officer", needsNote: true },
    { to: "reopened", label: "Reopen", needsNote: true },
    { to: "closed", label: "Close", needsNote: true },
  ],
};
const CITIZEN: Partial<Record<ComplaintStatus, Action[]>> = {
  resolution_proposed: [{ to: "under_resolution_review", label: "Accept resolution" }],
};

export function CaseActions(props: {
  caseId: string; status: ComplaintStatus; assignedTo: string | null; userId: string; isOwner: boolean;
  isOfficer: boolean; isSupervisor: boolean;
}) {
  const { caseId, status, assignedTo, userId, isOwner, isOfficer, isSupervisor } = props;
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: officers = [] } = useQuery({
    queryKey: ["officers"],
    enabled: isSupervisor,
    queryFn: async () => (await supabase.rpc("list_officers")).data ?? [],
  });

  const canOfficer = isOfficer && (!assignedTo || assignedTo === userId);
  const actions = [
    ...(canOfficer ? OFFICER[status] ?? [] : []),
    ...(isSupervisor ? SUPERVISOR[status] ?? [] : []),
    ...(isOwner ? CITIZEN[status] ?? [] : []),
  ];

  const refresh = () => qc.invalidateQueries();

  async function run(a: Action) {
    if (a.needsNote && note.trim().length < 3) return void toast.error("Add a short note explaining this action.");
    setBusy(true);
    const { error } = await supabase.rpc("transition_complaint", { _cid: caseId, _to: a.to, _note: note.trim() || undefined });
    setBusy(false);
    if (error) return void toast.error(error.message);
    setNote("");
    toast.success("Case updated");
    refresh();
  }

  async function assign(officer: string) {
    const { error } = await supabase.rpc("assign_complaint", { _cid: caseId, _officer: officer });
    if (error) return void toast.error(error.message);
    toast.success("Case assigned");
    refresh();
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const err = validateEvidenceFile(f);
    if (err) return void toast.error(err);
    const path = `${caseId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("evidence").upload(path, f, { contentType: f.type });
    if (up.error) return void toast.error("Upload failed");
    const { error } = await supabase.from("evidence").insert({
      complaint_id: caseId, uploaded_by: userId, kind: isOfficer || isSupervisor ? "official_document" : "citizen_evidence",
      file_path: path, file_name: f.name, mime_type: f.type, size_bytes: f.size,
    });
    if (error) return void toast.error("Could not save file record");
    toast.success("File uploaded");
    refresh();
  }

  const showPanel = actions.length > 0 || (isOfficer && !assignedTo) || isSupervisor;

  return (
    <section className="space-y-4 rounded-xl border bg-card p-6 shadow-card">
      <h2 className="font-semibold">Actions</h2>
      {isOfficer && !assignedTo && (
        <Button size="sm" variant="outline" onClick={() => assign(userId)}>Assign to me</Button>
      )}
      {isSupervisor && (
        <select value={assignedTo ?? ""} onChange={(e) => e.target.value && assign(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
          <option value="">Assign officer…</option>
          {officers.map((o) => <option key={o.id} value={o.id}>{o.full_name || "Unnamed officer"}</option>)}
        </select>
      )}
      {actions.length > 0 && (
        <>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="Note (shown to the citizen)" />
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button key={a.to} size="sm" disabled={busy} onClick={() => run(a)}
                variant={a.to === "escalated" || a.to === "reopened" ? "destructive" : a.to === "closed" ? "secondary" : "default"}>
                {a.label}
              </Button>
            ))}
          </div>
        </>
      )}
      {!showPanel && <p className="text-sm text-muted-foreground">No actions available right now.</p>}
      <label className="block text-sm">
        <span className="text-muted-foreground">Add a file (JPG, PNG, WEBP, PDF · 10 MB)</span>
        <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={upload} className="mt-1" />
      </label>
    </section>
  );
}
