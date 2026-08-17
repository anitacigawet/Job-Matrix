import { ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Standard page header — back-arrow on the left, title + subtitle in the middle,
 * optional right-side action slot. Used by every "sub-page" in Job Matrix
 * (Applied, Analytics, Presets, Settings, Preferences, ConfigDebug).
 *
 * The "hub" pages (Landing, Onboarding, the dashboard at /jobs, Platforms)
 * keep their own headers — they're entry points, not back-able sub-pages,
 * and each has a unique visual treatment.
 *
 * Notes:
 * - `subtitle` is ReactNode (not string) so callers can wrap with their own
 *   attributes — e.g. `aria-live="polite"` + `data-agent-status="..."` for
 *   subtitles that broadcast live counts.
 * - `backHref` defaults to `null` (no back button) because the global TopNav
 *   already exposes a Dashboard link on every route. Pass an explicit string
 *   to a non-default destination if a sub-page genuinely needs its own back
 *   target (e.g. nested flows).
 * - `icon` renders inline-left of the title text. Optional.
 * - `rightAction` is the right-hand slot — typically a Button.
 */
interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  backHref?: string | null;
  backLabel?: string;
  rightAction?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  backHref = null,
  backLabel = "Back to dashboard",
  rightAction,
  className,
}: PageHeaderProps) {
  const [, setLocation] = useLocation();
  return (
    <div
      className={
        "flex items-start justify-between mb-8 flex-wrap gap-4 " +
        (className ?? "")
      }
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {backHref && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation(backHref)}
            aria-label={backLabel}
            data-agent-action="back-to-dashboard"
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="text-3xl md:text-4xl font-bold gradient-text flex items-center gap-3">
            {icon}
            <span className="truncate">{title}</span>
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
      </div>
      {rightAction && <div className="shrink-0">{rightAction}</div>}
    </div>
  );
}
