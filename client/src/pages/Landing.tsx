import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BriefcaseBusiness,
  Database,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-gradient-to-br from-purple-900/20 via-background to-blue-900/20 flex items-center justify-center p-6">
      <Card className="max-w-4xl w-full glass-card border-purple-500/30 overflow-hidden">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="p-3 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30">
              <Sparkles className="h-10 w-10 text-purple-400" />
            </div>
          </div>
          <CardTitle className="text-4xl gradient-text">Escape the noise.</CardTitle>
          <CardDescription className="mx-auto max-w-2xl text-base leading-relaxed">
            Job Matrix searches public job sources, filters openings
            against what actually fits your life, and keeps the promising ones moving from
            discovery to application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-7">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
              <Search className="mb-3 h-5 w-5 text-cyan-400" />
              <h2 className="font-semibold">Search in one place</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Search selected job boards and public feeds without juggling the same query across tabs.
              </p>
            </div>
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
              <BriefcaseBusiness className="mb-3 h-5 w-5 text-purple-400" />
              <h2 className="font-semibold">See what fits</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Remove clear mismatches, rank the rest, and carry applications through your pipeline.
              </p>
            </div>
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
              <ShieldCheck className="mb-3 h-5 w-5 text-green-400" />
              <h2 className="font-semibold">Keep the final say</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                A browser assistant can help with forms, but you review and approve every submission.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
            <Database className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
            <p>
              Your profile, saved jobs, and application history stay in the local
              data folder. AI is optional and uses a provider key you choose to supply.
            </p>
          </div>

          {loading ? (
            <Button disabled className="w-full" size="lg" data-agent-status="loading-user">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
            </Button>
          ) : (
            <Button
              onClick={() => setLocation(user?.onboardingCompleted === 1 ? "/jobs" : "/onboarding")}
              data-agent-action="landing-continue"
              className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 shadow-lg shadow-purple-500/20"
              size="lg"
            >
              {user?.onboardingCompleted === 1 ? "Open my dashboard" : "Set up Job Matrix"}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
