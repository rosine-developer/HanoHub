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
      { name: "description", content: "Sign in or create your HanoHub account." },
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

// ── Quotes shown on the left panel ──────────────────────────
const QUOTES = [
  { text: "Every voice matters. Report issues, track progress, build a better Rwanda.", author: "HanoHub Mission" },
  { text: "Transparency between citizens and their leaders creates stronger communities.", author: "Community Values" },
  { text: "Your report today is tomorrow's solution for your neighborhood.", author: "HanoHub" },
];
const Q = QUOTES[Math.floor(Math.random() * QUOTES.length)];

function AuthPage() {
  const [mode, setMode] = useState<Mode>("in");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(fd);

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

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#F5F7FA] p-4">
      <div className="flex w-full max-w-4xl h-[min(600px,90vh)] overflow-hidden rounded-2xl shadow-2xl border border-[#E2E8F0]">

      {/* ── Left panel ── */}
      <div className="relative hidden md:flex md:w-5/12 flex-col justify-between overflow-hidden bg-primary-deep">
        <div className="absolute inset-0 bg-gradient-to-br from-[#102A43] via-[#163B65] to-[#0F766E] opacity-95" />
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "32px 32px" }} />

        <div className="relative z-10 flex flex-col justify-between h-full p-10">
          {/* Top — empty, no logo */}
          <div />

          {/* Center */}
          <div className="flex flex-col items-center justify-center gap-5 text-center">
            <div className="w-28 h-28 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
              <span className="text-3xl font-bold text-white leading-none">
                Hano<br/><span className="text-teal-300">Hub</span>
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white leading-snug">
                Your Community.<br />Your Voice.<br />Your Progress.
              </h2>
              <p className="mt-2 text-xs text-white/60">
                Report issues · Track progress · Build Rwanda
              </p>
            </div>
          </div>

          {/* Quote */}
          <div className="bg-white/10 rounded-xl p-4 border border-white/20">
            <p className="text-white/90 text-xs italic leading-relaxed">"{Q.text}"</p>
            <p className="mt-1.5 text-xs text-white/50 font-medium">{Q.author}</p>
          </div>
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-8 bg-white overflow-y-auto">
        <div className="w-full max-w-sm">

          {/* Mobile logo only */}
          <Link to="/" className="md:hidden text-2xl font-bold text-primary block mb-6">
            Hano<span className="text-secondary">Hub</span>
          </Link>

          {sent ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-success/10 border border-success/20 p-6 text-center">
                <span className="text-4xl">✉️</span>
                <p className="mt-3 font-semibold text-success">
                  {mode === "reset" ? "Reset link sent!" : "Account created!"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {mode === "reset"
                    ? "Check your email for a password reset link."
                    : "Check your email to confirm your account, then sign in."}
                </p>
              </div>
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
              {/* Heading */}
              <div className="mb-5">
                <h1 className="text-2xl font-bold text-[#243447]">
                  {mode === "in" ? "Welcome back" : mode === "up" ? "Create account" : "Reset password"}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {mode === "in"
                    ? "Sign in to your HanoHub account"
                    : mode === "up"
                    ? "Join HanoHub to report issues in your community"
                    : "Enter your email and we'll send you a reset link"}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={onSubmit} className="space-y-4">
                {mode === "up" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName" className="text-sm font-medium text-[#243447]">
                      Full name
                    </Label>
                    <Input
                      id="fullName"
                      name="fullName"
                      autoComplete="name"
                      placeholder="UMURERWA Rosine"
                      className="h-12 bg-white border-[#E2E8F0] rounded-lg text-sm"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium text-[#243447]">
                    Email address
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="h-12 bg-white border-[#E2E8F0] rounded-lg text-sm"
                  />
                </div>

                {mode !== "reset" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-sm font-medium text-[#243447]">
                        Password
                      </Label>
                      {mode === "in" && (
                        <button
                          type="button"
                          onClick={() => switchMode("reset")}
                          className="text-xs font-medium text-secondary hover:underline"
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
                      placeholder="••••••••"
                      className="h-12 bg-white border-[#E2E8F0] rounded-lg text-sm"
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={busy}
                  className="w-full h-12 rounded-lg text-sm font-semibold bg-primary hover:bg-primary/90"
                >
                  {busy
                    ? "Please wait…"
                    : mode === "in"
                    ? "Sign in"
                    : mode === "up"
                    ? "Create account"
                    : "Send reset link"}
                </Button>
              </form>

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#E2E8F0]" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-3 text-muted-foreground">or</span>
                </div>
              </div>

              {/* Switch mode */}
              <p className="text-center text-sm text-muted-foreground">
                {mode === "in" ? (
                  <>
                    Don't have an account?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("up")}
                      className="font-semibold text-secondary hover:underline"
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("in")}
                      className="font-semibold text-secondary hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>

              {mode !== "in" && (
                <button
                  type="button"
                  onClick={() => switchMode("in")}
                  className="mt-3 flex items-center justify-center gap-1 w-full text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </button>
              )}
            </>
          )}
        </div>
      </div>
      </div>{/* end card */}
    </div>
  );
}
