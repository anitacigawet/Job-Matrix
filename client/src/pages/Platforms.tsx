import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Building2, Linkedin, Search, Activity, Database, Zap, CheckCircle2, Clock, TrendingUp, Globe, AlertTriangle, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { getFriendlyApiErrorMessage } from "@/lib/api-errors";
import { ScraperHealthCard } from "@/components/ScraperHealthCard";
import { PageHeader } from "@/components/PageHeader";
import { useSubNav } from "@/components/SubNav";

interface PlatformConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  glowColor: string;
  borderColor: string;
  // Tier classification (DECISIONS.md D-019):
  //   1 — Real public API (Adzuna). Stable, requires credentials.
  //   2 — JobSpy scraper. Best-effort.
  tier: 1 | 2;
  // Operability status (set 2026-05-17, see docs/internal/SCRAPER_TRIAGE.md):
  //   "validated" — production-tested working
  //   "working"   — recently tested, returning results, may be brittle
  //   "broken"    — known not to work; reason in `brokenReason`
  status: "validated" | "working" | "broken";
  brokenReason?: string;
  // For Tier-1 sources that have credentials in Settings → Data Sources,
  // the data-source id used by the credentials query. Drives the
  // "Configure credentials" CTA. Sources with no auth (Remotive, RemoteOK)
  // skip this field — nothing to configure.
  dataSourceId?: "adzuna" | "usajobs" | "jooble" | "themuse";
}

const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    id: "adzuna",
    name: "Adzuna",
    description: "Real public API — aggregates listings worldwide with stable, documented endpoints",
    icon: <Database className="h-8 w-8" />,
    color: "text-emerald-500",
    glowColor: "shadow-emerald-500/20",
    borderColor: "border-emerald-500/30",
    tier: 1,
    status: "validated",
    dataSourceId: "adzuna",
  },
  {
    id: "usajobs",
    name: "USAJobs",
    description: "US federal civilian job postings (Social Security Admin, USDA, NIH, etc.)",
    icon: <Briefcase className="h-8 w-8" />,
    color: "text-indigo-400",
    glowColor: "shadow-indigo-500/20",
    borderColor: "border-indigo-500/30",
    tier: 1,
    status: "validated",
    dataSourceId: "usajobs",
  },
  {
    id: "jooble",
    name: "Jooble",
    description: "Global aggregator across many job boards — requires partner API key",
    icon: <Globe className="h-8 w-8" />,
    color: "text-amber-400",
    glowColor: "shadow-amber-500/20",
    borderColor: "border-amber-500/30",
    tier: 1,
    status: "validated",
    dataSourceId: "jooble",
  },
  {
    id: "themuse",
    name: "The Muse",
    description: "Early/mid-career roles in tech and media — open API, optional key raises rate limit",
    icon: <Search className="h-8 w-8" />,
    color: "text-pink-400",
    glowColor: "shadow-pink-500/20",
    borderColor: "border-pink-500/30",
    tier: 1,
    status: "validated",
    dataSourceId: "themuse",
  },
  {
    id: "remotive",
    name: "Remotive",
    description: "Remote-only positions across many categories — open API, no signup",
    icon: <Globe className="h-8 w-8" />,
    color: "text-cyan-400",
    glowColor: "shadow-cyan-500/20",
    borderColor: "border-cyan-500/30",
    tier: 1,
    status: "validated",
  },
  {
    id: "remoteok",
    name: "RemoteOK",
    description: "Remote-only tech jobs — open API, no signup",
    icon: <Activity className="h-8 w-8" />,
    color: "text-teal-400",
    glowColor: "shadow-teal-500/20",
    borderColor: "border-teal-500/30",
    tier: 1,
    status: "validated",
  },
  {
    id: "indeed",
    name: "Indeed",
    description: "World's #1 job site with millions of listings",
    icon: <Briefcase className="h-8 w-8" />,
    color: "text-blue-500",
    glowColor: "shadow-blue-500/20",
    borderColor: "border-blue-500/30",
    tier: 2,
    status: "validated",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Professional network with job opportunities",
    icon: <Linkedin className="h-8 w-8" />,
    color: "text-blue-600",
    glowColor: "shadow-blue-600/20",
    borderColor: "border-blue-600/30",
    tier: 2,
    status: "working",
  },
  {
    id: "glassdoor",
    name: "Glassdoor",
    description: "Job search with company reviews and salary data",
    icon: <Building2 className="h-8 w-8" />,
    color: "text-green-500",
    glowColor: "shadow-green-500/20",
    borderColor: "border-green-500/30",
    tier: 2,
    status: "broken",
    brokenReason:
      "JobSpy's Glassdoor scraper is currently failing — Glassdoor's API has drifted and the library hasn't caught up. Returns 0 rows with internal API errors.",
  },
  {
    id: "ziprecruiter",
    name: "ZipRecruiter",
    description: "AI-powered job matching platform",
    icon: <Search className="h-8 w-8" />,
    color: "text-orange-500",
    glowColor: "shadow-orange-500/20",
    borderColor: "border-orange-500/30",
    tier: 2,
    status: "broken",
    brokenReason:
      "Cloudflare blocks our requests with HTTP 403 before any scraper code runs. Not fixable without residential proxies, which Job Matrix won't ship.",
  },
  {
    id: "google",
    name: "Google Jobs",
    description: "Google's job aggregator",
    icon: <Globe className="h-8 w-8" />,
    color: "text-red-500",
    glowColor: "shadow-red-500/20",
    borderColor: "border-red-500/30",
    tier: 2,
    status: "broken",
    brokenReason:
      "JobSpy can't extract pagination cursors from Google's current response shape. The page structure has drifted. Returns 0 rows.",
  },
];

