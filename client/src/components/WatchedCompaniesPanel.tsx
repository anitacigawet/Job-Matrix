/**
 * Preferences → Companies sub-tab (Phase 14, D-020).
 *
 * Searchable / tag-filterable view of the maintainer-curated companies catalog
 * (`companies-catalog.yaml`) with a checkbox per entry. Selections persist
 * as the user's `watched_companies` table. Scan path fans out one ATS
 * request per checked company per scan.
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Building2, ExternalLink, Search, X } from "lucide-react";
import { toast } from "sonner";
import { getFriendlyApiErrorMessage } from "@/lib/api-errors";

const ATS_LABELS: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workday: "Workday",
};

const ATS_BADGE_COLORS: Record<string, string> = {
  greenhouse: "bg-green-500/10 text-green-300 border-green-500/40",
  lever: "bg-violet-500/10 text-violet-300 border-violet-500/40",
  ashby: "bg-rose-500/10 text-rose-300 border-rose-500/40",
  workday: "bg-amber-500/10 text-amber-300 border-amber-500/40",
};

export function WatchedCompaniesPanel() {
  const utils = trpc.useUtils();
  const catalogQuery = trpc.companies.catalog.useQuery();
  const watchedQuery = trpc.companies.watched.useQuery();

  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const watchedSlugs = useMemo(() => {
    return new Set(watchedQuery.data?.map((w) => w.companySlug) ?? []);
  }, [watchedQuery.data]);

  const tags = useMemo(() => {
    const all = new Set<string>();
    for (const c of catalogQuery.data?.companies ?? []) {
      for (const t of c.tags ?? []) all.add(t);
    }
    return Array.from(all).sort();
  }, [catalogQuery.data]);

  const filtered = useMemo(() => {
    const list = catalogQuery.data?.companies ?? [];
    const needle = search.trim().toLowerCase();
    return list.filter((c) => {
      if (activeTag && !(c.tags ?? []).includes(activeTag)) return false;
      if (needle) {
        const hay = `${c.name} ${c.slug} ${c.ats} ${(c.tags ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [catalogQuery.data, search, activeTag]);

  const addMutation = trpc.companies.add.useMutation({
    onSuccess: () => {
      utils.companies.watched.invalidate();
    },
    onError: (e) => toast.error(`Add failed: ${getFriendlyApiErrorMessage(e)}`),
  });

  const removeMutation = trpc.companies.remove.useMutation({
    onSuccess: () => {
      utils.companies.watched.invalidate();
    },
    onError: (e) => toast.error(`Remove failed: ${getFriendlyApiErrorMessage(e)}`),
  });

  const clearMutation = trpc.companies.clear.useMutation({
    onSuccess: (r) => {
      toast.success(`Cleared ${r.removed} watched companies`);
      utils.companies.watched.invalidate();
    },
    onError: (e) => toast.error(`Clear failed: ${getFriendlyApiErrorMessage(e)}`),
  });

  const toggle = (slug: string) => {
    if (watchedSlugs.has(slug)) {
      removeMutation.mutate({ companySlug: slug });
    } else {
      addMutation.mutate({ companySlug: slug });
    }
  };

  if (catalogQuery.isLoading) {
    return (
      <Card className="glass-card">
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const totalCatalog = catalogQuery.data?.companies.length ?? 0;
  const totalWatched = watchedSlugs.size;
  const isPending = addMutation.isPending || removeMutation.isPending;

  return (
    <Card className="glass-card" data-agent-status="watched-companies-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 flex-wrap">
          <Building2 className="h-5 w-5 text-blue-400" />
          Watched companies
          <Badge variant="outline" className="bg-blue-500/10 text-blue-300 border-blue-500/40" aria-live="polite" data-agent-status="watched-companies-count">
            {totalWatched} watched / {totalCatalog} in catalog
          </Badge>
        </CardTitle>
        <CardDescription>
          Pick companies you want to follow. Every scan will fetch their open jobs
          directly from their ATS (Greenhouse, Lever, Ashby, Workday) alongside the broad
          aggregator search. The catalog is maintainer-curated — to suggest a company,
          open an issue on GitHub.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Search + tag filter row */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, tag, or ATS…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-agent-input="company-search"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
                data-agent-action="clear-company-search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {totalWatched > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
              data-agent-action="clear-watched-companies"
            >
              {clearMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Clear all
            </Button>
          )}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-agent-status="company-tag-filter">
            <button
              type="button"
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                activeTag === null
                  ? "bg-blue-500/20 text-blue-200 border-blue-500/50"
                  : "bg-muted/20 text-muted-foreground border-muted/40 hover:bg-muted/30"
              }`}
              onClick={() => setActiveTag(null)}
              data-agent-action="filter-tag-all"
            >
              All
            </button>
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  activeTag === t
                    ? "bg-blue-500/20 text-blue-200 border-blue-500/50"
                    : "bg-muted/20 text-muted-foreground border-muted/40 hover:bg-muted/30"
                }`}
                onClick={() => setActiveTag(t)}
                data-agent-action={`filter-tag-${t}`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="empty py-8" data-agent-status="no-matching-companies">
            <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">
              {search || activeTag
                ? "No companies match this filter. Clear it to see the full catalog."
                : "The catalog isn't loading any companies right now. Check back after updating."}
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5" data-agent-status="company-catalog-list">
            {filtered.map((c) => {
              const checked = watchedSlugs.has(c.slug);
              return (
                <li
                  key={c.slug}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md border transition-colors ${
                    checked
                      ? "border-blue-500/40 bg-blue-500/5"
                      : "border-border/40 hover:bg-muted/20"
                  }`}
                  data-agent-status={`company-${c.slug}`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(c.slug)}
                    disabled={isPending}
                    aria-label={`Watch ${c.name}`}
                    data-agent-input={`watch-company-${c.slug}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{c.name}</span>
                      <Badge variant="outline" className={`text-[10px] ${ATS_BADGE_COLORS[c.ats] ?? ""}`}>
                        {ATS_LABELS[c.ats] ?? c.ats}
                      </Badge>
                      {(c.tags ?? []).map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
                          {t}
                        </span>
                      ))}
                    </div>
                    {c.website && (
                      <a
                        href={c.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-0.5"
                      >
                        {new URL(c.website).host}<ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
