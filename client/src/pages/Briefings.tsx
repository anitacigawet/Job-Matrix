import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Play, Image as ImageIcon, FileText, Sparkles,
  AlertTriangle, Trash2, Headphones, Search, X, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { getFriendlyApiErrorMessage } from "@/lib/api-errors";
import { BriefingAudioPlayer } from "@/components/BriefingAudioPlayer";
import { PageHeader } from "@/components/PageHeader";
import { useSubNav } from "@/components/SubNav";

const BRIEFING_LABELS: Record<string, { label: string; description: string }> = {
  daily_coach_audio: {
    label: "Daily Coach Briefing (audio)",
    description: "Two-host morning podcast about your overnight job-search activity. Warm, on-your-side coaching tone.",
  },
  weekly_market_audio: {
    label: "Weekly Market Pulse (audio)",
    description: "Five-minute Sunday-evening market summary — trends, salary movement, what's hot this week.",
  },
  interview_prep_audio: {
    label: "Interview Prep (audio)",
    description: "Personalised prep audio for a specific upcoming interview. Company, role themes, your fit angle.",
  },
  resume_critique_audio: {
    label: "Resume Critique (audio)",
    description: "Expert-style critique of your résumé. Requires resume text saved on the Preferences page.",
  },
  career_debate_audio: {
    label: "Career Direction Debate (audio)",
    description: "Long-form audio where two hosts thoughtfully argue both sides of a career fork.",
  },
  daily_dashboard_infographic: {
    label: "Daily Dashboard (infographic)",
    description: "One-page visual summary of today's state — new listings, top fit, pipeline funnel.",
  },
  funnel_infographic: {
    label: "Search Funnel (infographic)",
    description: "Weekly visual: scanned → eligible → applied → responded → interviewed.",
  },
  application_status_infographic: {
    label: "Application Status Board (infographic)",
    description: "Visual map of every active application — status, days-since, next action.",
  },
  pre_application_brief: {
    label: "Pre-Application Brief (text)",
    description: "Per-job markdown briefing: company snapshot, role analysis, your fit angle, suggested tweaks.",
  },
  monthly_retrospective: {
    label: "Monthly Retrospective (text)",
    description: "Narrative report of the past month — what shifted, what's stalled, recommendations.",
  },
  career_mindmap: {
    label: "Career Path Mind Map (text)",
    description: "Outline of the connections between your tracked roles, skills, and target companies.",
  },
  interview_flashcards: {
    label: "Interview Flashcards (text)",
    description: "Behavioral-question flashcards tailored to a specific role you're interviewing for.",
  },
  interview_quiz: {
    label: "Interview Quiz (text)",
    description: "Multiple-choice prep quiz tailored to a specific role you're interviewing for.",
  },
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  generating: { label: "Generating…", className: "bg-blue-500/15 text-blue-300 border-blue-500/40" },
  complete: { label: "Complete", className: "bg-green-500/15 text-green-300 border-green-500/40" },
  failed: { label: "Failed", className: "bg-red-500/15 text-red-300 border-red-500/40" },
};

function KindIcon({ kind }: { kind: "audio" | "image" | "video" | "text" | null }) {
  if (kind === "audio") return <Headphones className="h-5 w-5 text-purple-400" />;
  if (kind === "image") return <ImageIcon className="h-5 w-5 text-cyan-400" />;
  if (kind === "video") return <Play className="h-5 w-5 text-pink-400" />;
  return <FileText className="h-5 w-5 text-amber-400" />;
}

