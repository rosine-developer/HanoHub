import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
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

const ALL_ROLES: AppRole[] = ["citizen", "officer", "supervisor", "admin"];
type AdminTab = "users" | "categories" | "areas";

function AdminPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<AdminTab>("users");
  const [userSearch, setUserSearch] = useState("");

  // ── Users ────────────────────────────────────────────────────
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_users");
      if (error) throw error;
      return data ?? [];
    },
  });

  const setRole = useMutation({
    mutationFn: async ({
      userId,
      role,
      grant,
    }: {
      userId: string;
      role: AppRole;
      grant: boolean;
    }) => {
      const { error } = await supabase.rpc("set_user_role", {
        _user_id: userId,
        _role: role,
        _grant: grant,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredUsers = users.filter(
    (u) =>
      !userSearch ||
      u.email?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(userSearch.toLowerCase()),
  );

  // ── Categories ───────────────────────────────────────────────
  const { data: categories = [] } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("name");
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
      const { error } = await supabase
        .from("categories")
        .insert({ name: newCatName.trim(), description: newCatDesc.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category added");
      setNewCatName("");
      setNewCatDesc("");
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCategory = useMutation({
    mutationFn: async () => {
      if (!editCat) return;
      const { error } = await supabase
        .from("categories")
        .update({ name: editCat.name, description: editCat.description || null })
        .eq("id", editCat.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category updated");
      setEditCat(null);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleCategory = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("categories")
        .update({ active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-categories"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Areas ────────────────────────────────────────────────────
  const { data: areas = [] } = useQuery({
    queryKey: ["admin-areas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("areas")
        .select("*")
        .order("province")
        .order("district")
        .order("sector");
      if (error) throw error;
      return data;
    },
  });

  const [newArea, setNewArea] = useState({ province: "", district: "", sector: "" });
  const [editArea, setEditArea] = useState<{
    id: string;
    province: string;
    district: string;
    sector: string;
  } | null>(null);

  const addArea = useMutation({
    mutationFn: async () => {
      const { province, district, sector } = newArea;
      if (!province.trim() || !district.trim() || !sector.trim())
        throw new Error("All three fields are required");
      const { error } = await supabase
        .from("areas")
        .insert({ province: province.trim(), district: district.trim(), sector: sector.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Area added");
      setNewArea({ province: "", district: "", sector: "" });
      qc.invalidateQueries({ queryKey: ["admin-areas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateArea = useMutation({
    mutationFn: async () => {
      if (!editArea) return;
      const { error } = await supabase
        .from("areas")
        .update({
          province: editArea.province,
          district: editArea.district,
          sector: editArea.sector,
        })
        .eq("id", editArea.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Area updated");
      setEditArea(null);
      qc.invalidateQueries({ queryKey: ["admin-areas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteArea = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("areas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Area removed");
      qc.invalidateQueries({ queryKey: ["admin-areas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const TABS: { key: AdminTab; label: string }[] = [
    { key: "users", label: "Users & Roles" },
    { key: "categories", label: "Categories" },
    { key: "areas", label: "Areas" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold">Administration</h1>

      {/* Tab bar */}
      <div className="flex gap-2 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Users & Roles ── */}
      {tab === "users" && (
        <div className="space-y-4">
          <Input
            placeholder="Search by name or email…"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="max-w-sm bg-card"
          />
          <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="p-3">User</th>
                  <th className="p-3">Joined</th>
                  {ALL_ROLES.map((r) => (
                    <th key={r} className="p-3 capitalize">
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {usersLoading && (
                  <tr>
                    <td colSpan={6} className="p-4 text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                )}
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-muted">
                    <td className="p-3">
                      <p className="font-medium">{u.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(u.created_at)}
                    </td>
                    {ALL_ROLES.map((role) => {
                      const has = u.roles?.includes(role);
                      return (
                        <td key={role} className="p-3">
                          <button
                            onClick={() =>
                              setRole.mutate({ userId: u.id, role, grant: !has })
                            }
                            disabled={setRole.isPending}
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded border transition-colors",
                              has
                                ? "border-success bg-success/10 text-success"
                                : "border-input text-muted-foreground hover:border-primary",
                            )}
                            title={has ? `Remove ${role}` : `Grant ${role}`}
                          >
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

      {/* ── Categories ── */}
      {tab === "categories" && (
        <div className="space-y-6">
          {/* Add new */}
          <div className="rounded-xl border bg-card p-5 shadow-card">
            <h2 className="mb-3 font-semibold">Add category</h2>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Name"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="max-w-xs bg-card"
              />
              <Input
                placeholder="Description (optional)"
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                className="max-w-sm bg-card"
              />
              <Button
                size="sm"
                onClick={() => addCategory.mutate()}
                disabled={addCategory.isPending}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border bg-card shadow-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Active</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {categories.map((cat) =>
                  editCat?.id === cat.id ? (
                    <tr key={cat.id} className="bg-muted/50">
                      <td className="p-3">
                        <Input
                          value={editCat.name}
                          onChange={(e) => setEditCat({ ...editCat, name: e.target.value })}
                          className="bg-card"
                        />
                      </td>
                      <td className="p-3">
                        <Input
                          value={editCat.description}
                          onChange={(e) => setEditCat({ ...editCat, description: e.target.value })}
                          className="bg-card"
                        />
                      </td>
                      <td className="p-3" />
                      <td className="p-3 flex gap-2">
                        <Button size="sm" onClick={() => updateCategory.mutate()} disabled={updateCategory.isPending}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditCat(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={cat.id} className="hover:bg-muted">
                      <td className="p-3 font-medium">{cat.name}</td>
                      <td className="p-3 text-muted-foreground">{cat.description ?? "—"}</td>
                      <td className="p-3">
                        <button
                          onClick={() => toggleCategory.mutate({ id: cat.id, active: !cat.active })}
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            cat.active
                              ? "bg-success/10 text-success"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {cat.active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() =>
                            setEditCat({
                              id: cat.id,
                              name: cat.name,
                              description: cat.description ?? "",
                            })
                          }
                          className="text-muted-foreground hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Areas ── */}
      {tab === "areas" && (
        <div className="space-y-6">
          {/* Add new */}
          <div className="rounded-xl border bg-card p-5 shadow-card">
            <h2 className="mb-3 font-semibold">Add area</h2>
            <div className="flex flex-wrap gap-2">
              {(["province", "district", "sector"] as const).map((field) => (
                <Input
                  key={field}
                  placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                  value={newArea[field]}
                  onChange={(e) => setNewArea((a) => ({ ...a, [field]: e.target.value }))}
                  className="w-40 bg-card"
                />
              ))}
              <Button size="sm" onClick={() => addArea.mutate()} disabled={addArea.isPending}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="p-3">Province</th>
                  <th className="p-3">District</th>
                  <th className="p-3">Sector</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {areas.map((a) =>
                  editArea?.id === a.id ? (
                    <tr key={a.id} className="bg-muted/50">
                      {(["province", "district", "sector"] as const).map((f) => (
                        <td key={f} className="p-3">
                          <Input
                            value={editArea[f]}
                            onChange={(e) => setEditArea({ ...editArea, [f]: e.target.value })}
                            className="bg-card"
                          />
                        </td>
                      ))}
                      <td className="p-3 flex gap-2">
                        <Button size="sm" onClick={() => updateArea.mutate()} disabled={updateArea.isPending}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditArea(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={a.id} className="hover:bg-muted">
                      <td className="p-3">{a.province}</td>
                      <td className="p-3">{a.district}</td>
                      <td className="p-3">{a.sector}</td>
                      <td className="p-3 flex gap-2">
                        <button
                          onClick={() => setEditArea({ id: a.id, province: a.province, district: a.district, sector: a.sector })}
                          className="text-muted-foreground hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Delete this area?")) deleteArea.mutate(a.id);
                          }}
                          className="text-destructive hover:text-destructive/80"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
