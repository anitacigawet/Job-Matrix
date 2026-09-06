import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Loader2,
  Search,
  ExternalLink,
  MapPin,
  Briefcase,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  AlertCircle,
  Calendar,
  Settings,
  ChevronDown,
  ChevronUp,
  Download,
  Square,
  CheckSquare,
  Filter,
  X,
  BarChart3,
  Target,
  Copy,
  KeyRound,
  Bot,
  ListPlus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { TerminalBox, type TerminalBoxProps } from "@/components/TerminalBox";
import { rolePreview, sanitizeJobDescription } from "@/lib/sanitize";
import { getFriendlyApiErrorMessage } from "@/lib/api-errors";
import { getJobFitScore } from "@/lib/job-fit-score";

import { WorkflowRail } from "@/components/WorkflowRail";
import { StatusStrip } from "@/components/StatusStrip";
import { ApplyAction } from "@/components/PlatformApplyButton";
import { ApplicationAssistantDialog } from "@/components/ApplicationAssistantDialog";

// Helper function to format seconds into human-readable time
function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) {
    return `~${seconds}s remaining`;
  } else if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return `~${minutes} minute${minutes === 1 ? "" : "s"} remaining`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    if (minutes === 0) {
      return `~${hours} hour${hours === 1 ? "" : "s"} remaining`;
    }
    return `~${hours}h ${minutes}m remaining`;
  }
}

// Helper function to format relative time (e.g., "3 hours ago")
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return "just now";
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  } else {
    return date.toLocaleDateString();
  }
}