function mediaUrl(briefing: { mediaPath?: string | null }) {
  if (!briefing.mediaPath) return null;
  const normalised = briefing.mediaPath.replace(/\\/g, "/").replace(/^briefings\//, "");
  return `/briefings-media/${normalised}`;
}

type SortBy = "newest" | "oldest" | "type";

export function BriefingsPage() {
  const [, setLocation] = useLocation();
  const [selectedType, setSelectedType] = useState<string>("daily_coach_audio");
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Inbox filters / sort — purely client-side; the briefings list is small.
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("newest");

  const resetFilters = () => {
    setFilterType("all");
    setFilterStatus("all");
    setSearchQuery("");
    setSortBy("newest");
  };

  const catalog = trpc.briefings.catalog.useQuery();
  const list = trpc.briefings.list.useQuery(
    { limit: 100 },
    {
      // Poll while anything is still generating.
      refetchInterval: (q) => {
        const rows = q.state.data ?? [];
        return rows.some((r) => r.status === "generating") ? 8_000 : false;
      },
    },
  );
  const appliedJobs = trpc.personalized.getAppliedJobs.useQuery();
  const utils = trpc.useUtils();

  const generateMutation = trpc.briefings.generate.useMutation({
    onSuccess: () => {
      toast.success("Briefing queued — generation runs in the background.");
      utils.briefings.list.invalidate();
    },
    onError: (err) => toast.error(getFriendlyApiErrorMessage(err)),
  });

  const removeMutation = trpc.briefings.remove.useMutation({
    onSuccess: () => {
      toast.success("Briefing deleted.");
      utils.briefings.list.invalidate();
    },
    onError: (err) => toast.error(getFriendlyApiErrorMessage(err)),
  });

  const selectedSpec = (catalog.data ?? []).find((s) => s.type === selectedType);
  const requiresJob = Boolean(selectedSpec?.requiresJobId);
  const canGenerate = !requiresJob || Boolean(selectedJobId);

  const filteredBriefings = useMemo(() => {
    const rows = list.data ?? [];
    const q = searchQuery.trim().toLowerCase();
    const filtered = rows.filter((b: any) => {
      if (filterType !== "all" && b.briefingType !== filterType) return false;
      if (filterStatus !== "all" && b.status !== filterStatus) return false;
      if (q && !String(b.title ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
    const byDate = (a: any, b: any) =>
      (new Date(b.createdAt as any).getTime() || 0) - (new Date(a.createdAt as any).getTime() || 0);
    if (sortBy === "oldest") return [...filtered].sort((a, b) => -byDate(a, b));
    if (sortBy === "type") {
      return [...filtered].sort((a, b) => {
        const ta = BRIEFING_LABELS[a.briefingType]?.label ?? a.briefingType;
        const tb = BRIEFING_LABELS[b.briefingType]?.label ?? b.briefingType;
        const cmp = String(ta).localeCompare(String(tb));
        return cmp !== 0 ? cmp : byDate(a, b);
      });
    }
    return [...filtered].sort(byDate);
  }, [list.data, filterType, filterStatus, searchQuery, sortBy]);

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (searchQuery.trim()) labels.push("search");
    if (filterType !== "all") labels.push("type filter");
    if (filterStatus !== "all") labels.push("status filter");
    return labels;
  }, [searchQuery, filterType, filterStatus]);

  const filtersActive = activeFilterLabels.length > 0 || sortBy !== "newest";

  const handleGenerate = () => {
    if (requiresJob && !selectedJobId) {
      toast.error("This briefing type needs a job — pick one from the list first.");
      return;
    }
    generateMutation.mutate({
      type: selectedType as any,
      jobId: selectedJobId ? Number(selectedJobId) : undefined,
    });
  };

  const { current: subNavTab } = useSubNav();
  const activeTab = subNavTab ?? "inbox";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container max-w-6xl mx-auto px-4 py-8 space-y-6">
        <PageHeader
          title="Briefings"
          subtitle="NotebookLM-powered audio, infographic, and text outputs generated against your real job-search context."
          icon={<Sparkles className="h-7 w-7 text-purple-400" />}
        />

        {activeTab === "generate" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Generate a new briefing</CardTitle>
            <CardDescription>
              Each type uses a hand-curated NotebookLM prompt and your local job-search state.
              Audio generations can take 5–25 minutes — the dashboard polls in the background.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Briefing type
                </label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger data-agent-input="briefing-type">
                    <SelectValue placeholder="Pick a briefing" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(BRIEFING_LABELS).map(([key, meta]) => (
                      <SelectItem key={key} value={key}>
                        {meta.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedType && (
                  <p className="text-xs text-muted-foreground">
                    {BRIEFING_LABELS[selectedType]?.description}
                  </p>
                )}
              </div>
              {requiresJob && (
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Target job (applied)
                  </label>
                  <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                    <SelectTrigger data-agent-input="briefing-target-job">
                      <SelectValue placeholder="Choose an applied job" />
                    </SelectTrigger>
                    <SelectContent>
                      {(appliedJobs.data ?? []).map((j: any) => (
                        <SelectItem key={j.id} value={String(j.id)}>
                          {j.title} — {j.company}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!appliedJobs.data?.length && (
                    <p className="text-xs text-muted-foreground">
                      You don't have any applied jobs yet. Mark a job as applied from the dashboard
                      to use per-job briefings.
                    </p>
                  )}
                </div>
              )}
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending || !canGenerate}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              data-agent-action={`generate-briefing-${selectedType}`}
            >
              {generateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Generate
            </Button>
          </CardContent>
        </Card>
        )}

        {activeTab === "inbox" && (
        <>
        {/* The manual refresh button was retired in D11.16a — the list
            query auto-polls every 8s while anything is generating (see
            `list.useQuery` above), and invalidates after every
            generate/delete mutation. There's no flow where a user needs
            to manually refresh. */}

        {list.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground" data-agent-status="loading-briefings">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading briefings…
          </div>
        ) : !list.data?.length ? (
          <Card data-agent-status="empty-briefings">
            <CardContent className="py-12 text-center text-muted-foreground space-y-3">
              <Sparkles className="h-10 w-10 mx-auto opacity-50" />
              <p className="text-foreground font-medium">No briefings yet</p>
              <p className="text-sm max-w-md mx-auto">
                Switch to the{" "}
                <span className="text-foreground font-medium">Generate</span> tab above to create your first one.
                A good starting point is the{" "}
                <span className="text-foreground font-medium">Daily Coach Briefing</span> — a ten-minute two-host
                audio overview of your job search. Audio generations take 10–25 minutes.
              </p>
              <p className="text-xs">
                First time? Connect NotebookLM on the{" "}
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs underline"
                  onClick={() => setLocation("/settings")}
                  data-agent-action="go-to-settings-global"
                >
                  Settings
                </Button>{" "}
                page first.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-9 bg-background/50"
                  data-agent-input="briefing-search"
                  aria-label="Search briefings by title"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    aria-label="Clear search"
                    data-agent-action="clear-briefing-search"
                  >
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-[220px]" data-agent-input="briefing-filter-type" aria-label="Filter by briefing type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {Object.entries(BRIEFING_LABELS).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-[150px]" data-agent-input="briefing-filter-status" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="generating">Generating</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                <SelectTrigger className="w-full sm:w-[170px]" data-agent-input="briefing-sort" aria-label="Sort briefings">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="type">Type (A→Z)</SelectItem>
                </SelectContent>
              </Select>
              {filtersActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="gap-1.5"
                  data-agent-action="clear-briefing-filters"
                >
                  <X className="h-4 w-4" /> Clear
                </Button>
              )}
            </div>
            {filtersActive && (
              <p
                className="text-xs text-muted-foreground"
                aria-live="polite"
                data-agent-status="filtered-briefings-count"
              >
                Showing {filteredBriefings.length} of {list.data.length}
              </p>
            )}
            {filteredBriefings.length === 0 ? (
              <Card data-agent-status="no-matching-briefings">
                <CardContent className="py-12 text-center text-muted-foreground space-y-3">
                  <Filter className="h-10 w-10 mx-auto opacity-50" />
                  <p className="text-foreground font-medium">No briefings match your filters</p>
                  <p className="text-sm max-w-md mx-auto">
                    {list.data.length} briefing{list.data.length === 1 ? "" : "s"} in total, but none pass the current{" "}
                    {activeFilterLabels.join(" + ") || "view"}.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetFilters}
                    data-agent-action="clear-briefing-filters"
                  >
                    <X className="h-4 w-4 mr-2" /> Clear filters
                  </Button>
                </CardContent>
              </Card>
            ) : (
          <div className="space-y-3" data-agent-status="briefings-list">
            {filteredBriefings.map((b: any) => {
              const status = STATUS_BADGE[b.status] ?? STATUS_BADGE.pending;
              const meta = BRIEFING_LABELS[b.briefingType];
              const expanded = expandedId === b.id;
              const url = mediaUrl(b);
              return (
                <Card key={b.id} className="overflow-hidden" data-agent-status={`briefing-card-${b.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <KindIcon kind={b.mediaType ?? (meta?.label.includes("text") ? "text" : null)} />
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">{b.title}</CardTitle>
                          <CardDescription className="text-xs">
                            {meta?.label ?? b.briefingType} ·{" "}
                            {b.createdAt
                              ? new Date(b.createdAt).toLocaleString()
                              : "just now"}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={status.className}>
                          {status.label}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpandedId(expanded ? null : b.id)}
                          data-agent-action={`view-briefing-${b.id}`}
                          disabled={b.status !== "complete" && b.status !== "failed"}
                        >
                          {expanded ? "Hide" : "View"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Delete this briefing?")) {
                              removeMutation.mutate({ id: b.id });
                            }
                          }}
                          data-agent-action={`delete-briefing-${b.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  {expanded && (
                    <CardContent className="pt-0">
                      <Separator className="mb-4" />
                      {b.status === "failed" && (
                        <div className="flex items-start gap-2 text-sm text-red-300">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{b.errorMessage ?? "Generation failed."}</span>
                        </div>
                      )}
                      {b.status === "complete" && b.mediaType === "audio" && url && (
                        <BriefingAudioPlayer id={b.id} src={url} title={b.title} />
                      )}
                      {b.status === "complete" && b.mediaType === "image" && url && (
                        <img
                          src={url}
                          alt={b.title}
                          className="w-full rounded-md border border-border/30"
                          data-agent-status={`briefing-image-${b.id}`}
                        />
                      )}
                      {b.status === "complete" && b.mediaType === "video" && url && (
                        <video
                          controls
                          src={url}
                          className="w-full rounded-md border border-border/30"
                          data-agent-status={`briefing-video-${b.id}`}
                        />
                      )}
                      {b.status === "complete" && b.textContent && (
                        <pre
                          className="whitespace-pre-wrap text-sm bg-muted/10 border border-border/30 rounded-md p-4 font-sans"
                          data-agent-status={`briefing-text-${b.id}`}
                        >
                          {b.textContent}
                        </pre>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
            )}
          </>
        )}
        </>
        )}
      </div>
    </div>
  );
}

export default BriefingsPage;
