/**
 * Work-style Quick Fill.
 *
 * Curated job-title starter packs driven entirely by
 * `shared/work-style-suggestions.ts` — no LLM, no API call, no DB
 * schema dependency. Same component renders as a Dialog (Preferences)
 * or inline (Onboarding step 2).
 */
import { useMemo, useState } from "react";
import {
  WORK_STYLE_CATEGORIES,
  titleToSlug,
  type WorkStyleCategory,
  type WorkStyleLevelId,
} from "../../../shared/work-style-suggestions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const LEVEL_IDS: WorkStyleLevelId[] = ["low", "medium", "high"];
const LEVEL_LABELS: Record<WorkStyleLevelId, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/**
 * Per-accent visual classes for the four categories. Kept here so the
 * data file stays UI-free.
 */
const ACCENT_CLASSES = {
  blue: {
    border: "border-blue-500/30 hover:border-blue-500/60",
    glow: "hover:shadow-blue-500/20",
    text: "text-blue-400",
    badge: "bg-blue-500/10 text-blue-300 border-blue-500/40",
  },
  amber: {
    border: "border-amber-500/30 hover:border-amber-500/60",
    glow: "hover:shadow-amber-500/20",
    text: "text-amber-400",
    badge: "bg-amber-500/10 text-amber-300 border-amber-500/40",
  },
  green: {
    border: "border-emerald-500/30 hover:border-emerald-500/60",
    glow: "hover:shadow-emerald-500/20",
    text: "text-emerald-400",
    badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  },
  slate: {
    border: "border-slate-500/30 hover:border-slate-500/60",
    glow: "hover:shadow-slate-500/20",
    text: "text-slate-300",
    badge: "bg-slate-500/15 text-slate-200 border-slate-500/40",
  },
} as const;

export interface WorkStyleQuickFillProps {
  /**
   * Called when the user clicks Apply. Receives the list of titles the
   * user wants to add. Parent is responsible for deduping against
   * existing user_job_titles and persisting.
   */
  onApply: (titles: string[]) => void;
  /** Optional — for showing a loading state on Apply. */
  isApplying?: boolean;
  /**
   * Optional — existing titles the user already has. Used to badge
   * duplicates ("already added") so the user can see what's net-new.
   */
  existingTitles?: string[];
  /** Optional — called when the user clicks the Cancel button. */
  onCancel?: () => void;
  /** Optional — called when the user clicks Apply, after onApply. */
  onApplied?: () => void;
}