export function TrackedJobsPersonalized() {
  const utils = trpc.useUtils();
  const [progressDetails, setProgressDetails] = useState<{
    phase?: string;
    current?: number;
    total?: number;
    message?: string;
  } | null>(null);

  const terminalBoxesContainerRef = useRef<HTMLDivElement>(null);

  // Time estimation tracking
  const [timeEstimate, setTimeEstimate] = useState<{
    estimatedSecondsRemaining: number;
    startTime: number;
    lastCurrent: number;
    lastUpdateTime: number;
  } | null>(null);

  // Terminal boxes for visual workflow
  const [terminalBoxes, setTerminalBoxes] = useState<TerminalBoxProps[]>([]);
  const [isNukeDialogOpen, setIsNukeDialogOpen] = useState(false);
  // Default collapsed because most users don't need the filtered-out list
  // hanging open on every dashboard load. Power users can expand. State is
  // ephemeral; not persisted to localStorage on purpose.
  const [showFilteredJobs, setShowFilteredJobs] = useState(false);

  // Auto-scroll terminal boxes container when content updates
  useEffect(() => {
    if (terminalBoxesContainerRef.current) {
      terminalBoxesContainerRef.current.scrollTo({
        top: terminalBoxesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [terminalBoxes, progressDetails]);

  // Poll database for current scan progress (refresh-safe!)
  const { data: dbProgress } =
    trpc.personalized.getCurrentScanProgress.useQuery(undefined, {
      refetchInterval: data => {
        // Poll every second while a scan is running
        return data ? 1000 : false;
      },
    });

  const { data: jobs = [], isLoading: jobsLoading } =
    trpc.personalized.getBoardJobs.useQuery();

  // Fetch last scan timestamps
  const { data: lastGlobalSearch } =
    trpc.personalized.getLastGlobalSearch.useQuery();
  const { data: lastAIAnalysis } =
    trpc.personalized.getLastAIAnalysis.useQuery();

  // Fetch total job count for Database Cleanup confirmation
  const { data: totalJobCount = 0 } =
    trpc.personalized.getTotalJobCount.useQuery();

  // Fetch pending job counts for button badges
  const { data: pendingCounts } =
    trpc.personalized.getPendingJobCounts.useQuery();

  // Fetch dynamic user profile and job titles for Search Criteria display
  const { data: userProfile } = trpc.personalized.getUserProfile.useQuery();
  const { data: userJobTitlesList = [] } =
    trpc.onboarding.getJobTitles.useQuery();
  const { data: llmStatus } = trpc.settings.getLlm.useQuery();
  const activeProvider = llmStatus?.providers.find(
    p => p.id === llmStatus.activeProvider
  );
  const activeProviderHasKey = !!activeProvider?.hasKey;
  const activeProviderLabel =
    llmStatus?.activeProvider === "gemini"
      ? "Google Gemini"
      : llmStatus?.activeProvider === "openai"
        ? "OpenAI"
        : "DeepSeek";

  // Search, filter, bulk selection, and expanded job state
  const [searchQuery, setSearchQuery] = useState("");
  const [jobTypeFilter, setJobTypeFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [selectedJobs, setSelectedJobs] = useState<Set<number>>(new Set());
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [sortBy, setSortBy] = useState<string>("date");
  const [queuedOnly, setQueuedOnly] = useState(false);
  const [assistantJobId, setAssistantJobId] = useState<number | null>(null);

  // Derive availability from saved rows; a refreshed board can arrive before
  // the count query after the first scan, and imported rows can also be filtered.
  const hasJobsToFilter = totalJobCount > 0 || jobs.length > 0 ||
    (pendingCounts?.unanalyzedJobs ?? 0) > 0;

  // Global search mutation
  const globalSearch = trpc.personalized.runGlobalSearch.useMutation({
    onSuccess: result => {
      // Server reports success: false when every individual scrape failed
      // (typically: Python/JobSpy venv not configured). Don't claim success.
      const allFailed = result.success === false;
      const partialFailure = !allFailed && (result.failedSearchCount ?? 0) > 0;

      if (allFailed) {
        toast.error("Global Search Failed", { description: result.message });
        setTerminalBoxes([
          {
            id: "global-search",
            title: "Global Search",
            status: "error",
            message: result.message,
          },
        ]);
        setTimeout(() => setTerminalBoxes([]), 4000);
        return;
      }

      if (partialFailure) {
        toast.warning("Global Search — partial success", {
          description: result.message,
        });
      } else {
        toast.success("Global Search Complete!", {
          description: result.message,
        });
      }
      setTerminalBoxes([
        {
          id: "global-search",
          title: "Global Search",
          status: "completed",
          message: result.message,
        },
      ]);

      // Clear terminal boxes after 2 seconds
      setTimeout(() => setTerminalBoxes([]), 2000);

      utils.personalized.getLastGlobalSearch.invalidate();
      utils.personalized.getTotalJobCount.invalidate();
      utils.personalized.getPendingJobCounts.invalidate();
      utils.personalized.getSystemStats.invalidate();
      utils.personalized.getEligibleJobs.invalidate();
      utils.personalized.getBoardJobs.invalidate();
    },
    onError: error => {
      toast.error("Global Search Failed", {
        description: getFriendlyApiErrorMessage(error),
      });
      // Update terminal box to error
      setTerminalBoxes([
        {
          id: "global-search",
          title: "Global Search",
          status: "error",
          message: error.message,
        },
      ]);
      setTimeout(() => setTerminalBoxes([]), 3000);
    },
  });
  // AI job filtering mutation
  const aiAnalysis = trpc.personalized.runAIAnalysis.useMutation({
    onSuccess: result => {
      toast.success("AI Job Filtering Complete!", {
        description: result.message,
      });

      // Show all 3 stages completed
      setTerminalBoxes([
        {
          id: "stage-1",
          title: "Stage 1: Remote & Location Filter",
          status: "completed",
          message: "✓ Remote & location filter complete",
        },
        {
          id: "stage-2",
          title: "Stage 2: Degree Filter",
          status: "completed",
          message: "✓ Degree filter complete",
        },
        {
          id: "stage-3",
          title: "Stage 3: Experience Check",
          status: "completed",
          message: "✓ Experience check complete",
        },
      ]);

      // Clear terminal boxes after 2 seconds, then auto-chain fit scoring
      setTimeout(() => {
        setTerminalBoxes([]);
        // Auto-chain: run fit scoring after AI Job Filtering completes
        toast.info("Starting Fit Scoring...", {
          description:
            "Automatically scoring eligible jobs against your profile",
        });
        setTerminalBoxes([
          {
            id: "fit-scoring",
            title: "Fit Scoring (Auto)",
            status: "running",
            message: "Scoring eligible jobs against your profile...",
          },
        ]);
        fitScoring.mutate();
      }, 2000);

      utils.personalized.getLastAIAnalysis.invalidate();
      utils.personalized.getPendingJobCounts.invalidate();
      utils.personalized.getSystemStats.invalidate();
      utils.personalized.getEligibleJobs.invalidate();
      utils.personalized.getBoardJobs.invalidate();
    },
    onError: error => {
      // Extract stage information from error message if present
      const stageMatch = error.message.match(/Stage (\d+) \(([^)]+)\)/);
      const title = stageMatch
        ? `AI Job Filtering Failed - Stage ${stageMatch[1]}`
        : "AI Job Filtering Failed";
      const description = stageMatch
        ? `${stageMatch[2]} filter encountered an error. ${getFriendlyApiErrorMessage(error)}`
        : getFriendlyApiErrorMessage(error);

      toast.error(title, {
        description,
        duration: 8000, // Show longer for error messages
      });
    },
  });
  const cleanDatabase = trpc.personalized.cleanDatabase.useMutation({
    onSuccess: result => {
      toast.success("Database Cleaned!", {
        description: result.message,
      });
      // Invalidate all queries that depend on job data
      utils.personalized.getEligibleJobs.invalidate();
      utils.personalized.getBoardJobs.invalidate();
      utils.personalized.getPendingJobCounts.invalidate();
      utils.personalized.getTotalJobCount.invalidate();
      utils.personalized.getLastGlobalSearch.invalidate();
      utils.personalized.getLastAIAnalysis.invalidate();
    },
    onError: error => {
      toast.error("Clean Failed", {
        description: getFriendlyApiErrorMessage(error),
      });
    },
  });

  // Pause operation mutation
  const pauseOperation = trpc.personalized.pauseOperation.useMutation({
    onSuccess: result => {
      toast.info("Operation Paused", {
        description: "You can resume anytime",
      });
      utils.personalized.getCurrentScanProgress.invalidate();
    },
    onError: error => {
      toast.error("Pause Failed", {
        description: getFriendlyApiErrorMessage(error),
      });
    },
  });

  // Resume operation mutation
  const resumeOperation = trpc.personalized.resumeOperation.useMutation({
    onSuccess: result => {
      toast.success("Operation Resumed", {
        description: "Continuing from where we left off",
      });
      utils.personalized.getCurrentScanProgress.invalidate();
    },
    onError: error => {
      toast.error("Resume Failed", {
        description: getFriendlyApiErrorMessage(error),
      });
    },
  });

  // Cancel operation mutation
  const cancelOperation = trpc.personalized.cancelOperation.useMutation({
    onSuccess: result => {
      toast.success("Operation Cancelled", {
        description: "All progress has been stopped",
      });
      utils.personalized.getCurrentScanProgress.invalidate();
    },
    onError: error => {
      toast.error("Cancel Failed", {
        description: getFriendlyApiErrorMessage(error),
      });
    },
  });

  // Mark job as applied mutation
  const markAsApplied = trpc.personalized.markJobAsApplied.useMutation({
    onSuccess: result => {
      if (result.success) {
        toast.success("Job Marked as Applied!", {
          description: "Added to your Applied Jobs list",
        });
        utils.personalized.getEligibleJobs.invalidate();
        utils.personalized.getBoardJobs.invalidate();
        utils.personalized.getAppliedJobs.invalidate();
      } else {
        toast.info("Already Applied", {
          description: result.message,
        });
      }
    },
    onError: error => {
      toast.error("Failed to Mark as Applied", {
        description: getFriendlyApiErrorMessage(error),
      });
    },
  });

  // Track whether any operation is currently active.
  const isAnyOperationPending =
    globalSearch.isPending || aiAnalysis.isPending || cleanDatabase.isPending;

  // Track previous progress to avoid redundant updates.
  const prevProgressRef = useRef<{
    phase: string;
    current: number;
    total: number;
  } | null>(null);

  // Track time estimate with ref to avoid dependency issues
  const timeEstimateRef = useRef<{
    estimatedSecondsRemaining: number;
    startTime: number;
    lastCurrent: number;
    lastUpdateTime: number;
  } | null>(null);

  // Update progress display from database (survives refresh!)
  useEffect(() => {
    if (dbProgress && dbProgress.status === "running") {
      // Only process progress when its values change.
      const hasChanged =
        !prevProgressRef.current ||
        prevProgressRef.current.phase !== dbProgress.currentPhase ||
        prevProgressRef.current.current !== dbProgress.currentProgress ||
        prevProgressRef.current.total !== dbProgress.totalProgress;

      if (hasChanged) {
        prevProgressRef.current = {
          phase: dbProgress.currentPhase,
          current: dbProgress.currentProgress,
          total: dbProgress.totalProgress,
        };

        // Calculate time estimate
        const now = Date.now();
        const current = dbProgress.currentProgress;
        const total = dbProgress.totalProgress;

        if (current > 0 && total > 0) {
          if (
            !timeEstimateRef.current ||
            timeEstimateRef.current.lastCurrent === 0
          ) {
            // First progress update - initialize tracking
            const newEstimate = {
              estimatedSecondsRemaining: 0,
              startTime: now,
              lastCurrent: current,
              lastUpdateTime: now,
            };
            timeEstimateRef.current = newEstimate;
            setTimeEstimate(newEstimate);
          } else if (current > timeEstimateRef.current.lastCurrent) {
            // Progress has advanced - calculate rate
            const itemsProcessed =
              current - timeEstimateRef.current.lastCurrent;
            const timeElapsed =
              (now - timeEstimateRef.current.lastUpdateTime) / 1000; // seconds
            const itemsPerSecond = itemsProcessed / timeElapsed;
            const itemsRemaining = total - current;
            const secondsRemaining = itemsRemaining / itemsPerSecond;

            const newEstimate = {
              estimatedSecondsRemaining: Math.round(secondsRemaining),
              startTime: timeEstimateRef.current.startTime,
              lastCurrent: current,
              lastUpdateTime: now,
            };
            timeEstimateRef.current = newEstimate;
            setTimeEstimate(newEstimate);
          }
        }

        // Only update progress details when values change
        setProgressDetails({
          phase: dbProgress.currentPhase,
          current: dbProgress.currentProgress,
          total: dbProgress.totalProgress,
          message: dbProgress.progressMessage,
        });
      }
    } else if (!isAnyOperationPending) {
      prevProgressRef.current = null;
      timeEstimateRef.current = null;
      setTimeEstimate(null);
      setProgressDetails(null);
    }
  }, [dbProgress, isAnyOperationPending]);

  // Update terminal boxes based on AI Job Filtering progress
  useEffect(() => {
    if (!aiAnalysis.isPending || !dbProgress) return;

    const phase = dbProgress.currentPhase;
    const current = dbProgress.currentProgress;
    const total = dbProgress.totalProgress;

    // Stage 1: Remote/Location Filter
    if (
      phase.includes("Stage 1") ||
      phase.includes("remote") ||
      phase.includes("location")
    ) {
      setTerminalBoxes([
        {
          id: "stage-1",
          title: "Stage 1: Remote & Location Filter",
          status: "running",
          message: `Analyzing ${current}/${total} jobs...`,
          progress: { current, total },
        },
      ]);
    }
    // Stage 2: Degree/Education Filter
    else if (
      phase.includes("Stage 2") ||
      phase.includes("degree") ||
      phase.includes("education")
    ) {
      setTerminalBoxes([
        {
          id: "stage-1",
          title: "Stage 1: Remote & Location Filter",
          status: "completed",
          message: "✓ Remote & location filter complete",
        },
        {
          id: "stage-2",
          title: "Stage 2: Degree Filter",
          status: "running",
          message: `Verifying ${current}/${total} jobs...`,
          progress: { current, total },
        },
      ]);
    }
    // Stage 3: Experience Check
    else if (phase.includes("Stage 3") || phase.includes("experience")) {
      setTerminalBoxes([
        {
          id: "stage-1",
          title: "Stage 1: Remote & Location Filter",
          status: "completed",
          message: "✓ Remote & location filter complete",
        },
        {
          id: "stage-2",
          title: "Stage 2: Degree Filter",
          status: "completed",
          message: "✓ Degree filter complete",
        },
        {
          id: "stage-3",
          title: "Stage 3: Experience Check",
          status: "running",
          message: `Checking ${current}/${total} jobs...`,
          progress: { current, total },
        },
      ]);
    }
  }, [dbProgress, aiAnalysis.isPending]);

  const handleBroadSearch = () => {
    // Add terminal box for Global Search
    setTerminalBoxes([
      {
        id: "global-search",
        title: "Global Search",
        status: "running",
        message: "Scanning Indeed for jobs...",
      },
    ]);

    globalSearch.mutate();
  };

  const handleAIAnalysis = () => {
    // Start with Stage 1 terminal box
    setTerminalBoxes([
      {
        id: "stage-1",
        title: "Stage 1: Remote & Location Filter",
        status: "running",
        message: "Filtering jobs by remote eligibility & location...",
      },
    ]);

    aiAnalysis.mutate();
  };

  const handleCleanDatabase = () => {
    if (totalJobCount === 0) {
      toast.error("No jobs to delete", {
        description: "Database is already empty",
      });
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ALL ${totalJobCount} jobs from the database?\n\nThis action cannot be undone.`
    );

    if (confirmed) {
      cleanDatabase.mutate();
    }
  };

  // Bulk action mutations
  const bulkMarkApplied = trpc.personalized.bulkMarkApplied.useMutation({
    onSuccess: result => {
      toast.success(`Marked ${result.applied} jobs as applied`, {
        description:
          result.skipped > 0 ? `${result.skipped} already applied` : undefined,
      });
      setSelectedJobs(new Set());
      setShowBulkActions(false);
      utils.personalized.getEligibleJobs.invalidate();
      utils.personalized.getBoardJobs.invalidate();
      utils.personalized.getAppliedJobs.invalidate();
    },
    onError: error =>
      toast.error("Bulk apply failed", {
        description: getFriendlyApiErrorMessage(error),
      }),
  });

  const bulkReject = trpc.personalized.bulkRejectJobs.useMutation({
    onSuccess: result => {
      toast.success(`Rejected ${result.rejected} jobs`);
      setSelectedJobs(new Set());
      setShowBulkActions(false);
      utils.personalized.getEligibleJobs.invalidate();
      utils.personalized.getBoardJobs.invalidate();
    },
    onError: error =>
      toast.error("Bulk reject failed", {
        description: getFriendlyApiErrorMessage(error),
      }),
  });

  const setQueued = trpc.automation.setQueued.useMutation({
    onSuccess: async () => {
      await utils.personalized.getEligibleJobs.invalidate();
      utils.personalized.getBoardJobs.invalidate();
    },
    onError: error =>
      toast.error("Queue update failed", {
        description: getFriendlyApiErrorMessage(error),
      }),
  });

  const bulkQueue = trpc.automation.bulkQueue.useMutation({
    onSuccess: async result => {
      toast.success(
        `Queued ${result.queued} job${result.queued === 1 ? "" : "s"}`
      );
      setSelectedJobs(new Set());
      setShowBulkActions(false);
      await utils.personalized.getEligibleJobs.invalidate();
      utils.personalized.getBoardJobs.invalidate();
    },
    onError: error =>
      toast.error("Queue update failed", {
        description: getFriendlyApiErrorMessage(error),
      }),
  });

  // Fit Scoring mutation
  const fitScoring = trpc.personalized.runFitScoring.useMutation({
    onSuccess: result => {
      toast.success("Fit Scoring Complete!", {
        description: result.message,
      });
      setTerminalBoxes([
        {
          id: "fit-scoring",
          title: "Fit Scoring",
          status: "completed",
          message: result.message,
        },
      ]);
      setTimeout(() => setTerminalBoxes([]), 2000);
      utils.personalized.getEligibleJobs.invalidate();
      utils.personalized.getBoardJobs.invalidate();
      utils.personalized.getDuplicateGroups.invalidate();
    },
    onError: error => {
      toast.error("Fit Scoring Failed", {
        description: getFriendlyApiErrorMessage(error),
      });
      setTerminalBoxes([
        {
          id: "fit-scoring",
          title: "Fit Scoring",
          status: "error",
          message: error.message,
        },
      ]);
      setTimeout(() => setTerminalBoxes([]), 3000);
    },
  });

  // Duplicate groups query
  const { data: duplicateData } =
    trpc.personalized.getDuplicateGroups.useQuery();

  const csvExport = trpc.personalized.exportEligibleJobsCSV.useQuery(
    undefined,
    { enabled: false }
  );

  const handleExportCSV = async () => {
    const result = await csvExport.refetch();
    if (result.data) {
      const blob = new Blob([result.data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `eligible-jobs-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported successfully");
    }
  };

  const toggleJobSelection = (jobId: number) => {
    setSelectedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const toggleSelectAll = (jobIds: number[]) => {
    if (selectedJobs.size === jobIds.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(jobIds));
    }
  };

  // Filter eligible jobs based on search and filters
  const eligibleJobs = jobs.filter(
    j => (j.aiAnalysis as any)?.eligible === true
  );
  const rejectedJobs = jobs.filter(j => (j.aiAnalysis as any)?.eligible === false);
  const pendingJobs = jobs.filter(j => typeof (j.aiAnalysis as any)?.eligible !== "boolean");
  const filteredEligibleJobs = eligibleJobs.filter(job => {
    const matchesSearch =
      !searchQuery ||
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (job.company || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (job.location || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType =
      jobTypeFilter === "all" ||
      (job.jobType || "").toLowerCase() === jobTypeFilter.toLowerCase();
    const matchesPlatform =
      platformFilter === "all" || job.platform === platformFilter;
    const matchesQueue = !queuedOnly || job.status === "interested";
    return matchesSearch && matchesType && matchesPlatform && matchesQueue;
  });

  // Build duplicate lookup map: jobId -> list of other platform listings
  const duplicateMap = useMemo(() => {
    const map = new Map<
      number,
      Array<{ id: number; platform: string; jobUrl: string | null }>
    >();
    if (duplicateData?.groups) {
      for (const group of duplicateData.groups) {
        for (const jobId of group.jobIds) {
          const others = group.jobIds
            .filter(id => id !== jobId)
            .map(id => {
              const job = eligibleJobs.find(j => j.id === id);
              return job
                ? {
                    id: job.id,
                    platform: job.platform || "unknown",
                    jobUrl: job.jobUrl,
                  }
                : null;
            })
            .filter(Boolean) as Array<{
            id: number;
            platform: string;
            jobUrl: string | null;
          }>;
          map.set(jobId, others);
        }
      }
    }
    return map;
  }, [duplicateData, eligibleJobs]);

  // Collapse duplicates: keep the best listing (highest fit score, or first found)
  const [showDuplicates, setShowDuplicates] = useState(false);
  const deduplicatedJobs = useMemo(() => {
    if (showDuplicates) return filteredEligibleJobs; // Show all if toggled
    const seen = new Set<number>();
    const result: typeof filteredEligibleJobs = [];
    if (duplicateData?.groups) {
      for (const group of duplicateData.groups) {
        // Find the best job in this group (highest fit score)
        let bestJob: (typeof filteredEligibleJobs)[0] | null = null;
        for (const jobId of group.jobIds) {
          const job = filteredEligibleJobs.find(j => j.id === jobId);
          if (!job) continue;
          if (!bestJob) {
            bestJob = job;
            continue;
          }
          const scoreA = getJobFitScore(bestJob) ?? -1;
          const scoreB = getJobFitScore(job) ?? -1;
          if (scoreB > scoreA) bestJob = job;
        }
        if (bestJob) {
          seen.add(bestJob.id);
          group.jobIds.forEach(id => seen.add(id));
          result.push(bestJob);
        }
      }
    }
    // Add non-duplicate jobs
    for (const job of filteredEligibleJobs) {
      if (!seen.has(job.id)) result.push(job);
    }
    return result;
  }, [filteredEligibleJobs, duplicateData, showDuplicates]);

  // Sort eligible jobs
  const sortedEligibleJobs = [...deduplicatedJobs].sort((a, b) => {
    if (sortBy === "fit_score") {
      const scoreA = getJobFitScore(a) ?? -1;
      const scoreB = getJobFitScore(b) ?? -1;
      return scoreB - scoreA; // Highest first
    } else if (sortBy === "salary") {
      const salA = a.salaryMax ?? a.salaryMin ?? 0;
      const salB = b.salaryMax ?? b.salaryMin ?? 0;
      return salB - salA; // Highest first
    } else if (sortBy === "title") {
      return a.title.localeCompare(b.title);
    } else {
      // Default: date (newest first)
      const dateA = a.datePosted ? new Date(a.datePosted).getTime() : 0;
      const dateB = b.datePosted ? new Date(b.datePosted).getTime() : 0;
      return dateB - dateA;
    }
  });

  // Get unique job types for filter dropdown
  const uniqueJobTypes = Array.from(
    new Set(eligibleJobs.map(j => j.jobType).filter(Boolean))
  ) as string[];

  const formatSalary = (
    min: number | null,
    max: number | null,
    interval: string | null
  ) => {
    if (!min && !max) return null;
    if (min && max) {
      return `$${min.toLocaleString()} - $${max.toLocaleString()}${interval ? `/${interval}` : ""}`;
    }
    if (min)
      return `$${min.toLocaleString()}+${interval ? `/${interval}` : ""}`;
    if (max)
      return `Up to $${max.toLocaleString()}${interval ? `/${interval}` : ""}`;
    return null;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    try {
      const date = new Date(dateStr);
      // Format: "Jan 21, 2026" (no time)
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour12: true,
      });
    } catch {
      return "Invalid date";
    }
  };

  // Parse "Analysis complete: 234 eligible, 930 ineligible" from the last
  // AI filter run so the WorkflowRail can show eligible/ineligible meta.
  const { eligibleFromFilter, ineligibleFromFilter } = useMemo(() => {
    const message = lastAIAnalysis?.progressMessage || "";
    const eligibleMatch = message.match(/(\d+)\s+eligible/);
    const ineligibleMatch = message.match(/(\d+)\s+ineligible/);
    return {
      eligibleFromFilter: eligibleMatch ? parseInt(eligibleMatch[1]) : null,
      ineligibleFromFilter: ineligibleMatch
        ? parseInt(ineligibleMatch[1])
        : null,
    };
  }, [lastAIAnalysis?.progressMessage]);

  const handleFitScoring = () => {
    setTerminalBoxes([
      {
        id: "fit-scoring",
        title: "Fit Scoring",
        status: "running",
        message: "Scoring jobs against your profile...",
      },
    ]);
    fitScoring.mutate();
  };

  const handleCleanupRequest = () => {
    if (totalJobCount === 0) {
      toast.error("Database is already empty");
      return;
    }
    setIsNukeDialogOpen(true);
  };

  return (
    <>
      <ApplicationAssistantDialog
        jobId={assistantJobId}
        open={assistantJobId !== null}
        onOpenChange={open => {
          if (!open) setAssistantJobId(null);
        }}
      />
      {/* LLM Key Warning (full-width banner above the dash grid) */}
      {llmStatus && !activeProviderHasKey && (
        <div
          className="card card-pad row-between llm-key-warning"
          data-agent-status="llm-key-warning"
          style={{
            marginBottom: 16,
            borderColor: "color-mix(in oklch, var(--warn) 35%, var(--line))",
            background: "var(--warn-bg)",
          }}
        >
          <div className="row" style={{ gap: 12 }}>
            <AlertTriangle
              size={18}
              style={{ color: "var(--warn)", flexShrink: 0 }}
            />
            <div>
              <div style={{ fontWeight: 600 }}>AI features disabled</div>
              <div
                className="dim"
                style={{ fontSize: "var(--font-sm)", marginTop: 2 }}
              >
                Your {activeProviderLabel} API key isn't configured. AI
                filtering and scoring will be skipped.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => (window.location.href = "/settings")}
            data-agent-action="go-to-settings-global"
          >
            <KeyRound size={12} />
            Configure {activeProviderLabel}
          </button>
        </div>
      )}

      {/* Operation Progress (full-width banner above the dash-grid) */}
      {(isAnyOperationPending || progressDetails) && (
        <div
          className="card card-pad stack"
          data-agent-status="operation-progress"
          style={{
            marginBottom: 16,
            borderColor: "var(--accent-line)",
            background:
              "color-mix(in oklch, var(--bg-1) 92%, var(--accent-1) 6%)",
          }}
        >
          <div className="row-between">
            <div className="row-tight">
              <Loader2
                size={14}
                className="animate-spin"
                style={{ color: "var(--accent-1)" }}
              />
              <span style={{ fontWeight: 500, fontSize: "var(--font-sm)" }}>
                {progressDetails?.phase || "Operation in progress"}
              </span>
            </div>
            {progressDetails && (progressDetails.total || 0) > 0 && (
              <span
                className="mono"
                style={{ fontSize: "var(--font-xs)", color: "var(--accent-1)" }}
              >
                {Math.round(
                  ((progressDetails.current || 0) /
                    (progressDetails.total || 1)) *
                    100
                )}
                %
              </span>
            )}
          </div>
          {progressDetails && (progressDetails.total || 0) > 0 ? (
            <>
              <div className="progress-track">
                <div
                  className="progress-bar"
                  style={{
                    width: `${((progressDetails.current || 0) / (progressDetails.total || 1)) * 100}%`,
                  }}
                />
              </div>
              <div className="dim" style={{ fontSize: "var(--font-xs)" }}>
                <span className="mono">
                  {progressDetails.current}/{progressDetails.total}
                </span>
                {timeEstimate && timeEstimate.estimatedSecondsRemaining > 0 && (
                  <>
                    {" "}
                    ·{" "}
                    {formatTimeRemaining(
                      timeEstimate.estimatedSecondsRemaining
                    )}
                  </>
                )}
                {progressDetails.message && <> · {progressDetails.message}</>}
              </div>
            </>
          ) : (
            <>
              <div className="progress-track">
                <div
                  className="progress-bar"
                  style={{
                    width: "40%",
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
              </div>
              <div className="dim" style={{ fontSize: "var(--font-xs)" }}>
                {progressDetails?.message || "Processing..."}
              </div>
            </>
          )}
          <div className="row" style={{ gap: 8 }}>
            {dbProgress?.operationPaused ? (
              <button
                type="button"
                className="btn btn-sm flex-1"
                onClick={() => resumeOperation.mutate()}
                disabled={resumeOperation.isPending}
                data-agent-action="resume-operation"
              >
                {resumeOperation.isPending ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Resuming…
                  </>
                ) : (
                  "Resume"
                )}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm flex-1"
                onClick={() => pauseOperation.mutate()}
                disabled={pauseOperation.isPending}
                data-agent-action="pause-operation"
              >
                {pauseOperation.isPending ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Pausing…
                  </>
                ) : (
                  "Pause"
                )}
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-danger flex-1"
              onClick={() => cancelOperation.mutate()}
              disabled={cancelOperation.isPending}
              data-agent-action="cancel-operation"
            >
              {cancelOperation.isPending ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Cancelling…
                </>
              ) : (
                "Cancel"
              )}
            </button>
          </div>
        </div>
      )}

      <div className="dash-grid">
        <aside className="dash-rail">
          <WorkflowRail
            onScan={handleBroadSearch}
            scanIsPending={globalSearch.isPending}
            scanLastCompletedAt={lastGlobalSearch?.completedAt ?? undefined}
            scanLastTotal={lastGlobalSearch?.totalJobsFound}
            scanLastNew={lastGlobalSearch?.newJobsFound}
            onFilter={handleAIAnalysis}
            filterIsPending={aiAnalysis.isPending}
            filterEnabled={hasJobsToFilter}
            filterPendingCount={pendingCounts?.unanalyzedJobs}
            filterLastCompletedAt={lastAIAnalysis?.completedAt ?? undefined}
            filterEligible={eligibleFromFilter}
            filterIneligible={ineligibleFromFilter}
            onScore={handleFitScoring}
            scoreIsPending={fitScoring.isPending}
            scoreEnabled={eligibleJobs.length > 0}
            scoreUnscoredCount={
              eligibleJobs.filter(j => getJobFitScore(j) === null).length
            }
            onCleanup={handleCleanupRequest}
            cleanupIsPending={cleanDatabase.isPending}
            totalJobCount={totalJobCount}
          />

          {/* Terminal boxes stream into the rail while operations are running */}
          {terminalBoxes.length > 0 && (
            <div
              ref={terminalBoxesContainerRef}
              className="stack-tight"
              style={{ maxHeight: 420, overflowY: "auto" }}
            >
              {terminalBoxes.map((box, index) => (
                <TerminalBox
                  key={box.id ?? `${box.title}-${index}`}
                  title={box.title}
                  status={box.status}
                  message={box.message}
                  progress={box.progress}
                  spawnFrom={box.spawnFrom}
                  onComplete={box.onComplete}
                />
              ))}
            </div>
          )}
        </aside>

        <main className="dash-main">
          <StatusStrip
            scanned={totalJobCount}
            eligible={eligibleJobs.length}
            filteredOut={rejectedJobs.length}
            scored={
              eligibleJobs.filter(j => getJobFitScore(j) !== null).length
            }
            awaitingScore={
              eligibleJobs.filter(j => getJobFitScore(j) === null).length
            }
          />

          {/* Search Criteria Info */}
          <Card className="mb-6 glass-card" data-agent-status="search-criteria">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Search Criteria & AI Filters
                </CardTitle>
                <a
                  href="/preferences"
                  className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                  data-agent-action="edit-preferences-from-card"
                >
                  <Settings className="h-3 w-3" /> Edit
                </a>
              </div>
            </CardHeader>
            <CardContent>
              {!userProfile?.isRealProfile ? (
                <div className="p-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex flex-col items-center text-center gap-4 animate-pulse">
                  <AlertCircle className="h-10 w-10 text-orange-400" />
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-orange-200">
                      Profile Not Configured
                    </p>
                    <p className="text-sm text-orange-200/70 max-w-md">
                      Please click <strong>Set Up Profile</strong> above to
                      configure your actual location and preferences.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  {/* Column 1: Search Targets */}
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        Target Positions
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {userJobTitlesList.filter(t => t.isActive).length >
                        0 ? (
                          userJobTitlesList
                            .filter(t => t.isActive)
                            .slice(0, 10)
                            .map((t, i) => {
                              const colors = [
                                "bg-blue-500/20 text-blue-300 border-blue-500/40",
                                "bg-purple-500/20 text-purple-300 border-purple-500/40",
                                "bg-pink-500/20 text-pink-300 border-pink-500/40",
                              ];
                              return (
                                <Badge
                                  key={t.id}
                                  variant="secondary"
                                  className={`text-[11px] ${colors[i % colors.length]}`}
                                >
                                  {t.title}
                                </Badge>
                              );
                            })
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            No active titles
                          </span>
                        )}
                        {userJobTitlesList.filter(t => t.isActive).length >
                          10 && (
                          <Badge
                            variant="secondary"
                            className="bg-gray-500/20 text-gray-300 border-gray-500/40 text-[11px]"
                          >
                            +
                            {userJobTitlesList.filter(t => t.isActive).length -
                              10}{" "}
                            more
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        Target Locations
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(userProfile?.remotePreference === "remote_only" ||
                          userProfile?.remotePreference === "any") && (
                          <Badge
                            variant="secondary"
                            className="bg-green-500/20 text-green-300 border-green-500/40 text-[11px]"
                          >
                            🌎 Remote (Nationwide)
                          </Badge>
                        )}
                        {userProfile?.city && (
                          <Badge
                            variant="secondary"
                            className="bg-cyan-500/20 text-cyan-300 border-cyan-500/40 text-[11px]"
                          >
                            🏠 {userProfile.city},{" "}
                            {userProfile.stateAbbr || userProfile.state} (
                            {userProfile.searchRadiusMiles || 50} mi)
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Filter Rules & Profile */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        AI Filter Rules
                      </p>
                      <ul className="space-y-1.5">
                        <li className="flex items-center gap-2">
                          <span className="text-red-400 font-bold leading-none">
                            -
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            Higher Education Req.
                          </span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-red-400 font-bold leading-none">
                            -
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            Over{" "}
                            {userProfile?.yearsExperience === "0-1"
                              ? "1"
                              : userProfile?.yearsExperience === "1-3"
                                ? "3"
                                : userProfile?.yearsExperience === "3-5"
                                  ? "5"
                                  : userProfile?.yearsExperience === "5-10"
                                    ? "10"
                                    : "1"}
                            Y Exp.
                          </span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-red-400 font-bold leading-none">
                            -
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            Not {userProfile?.state || "State"} Residents
                          </span>
                        </li>
                        {userProfile?.salaryFilterEnabled &&
                          userProfile?.minSalary && (
                            <li className="flex items-center gap-2">
                              <span className="text-red-400 font-bold leading-none">
                                -
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                Under ${userProfile.minSalary.toLocaleString()}
                                /yr
                              </span>
                            </li>
                          )}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        Profile Applied
                      </p>
                      <ul className="space-y-1.5">
                        <li className="flex items-center gap-2">
                          <span className="text-green-400 font-bold leading-none">
                            +
                          </span>
                          <span
                            className="text-[11px] text-muted-foreground truncate"
                            title={userProfile?.educationLevel}
                          >
                            {userProfile?.educationLevel === "no_degree"
                              ? "No Degree"
                              : userProfile?.educationLevel === "high_school"
                                ? "HS / GED"
                                : userProfile?.educationLevel === "associates"
                                  ? "Associate's"
                                  : userProfile?.educationLevel === "bachelors"
                                    ? "Bachelor's"
                                    : userProfile?.educationLevel === "masters"
                                      ? "Master's"
                                      : userProfile?.educationLevel === "phd"
                                        ? "PhD / Doc"
                                        : "Standard"}
                          </span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-green-400 font-bold leading-none">
                            +
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {userProfile?.yearsExperience || "0-1"}Y Experience
                          </span>
                        </li>
                        {userProfile?.skillsParsed && (
                          <li className="flex items-center gap-2">
                            <span className="text-green-400 font-bold leading-none">
                              +
                            </span>
                            <span
                              className="text-[11px] text-muted-foreground truncate"
                              title={userProfile.skillsParsed}
                            >
                              Skills Matcher
                            </span>
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Search, Filter & Bulk Actions Bar */}
          {eligibleJobs.length > 0 && (
            <div className="mb-6 space-y-3">
              <div className="flex items-center gap-3 flex-wrap filter-bar">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by title, company, or location..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-10 bg-background/50 border-border/50"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                </div>
                {/* Job Type Filter */}
                <Select value={jobTypeFilter} onValueChange={setJobTypeFilter}>
                  <SelectTrigger className="w-full sm:w-[180px] bg-background/50">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Job Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {uniqueJobTypes.map(type => (
                      <SelectItem key={type} value={type.toLowerCase()}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Platform Filter */}
                <Select
                  value={platformFilter}
                  onValueChange={setPlatformFilter}
                >
                  <SelectTrigger className="w-full sm:w-[180px] bg-background/50">
                    <Briefcase className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    <SelectItem value="indeed">Indeed</SelectItem>
                    <SelectItem value="glassdoor">Glassdoor</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="ziprecruiter">ZipRecruiter</SelectItem>
                    <SelectItem value="google">Google Jobs</SelectItem>
                  </SelectContent>
                </Select>
                {/* Sort By */}
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-full sm:w-[180px] bg-background/50">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Sort By" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Newest First</SelectItem>
                    <SelectItem value="fit_score">
                      AI Match Score (High→Low)
                    </SelectItem>
                    <SelectItem value="salary">Salary (High→Low)</SelectItem>
                    <SelectItem value="title">Title (A→Z)</SelectItem>
                  </SelectContent>
                </Select>
                {/* CSV Export */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
                <Button
                  variant={queuedOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setQueuedOnly(value => !value)}
                  className="gap-2"
                  data-agent-action="toggle-application-queue"
                >
                  <ListPlus className="h-4 w-4" />
                  {queuedOnly ? "Showing queue" : "Application queue"}
                </Button>
                {/* Bulk Select Toggle */}
                <Button
                  variant={showBulkActions ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowBulkActions(!showBulkActions);
                    setSelectedJobs(new Set());
                  }}
                  className="gap-2"
                >
                  <CheckSquare className="h-4 w-4" />
                  {showBulkActions ? "Cancel Selection" : "Bulk Actions"}
                </Button>
              </div>
              {/* Bulk Action Bar */}
              {showBulkActions && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      toggleSelectAll(filteredEligibleJobs.map(j => j.id))
                    }
                    className="gap-2 text-xs"
                  >
                    {selectedJobs.size === filteredEligibleJobs.length ? (
                      <>
                        <CheckSquare className="h-4 w-4" /> Deselect All
                      </>
                    ) : (
                      <>
                        <Square className="h-4 w-4" /> Select All (
                        {filteredEligibleJobs.length})
                      </>
                    )}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {selectedJobs.size} selected
                  </span>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selectedJobs.size === 0 || bulkQueue.isPending}
                    onClick={() =>
                      bulkQueue.mutate({ jobIds: Array.from(selectedJobs) })
                    }
                    className="gap-2"
                    data-agent-action="bulk-add-to-application-queue"
                  >
                    {bulkQueue.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ListPlus className="h-3 w-3" />
                    )}
                    Add to queue
                  </Button>
                  <Button
                    size="sm"
                    disabled={
                      selectedJobs.size === 0 || bulkMarkApplied.isPending
                    }
                    onClick={() =>
                      bulkMarkApplied.mutate({
                        jobIds: Array.from(selectedJobs),
                      })
                    }
                    className="bg-green-600 hover:bg-green-700 gap-2"
                  >
                    {bulkMarkApplied.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    Mark Applied
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={selectedJobs.size === 0 || bulkReject.isPending}
                    onClick={() =>
                      bulkReject.mutate({ jobIds: Array.from(selectedJobs) })
                    }
                    className="gap-2"
                  >
                    {bulkReject.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    Reject
                  </Button>
                </div>
              )}
              {/* Results count + dedup toggle */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-muted-foreground">
                  Showing {sortedEligibleJobs.length}
                  {!showDuplicates && duplicateData?.totalDuplicates
                    ? ` (${filteredEligibleJobs.length - deduplicatedJobs.length + sortedEligibleJobs.length} with duplicates)`
                    : ""}{" "}
                  of {eligibleJobs.length} eligible jobs
                  {platformFilter !== "all" &&
                    ` • ${platformFilter === "ziprecruiter" ? "ZipRecruiter" : platformFilter === "linkedin" ? "LinkedIn" : platformFilter.charAt(0).toUpperCase() + platformFilter.slice(1)}`}
                  {sortBy !== "date" &&
                    ` • Sorted by ${sortBy === "fit_score" ? "AI Match Score" : sortBy === "salary" ? "Salary" : "Title"}`}
                </p>
                {duplicateData?.totalDuplicates ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDuplicates(!showDuplicates)}
                    className="gap-2 text-xs"
                  >
                    <Copy className="h-3 w-3" />
                    {showDuplicates
                      ? `Hide Duplicates (${duplicateData.totalDuplicates})`
                      : `Show All Duplicates (${duplicateData.totalDuplicates})`}
                  </Button>
                ) : null}
              </div>
            </div>
          )}

          {jobsLoading ? (
            <div
              className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground border border-dashed border-border/50 rounded-xl bg-muted/5"
              aria-live="polite"
              data-agent-status="loading-jobs"
            >
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p>Loading your job board...</p>
            </div>
          ) : eligibleJobs.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-12 text-center border rounded-xl bg-muted/10"
              aria-live="polite"
              data-agent-status="empty-jobs"
            >
              <Card className="border-0 bg-transparent shadow-none">
                <CardContent className="py-6 text-center max-w-md">
                  <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  {jobs.length === 0 ? (
                    <>
                      <h3 className="text-lg font-semibold mb-2">
                        {totalJobCount === 0 && !lastGlobalSearch?.completedAt
                          ? "Nothing scanned yet"
                          : "No jobs waiting for review"}
                      </h3>
                      <p className="text-muted-foreground">
                        Click{" "}
                        <span className="text-foreground font-medium">
                          Run New Scan
                        </span>{" "}
                        above to fetch live listings from your enabled job
                        sources that match the profile saved on the{" "}
                        <a
                          className="underline hover:text-foreground"
                          href="/preferences"
                          data-agent-action="go-to-preferences"
                        >
                          Preferences
                        </a>{" "}
                        page.
                      </p>
                    </>
                  ) : pendingJobs.length === 0 ? (
                    <>
                      <h3 className="text-lg font-semibold mb-2">
                        No eligible matches
                      </h3>
                      <p className="text-muted-foreground">
                        {rejectedJobs.length} job{rejectedJobs.length === 1 ? "" : "s"} scanned,
                        but none passed the AI filter for your profile. Try
                        widening your{" "}
                        <a
                          className="underline hover:text-foreground"
                          href="/preferences"
                          data-agent-action="go-to-preferences"
                        >
                          preferences
                        </a>{" "}
                        (skills, education, remote settings) or run a new scan
                        with different job titles.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold mb-2">
                        Jobs scanned, waiting for AI filter
                      </h3>
                      <p className="text-muted-foreground">
                        {pendingJobs.length} job{pendingJobs.length === 1 ? "" : "s"} scanned
                        but not yet evaluated. Click{" "}
                        <span className="text-foreground font-medium">
                          Run AI Filtering
                        </span>{" "}
                        above to score each one against your profile.
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <>
              {/* Eligible Jobs Section */}
              <div className="space-y-4 mb-12">
                {sortedEligibleJobs.map(job => {
                  const aiData = job.aiAnalysis as any;
                  const fitScore = getJobFitScore(job);
                  const isExpanded = expandedJobId === job.id;
                  const isSelected = selectedJobs.has(job.id);

                  return (
                    <Card
                      key={job.id}
                      className={`hover-lift glass-card transition-all duration-300 neon-glow-green ${isSelected ? "ring-2 ring-primary" : ""}`}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                          {/* Bulk selection checkbox */}
                          {showBulkActions && (
                            <button
                              onClick={() => toggleJobSelection(job.id)}
                              className="mt-1 flex-shrink-0"
                            >
                              {isSelected ? (
                                <CheckSquare className="h-5 w-5 text-primary" />
                              ) : (
                                <Square className="h-5 w-5 text-muted-foreground hover:text-foreground" />
                              )}
                            </button>
                          )}
                          <div className="flex-1">
                            {/* Title and Company */}
                            <div className="mb-2">
                              <div className="flex items-start gap-2">
                                <h3 className="text-xl font-bold mb-1 flex-1 text-foreground">
                                  {job.title}
                                </h3>
                                {(() => {
                                  const dateStr =
                                    job.datePosted || new Date().toISOString();
                                  const diffDays =
                                    (Date.now() - new Date(dateStr).getTime()) /
                                    86_400_000;
                                  const showsRelative = diffDays < 7;
                                  const display = formatRelativeTime(dateStr);
                                  const badge = (
                                    <Badge
                                      className={`bg-blue-500/80 text-white flex-shrink-0 ${showsRelative ? "cursor-help" : ""}`}
                                    >
                                      {display}
                                    </Badge>
                                  );
                                  if (!showsRelative) return badge;
                                  return (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          {badge}
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>
                                            📅{" "}
                                            {new Date(
                                              dateStr
                                            ).toLocaleDateString("en-US", {
                                              month: "short",
                                              day: "numeric",
                                              year: "numeric",
                                            })}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  );
                                })()}
                                {/* Platform identity now lives on the platform-coloured Apply button below. */}
                                {/* AI Match Score Badge */}
                                {fitScore !== null && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge
                                          className={`text-[10px] flex-shrink-0 font-bold ${
                                            fitScore >= 80
                                              ? "bg-green-500/20 text-green-300 border-green-500/40"
                                              : fitScore >= 60
                                                ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40"
                                                : fitScore >= 40
                                                  ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                                                  : "bg-red-500/20 text-red-300 border-red-500/40"
                                          }`}
                                        >
                                          <Target className="h-3 w-3 mr-1" />
                                          {fitScore}% fit
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs">
                                        <div className="space-y-1 text-xs">
                                          <p className="font-semibold">
                                            Profile Match Breakdown:
                                          </p>
                                          {aiData.fitDetails?.skillsMatch && (
                                            <p>
                                              Skills:{" "}
                                              {aiData.fitDetails.skillsMatch}
                                            </p>
                                          )}
                                          {aiData.fitDetails
                                            ?.educationMatch && (
                                            <p>
                                              Education:{" "}
                                              {aiData.fitDetails.educationMatch}
                                            </p>
                                          )}
                                          {aiData.fitDetails
                                            ?.experienceMatch && (
                                            <p>
                                              Experience:{" "}
                                              {
                                                aiData.fitDetails
                                                  .experienceMatch
                                              }
                                            </p>
                                          )}
                                          {aiData.fitDetails?.locationMatch && (
                                            <p>
                                              Location:{" "}
                                              {aiData.fitDetails.locationMatch}
                                            </p>
                                          )}
                                          {aiData.fitDetails?.notes && (
                                            <p className="text-muted-foreground mt-1">
                                              {aiData.fitDetails.notes}
                                            </p>
                                          )}
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                {job.status === "interested" && (
                                  <Badge
                                    variant="outline"
                                    className="border-purple-500/40 bg-purple-500/10 text-purple-300"
                                  >
                                    In application queue
                                  </Badge>
                                )}
                                {/* Duplicate Badge */}
                                {duplicateData?.lookup &&
                                  duplicateData.lookup[job.id] &&
                                  duplicateData.lookup[job.id] !== job.id && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] flex-shrink-0 border-amber-500/40 text-amber-400"
                                          >
                                            <Copy className="h-3 w-3 mr-1" />
                                            Duplicate
                                          </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">
                                            This job appears on multiple
                                            platforms. The primary listing is
                                            shown elsewhere.
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                {/* The "N platforms" badge was here — replaced by the MultiPlatformApply dropdown on the action row. */}
                              </div>
                              <p className="text-muted-foreground">
                                {job.company}
                              </p>
                            </div>

                            {/* AI Job Filtering Badge */}
                            {aiData && (
                              <div className="mb-3">
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                  <span className="text-sm font-semibold text-green-400">
                                    Passed all filters
                                  </span>
                                  {aiData.confidence && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs bg-blue-500/20 text-blue-300 border-blue-500/40"
                                    >
                                      {aiData.confidence}% confidence
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Job Details — emoji icons; the date lives in the
                          top-right badge (with hover tooltip when relative). */}
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-3">
                              {job.location && (
                                <div className="flex items-center gap-1.5">
                                  <span aria-hidden>📍</span>
                                  <span>{job.location}</span>
                                </div>
                              )}
                              {formatSalary(
                                job.salaryMin,
                                job.salaryMax,
                                job.salaryInterval
                              ) && (
                                <div className="flex items-center gap-1.5">
                                  <span aria-hidden>💵</span>
                                  <span>
                                    {formatSalary(
                                      job.salaryMin,
                                      job.salaryMax,
                                      job.salaryInterval
                                    )}
                                  </span>
                                </div>
                              )}
                              {job.jobType && (
                                <div className="flex items-center gap-1.5">
                                  <span aria-hidden>💼</span>
                                  <span className="capitalize">
                                    {job.jobType}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Description Preview / Expanded */}
                            {job.description && (
                              <div className="mb-3">
                                {isExpanded ? (
                                  <div
                                    className="text-sm text-muted-foreground whitespace-pre-wrap bg-background/30 rounded-lg p-4 border border-border/30 max-h-96 overflow-y-auto max-w-none"
                                    dangerouslySetInnerHTML={{
                                      __html: sanitizeJobDescription(
                                        job.description
                                      ),
                                    }}
                                  />
                                ) : (
                                  <p className="text-sm text-muted-foreground line-clamp-2">
                                    {rolePreview(job.description)}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex flex-wrap gap-2 items-center">
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (job.status !== "interested")
                                    setQueued.mutate({
                                      jobId: job.id,
                                      queued: true,
                                    });
                                  setAssistantJobId(job.id);
                                }}
                                disabled={setQueued.isPending}
                                className="gap-2 bg-purple-600 hover:bg-purple-700"
                                data-agent-action={`start-guided-application-${job.id}`}
                              >
                                <Bot className="h-3 w-3" />
                                Apply with AI
                              </Button>
                              <ApplyAction
                                primary={{
                                  platform: job.platform,
                                  url: job.jobUrl,
                                }}
                                duplicates={(
                                  duplicateMap.get(job.id) ?? []
                                ).map(d => ({
                                  platform: d.platform,
                                  url: d.jobUrl,
                                }))}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setQueued.mutate({
                                    jobId: job.id,
                                    queued: job.status !== "interested",
                                  })
                                }
                                disabled={setQueued.isPending}
                                data-agent-action={`${job.status === "interested" ? "remove-from" : "add-to"}-application-queue-${job.id}`}
                              >
                                <ListPlus className="mr-1 h-3 w-3" />
                                {job.status === "interested"
                                  ? "Remove from queue"
                                  : "Queue"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  markAsApplied.mutate({ jobId: job.id })
                                }
                                disabled={markAsApplied.isPending}
                                className="gap-2"
                                data-agent-action={`mark-applied-${job.id}`}
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                {markAsApplied.isPending
                                  ? "Marking..."
                                  : "Mark Applied"}
                              </Button>
                              {job.description && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setExpandedJobId(isExpanded ? null : job.id)
                                  }
                                  className="gap-2 text-muted-foreground"
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronUp className="h-3 w-3" /> Less
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="h-3 w-3" />{" "}
                                      Details
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

            </>
          )}

              {/* Section 2: filtered-job review. Collapsed by default —
              filtered-out jobs are a distinct concern from the eligible list
              and don't need to push it below the fold on every page load.
              The toggle persists nothing; reopens to collapsed on refresh. */}
              {!jobsLoading && rejectedJobs.length > 0 && (
                <div className="mt-12">
                  <button
                    type="button"
                    onClick={() => setShowFilteredJobs(shown => !shown)}
                    data-agent-action="toggle-filtered-jobs"
                    aria-expanded={showFilteredJobs}
                    className="w-full flex items-center gap-3 mb-4 text-left hover:bg-muted/20 rounded-lg p-2 -m-2 transition-colors"
                  >
                    {showFilteredJobs ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                    <AlertCircle className="h-6 w-6 text-yellow-400" />
                    <h2 className="text-2xl font-bold text-foreground">
                      Jobs Filtered by AI
                    </h2>
                    <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/40">
                      {rejectedJobs.length}{" "}
                      filtered out
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {showFilteredJobs ? "Hide" : "Show"}
                    </span>
                  </button>
                  {!showFilteredJobs && (
                    <p
                      className="text-xs text-muted-foreground italic px-2"
                      data-agent-status="filtered-jobs-collapsed"
                    >
                      Click above to inspect why each job was filtered out —
                      useful for checking the AI's accuracy or adjusting your
                      profile and filter rules.
                    </p>
                  )}
                  {showFilteredJobs && (
                    <div data-agent-status="filtered-jobs">
                      <p className="text-sm text-muted-foreground mb-6">
                        Jobs that were filtered out by AI - review to verify
                        accuracy
                      </p>

                      <div className="space-y-4">
                        {rejectedJobs.map(job => {
                            const aiAnalysis = job.aiAnalysis as any;

                            return (
                              <Card
                                key={job.id}
                                className="glass-card border-yellow-500/30"
                              >
                                <CardContent className="pt-6">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                      {/* Title and Company */}
                                      <div className="mb-2">
                                        <div className="flex items-start gap-2">
                                          <h3 className="text-xl font-bold mb-1 flex-1 text-foreground/70">
                                            {job.title}
                                          </h3>
                                          <Badge className="bg-red-500/20 text-red-300 border-red-500/40">
                                            Filtered Out
                                          </Badge>
                                          <Badge
                                            variant="outline"
                                            className={`text-[10px] flex-shrink-0 ${
                                              job.platform === "indeed"
                                                ? "border-blue-500/40 text-blue-400"
                                                : job.platform === "glassdoor"
                                                  ? "border-green-500/40 text-green-400"
                                                  : job.platform === "linkedin"
                                                    ? "border-blue-600/40 text-blue-300"
                                                    : job.platform ===
                                                        "ziprecruiter"
                                                      ? "border-orange-500/40 text-orange-400"
                                                      : "border-muted-foreground/40 text-muted-foreground"
                                            }`}
                                          >
                                            {job.platform === "ziprecruiter"
                                              ? "ZipRecruiter"
                                              : job.platform === "linkedin"
                                                ? "LinkedIn"
                                                : job.platform
                                                  ? job.platform
                                                      .charAt(0)
                                                      .toUpperCase() +
                                                    job.platform.slice(1)
                                                  : "Indeed"}
                                          </Badge>
                                        </div>
                                        <p className="text-foreground/60 font-medium">
                                          {job.company}
                                        </p>
                                      </div>

                                      {/* AI Job Filtering */}
                                      {aiAnalysis && (
                                        <div className="mt-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                                          <div className="flex items-start gap-2 mb-2">
                                            <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5" />
                                            <div className="flex-1">
                                              <p className="font-semibold text-yellow-300 mb-1">
                                                Why Filtered Out:
                                              </p>
                                              <p className="text-sm text-foreground/80">
                                                {aiAnalysis.reason ||
                                                  "No reason provided"}
                                              </p>
                                              {aiAnalysis.confidence && (
                                                <p className="text-xs text-muted-foreground mt-2">
                                                  Confidence:{" "}
                                                  {Math.round(
                                                    aiAnalysis.confidence * 100
                                                  )}
                                                  %
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {/* Job Details */}
                                      <div className="flex flex-wrap gap-4 mt-4 text-sm text-foreground/60">
                                        {job.jobType && (
                                          <span className="flex items-center gap-1">
                                            <Briefcase className="h-4 w-4" />
                                            {job.jobType}
                                          </span>
                                        )}
                                        {job.location && (
                                          <span className="flex items-center gap-1">
                                            <MapPin className="h-4 w-4" />
                                            {job.location}
                                          </span>
                                        )}
                                        {job.datePosted && (
                                          <span className="flex items-center gap-1">
                                            <Calendar className="h-4 w-4" />
                                            {new Date(
                                              job.datePosted
                                            ).toLocaleDateString()}
                                          </span>
                                        )}
                                      </div>

                                      {/* View Link */}
                                      <div className="mt-4">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          asChild
                                        >
                                          <a
                                            href={job.jobUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            <ExternalLink className="mr-2 h-3 w-3" />
                                            View on{" "}
                                            {job.platform === "ziprecruiter"
                                              ? "ZipRecruiter"
                                              : job.platform === "linkedin"
                                                ? "LinkedIn"
                                                : job.platform
                                                  ? job.platform
                                                      .charAt(0)
                                                      .toUpperCase() +
                                                    job.platform.slice(1)
                                                  : "Indeed"}
                                          </a>
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}
        </main>
      </div>

      {/* Database Nuke Confirmation Dialog */}
      <Dialog open={isNukeDialogOpen} onOpenChange={setIsNukeDialogOpen}>
        <DialogContent className="max-w-md border-red-500/50 bg-background/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-red-500 flex items-center gap-2">
              <AlertTriangle className="h-6 w-6" />
              DANGER: Full Database Wipe
            </DialogTitle>
            <DialogDescription className="text-foreground pt-2">
              You are about to delete **ALL** {totalJobCount.toLocaleString()}{" "}
              job listings, all scan history, and all AI Job Filtering from this
              machine.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 my-2">
            <p className="text-sm font-semibold text-red-400 mb-1">
              IMPLICATIONS:
            </p>
            <ul className="text-xs text-red-300/80 space-y-1 list-disc list-inside">
              <li>All tracked jobs will be permanently erased.</li>
              <li>Your AI Match Scores will be lost.</li>
              <li>This action cannot be undone.</li>
            </ul>
          </div>

          <div className="flex flex-col gap-3 mt-4">
            <Button
              variant="destructive"
              size="lg"
              className="w-full font-bold shadow-lg shadow-red-500/20"
              onClick={() => {
                setIsNukeDialogOpen(false);
                cleanDatabase.mutate();
              }}
              data-agent-action="nuke-database"
            >
              Nuke Database
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full border-border/50"
              onClick={() => setIsNukeDialogOpen(false)}
              data-agent-action="keep-data"
            >
              Keep Data
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
