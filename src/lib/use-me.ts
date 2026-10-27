import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/hanohub";

export function useMe(userId: string, email?: string) {
  return useQuery({
    queryKey: ["me", userId],
    queryFn: async () => {
      const [{ data: p }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      const r = (roles ?? []).map((x) => x.role as AppRole);
      return {
        name: p?.full_name || email || "",
        roles: r,
        isStaff: r.some((x) => x !== "citizen"),
        isSupervisor: r.includes("supervisor") || r.includes("admin"),
      };
    },
  });
}