export function WorkStyleQuickFill({
  onApply,
  isApplying = false,
  existingTitles = [],
  onCancel,
  onApplied,
}: WorkStyleQuickFillProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [levelIndex, setLevelIndex] = useState<number>(1); // default Medium
  /**
   * Per-(category, level) record of titles the user has unchecked.
   * Keyed by `${categoryId}:${levelId}:${title}` — surviving across
   * slider moves so toggling Medium → High → Medium doesn't reset.
   */
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());

  const selectedCategory: WorkStyleCategory | null = useMemo(
    () => (selectedCategoryId ? WORK_STYLE_CATEGORIES.find((c) => c.id === selectedCategoryId) ?? null : null),
    [selectedCategoryId],
  );
  const selectedLevel = selectedCategory?.levels[levelIndex] ?? null;

  const existingLower = useMemo(
    () => new Set(existingTitles.map((t) => t.toLowerCase().trim())),
    [existingTitles],
  );

  // Currently-checked = visible titles minus the user's unchecks.
  const currentChecked = useMemo(() => {
    if (!selectedCategory || !selectedLevel) return [];
    return selectedLevel.titles.filter((t) => {
      const key = `${selectedCategory.id}:${selectedLevel.id}:${t}`;
      return !unchecked.has(key);
    });
  }, [selectedCategory, selectedLevel, unchecked]);

  const handleApply = () => {
    if (!selectedCategory || !selectedLevel) return;
    // Dedup against existing titles (case-insensitive).
    const fresh = currentChecked.filter((t) => !existingLower.has(t.toLowerCase().trim()));
    onApply(fresh);
    onApplied?.();
  };

  const toggleTitle = (title: string) => {
    if (!selectedCategory || !selectedLevel) return;
    const key = `${selectedCategory.id}:${selectedLevel.id}:${title}`;
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Step 1: Pick a category ─────────────────────────────────────
  if (!selectedCategory) {
    return (
      <div className="space-y-4" data-agent-status="work-style-quickfill-picker">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Not sure what to type? Pick a work style and we'll suggest a starter pack of job titles. You can uncheck what doesn't fit before applying.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {WORK_STYLE_CATEGORIES.map((cat) => {
            const accent = ACCENT_CLASSES[cat.accent];
            return (
              <Card
                key={cat.id}
                role="button"
                tabIndex={0}
                className={`relative p-4 cursor-pointer border-2 transition-all ${accent.border} ${accent.glow} hover:shadow-md`}
                onClick={() => setSelectedCategoryId(cat.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedCategoryId(cat.id);
                  }
                }}
                data-agent-action={`select-work-style-category-${cat.id}`}
              >
                <div className="flex items-start gap-2 mb-2">
                  <Sparkles className={`h-4 w-4 mt-0.5 ${accent.text}`} />
                  <div className="flex-1">
                    <div className={`font-semibold ${accent.text}`}>{cat.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{cat.tagline}</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        {onCancel && (
          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={onCancel} data-agent-action="cancel-work-style-quickfill">
              Cancel
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── Step 2: Tune the level + uncheck titles + apply ──────────────
  const accent = ACCENT_CLASSES[selectedCategory.accent];
  return (
    <div className="space-y-5" data-agent-status="work-style-quickfill-tuner">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedCategoryId(null)}
          data-agent-action="back-to-work-style-picker"
          className="-ml-2"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div className="flex-1 flex items-center gap-2 flex-wrap">
          <span className={`font-semibold ${accent.text}`}>{selectedCategory.label}</span>
          <Badge variant="outline" className={accent.badge}>
            {LEVEL_LABELS[selectedLevel!.id]}
          </Badge>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">Intensity</Label>
        <Slider
          value={[levelIndex]}
          onValueChange={(v) => setLevelIndex(v[0])}
          min={0}
          max={2}
          step={1}
          data-agent-input={`set-work-style-level-${LEVEL_IDS[levelIndex]}`}
          aria-label={`Work-style intensity: ${LEVEL_LABELS[selectedLevel!.id]}`}
        />
        <div className="flex justify-between text-xs text-muted-foreground px-0.5">
          {LEVEL_IDS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setLevelIndex(LEVEL_IDS.indexOf(lvl))}
              data-agent-action={`set-work-style-level-${lvl}`}
              className={`capitalize px-1 py-0.5 rounded transition-colors ${levelIndex === LEVEL_IDS.indexOf(lvl)
                ? `${accent.text} font-medium`
                : "hover:text-foreground"
                }`}
            >
              {lvl}
            </button>
          ))}
        </div>
        <p
          className="text-sm text-muted-foreground italic"
          aria-live="polite"
          data-agent-status={`work-style-level-description-${selectedLevel!.id}`}
        >
          {selectedLevel!.description}
        </p>
      </div>

      <div className="space-y-2" data-agent-status="work-style-suggested-titles">
        <Label className="text-sm font-medium">
          Suggested titles ({currentChecked.length} of {selectedLevel!.titles.length} selected)
        </Label>
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
          {selectedLevel!.titles.map((title) => {
            const key = `${selectedCategory.id}:${selectedLevel!.id}:${title}`;
            const checked = !unchecked.has(key);
            const alreadyAdded = existingLower.has(title.toLowerCase().trim());
            const slug = titleToSlug(title);
            return (
              <label
                key={title}
                className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border transition-colors cursor-pointer ${checked
                  ? "bg-card/50 border-border hover:border-border/80"
                  : "bg-muted/20 border-muted/40 opacity-60"
                  }`}
                htmlFor={`work-style-title-${slug}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Checkbox
                    id={`work-style-title-${slug}`}
                    checked={checked}
                    onCheckedChange={() => toggleTitle(title)}
                    data-agent-action={`toggle-suggested-title-${slug}`}
                    aria-label={`Toggle ${title}`}
                  />
                  <span className={`text-sm ${checked ? "" : "line-through text-muted-foreground"}`}>{title}</span>
                </div>
                {alreadyAdded && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-muted/30 text-muted-foreground border-muted/40 shrink-0"
                  >
                    already added
                  </Badge>
                )}
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <Button
          onClick={handleApply}
          disabled={isApplying || currentChecked.length === 0}
          data-agent-action="apply-work-style-suggestions"
          className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
        >
          {isApplying ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          {(() => {
            const newCount = currentChecked.filter((t) => !existingLower.has(t.toLowerCase().trim())).length;
            const dupCount = currentChecked.length - newCount;
            if (newCount === 0 && dupCount > 0) {
              return `Already in your list`;
            }
            if (dupCount > 0) {
              return `Add ${newCount} new (${dupCount} already in list)`;
            }
            return `Add ${newCount} title${newCount === 1 ? "" : "s"}`;
          })()}
        </Button>
        {onCancel && (
          <Button
            variant="outline"
            onClick={onCancel}
            data-agent-action="cancel-work-style-quickfill"
            className="sm:w-auto"
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Dialog wrapper for the Preferences page ────────────────────────

export interface WorkStyleQuickFillDialogProps extends WorkStyleQuickFillProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkStyleQuickFillDialog({
  open,
  onOpenChange,
  ...rest
}: WorkStyleQuickFillDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        data-agent-status="work-style-quickfill-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-400" />
            Quick fill — work-style starter packs
          </DialogTitle>
          <DialogDescription>
            Curated job-title starter packs. Pick a work style, tune the intensity, and add to your list.
          </DialogDescription>
        </DialogHeader>
        <WorkStyleQuickFill
          {...rest}
          onCancel={() => onOpenChange(false)}
          onApplied={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
