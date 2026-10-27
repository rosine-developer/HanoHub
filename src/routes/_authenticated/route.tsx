import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, FilePlus2, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, Users, X } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppShell,
});

// Nav items — each may require a role; undefined means available to everyone
const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: undefined },
  { to: "/report", label: "Report an issue", icon: FilePlus2, roles: undefined },
  { to: "/cases", label: "Case management", icon: Users, roles: ["officer", "supervisor", "admin"] },
  { to: "/supervisor", label: "Supervisor", icon: ShieldCheck, roles: ["supervisor", "admin"] },
  { to: "/admin", label: "Administration", icon: Settings, roles: ["admin"] },
] as const;

function AppShell() {
  const { user } = Route.useRouteContext();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const { data: profile } = useQuery({
    queryKey: ["me", user.id],
    queryFn: async () => {
      const [{ data: p }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      return { name: p?.full_name || user.email, roles: (roles ?? []).map((r) => r.role) };
    },
  });
  const { data: unread = 0 } = useQuery({
    queryKey: ["unread", user.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("read", false);
      return count ?? 0;
    },
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  // Filter nav items based on the user's roles
  const visibleNav = NAV.filter(
    (n) => !n.roles || (profile?.roles ?? []).some((r) => (n.roles as readonly string[]).includes(r)),
  );

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-4">
      <Link to="/" className="mb-6 px-2 text-xl font-bold text-sidebar-foreground">
        Hano<span className="text-sidebar-primary">Hub</span>
      </Link>
      {visibleNav.map((n) => (
        <Link
          key={n.to}
          to={n.to}
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent",
            path.startsWith(n.to) && "bg-sidebar-accent font-medium",
          )}
        >
          <n.icon className="h-4 w-4" /> {n.label}
        </Link>
      ))}
      <div className="mt-auto border-t border-sidebar-border pt-4 text-sm text-sidebar-foreground">
        <p className="truncate px-3 font-medium">{profile?.name}</p>
        <p className="px-3 text-xs capitalize opacity-70">{profile?.roles.join(", ")}</p>
        <button onClick={signOut} className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 hover:bg-sidebar-accent">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 bg-sidebar md:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-primary-deep/50" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-64 bg-sidebar">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-card px-4">
          <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X /> : <Menu />}
          </button>
          <span />
          <Link to="/notifications" className="relative" aria-label="Notifications">
            <Bell className="h-5 w-5 text-muted-foreground" />
            {unread > 0 && (
              <span className="absolute -right-2 -top-2 rounded-full bg-destructive px-1.5 text-[10px] text-destructive-foreground">
                {unread}
              </span>
            )}
          </Link>
        </header>
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