export default function Platforms() {
  const { current: subNavTab } = useSubNav();
  const activeTab = subNavTab ?? "sources";
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();

  // Fetch dynamic stats and platform settings
  const { data: systemStats } = trpc.personalized.getSystemStats.useQuery();
  const { data: enabledPlatforms, isLoading: platformsLoading } = trpc.settings.getEnabledPlatforms.useQuery();
  // Tier-1 credential status (Phase 13). Drives the "Configure credentials"
  // CTA on Adzuna's card when it's enabled but unconfigured.
  const { data: dataSources } = trpc.settings.getDataSources.useQuery();

  // Local state for optimistic updates. The initial value mirrors the database
  // default and is replaced by the saved setting as soon as the query resolves.
  const [localEnabled, setLocalEnabled] = useState<string[]>(["indeed", "linkedin", "adzuna"]);
  
  useEffect(() => {
    if (enabledPlatforms) {
      setLocalEnabled(enabledPlatforms);
    }
  }, [enabledPlatforms]);

  // Mutation to update platforms
  const updatePlatforms = trpc.settings.updatePlatforms.useMutation({
    onSuccess: (data) => {
      toast.success("Platforms updated!", {
        description: `Now searching: ${data.platforms.join(", ")}`,
      });
      utils.settings.getEnabledPlatforms.invalidate();
    },
    onError: (error) => {
      toast.error("Failed to update platforms", { description: getFriendlyApiErrorMessage(error) });
      // Revert optimistic update
      if (enabledPlatforms) setLocalEnabled(enabledPlatforms);
    },
  });

  const handleTogglePlatform = (platformId: string) => {
    const isCurrentlyEnabled = localEnabled.includes(platformId);
    let newPlatforms: string[];
    
    if (isCurrentlyEnabled) {
      // Don't allow disabling the last platform
      if (localEnabled.length <= 1) {
        toast.error("At least one platform must be enabled");
        return;
      }
      newPlatforms = localEnabled.filter(p => p !== platformId);
    } else {
      newPlatforms = [...localEnabled, platformId];
    }
    
    setLocalEnabled(newPlatforms);
    updatePlatforms.mutate({ enabledPlatforms: newPlatforms as any });
  };

  // Dynamic stats
  const totalEligible = systemStats?.totalEligibleJobs || 0;
  const totalTracked = systemStats?.totalTrackedJobs || totalEligible || 0;
  const activePlatformCount = localEnabled.length;

  return (
    <div className="container max-w-7xl mx-auto py-8 relative overflow-x-hidden">
      {/* Background effects */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -z-10" />

      <PageHeader
        title="Data Sources"
        subtitle="Choose which job sources are searched during a global scan. All enabled sources are searched together."
        icon={<Globe className="h-8 w-8 text-cyan-400" />}
      />

      {activeTab === "sources" && (<>
      {/* Data Source Hub Cards */}
      <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-12" style={{ zIndex: 2 }}>
        {PLATFORM_CONFIGS.map((platform) => {
          const isEnabled = localEnabled.includes(platform.id);
          const isTier1 = platform.tier === 1;
          const dsRow = platform.dataSourceId
            ? dataSources?.sources.find((s) => s.id === platform.dataSourceId)
            : null;
          const needsCredentials = isTier1 && !!dsRow && !dsRow.configured;

          return (
            <Card
              key={platform.id}
              className={`group relative transition-all duration-300 border-2 z-10 overflow-visible ${
                isEnabled
                  ? `${platform.borderColor} bg-gradient-to-br from-green-500/5 to-transparent hover:shadow-lg ${platform.glowColor}`
                  : "border-muted/30 bg-gradient-to-br from-muted/5 to-transparent opacity-60"
              }`}
            >
              {/* Animated Glow Pulse for active cards */}
              {isEnabled && (
                <div
                  className="absolute inset-0 rounded-lg pointer-events-none"
                  style={{
                    animation: `pulse-glow ${3 + PLATFORM_CONFIGS.indexOf(platform) * 0.5}s ease-in-out infinite`,
                  }}
                />
              )}

              {/* Status + Toggle */}
              <div className="absolute top-3 right-3 flex items-center gap-2 flex-wrap justify-end">
                {isTier1 && (
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40 text-[10px] font-medium"
                    title="Tier 1 — real public API (no scraping)"
                  >
                    TIER 1 · API
                  </Badge>
                )}
                {!isTier1 && (
                  <Badge
                    variant="outline"
                    className="bg-slate-500/15 text-slate-300 border-slate-500/40 text-[10px] font-medium"
                    title="Tier 2 — scraper (JobSpy)"
                  >
                    TIER 2 · SCRAPER
                  </Badge>
                )}
                {platform.status === "broken" && (
                  <Badge
                    variant="outline"
                    className="bg-red-500/15 text-red-300 border-red-500/40 text-[10px] font-medium gap-1"
                    title={platform.brokenReason}
                    data-agent-status={`platform-broken-${platform.id}`}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    BROKEN
                  </Badge>
                )}
                {platform.status === "validated" && !isTier1 && (
                  <Badge
                    variant="outline"
                    className="bg-green-500/15 text-green-300 border-green-500/40 text-[10px] font-medium"
                  >
                    VALIDATED
                  </Badge>
                )}
                {isEnabled ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-medium text-green-400">ON</span>
                  </div>
                ) : (
                  <span className="text-xs font-medium text-muted-foreground">OFF</span>
                )}
                <Switch
                  checked={isEnabled}
                  onCheckedChange={() => handleTogglePlatform(platform.id)}
                  disabled={updatePlatforms.isPending}
                  aria-label={`Toggle ${platform.name}`}
                  data-agent-action={`toggle-platform-${platform.id}`}
                  className="scale-75"
                />
              </div>

              {/* Broken-platform reason callout — visible inside the card, not just on hover */}
              {platform.status === "broken" && (
                <div
                  className="mx-4 mt-2 -mb-1 p-2 rounded-md bg-red-500/10 border border-red-500/30 flex items-start gap-2 text-xs text-red-200"
                  data-agent-status={`platform-broken-reason-${platform.id}`}
                >
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{platform.brokenReason}</span>
                </div>
              )}

              {/* Tier-1 credential CTA — visible only when toggled on AND credentials missing */}
              {needsCredentials && isEnabled && (
                <div
                  className="mx-4 mt-2 -mb-1 p-2 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-xs text-amber-200"
                  data-agent-status={`platform-needs-credentials-${platform.id}`}
                >
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span>Credentials not configured. Searches that include {platform.name} will skip it.</span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 ml-1 text-amber-100 underline"
                      data-agent-action={`configure-${platform.id}-credentials`}
                      onClick={() => setLocation("/settings")}
                    >
                      Configure in Settings →
                    </Button>
                  </div>
                </div>
              )}
              {isTier1 && !needsCredentials && dsRow?.configured && (
                <div
                  className="mx-4 mt-2 -mb-1 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2 text-xs text-emerald-200"
                  data-agent-status={`platform-credentials-ok-${platform.id}`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Credentials configured (from {dsRow.source === "env" ? "env var" : "settings file"}).</span>
                </div>
              )}

              <CardHeader className="pb-3">
                <div className={`${isEnabled ? platform.color : "text-muted-foreground"} mb-3 transition-colors`}>
                  {platform.icon}
                </div>
                <CardTitle className={`text-xl font-bold ${!isEnabled ? "text-muted-foreground" : ""}`}>
                  {platform.name}
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  {platform.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="space-y-2 text-xs">
                  {/* Dynamic stats for enabled platforms */}
                  {platform.id === "indeed" && isEnabled && (
                    <>
                      <div className="flex items-center justify-between py-1.5 px-2 rounded bg-background/50">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Database className="h-3 w-3" />
                          <span>Jobs Tracked</span>
                        </div>
                        <span className="font-semibold text-foreground">
                          {totalTracked.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 px-2 rounded bg-background/50">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <TrendingUp className="h-3 w-3" />
                          <span>Eligible</span>
                        </div>
                        <span className="font-semibold text-green-400">
                          {totalEligible.toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}

                  {/* Status row for all cards */}
                  <div className="flex items-center justify-between py-1.5 px-2 rounded bg-background/50">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Activity className="h-3 w-3" />
                      <span>Status</span>
                    </div>
                    <span className={`font-semibold ${
                      isEnabled ? "text-green-400" : "text-muted-foreground"
                    }`}>
                      {isEnabled ? "Active" : "Disabled"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <Card className="glass-card border-blue-500/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
              <CardTitle className="text-lg">Active Sources</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold gradient-text">
              {activePlatformCount} / {PLATFORM_CONFIGS.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Data sources enabled</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-purple-500/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-purple-400" />
              <CardTitle className="text-lg">Total Jobs Tracked</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold gradient-text">
              {totalTracked.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Eligible jobs from {totalTracked.toLocaleString()} total scanned
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card border-green-500/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-400" />
              <CardTitle className="text-lg">System Health</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400">Healthy</div>
            <div className="space-y-1 mt-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                <span>Uptime: {systemStats?.systemUptime || "N/A"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Database className="h-3 w-3" />
                <span>First scan: {systemStats?.firstScanDate || "N/A"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      </>)}

      {activeTab === "health" && (
      <div className="mt-4">
        {/* Per-platform health telemetry. Moved here from Settings in D11.12
            (2026-05-17) so per-platform on/off and per-platform success
            rates live in the same route. The Health tab focuses solely on
            scrape success/failure rates and last-error messages. */}
        <ScraperHealthCard />
      </div>
      )}
    </div>
  );
}
