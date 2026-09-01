import { useEffect, useRef, useState } from "react";
import { ChevronUp, ExternalLink } from "lucide-react";

/**
 * Apply-button styling per job board. Buttons wear the platform's
 * recognizable brand color so users can tell where they're about to
 * land before clicking. Multi-platform jobs blend the colors into an
 * oil-spill gradient that pops open a per-platform menu.
 *
 * Brand colors are intentionally close to each platform's real logo
 * color — referential use, the same way a "Continue with Google"
 * button uses Google's blue.
 */

interface Brand {
  label: string;
  bg: string;
  hover: string;
}

const PLATFORM_BRAND: Record<string, Brand> = {
  indeed:       { label: "Indeed",       bg: "#2557a7", hover: "#1d4585" },
  linkedin:     { label: "LinkedIn",     bg: "#0a66c2", hover: "#084d92" },
  glassdoor:    { label: "Glassdoor",    bg: "#0caa41", hover: "#0a8d36" },
  ziprecruiter: { label: "ZipRecruiter", bg: "#5046bc", hover: "#3f389e" },
  google:       { label: "Google Jobs",  bg: "#1a73e8", hover: "#1557b0" },
};

const FALLBACK: Brand = { label: "External", bg: "#16a34a", hover: "#15803d" };

function brandFor(p: string | null | undefined): Brand {
  if (!p) return FALLBACK;
  return (
    PLATFORM_BRAND[p.toLowerCase()] ?? {
      ...FALLBACK,
      label: p.charAt(0).toUpperCase() + p.slice(1),
    }
  );
}

export interface ApplyTarget {
  platform: string;
  url: string | null | undefined;
}

function platformSlug(p: string | null | undefined): string {
  return (p || "external").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function ApplyLink({
  target,
  layout = "wide",
}: {
  target: ApplyTarget;
  layout?: "wide" | "compact";
}) {
  const b = brandFor(target.platform);
  const slug = platformSlug(target.platform);
  const padding = layout === "compact" ? "6px 10px" : "8px 12px";
  const fontSize = layout === "compact" ? 12 : 13;
  return (
    <a
      href={target.url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-white font-medium rounded-md transition-colors"
      style={{ background: b.bg, padding, fontSize, whiteSpace: "nowrap" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = b.hover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = b.bg;
      }}
      data-agent-action={`apply-${slug}`}
      data-platform={slug}
    >
      <ExternalLink size={12} />
      Apply on {b.label}
    </a>
  );
}

/**
 * Single-platform job: platform-branded apply link.
 */
export function PlatformApplyButton({ target }: { target: ApplyTarget }) {
  return <ApplyLink target={target} />;
}

/**
 * Multi-platform job: an oil-spill gradient "Apply Now" that opens a
 * stack of per-platform apply links above it. Click outside or press
 * Esc to close.
 */
export function MultiPlatformApply({ targets }: { targets: ApplyTarget[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouse(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const colors = targets.map((t) => brandFor(t.platform).bg);
  // Soft oil-spill: blend each color across the button. Repeat the
  // single-platform case so the gradient still has 2 stops to render.
  const stops = colors.length === 1 ? `${colors[0]}, ${colors[0]}` : colors.join(", ");
  const gradient = `linear-gradient(135deg, ${stops})`;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      {open && (
        <div
          role="menu"
          aria-label="Choose a platform to apply on"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 6,
            background: "var(--bg-1)",
            border: "1px solid var(--line-strong)",
            borderRadius: 10,
            boxShadow: "0 12px 32px oklch(0 0 0 / 45%)",
            zIndex: 20,
            minWidth: 180,
            animation: "popIn .14s ease",
          }}
        >
          {targets.map((t) => (
            <ApplyLink key={`${t.platform}-${t.url ?? ""}`} target={t} layout="compact" />
          ))}
        </div>
      )}
      <button
        type="button"
        className="inline-flex items-center gap-2 text-white font-medium rounded-md"
        style={{
          background: gradient,
          padding: "8px 12px",
          fontSize: 13,
          whiteSpace: "nowrap",
          border: 0,
          cursor: "pointer",
          transition: "transform .14s, filter .14s",
          transform: open ? "scale(1.02)" : undefined,
        }}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={(e) => {
          e.currentTarget.style.filter = "brightness(1.08)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = "";
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        data-agent-action="toggle-apply-platforms"
      >
        <ExternalLink size={12} />
        Apply Now
        <ChevronUp
          size={12}
          style={{
            transform: open ? "rotate(0deg)" : "rotate(180deg)",
            transition: "transform .14s",
          }}
        />
      </button>
    </div>
  );
}

/**
 * Picks the right apply component based on how many platforms list
 * this job. Pass the primary job + its duplicates; targets with no
 * URL are dropped.
 */
export function ApplyAction({
  primary,
  duplicates = [],
}: {
  primary: ApplyTarget;
  duplicates?: ApplyTarget[];
}) {
  const all = [primary, ...duplicates].filter((t) => t.url);
  if (all.length === 0) return null;
  if (all.length === 1) return <PlatformApplyButton target={all[0]} />;
  return <MultiPlatformApply targets={all} />;
}
