import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — HanoHub" },
      { name: "description", content: "Sign in or create your HanoHub account to report and track community issues." },
      { property: "og:title", content: "Sign in — HanoHub" },
      { property: "og:description", content: "Access your HanoHub citizen account." },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  fullName: z.string().trim().max(100).optional(),
});

function AuthPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (mode === "up" && !parsed.data.fullName) return toast.error("Enter your full name");
    setBusy(true);
    const { email, password, fullName } = parsed.data;
    if (mode === "up") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + "/dashboard", data: { full_name: fullName } },
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      setSent(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return toast.error(error.message);
      navigate({ to: "/dashboard" });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-card">
        <Link to="/" className="text-2xl font-bold text-primary">
          Hano<span className="text-secondary">Hub</span>
        </Link>
        {sent ? (
          <p className="mt-6 text-sm">Check your email to confirm your account, then sign in.</p>
        ) : (
          <>
            <h1 className="mt-4 text-lg font-semibold">{mode === "in" ? "Sign in" : "Create a citizen account"}</h1>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {mode === "up" && (
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" name="fullName" autoComplete="name" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
              </Button>
            </form>
            <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 text-sm text-secondary hover:underline">
              {mode === "in" ? "New here? Create an account" : "Already registered? Sign in"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
