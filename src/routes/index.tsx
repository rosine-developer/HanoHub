import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardCheck, MessageSquare, ShieldCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HanoHub — Your Community. Your Voice. Your Progress." },
      { name: "description", content: "Report community problems in Rwanda, track progress, and talk directly with responsible officers." },
      { property: "og:title", content: "HanoHub — Citizen Reporting for Rwanda" },
      { property: "og:description", content: "Report issues, track cases, and hold services accountable." },
    ],
  }),
  component: Landing,
});

const STEPS = [
  { icon: ClipboardCheck, title: "Report", text: "Describe the problem, pick the location and attach photos." },
  { icon: Search, title: "Track", text: "Get a reference number and follow every status change." },
  { icon: MessageSquare, title: "Communicate", text: "Talk with the assigned officer directly on your case." },
  { icon: ShieldCheck, title: "Verify", text: "Resolutions are reviewed — and you can challenge them." },
];

function Landing() {
  return (
    <div>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="text-xl font-bold text-primary">
          Hano<span className="text-secondary">Hub</span>
        </span>
        <Button asChild variant="outline">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>
      <section className="bg-primary-deep text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <p className="text-sm font-medium uppercase tracking-wider text-secondary-foreground/80">Citizen reporting · Rwanda</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-bold leading-tight md:text-5xl">
            Your Community. Your Voice. Your Progress.
          </h1>
          <p className="mt-5 max-w-xl text-primary-foreground/80">
            Report damaged roads, water shortages, waste and broken streetlights — and follow each case until it is truly resolved.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="secondary">
              <Link to="/auth">Report an issue</Link>
            </Button>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold">How it works</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.title} className="rounded-xl border bg-card p-6 shadow-card">
              <s.icon className="h-6 w-6 text-secondary" />
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">© 2026 HanoHub</footer>
    </div>
  );
}
