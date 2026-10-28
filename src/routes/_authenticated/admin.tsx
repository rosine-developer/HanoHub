import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Check, X, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, type AppRole } from "@/lib/hanohub";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — HanoHub" }] }),
  beforeLoad: async ({ context }) => {
    const uid = (context as { user: { id: string } }).user.id;
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .eq("role", "admin");
    if (!data || data.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

// ── Types ──────────────────────────────────────────────────────
const ALL_ROLES: AppRole[] = ["citizen", "officer", "supervisor", "admin"];

const LEADER_ROLES = [
  { role: "umudugudu_leader", label: "Umudugudu (Village)" },
  { role: "akagari_leader",   label: "Akagari (Cell)" },
  { role: "umurenge_leader",  label: "Umurenge (Sector)" },
  { role: "akarere_leader",   label: "Akarere (District)" },
  { role: "intara_leader",    label: "Intara (Province)" },
] as const;

type LeaderRole = (typeof LEADER_ROLES)[number]["role"];
type AdminTab = "users" | "leaders" | "categories" | "areas";

type Area = {
  id: string;
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
};

function unique(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean))).sort();
}

// ── Component ──────────────────────────────────────────────────
function AdminPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<AdminTab>("users");

  // ── Users & Roles ─────────────────────────────────────────
  const [userSearch, setUserSearch] = useState("");

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_users");
      if (error) throw error;
      return data ?? [];
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role, grant }: { userId: string; role: AppRole; grant: boolean }) => {
      const { error } = await supabase.rpc("set_user_role", { _user_id: userId, _role: role, _grant: grant });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredUsers = users.filter(
    (u) => !userSearch ||
      u.email?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(userSearch.toLowerCase()),
  );

  // ── Leader area assignment ────────────────────────────────
  const { data: areas = [] } = useQuery({
    queryKey: ["admin-areas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("areas")
        .select("id, province, district, sector, cell, village")
        .order("province").order("district").order("sector").order("cell").order("village");
      if (error) throw error;
      return (data ?? []) as Area[];
    },
  });

  const { data: leaderAreas = [] } = useQuery({
    queryKey: ["admin-leader-areas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leader_areas")
        .select("*, profiles(full_name)")
        .order("role");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Cascading state for assignment form
  const [assignUserId, setAssignUserId]     = useState("");
  const [assignRole, setAssignRole]         = useState<LeaderRole>("umudugudu_leader");
  const [assignProvince, setAssignProvince] = useState("");
  const [assignDistrict, setAssignDistrict] = useState("");
  const [assignSector, setAssignSector]     = useState("");
  const [assignCell, setAssignCell]         = useState("");
  const [assignVillage, setAssignVillage]   = useState("");

  // Derived lists
  const provinces = unique(areas.map((a) => a.province));
  const districts = unique(areas.filter((a) => a.province === assignProvince).map((a) => a.district));
  const sectors   = unique(areas.filter((a) => a.province === assignProvince && a.district === assignDistrict).map((a) => a.sector));
  const cells     = unique(areas.filter((a) => a.province === assignProvince && a.district === assignDistrict && a.sector === assignSector).map((a) => a.cell));
  const villages  = unique(areas.filter((a) => a.province === assignProvince && a.district === assignDistrict && a.sector === assignSector && a.cell === assignCell).map((a) => a.village));

  // Which fields are required for each role
  const ROLE_LEVELS: Record<LeaderRole, ("province"|"district"|"sector"|"cell"|"village")[]> = {
    intara_leader:    ["province"],
    akarere_leader:   ["province","district"],
    umurenge_leader:  ["province","district","sector"],
    akagari_leader:   ["province","district","sector","cell"],
    umudugudu_leader: ["province","district","sector","cell","village"],
  };

  const assignLeader = useMutation({
    mutationFn: async () => {
      if (!assignUserId) throw new Error("Select a user");
      const levels = ROLE_LEVELS[assignRole];
      if (levels.includes("province")  && !assignProvince) throw new Error("Select a province");
      if (levels.includes("district")  && !assignDistrict) throw new Error("Select a district");
      if (levels.includes("sector")    && !assignSector)   throw new Error("Select a sector");
      if (levels.includes("cell")      && !assignCell)     throw new Error("Select a cell");
      if (levels.includes("village")   && !assignVillage)  throw new Error("Select a village");

      // also grant the leader role in user_roles
      await supabase.rpc("set_user_role", { _user_id: assignUserId, _role: assignRole as AppRole, _grant: true });

      const { error } = await supabase.rpc("assign_leader_area", {
        _user_id:   assignUserId,
        _role:      assignRole,
        _province:  assignProvince,
        _district:  assignDistrict,
        _sector:    assignSector,
        _cell:      assignCell,
        _village:   assignVillage,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leader assigned to area");
      setAssignUserId(""); setAssignProvince(""); setAssignDistrict("");
      setAssignSector(""); setAssignCell(""); setAssignVillage("");
      qc.invalidateQueries({ queryKey: ["admin-leader-areas"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeLeaderArea = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leader_areas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Assignment removed"); qc.invalidateQueries({ queryKey: ["admin-leader-areas"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Categories ───────────────────────────────────────────
  const { data: categories = [] } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [editCat, setEditCat] = useState<{ id: string; name: string; description: string } | null>(null);

  const addCategory = useMutation({
    mutationFn: async () => {
      if (!newCatName.trim()) throw new Error("Name is required");
      const { error } = await supabase.from("categories").insert({ name: newCatName.trim(), description: newCatDesc.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Category added"); setNewCatName(""); setNewCatDesc(""); qc.invalidateQueries({ queryKey: ["admin-categories"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCategory = useMutation({
    mutationFn: async () => {
      if (!editCat) return;
      const { error } = await supabase.from("categories").update({ name: editCat.name, description: editCat.description || null }).eq("id", editCat.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Category updated"); setEditCat(null); qc.invalidateQueries({ queryKey: ["admin-categories"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleCategory = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("categories").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-categories"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Areas ────────────────────────────────────────────────
  const [newArea, setNewArea] = useState({ province: "", district: "", sector: "", cell: "", village: "" });
  const [editArea, setEditArea] = useState<Area | null>(null);

  const addArea = useMutation({
    mutationFn: async () => {
      const { province, district, sector, cell, village } = newArea;
      if (!province.trim() || !district.trim() || !sector.trim() || !cell.trim() || !village.trim())
        throw new Error("All 5 fields are required");
      const { error } = await supabase.from("areas").insert({
        province: province.trim(), district: district.trim(), sector: sector.trim(),
        cell: cell.trim(), village: village.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Area added");
      setNewArea({ province: "", district: "", sector: "", cell: "", village: "" });
      qc.invalidateQueries({ queryKey: ["admin-areas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateArea = useMutation({
    mutationFn: async () => {
      if (!editArea) return;
      const { error } = await supabase.from("areas").update({
        province: editArea.province, district: editArea.district, sector: editArea.sector,
        cell: editArea.cell, village: editArea.village,
      }).eq("id", editArea.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Area updated"); setEditArea(null); qc.invalidateQueries({ queryKey: ["admin-areas"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteArea = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("areas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Area removed"); qc.invalidateQueries({ queryKey: ["admin-areas"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectCls = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm disabled:opacity-50";

  const TABS: { key: AdminTab; label: string }[] = [
    { key: "users",    label: "Users & Roles" },
    { key: "leaders",  label: "Leader Assignments" },
    { key: "categories", label: "Categories" },
    { key: "areas",    label: "Areas" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold">Administration</h1>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-0 border-b">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Users & Roles ── */}
      {tab === "users" && (
        <div className="space-y-4">
          <Input placeholder="Search by name or email…" value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)} className="max-w-sm bg-card" />
          <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="p-3">User</th>
                  <th className="p-3">Joined</th>
                  {ALL_ROLES.map((r) => <th key={r} className="p-3 capitalize">{r}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {usersLoading && <tr><td colSpan={6} className="p-4 text-muted-foreground">Loading…</td></tr>}
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-muted">
                    <td className="p-3">
                      <p className="font-medium">{u.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </td>
                    <td className="p-3 text-muted-foreground">{formatDate(u.created_at)}</td>
                    {ALL_ROLES.map((role) => {
                      const has = u.roles?.includes(role);
                      return (
                        <td key={role} className="p-3">
                          <button onClick={() => setRole.mutate({ userId: u.id, role, grant: !has })}
                            disabled={setRole.isPending}
                            className={cn("flex h-6 w-6 items-center justify-center rounded border transition-colors",
                              has ? "border-success bg-success/10 text-success" : "border-input text-muted-foreground hover:border-primary")}
                            title={has ? `Remove ${role}` : `Grant ${role}`}>
                            {has ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Leader Assignments ── */}
      {tab === "leaders" && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Assign a registered user as a leader for a specific administrative area.
            They will automatically receive complaints submitted in their area.
          </p>

          {/* Assignment form */}
          <div className="rounded-xl border bg-card p-6 shadow-card space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Assign a leader
            </h2>

            {/* User picker */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">User</label>
              <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} className={selectCls}>
                <option value="">Select a user…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email} — {u.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Role picker */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Leadership level</label>
              <select value={assignRole}
                onChange={(e) => { setAssignRole(e.target.value as LeaderRole); setAssignProvince(""); setAssignDistrict(""); setAssignSector(""); setAssignCell(""); setAssignVillage(""); }}
                className={selectCls}>
                {LEADER_ROLES.map((r) => (
                  <option key={r.role} value={r.role}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Cascading area pickers */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {/* Province — always shown */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Intara (Province)</label>
                <select value={assignProvince}
                  onChange={(e) => { setAssignProvince(e.target.value); setAssignDistrict(""); setAssignSector(""); setAssignCell(""); setAssignVillage(""); }}
                  className={selectCls}>
                  <option value="">Select…</option>
                  {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* District — akarere and below */}
              {ROLE_LEVELS[assignRole].includes("district") && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Akarere (District)</label>
                  <select value={assignDistrict} disabled={!assignProvince}
                    onChange={(e) => { setAssignDistrict(e.target.value); setAssignSector(""); setAssignCell(""); setAssignVillage(""); }}
                    className={selectCls}>
                    <option value="">Select…</option>
                    {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}

              {/* Sector — umurenge and below */}
              {ROLE_LEVELS[assignRole].includes("sector") && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Umurenge (Sector)</label>
                  <select value={assignSector} disabled={!assignDistrict}
                    onChange={(e) => { setAssignSector(e.target.value); setAssignCell(""); setAssignVillage(""); }}
                    className={selectCls}>
                    <option value="">Select…</option>
                    {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              {/* Cell — akagari and below */}
              {ROLE_LEVELS[assignRole].includes("cell") && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Akagari (Cell)</label>
                  <select value={assignCell} disabled={!assignSector}
                    onChange={(e) => { setAssignCell(e.target.value); setAssignVillage(""); }}
                    className={selectCls}>
                    <option value="">Select…</option>
                    {cells.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              {/* Village — umudugudu only */}
              {ROLE_LEVELS[assignRole].includes("village") && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Umudugudu (Village)</label>
                  <select value={assignVillage} disabled={!assignCell}
                    onChange={(e) => setAssignVillage(e.target.value)}
                    className={selectCls}>
                    <option value="">Select…</option>
                    {villages.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              )}
            </div>

            <Button onClick={() => assignLeader.mutate()} disabled={assignLeader.isPending}>
              {assignLeader.isPending ? "Assigning…" : "Assign leader"}
            </Button>
          </div>

          {/* Current assignments table */}
          <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="p-3">Leader</th>
                  <th className="p-3">Level</th>
                  <th className="p-3">Area</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {leaderAreas.length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-muted-foreground">No leaders assigned yet.</td></tr>
                )}
                {leaderAreas.map((la) => {
                  const levelLabel = LEADER_ROLES.find((r) => r.role === la.role)?.label ?? la.role;
                  const areaPath = [la.village, la.cell, la.sector, la.district, la.province]
                    .filter(Boolean).join(", ");
                  return (
                    <tr key={la.id} className="hover:bg-muted">
                      <td className="p-3 font-medium">
                        {(la.profiles as { full_name: string } | null)?.full_name || "—"}
                      </td>
                      <td className="p-3">{levelLabel}</td>
                      <td className="p-3 text-muted-foreground">{areaPath}</td>
                      <td className="p-3">
                        <button
                          onClick={() => { if (confirm("Remove this assignment?")) removeLeaderArea.mutate(la.id); }}
                          className="text-destructive hover:text-destructive/80" title="Remove">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Categories ── */}
      {tab === "categories" && (
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5 shadow-card">
            <h2 className="mb-3 font-semibold">Add category</h2>
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Name" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="max-w-xs bg-card" />
              <Input placeholder="Description (optional)" value={newCatDesc} onChange={(e) => setNewCatDesc(e.target.value)} className="max-w-sm bg-card" />
              <Button size="sm" onClick={() => addCategory.mutate()} disabled={addCategory.isPending}>
                <Plus className="mr-1.5 h-4 w-4" /> Add
              </Button>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card shadow-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted text-left text-muted-foreground">
                <tr><th className="p-3">Name</th><th className="p-3">Description</th><th className="p-3">Active</th><th className="p-3">Actions</th></tr>
              </thead>
              <tbody className="divide-y">
                {categories.map((cat) =>
                  editCat?.id === cat.id ? (
                    <tr key={cat.id} className="bg-muted/50">
                      <td className="p-3"><Input value={editCat.name} onChange={(e) => setEditCat({ ...editCat, name: e.target.value })} className="bg-card" /></td>
                      <td className="p-3"><Input value={editCat.description} onChange={(e) => setEditCat({ ...editCat, description: e.target.value })} className="bg-card" /></td>
                      <td className="p-3" />
                      <td className="p-3 flex gap-2">
                        <Button size="sm" onClick={() => updateCategory.mutate()} disabled={updateCategory.isPending}><Check className="h-4 w-4" /></Button>
                        <Button size="sm" variant="outline" onClick={() => setEditCat(null)}><X className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={cat.id} className="hover:bg-muted">
                      <td className="p-3 font-medium">{cat.name}</td>
                      <td className="p-3 text-muted-foreground">{cat.description ?? "—"}</td>
                      <td className="p-3">
                        <button onClick={() => toggleCategory.mutate({ id: cat.id, active: !cat.active })}
                          className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium",
                            cat.active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
                          {cat.active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="p-3">
                        <button onClick={() => setEditCat({ id: cat.id, name: cat.name, description: cat.description ?? "" })}
                          className="text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Areas ── */}
      {tab === "areas" && (
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5 shadow-card">
            <h2 className="mb-3 font-semibold">Add area (full hierarchy)</h2>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {(["province","district","sector","cell","village"] as const).map((field) => (
                <Input key={field}
                  placeholder={field === "province" ? "Intara" : field === "district" ? "Akarere" : field === "sector" ? "Umurenge" : field === "cell" ? "Akagari" : "Umudugudu"}
                  value={newArea[field]}
                  onChange={(e) => setNewArea((a) => ({ ...a, [field]: e.target.value }))}
                  className="bg-card" />
              ))}
            </div>
            <Button size="sm" className="mt-3" onClick={() => addArea.mutate()} disabled={addArea.isPending}>
              <Plus className="mr-1.5 h-4 w-4" /> Add area
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="p-3">Intara</th><th className="p-3">Akarere</th>
                  <th className="p-3">Umurenge</th><th className="p-3">Akagari</th>
                  <th className="p-3">Umudugudu</th><th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {areas.map((a) =>
                  editArea?.id === a.id ? (
                    <tr key={a.id} className="bg-muted/50">
                      {(["province","district","sector","cell","village"] as const).map((f) => (
                        <td key={f} className="p-2">
                          <Input value={editArea[f]} onChange={(e) => setEditArea({ ...editArea, [f]: e.target.value })} className="bg-card h-8 text-sm" />
                        </td>
                      ))}
                      <td className="p-2 flex gap-1">
                        <Button size="sm" onClick={() => updateArea.mutate()} disabled={updateArea.isPending}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="outline" onClick={() => setEditArea(null)}><X className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={a.id} className="hover:bg-muted">
                      <td className="p-3">{a.province}</td>
                      <td className="p-3">{a.district}</td>
                      <td className="p-3">{a.sector}</td>
                      <td className="p-3">{a.cell}</td>
                      <td className="p-3">{a.village}</td>
                      <td className="p-3 flex gap-2">
                        <button onClick={() => setEditArea({ ...a })} className="text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => { if (confirm("Delete this area?")) deleteArea.mutate(a.id); }} className="text-destructive hover:text-destructive/80"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
