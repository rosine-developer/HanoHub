import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";

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

type Mode = "in" | "up" | "reset";

function AuthPage() {
  const [mode, setMode] = useState<Mode>("in");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(fd);

    // ── Password reset ──────────────────────────────────────────
    if (mode === "reset") {
      const emailParsed = z.string().trim().email("Enter a valid email").safeParse(raw.email);
      if (!emailParsed.success) return void toast.error(emailParsed.error.issues[0]?.message ?? "Invalid email");
      setBusy(true);
      const { error } = await supabase.auth.resetPasswordForEmail(emailParsed.data, {
        redirectTo: window.location.origin + "/auth/update-password",
      });
      setBusy(false);
      if (error) return void toast.error(error.message);
      setSent(true);
      return;
    }

    // ── Sign in / Sign up ───────────────────────────────────────
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
    if (mode === "up" && !parsed.data.fullName) return void toast.error("Enter your full name");
    setBusy(true);
    const { email, password, fullName } = parsed.data;
    if (mode === "up") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + "/dashboard",
          data: { full_name: fullName },
        },
      });
      setBusy(false);
      if (error) return void toast.error(error.message);
      setSent(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return void toast.error(error.message);
      navigate({ to: "/dashboard" });
    }
  }

  function switchMode(next: Mode) {
    setSent(false);
    setMode(next);
  }

  const titles: Record<Mode, string> = {
    in: "Sign in",
    up: "Create a citizen account",
    reset: "Reset your password",
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-card">
        <Link to="/" className="text-2xl font-bold text-primary">
          Hano<span className="text-secondary">Hub</span>
        </Link>

        {sent ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm">
              {mode === "reset"
                ? "Check your email for a password reset link."
                : "Check your email to confirm your account, then sign in."}
            </p>
            <button
              onClick={() => switchMode("in")}
              className="flex items-center gap-1 text-sm text-secondary hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <h1 className="mt-4 text-lg font-semibold">{titles[mode]}</h1>
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
              {mode !== "reset" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {mode === "in" && (
                      <button
                        type="button"
                        onClick={() => switchMode("reset")}
                        className="text-xs text-secondary hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={mode === "in" ? "current-password" : "new-password"}
                  />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : mode === "in"
                  ? "Sign in"
                  : mode === "up"
                  ? "Create account"
                  : "Send reset link"}
              </Button>
            </form>

            <div className="mt-4 flex flex-col gap-1">
              {mode !== "up" && (
                <button
                  type="button"
                  onClick={() => switchMode("up")}
                  className="text-sm text-secondary hover:underline text-left"
                >
                  New here? Create an account
                </button>
              )}
              {mode !== "in" && (
                <button
                  type="button"
                  onClick={() => switchMode("in")}
                  className="flex items-center gap-1 text-sm text-secondary hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
