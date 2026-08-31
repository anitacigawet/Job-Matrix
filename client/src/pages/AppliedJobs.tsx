import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ExternalLink,
  MapPin,
  DollarSign,
  Briefcase,
  Clock,
  Download,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  StickyNote,
  CheckCircle2,
  Phone,
  Gift,
  ThumbsUp,
  ThumbsDown,
  Ghost,
  Filter,
  Search,
  X,
  MessageSquare,
  Plus,
  Calendar,
  FileText,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { useSubNav } from "@/components/SubNav";
import { ResponseInbox } from "@/components/ResponseInbox";

// Status pipeline configuration
const STATUS_CONFIG = {
  applied: {
    label: "Applied",
    color: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    icon: CheckCircle2,
    order: 0,
  },
  interview: {
    label: "Interview",
    color: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    icon: Phone,
    order: 1,
  },
  offer: {
    label: "Offer",
    color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
    icon: Gift,
    order: 2,
  },
  accepted: {
    label: "Accepted",
    color: "bg-green-500/20 text-green-300 border-green-500/40",
    icon: ThumbsUp,
    order: 3,
  },
  rejected: {
    label: "Rejected",
    color: "bg-red-500/20 text-red-300 border-red-500/40",
    icon: ThumbsDown,
    order: 4,
  },
  ghosted: {
    label: "Ghosted",
    color: "bg-gray-500/20 text-gray-300 border-gray-500/40",
    icon: Ghost,
    order: 5,
  },
} as const;

type ApplicationStatus = keyof typeof STATUS_CONFIG;

const NOTE_TYPE_CONFIG = {
  note: { label: "Note", icon: FileText, color: "text-blue-400" },
  status_change: {
    label: "Status Change",
    icon: AlertCircle,
    color: "text-purple-400",
  },
  interview: { label: "Interview", icon: Phone, color: "text-purple-400" },
  follow_up: { label: "Follow Up", icon: Calendar, color: "text-yellow-400" },
  offer: { label: "Offer", icon: Gift, color: "text-green-400" },
  rejection: { label: "Rejection", icon: ThumbsDown, color: "text-red-400" },
} as const;

type NoteType = keyof typeof NOTE_TYPE_CONFIG;

function formatSalary(
  min: number | null,
  max: number | null,
  interval: string | null
): string {
  if (!min && !max) return "";
  const formatNum = (n: number) => n.toLocaleString();
  if (min && max)
    return `$${formatNum(min)} - $${formatNum(max)}${interval ? `/${interval}` : ""}`;
  if (min) return `$${formatNum(min)}+${interval ? `/${interval}` : ""}`;
  if (max) return `Up to $${formatNum(max)}${interval ? `/${interval}` : ""}`;
  return "";
}

