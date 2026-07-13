import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { api, type User } from "@/lib/api";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — FinSight" },
      { name: "description", content: "Enter the FinSight research desk." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Login,
});

const BOOT = [
  "FINSIGHT/OS v2.0",
  "AUTHENTICATING LINK…",
  "MARKET DATA … OK",
  "SESSION KEY … OK",
];

function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (step < BOOT.length) {
      const t = setTimeout(() => setStep((s) => s + 1), 380);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setReady(true), 240);
    return () => clearTimeout(t);
  }, [step]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !pass) {
      setError("Enter both an email and password.");
      cardRef.current?.classList.remove("animate-shake");
      void cardRef.current?.offsetWidth;
      cardRef.current?.classList.add("animate-shake");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api<User>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password: pass }),
      });
      await navigate({ to: "/terminal" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
      cardRef.current?.classList.remove("animate-shake");
      void cardRef.current?.offsetWidth;
      cardRef.current?.classList.add("animate-shake");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(240,169,41,0.06),transparent_60%)]" />
      <div
        ref={cardRef}
        className="panel relative w-full max-w-md p-8 amber-glow"
      >
        <div className="mono-caps mb-6 flex items-center justify-between text-[10px] text-primary">
          <span>FINSIGHT · SESSION</span>
          <span className="flex items-center gap-2 text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-up animate-pulse-live" />
            LIVE
          </span>
        </div>

        <div className="mb-6 space-y-1.5 font-mono text-xs">
          {BOOT.slice(0, step).map((line, i) => (
            <div key={i} className="text-muted-foreground animate-fade-in">
              <span className="text-primary">›</span> {line}
            </div>
          ))}
          {step < BOOT.length && (
            <div className="text-muted-foreground">
              <span className="text-primary">›</span> {BOOT[step]}
              <span className="ml-1 inline-block h-3 w-2 bg-primary animate-caret align-middle" />
            </div>
          )}
        </div>

        {ready && (
          <form onSubmit={submit} className="space-y-5 animate-fade-in">
            <div>
              <label className="mono-caps mb-2 block text-[10px] text-muted-foreground" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none transition focus:border-primary focus:shadow-[0_0_0_3px_rgba(240,169,41,0.18)]"
                placeholder="you@fund.co"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="mono-caps mb-2 block text-[10px] text-muted-foreground" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                className="w-full border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none transition focus:border-primary focus:shadow-[0_0_0_3px_rgba(240,169,41,0.18)]"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="border-l-2 border-down bg-down/10 px-3 py-2 font-mono text-xs text-down animate-fade-in">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="mono-caps flex w-full items-center justify-center gap-2 bg-primary px-4 py-3 text-xs text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
            >
              {submitting ? "Opening desk…" : mode === "login" ? "Enter the desk →" : "Create account →"}
            </button>
            <div className="mono-caps flex items-center justify-between text-[10px] text-faint">
              <Link to="/" className="hover:text-foreground">← Landing</Link>
              <button
                type="button"
                onClick={() => {
                  setMode((value) => value === "login" ? "register" : "login");
                  setError(null);
                }}
                className="hover:text-primary"
              >{mode === "login" ? "Create account" : "Use existing account"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

