import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Archiv" },
      { name: "description", content: "Sign in to your company drive." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/drive", replace: true });
  }, [session, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to verify.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_440px] bg-background">
      {/* Left side — brand panel */}
      <aside className="hidden lg:flex flex-col justify-between p-12 bg-sidebar border-r border-hairline relative overflow-hidden">
        <div className="flex items-center gap-2">
          <div className="size-7 bg-primary rounded-sm" />
          <span className="font-semibold tracking-tight">Archiv.</span>
        </div>
        <div className="space-y-6 relative z-10">
          <h1 className="text-5xl font-semibold tracking-tight text-balance leading-[1.05]">
            The company drive,<br/>built like Finder.
          </h1>
          <p className="text-muted-foreground max-w-md text-pretty">
            Browse in columns. Preview anything. Share folders with the right people. A precise, architectural alternative to Dropbox & Google Drive.
          </p>
          <ul className="text-sm text-muted-foreground space-y-1.5 font-mono">
            <li>— Columns / List / Grid views</li>
            <li>— Inline PDF, image & video previews</li>
            <li>— Granular folder & file sharing</li>
            <li>— Activity log on every file</li>
          </ul>
        </div>
        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">v0.1 — internal preview</div>
      </aside>

      {/* Right — form */}
      <main className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="size-7 bg-primary rounded-sm" />
            <span className="font-semibold tracking-tight">Archiv.</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signin" ? "Sign in to access your drive." : "Start storing and sharing in seconds."}
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Display name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <Button
            type="button"
            variant="outline"
            disabled={busy}
            className="w-full mt-3"
            onClick={async () => {
              setBusy(true);
              const demoEmail = "demo@archiv.app";
              const demoPass = "demo-archiv-2026";
              try {
                let { error } = await supabase.auth.signInWithPassword({
                  email: demoEmail, password: demoPass,
                });
                if (error) {
                  const { error: e2 } = await supabase.auth.signUp({
                    email: demoEmail, password: demoPass,
                    options: { data: { display_name: "Demo" } },
                  });
                  if (e2) throw e2;
                  await supabase.auth.signInWithPassword({ email: demoEmail, password: demoPass });
                }
              } catch (err: any) {
                toast.error(err.message ?? "Demo login failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Continue with demo account
          </Button>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {mode === "signin" ? "No account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </main>
    </div>
  );
}
