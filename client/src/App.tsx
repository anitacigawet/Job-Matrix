import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2 } from "lucide-react";
import type { ComponentType } from "react";
import { lazy, Suspense, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppearanceProvider } from "./contexts/AppearanceContext";
import { DebugModeProvider } from "./contexts/DebugModeContext";
import { TopNav } from "./components/TopNav";
import { SubNav, SubNavProvider } from "./components/SubNav";
import { KeyboardShortcuts } from "./components/KeyboardShortcuts";

const Landing = lazy(() => import("./pages/Landing"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Platforms = lazy(() => import("./pages/Platforms"));
const NotFound = lazy(() => import("./pages/NotFound"));
const TrackedJobsPersonalized = lazy(() =>
  import("./pages/TrackedJobsPersonalized").then(module => ({
    default: module.TrackedJobsPersonalized,
  }))
);
const AppliedJobs = lazy(() =>
  import("./pages/AppliedJobs").then(module => ({
    default: module.AppliedJobs,
  }))
);
const ConfigDebug = lazy(() =>
  import("./pages/ConfigDebug").then(module => ({
    default: module.ConfigDebug,
  }))
);
const JobPreferences = lazy(() =>
  import("./pages/JobPreferences").then(module => ({
    default: module.JobPreferences,
  }))
);
const Analytics = lazy(() =>
  import("./pages/Analytics").then(module => ({ default: module.Analytics }))
);
const SettingsPage = lazy(() =>
  import("./pages/Settings").then(module => ({ default: module.SettingsPage }))
);
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground gap-2">
      <Loader2 className="h-5 w-5 animate-spin" />
      Loading...
    </div>
  );
}

// The route gate follows the database-backed user returned by auth.me. A new
// context is created for every request, so onboarding completion and factory
// reset changes become visible immediately.
function RequireOnboardingComplete({
  component: Component,
}: {
  component: ComponentType;
}) {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });

  useEffect(() => {
    if (!loading && user && user.onboardingCompleted !== 1) {
      setLocation("/onboarding");
    }
  }, [loading, setLocation, user]);

  if (loading) return <RouteLoading />;
  if (!user) return <RouteLoading />;
  if (user.onboardingCompleted !== 1) return null;

  return <Component />;
}

function RequirePendingOnboarding({
  component: Component,
}: {
  component: ComponentType;
}) {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });

  useEffect(() => {
    if (!loading && user?.onboardingCompleted === 1) {
      setLocation("/jobs");
    }
  }, [loading, setLocation, user]);

  if (loading) return <RouteLoading />;
  if (!user) return <RouteLoading />;
  if (user.onboardingCompleted === 1) return null;

  return <Component />;
}

const GuardedOnboarding = () => (
  <RequirePendingOnboarding component={Onboarding} />
);
const GuardedHome = () => <RequireOnboardingComplete component={Platforms} />;
const GuardedJobs = () => (
  <RequireOnboardingComplete component={TrackedJobsPersonalized} />
);
const GuardedApplied = () => (
  <RequireOnboardingComplete component={AppliedJobs} />
);
const GuardedPreferences = () => (
  <RequireOnboardingComplete component={JobPreferences} />
);
const GuardedAnalytics = () => (
  <RequireOnboardingComplete component={Analytics} />
);
const GuardedSettings = () => (
  <RequireOnboardingComplete component={SettingsPage} />
);
const GuardedConfigDebug = () => (
  <RequireOnboardingComplete component={ConfigDebug} />
);

function Router() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Switch>
        <Route path={"/"} component={Landing} />
        <Route path={"/onboarding"} component={GuardedOnboarding} />
        <Route path={"/home"} component={GuardedHome} />
        <Route path={"/jobs"} component={GuardedJobs} />
        <Route path={"/applied"} component={GuardedApplied} />
        <Route path={"/preferences"} component={GuardedPreferences} />
        <Route path={"/analytics"} component={GuardedAnalytics} />
        <Route path={"/settings"} component={GuardedSettings} />
        <Route path={"/config-debug"} component={GuardedConfigDebug} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// Routes that opt out of the global page-shell (TopNav + SubNav + footer).
// Onboarding is a gated, forced flow — exposing TopNav would let users jump
// to other routes mid-setup, breaking RequirePendingOnboarding's intent.
const BARE_ROUTES = new Set(["/onboarding"]);

function AppShell() {
  const [location] = useLocation();
  if (BARE_ROUTES.has(location)) {
    return (
      <main>
        <Router />
      </main>
    );
  }
  return (
    <SubNavProvider>
      <div className="page-shell">
        <TopNav />
        <SubNav />
        <main className="page-content">
          <Router />
        </main>
        <footer
          style={{
            padding: "20px 32px 24px",
            fontSize: 12,
            color: "var(--fg-dim)",
            borderTop: "1px solid var(--line)",
            marginTop: 32,
          }}
        >
          <div
            style={{
              textAlign: "center",
              fontStyle: "italic",
              fontSize: 13,
              marginBottom: 12,
              color: "var(--fg)",
              opacity: 0.85,
            }}
          >
            Job Matrix — escape the noise.
          </div>
          <div
            style={{
              display: "flex",
              gap: 16,
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <span className="mono">
              Job Matrix · local-first · no telemetry · single user
            </span>
            <span className="mono">v0.2.0-beta · SQLite</span>
          </div>
        </footer>
      </div>
    </SubNavProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppearanceProvider>
        <DebugModeProvider>
          <TooltipProvider>
            <Toaster />
            <KeyboardShortcuts />
            <AppShell />
          </TooltipProvider>
        </DebugModeProvider>
      </AppearanceProvider>
    </ErrorBoundary>
  );
}

export default App;
