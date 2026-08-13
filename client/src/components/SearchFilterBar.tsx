import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Download, CheckSquare, X, Briefcase, Loader2, XCircle, CheckCircle2 } from "lucide-react";

interface SearchFilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  jobTypeFilter: string;
  onJobTypeChange: (value: string) => void;
  platformFilter: string;
  onPlatformChange: (value: string) => void;
  uniqueJobTypes: string[];
  onExportCSV: () => void;
  showBulkActions: boolean;
  onToggleBulkActions: () => void;
  selectedCount: number;
  totalCount: number;
  filteredCount: number;
  onSelectAll: () => void;
  onBulkApply: () => void;
  onBulkReject: () => void;
  isBulkApplyPending: boolean;
  isBulkRejectPending: boolean;
}

export function SearchFilterBar({
  searchQuery,
  onSearchChange,
  jobTypeFilter,
  onJobTypeChange,
  platformFilter,
  onPlatformChange,
  uniqueJobTypes,
  onExportCSV,
  showBulkActions,
  onToggleBulkActions,
  selectedCount,
  totalCount,
  filteredCount,
  onSelectAll,
  onBulkApply,
  onBulkReject,
  isBulkApplyPending,
  isBulkRejectPending,
}: SearchFilterBarProps) {
  const hasActiveFilters = searchQuery || jobTypeFilter !== "all" || platformFilter !== "all";

  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, company, or location..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 bg-background/50 border-border/50"
          />
          {searchQuery && (
            <button 
              onClick={() => onSearchChange("")} 
              className="absolute right-3 top-1/2 -translate-y-1/2"
              aria-label="Clear search"
              data-agent-action="clear-search"
            >
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
        {/* Job Type Filter */}
        <Select value={jobTypeFilter} onValueChange={onJobTypeChange}>
          <SelectTrigger className="w-[180px] bg-background/50" data-agent-action="filter-job-type">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Job Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {uniqueJobTypes.map(type => (
              <SelectItem key={type} value={type.toLowerCase()}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Platform Filter */}
        <Select value={platformFilter} onValueChange={onPlatformChange}>
          <SelectTrigger className="w-[180px] bg-background/50" data-agent-action="filter-platform">
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
        {/* CSV Export */}
        <Button variant="outline" size="sm" onClick={onExportCSV} className="gap-2" data-agent-action="export-csv">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
        {/* Bulk Select Toggle */}
        <Button
          variant={showBulkActions ? "default" : "outline"}
          size="sm"
          onClick={onToggleBulkActions}
          className="gap-2"
          data-agent-action="toggle-bulk-actions"
        >
          <CheckSquare className="h-4 w-4" />
          {showBulkActions ? "Cancel Selection" : "Bulk Actions"}
        </Button>
      </div>
      {/* Bulk Action Bar */}
      {showBulkActions && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30" aria-live="polite">
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectAll}
            data-agent-action="bulk-select-all"
          >
            Select All ({filteredCount})
          </Button>
          <span className="text-sm text-muted-foreground" data-agent-status="bulk-selection-count">
            {selectedCount} selected
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkApply}
            disabled={selectedCount === 0 || isBulkApplyPending}
            className="gap-2 border-green-500/50 text-green-400 hover:bg-green-500/10"
            data-agent-action="bulk-mark-applied"
          >
            {isBulkApplyPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Mark Applied
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkReject}
            disabled={selectedCount === 0 || isBulkRejectPending}
            className="gap-2 border-red-500/50 text-red-400 hover:bg-red-500/10"
            data-agent-action="bulk-reject"
          >
            {isBulkRejectPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
            Reject
          </Button>
        </div>
      )}
      {/* Results count */}
      {hasActiveFilters ? (
        <p className="text-sm text-muted-foreground">
          Showing {filteredCount} of {totalCount} eligible jobs
          {platformFilter !== "all" && ` (${platformFilter === 'ziprecruiter' ? 'ZipRecruiter' : platformFilter === 'linkedin' ? 'LinkedIn' : platformFilter.charAt(0).toUpperCase() + platformFilter.slice(1)})`}
        </p>
      ) : null}
    </div>
  );
}