function formatDate(dateString: string | Date | null): string {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

function formatTimestamp(dateString: string | Date): string {
  const date = new Date(dateString);
  return (
    date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) +
    " at " +
    date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

function getJobAgeInfo(firstTrackedAt: string | Date) {
  const trackedDate = new Date(firstTrackedAt);
  const now = new Date();
  const daysOld = Math.floor(
    (now.getTime() - trackedDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysOld >= 30) return { color: "text-red-400", isExpired: true, daysOld };
  if (daysOld >= 20)
    return { color: "text-orange-400", isExpired: false, daysOld };
  if (daysOld >= 10)
    return { color: "text-yellow-400", isExpired: false, daysOld };
  return { color: "text-green-400", isExpired: false, daysOld };
}

function exportToCSV(jobs: any[]) {
  const headers = [
    "Title",
    "Company",
    "Location",
    "Salary",
    "Job Type",
    "Status",
    "Applied Date",
    "Notes",
    "Job URL",
  ];
  const rows = jobs.map(job => [
    job.title,
    job.company,
    job.location || "N/A",
    formatSalary(job.salaryMin, job.salaryMax, job.salaryInterval) || "N/A",
    job.jobType || "N/A",
    job.applicationStatus || "applied",
    new Date(job.appliedAt).toLocaleDateString(),
    (job.notes || "").replace(/"/g, '""'),
    job.jobUrl,
  ]);
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `applied-jobs-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Timeline component for a single job
function JobTimeline({ jobId, jobTitle }: { jobId: number; jobTitle: string }) {
  const utils = trpc.useUtils();
  const { data: notes = [], isLoading } = trpc.notes.getJobNotes.useQuery({
    jobId,
  });
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteType, setNewNoteType] = useState<NoteType>("note");
  const [showAddNote, setShowAddNote] = useState(false);

  const addNote = trpc.notes.addNote.useMutation({
    onSuccess: () => {
      toast.success("Note added");
      setNewNoteContent("");
      setShowAddNote(false);
      utils.notes.getJobNotes.invalidate({ jobId });
      utils.notes.getNoteCounts.invalidate();
    },
    onError: error =>
      toast.error("Failed to add note", { description: error.message }),
  });

  const deleteNote = trpc.notes.deleteNote.useMutation({
    onSuccess: () => {
      toast.success("Note deleted");
      utils.notes.getJobNotes.invalidate({ jobId });
      utils.notes.getNoteCounts.invalidate();
    },
    onError: error =>
      toast.error("Failed to delete note", { description: error.message }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-border/30 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          Activity Timeline ({notes.length})
        </h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAddNote(!showAddNote)}
          data-agent-action={`toggle-add-note-${jobId}`}
          className="gap-1 text-xs"
        >
          <Plus className="h-3 w-3" />
          Add Note
        </Button>
      </div>

      {/* Add note form */}
      {showAddNote && (
        <div className="mb-4 p-3 rounded-lg bg-background/50 border border-border/30 space-y-3">
          <div className="flex items-center gap-2">
            <Select
              value={newNoteType}
              onValueChange={v => setNewNoteType(v as NoteType)}
            >
              <SelectTrigger
                className="w-40 h-8 text-xs"
                data-agent-action={`select-note-type-${jobId}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.entries(NOTE_TYPE_CONFIG) as [
                    NoteType,
                    (typeof NOTE_TYPE_CONFIG)[NoteType],
                  ][]
                )
                  .filter(([key]) => key !== "status_change")
                  .map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <Icon className={`h-3 w-3 ${config.color}`} />
                          {config.label}
                        </span>
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={newNoteContent}
            onChange={e => setNewNoteContent(e.target.value)}
            placeholder="Phone screen scheduled for Monday 2pm... Recruiter: Jane Smith (jane@company.com)..."
            rows={3}
            className="text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAddNote(false);
                setNewNoteContent("");
              }}
              data-agent-action={`cancel-add-note-${jobId}`}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() =>
                addNote.mutate({
                  jobId,
                  noteType: newNoteType,
                  content: newNoteContent,
                })
              }
              disabled={!newNoteContent.trim() || addNote.isPending}
              data-agent-action={`save-note-${jobId}`}
              className="gap-1"
            >
              {addNote.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              Save Note
            </Button>
          </div>
        </div>
      )}

      {/* Timeline entries */}
      {notes.length === 0 ? (
        <p
          className="text-xs text-muted-foreground py-2"
          data-agent-status={`empty-timeline-${jobId}`}
        >
          No notes yet. Add your first note to start tracking this application.
        </p>
      ) : (
        <div
          className="relative pl-6 space-y-3"
          data-agent-status={`timeline-list-${jobId}`}
        >
          {/* Timeline line */}
          <div className="absolute left-2 top-2 bottom-2 w-px bg-border/50" />

          {notes.map(note => {
            const typeConfig =
              NOTE_TYPE_CONFIG[note.noteType as NoteType] ||
              NOTE_TYPE_CONFIG.note;
            const Icon = typeConfig.icon;
            return (
              <div key={note.id} className="relative group">
                {/* Timeline dot */}
                <div
                  className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-background flex items-center justify-center ${
                    note.noteType === "status_change"
                      ? "bg-purple-500"
                      : note.noteType === "interview"
                        ? "bg-purple-500"
                        : note.noteType === "follow_up"
                          ? "bg-yellow-500"
                          : note.noteType === "offer"
                            ? "bg-green-500"
                            : note.noteType === "rejection"
                              ? "bg-red-500"
                              : "bg-blue-500"
                  }`}
                >
                  <Icon className="h-2 w-2 text-white" />
                </div>

                <div className="p-2 rounded-lg bg-background/30 border border-border/20 hover:border-border/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${typeConfig.color}`}
                        >
                          {typeConfig.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {formatTimestamp(note.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                        {note.content}
                      </p>
                      {note.noteType === "status_change" &&
                        note.oldStatus &&
                        note.newStatus && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {note.oldStatus} → {note.newStatus}
                          </p>
                        )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm("Delete this note?")) {
                          deleteNote.mutate({ noteId: note.id });
                        }
                      }}
                      aria-label={`Delete note from ${formatTimestamp(note.createdAt)}`}
                      data-agent-action={`delete-note-${note.id}`}
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AppliedJobs() {
  const utils = trpc.useUtils();
  const { data: appliedJobs = [], isLoading } =
    trpc.personalized.getAppliedJobs.useQuery();
  const { data: noteCounts = {} } = trpc.notes.getNoteCounts.useQuery();
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [timelineJobId, setTimelineJobId] = useState<number | null>(null);
  const { current: subNavTab, setCurrent: setSubNavTab } = useSubNav();
  const activeTab = subNavTab ?? "all";
  const autoOpenTimelines = activeTab === "timeline";
  const showList = activeTab !== "pipeline" && activeTab !== "responses";
  const showSearch = activeTab !== "pipeline" && activeTab !== "responses";
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const removeJob = trpc.personalized.removeAppliedJob.useMutation({
    onSuccess: () => {
      toast.success("Job Removed");
      utils.personalized.getAppliedJobs.invalidate();
    },
    onError: error =>
      toast.error("Failed to Remove", { description: error.message }),
  });

  const updateStatus = trpc.personalized.updateApplicationStatus.useMutation({
    onSuccess: () => {
      toast.success("Status Updated");
      utils.personalized.getAppliedJobs.invalidate();
    },
    onError: error =>
      toast.error("Failed to Update Status", { description: error.message }),
  });

  // Filter jobs
  const filteredJobs = appliedJobs.filter(job => {
    const matchesStatus =
      statusFilter === "all" || (job as any).applicationStatus === statusFilter;
    const matchesSearch =
      !searchQuery ||
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (job.location || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Count by status
  const statusCounts = appliedJobs.reduce(
    (acc, job) => {
      const status = (job as any).applicationStatus || "applied";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Get next valid statuses for a given status
  const getNextStatuses = (current: ApplicationStatus): ApplicationStatus[] => {
    switch (current) {
      case "applied":
        return ["interview", "rejected", "ghosted"];
      case "interview":
        return ["offer", "rejected", "ghosted"];
      case "offer":
        return ["accepted", "rejected"];
      case "accepted":
        return [];
      case "rejected":
        return ["applied"];
      case "ghosted":
        return ["applied"];
      default:
        return [];
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-6xl mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto py-8 relative">
      {/* Background effects */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -z-10" />

      <PageHeader
        title="Applied Jobs"
        subtitle={
          <span
            aria-live="polite"
            aria-atomic="true"
            data-agent-status="applied-jobs-count"
          >
            Track your application pipeline ({appliedJobs.length} total)
          </span>
        }
        rightAction={
          appliedJobs.length > 0 ? (
            <Button
              onClick={() => exportToCSV(appliedJobs)}
              variant="outline"
              className="gap-2"
              data-agent-action="export-applied-csv"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          ) : undefined
        }
      />

      {activeTab === "responses" && <ResponseInbox />}

      {/* Status Pipeline Summary — clicking a cell on the Pipeline tab
          auto-switches you to the All tab with that status pre-filtered. */}
      {appliedJobs.length > 0 &&
        activeTab !== "timeline" &&
        activeTab !== "responses" && (
          <div
            className={
              activeTab === "pipeline"
                ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8"
                : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6"
            }
          >
            {(
              Object.entries(STATUS_CONFIG) as [
                ApplicationStatus,
                (typeof STATUS_CONFIG)[ApplicationStatus],
              ][]
            ).map(([key, config]) => {
              const count = statusCounts[key] || 0;
              const Icon = config.icon;
              const isActive = statusFilter === key;
              const onCellClick = () => {
                setStatusFilter(isActive ? "all" : key);
                if (activeTab === "pipeline") {
                  setSubNavTab("all");
                }
              };
              return (
                <button
                  key={key}
                  onClick={onCellClick}
                  data-agent-action={`filter-status-${key}`}
                  className={`${activeTab === "pipeline" ? "p-5" : "p-3"} rounded-lg border transition-all text-left ${
                    isActive
                      ? `${config.color} ring-2 ring-offset-2 ring-offset-background`
                      : "bg-background/50 border-border/50 hover:border-border"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon
                      className={
                        activeTab === "pipeline" ? "h-5 w-5" : "h-4 w-4"
                      }
                    />
                    <span
                      className={
                        activeTab === "pipeline"
                          ? "text-base font-semibold"
                          : "text-sm font-medium"
                      }
                    >
                      {config.label}
                    </span>
                  </div>
                  <p
                    className={
                      activeTab === "pipeline"
                        ? "text-3xl font-bold"
                        : "text-2xl font-bold"
                    }
                  >
                    {count}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      {activeTab === "pipeline" && appliedJobs.length > 0 && (
        <p className="text-xs text-muted-foreground mb-4">
          Click any status above to view those applications in the All tab.
        </p>
      )}

      {/* Search Bar */}
      {showSearch && appliedJobs.length > 0 && (
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search applied jobs..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 bg-background/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                aria-label="Clear search"
                data-agent-action="clear-applied-search"
              >
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          {statusFilter !== "all" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStatusFilter("all")}
              className="gap-2"
              data-agent-action="clear-applied-filters"
            >
              <X className="h-4 w-4" /> Clear Filter
            </Button>
          )}
        </div>
      )}

      {/* Results count */}
      {showList && (searchQuery || statusFilter !== "all") && (
        <p
          className="text-sm text-muted-foreground mb-4"
          aria-live="polite"
          data-agent-status="filtered-applied-count"
        >
          Showing {filteredJobs.length} of {appliedJobs.length} applied jobs
        </p>
      )}

      {/* Applied Jobs List */}
      {!showList ? null : appliedJobs.length === 0 ? (
        <Card className="glass-card" data-agent-status="empty-applied-jobs">
          <CardContent className="pt-6 text-center py-12">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No applied jobs yet</h3>
            <p className="text-muted-foreground mb-4">
              Mark jobs as applied from the dashboard to track them here.
            </p>
            <Button
              asChild
              variant="outline"
              data-agent-action="go-to-dashboard"
            >
              <a href="/jobs">Go to Dashboard</a>
            </Button>
          </CardContent>
        </Card>
      ) : filteredJobs.length === 0 ? (
        <Card
          className="glass-card"
          data-agent-status="no-matching-applied-jobs"
        >
          <CardContent className="pt-6 text-center py-12">
            <Filter className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No matching jobs</h3>
            <p className="text-muted-foreground mb-4">
              {appliedJobs.length} applied job
              {appliedJobs.length === 1 ? "" : "s"} in total, but none match the
              current
              {searchQuery && statusFilter !== "all"
                ? " search and filter"
                : searchQuery
                  ? " search"
                  : " filter"}
              .
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {searchQuery && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchQuery("")}
                  data-agent-action="clear-applied-search"
                >
                  <X className="h-4 w-4 mr-2" /> Clear search
                </Button>
              )}
              {statusFilter !== "all" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStatusFilter("all")}
                  data-agent-action="clear-applied-filters"
                >
                  <X className="h-4 w-4 mr-2" /> Clear status filter
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4" data-agent-status="applied-jobs-list">
          {filteredJobs.map(job => {
            const ageInfo = getJobAgeInfo(job.firstTrackedAt);
            const currentStatus = ((job as any).applicationStatus ||
              "applied") as ApplicationStatus;
            const statusConfig = STATUS_CONFIG[currentStatus];
            const StatusIcon = statusConfig.icon;
            const isExpanded = expandedJobId === job.id;
            const isTimelineOpen =
              autoOpenTimelines || timelineJobId === job.id;
            const nextStatuses = getNextStatuses(currentStatus);
            const noteCount = noteCounts[job.id] || 0;

            return (
              <Card
                key={job.id}
                className={`glass-card hover-lift transition-all duration-300 border-l-4 ${
                  currentStatus === "accepted"
                    ? "border-l-green-500"
                    : currentStatus === "offer"
                      ? "border-l-yellow-500"
                      : currentStatus === "interview"
                        ? "border-l-purple-500"
                        : currentStatus === "rejected"
                          ? "border-l-red-500"
                          : currentStatus === "ghosted"
                            ? "border-l-gray-500"
                            : "border-l-blue-500"
                }`}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {/* Title, Company, Status */}
                      <div className="mb-3">
                        <div className="flex items-start gap-2 mb-1 flex-wrap">
                          <h3 className="text-xl font-bold flex-1">
                            {job.title}
                          </h3>
                          <Badge className={statusConfig.color + " gap-1"}>
                            <StatusIcon className="h-3 w-3" />
                            {statusConfig.label}
                          </Badge>
                          {ageInfo.isExpired && (
                            <Badge variant="destructive">Expired</Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground">{job.company}</p>
                      </div>

                      {/* Job Details */}
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-3">
                        {job.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            <span>{job.location}</span>
                          </div>
                        )}
                        {formatSalary(
                          job.salaryMin,
                          job.salaryMax,
                          job.salaryInterval
                        ) && (
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-4 w-4" />
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
                          <div className="flex items-center gap-1">
                            <Briefcase className="h-4 w-4" />
                            <span className="capitalize">{job.jobType}</span>
                          </div>
                        )}
                      </div>

                      {/* Timeline dates */}
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-3">
                        <span className={ageInfo.color}>
                          Tracked: {formatDate(job.firstTrackedAt)} (
                          {ageInfo.daysOld}d)
                        </span>
                        <span>Applied: {formatDate(job.appliedAt)}</span>
                        {(job as any).interviewAt && (
                          <span className="text-purple-400">
                            Interview: {formatDate((job as any).interviewAt)}
                          </span>
                        )}
                        {(job as any).offerAt && (
                          <span className="text-yellow-400">
                            Offer: {formatDate((job as any).offerAt)}
                          </span>
                        )}
                        {(job as any).resolvedAt && (
                          <span>
                            Resolved: {formatDate((job as any).resolvedAt)}
                          </span>
                        )}
                      </div>

                      {/* Legacy Quick Notes — read-only since the editor was
                          retired. Existing data is preserved; new
                          notes go through Timeline (the MessageSquare button
                          in the action row). The `notes` column on
                          appliedJobs stays in the schema so this block can
                          keep rendering for users who used the old system. */}
                      {(job as any).notes && (
                        <div className="mb-3 p-2 rounded bg-background/30 border border-border/30">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                            <StickyNote className="h-3 w-3" />
                            Quick Notes (read-only — open Timeline to add new
                            notes)
                          </div>
                          <p className="text-sm text-foreground/80">
                            {(job as any).notes}
                          </p>
                        </div>
                      )}

                      {/* Expanded Description */}
                      {isExpanded && job.description && (
                        <div
                          className="mb-3 text-sm text-muted-foreground whitespace-pre-wrap bg-background/30 rounded-lg p-4 border border-border/30 max-h-64 overflow-y-auto"
                          data-agent-status={`job-description-${job.id}`}
                        >
                          {job.description}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 items-center">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          data-agent-action={`view-posting-${job.id}`}
                        >
                          <a
                            href={job.jobUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="mr-2 h-3 w-3" />
                            View Posting
                          </a>
                        </Button>

                        {/* Status transition buttons */}
                        {nextStatuses.map(nextStatus => {
                          const nextConfig = STATUS_CONFIG[nextStatus];
                          const NextIcon = nextConfig.icon;
                          return (
                            <Button
                              key={nextStatus}
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                updateStatus.mutate({
                                  jobId: job.id,
                                  status: nextStatus,
                                })
                              }
                              disabled={updateStatus.isPending}
                              data-agent-action={`set-status-${nextStatus}-${job.id}`}
                              className={`gap-1 ${nextConfig.color}`}
                            >
                              <NextIcon className="h-3 w-3" />
                              {nextConfig.label}
                            </Button>
                          );
                        })}

                        {/* Timeline toggle */}
                        <Button
                          variant={isTimelineOpen ? "default" : "ghost"}
                          size="sm"
                          onClick={() =>
                            setTimelineJobId(isTimelineOpen ? null : job.id)
                          }
                          data-agent-action={`toggle-timeline-${job.id}`}
                          className="gap-1 text-muted-foreground relative"
                        >
                          <MessageSquare className="h-3 w-3" />
                          Timeline
                          {noteCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] rounded-full h-4 w-4 flex items-center justify-center">
                              {noteCount}
                            </span>
                          )}
                        </Button>

                        {/* Expand/collapse */}
                        {job.description && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setExpandedJobId(isExpanded ? null : job.id)
                            }
                            data-agent-action={`toggle-details-${job.id}`}
                            className="gap-1 text-muted-foreground"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="h-3 w-3" /> Less
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3 w-3" /> Details
                              </>
                            )}
                          </Button>
                        )}

                        {/* Remove */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (
                              confirm("Remove this job from your applied list?")
                            ) {
                              removeJob.mutate({ jobId: job.id });
                            }
                          }}
                          disabled={removeJob.isPending}
                          data-agent-action={`remove-applied-job-${job.id}`}
                          className="text-red-400 hover:text-red-300 gap-1 ml-auto"
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove
                        </Button>
                      </div>

                      {/* Timeline section (expandable) */}
                      {isTimelineOpen && (
                        <JobTimeline jobId={job.id} jobTitle={job.title} />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
