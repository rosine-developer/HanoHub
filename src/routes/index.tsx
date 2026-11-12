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
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28 flex flex-col md:flex-row items-center gap-10">
          {/* Left — text */}
          <div className="flex-1">
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

          {/* Right — illustration */}
          <div className="flex-shrink-0 w-full md:w-[420px]">
            <svg viewBox="0 0 420 320" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
              {/* Sky background */}
              <rect width="420" height="320" rx="16" fill="#0F2235"/>

              {/* Stars */}
              {[[40,30],[80,20],[150,15],[200,25],[300,18],[360,30],[390,15],[320,40],[60,50],[250,10]].map(([x,y],i)=>(
                <circle key={i} cx={x} cy={y} r="1.5" fill="white" opacity="0.6"/>
              ))}

              {/* Moon */}
              <circle cx="370" cy="40" r="22" fill="#1e3a5f"/>
              <circle cx="380" cy="33" r="18" fill="#0F2235"/>

              {/* Hills */}
              <ellipse cx="210" cy="310" rx="260" ry="80" fill="#0d3320"/>
              <ellipse cx="60" cy="300" rx="120" ry="60" fill="#0a2a1a"/>
              <ellipse cx="380" cy="305" rx="100" ry="55" fill="#0a2a1a"/>

              {/* Road */}
              <path d="M140 280 L200 200 L220 200 L280 280Z" fill="#1a2a3a"/>
              <line x1="210" y1="210" x2="210" y2="275" stroke="white" strokeWidth="2" strokeDasharray="6 5" opacity="0.4"/>

              {/* Building 1 — left */}
              <rect x="50" y="160" width="60" height="120" rx="3" fill="#163B65"/>
              <rect x="55" y="165" width="10" height="10" rx="1" fill="#0F766E" opacity="0.9"/>
              <rect x="72" y="165" width="10" height="10" rx="1" fill="#0F766E" opacity="0.6"/>
              <rect x="89" y="165" width="10" height="10" rx="1" fill="#F5F7FA" opacity="0.3"/>
              <rect x="55" y="183" width="10" height="10" rx="1" fill="#F5F7FA" opacity="0.8"/>
              <rect x="72" y="183" width="10" height="10" rx="1" fill="#0F766E" opacity="0.9"/>
              <rect x="89" y="183" width="10" height="10" rx="1" fill="#F5F7FA" opacity="0.4"/>
              <rect x="55" y="201" width="10" height="10" rx="1" fill="#0F766E" opacity="0.7"/>
              <rect x="72" y="201" width="10" height="10" rx="1" fill="#F5F7FA" opacity="0.5"/>
              <rect x="89" y="201" width="10" height="10" rx="1" fill="#0F766E" opacity="0.9"/>
              {/* Door */}
              <rect x="70" y="255" width="20" height="25" rx="2" fill="#0d2235"/>

              {/* Building 2 — right tall */}
              <rect x="300" y="130" width="70" height="150" rx="3" fill="#102A43"/>
              <rect x="308" y="138" width="12" height="12" rx="1" fill="#0F766E" opacity="0.9"/>
              <rect x="326" y="138" width="12" height="12" rx="1" fill="#F5F7FA" opacity="0.5"/>
              <rect x="344" y="138" width="12" height="12" rx="1" fill="#0F766E" opacity="0.7"/>
              <rect x="308" y="158" width="12" height="12" rx="1" fill="#F5F7FA" opacity="0.8"/>
              <rect x="326" y="158" width="12" height="12" rx="1" fill="#0F766E" opacity="0.9"/>
              <rect x="344" y="158" width="12" height="12" rx="1" fill="#F5F7FA" opacity="0.3"/>
              <rect x="308" y="178" width="12" height="12" rx="1" fill="#0F766E" opacity="0.6"/>
              <rect x="326" y="178" width="12" height="12" rx="1" fill="#F5F7FA" opacity="0.9"/>
              <rect x="344" y="178" width="12" height="12" rx="1" fill="#0F766E" opacity="0.8"/>
              <rect x="308" y="198" width="12" height="12" rx="1" fill="#F5F7FA" opacity="0.4"/>
              <rect x="326" y="198" width="12" height="12" rx="1" fill="#0F766E" opacity="0.7"/>
              <rect x="344" y="198" width="12" height="12" rx="1" fill="#F5F7FA" opacity="0.6"/>
              <rect x="322" y="250" width="22" height="30" rx="2" fill="#0d2235"/>

              {/* Phone with report UI — center */}
              <rect x="168" y="100" width="84" height="150" rx="10" fill="#1e3a5f" stroke="#0F766E" strokeWidth="2"/>
              <rect x="176" y="115" width="68" height="10" rx="3" fill="#0F766E" opacity="0.8"/>
              <rect x="176" y="132" width="50" height="6" rx="2" fill="white" opacity="0.4"/>
              <rect x="176" y="144" width="60" height="6" rx="2" fill="white" opacity="0.3"/>
              <rect x="176" y="156" width="45" height="6" rx="2" fill="white" opacity="0.4"/>
              {/* Submit button */}
              <rect x="176" y="170" width="68" height="18" rx="5" fill="#0F766E"/>
              <text x="210" y="183" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">Submit Report</text>
              {/* Status bar */}
              <rect x="176" y="196" width="68" height="10" rx="3" fill="#15803D" opacity="0.7"/>
              <text x="210" y="205" textAnchor="middle" fill="white" fontSize="6">✓ Submitted</text>
              {/* Home button */}
              <circle cx="210" cy="232" r="5" fill="#0F766E" opacity="0.5"/>

              {/* Person holding phone */}
              {/* Head */}
              <circle cx="210" cy="78" r="14" fill="#c8a882"/>
              {/* Body */}
              <path d="M196 92 Q196 130 210 130 Q224 130 224 92Z" fill="#163B65"/>
              {/* Arms holding phone */}
              <path d="M196 100 Q180 110 174 118" stroke="#c8a882" strokeWidth="5" strokeLinecap="round"/>
              <path d="M224 100 Q240 110 246 118" stroke="#c8a882" strokeWidth="5" strokeLinecap="round"/>

              {/* Notification bubble */}
              <rect x="230" y="55" width="80" height="32" rx="8" fill="#0F766E"/>
              <text x="270" y="68" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold">Case Received!</text>
              <text x="270" y="80" textAnchor="middle" fill="white" fontSize="6" opacity="0.9">HH-2026-000001</text>
              <path d="M238 87 L232 95 L248 87Z" fill="#0F766E"/>

              {/* Signal waves from phone */}
              <path d="M252 108 Q262 100 252 92" stroke="#0F766E" strokeWidth="1.5" fill="none" opacity="0.7"/>
              <path d="M258 112 Q272 100 258 88" stroke="#0F766E" strokeWidth="1.5" fill="none" opacity="0.5"/>

              {/* Rwanda flag small */}
              <rect x="22" y="100" width="24" height="16" rx="1" fill="#20603D"/>
              <rect x="22" y="100" width="24" height="5.3" fill="#20603D"/>
              <rect x="22" y="105.3" width="24" height="5.3" fill="#FAD201"/>
              <rect x="22" y="110.6" width="24" height="5.4" fill="#E5162B"/>
              {/* Flag pole */}
              <line x1="22" y1="100" x2="22" y2="130" stroke="#888" strokeWidth="1.5"/>
            </svg>
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
