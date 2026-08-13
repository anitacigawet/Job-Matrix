import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, X, Info } from "lucide-react";
import {
  useAppearance,
  ACCENT_PALETTES,
  ACCENT_KEYS,
  APPEARANCE_DEFAULTS,
  type AccentKey,
} from "@/contexts/AppearanceContext";

interface SegOption<V extends string> {
  value: V;
  label: string;
}

function Seg<V extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: V;
  options: SegOption<V>[];
  onChange: (v: V) => void;
  ariaLabel: string;
}) {
  return (
    <div className="ap-seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SwatchSlider({
  value,
  onChange,
  theme,
}: {
  value: AccentKey;
  onChange: (k: AccentKey) => void;
  theme: "dark" | "light";
}) {
  const heroes = ACCENT_KEYS.map((k) =>
    theme === "light" ? ACCENT_PALETTES[k].light[0] : ACCENT_PALETTES[k].dark[0],
  );
  // A blended track so dragging visibly fades between accent hero colours.
  const gradient = `linear-gradient(to right, ${heroes.join(", ")})`;
  const idx = Math.max(0, ACCENT_KEYS.indexOf(value));
  const activeHero = heroes[idx];

  return (
    <div className="ap-accent-slider">
      <div
        className="ap-accent-track"
        style={{
          background: gradient,
          ["--ap-accent-thumb" as never]: activeHero,
        }}
      >
        <input
          type="range"
          min={0}
          max={ACCENT_KEYS.length - 1}
          step={1}
          value={idx}
          onChange={(e) => onChange(ACCENT_KEYS[parseInt(e.target.value, 10)])}
          aria-label={`Accent for ${theme} mode`}
          aria-valuetext={ACCENT_PALETTES[value].label}
          data-agent-input="appearance-accent"
        />
      </div>
      <div className="ap-accent-labels">
        {ACCENT_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`ap-accent-label ${value === k ? "active" : ""}`}
            onClick={() => onChange(k)}
            aria-pressed={value === k}
            data-agent-action={`set-accent-${k}`}
          >
            {ACCENT_PALETTES[k].label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slider({
  value,
  onChange,
  label,
  min = 0,
  max = 100,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="ap-section">
      <div className="ap-row">
        <span className="ap-label">{label}</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-dim)" }}>
          {value}
        </span>
      </div>
      <div
        className="ap-slider"
        style={{ ["--ap-slider-pct" as never]: `${pct}%` }}
      >
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          aria-label={label}
          data-agent-input="appearance-glass"
        />
      </div>
    </div>
  );
}

/**
 * The shared body — same content rendered inside the popover and inside the
 * Settings → Appearance sub-tab.
 */
export function AppearanceBody({ inline = false }: { inline?: boolean }) {
  const { value: a, set, reset } = useAppearance();
  const theme = a.theme;
  const accentValue = a.accent[theme] ?? "aurora";

  return (
    <>
      <div className="ap-section">
        <div className="ap-label">Theme</div>
        <Seg
          ariaLabel="Theme mode"
          value={a.theme}
          options={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
          onChange={(v) => set({ theme: v })}
        />
      </div>

      <div className="ap-section">
        <div className="ap-row">
          <span className="ap-label">Accent · {theme} mode</span>
          <span className="mono" style={{ fontSize: 11, color: "var(--fg-dim)" }}>
            {ACCENT_PALETTES[accentValue].label}
          </span>
        </div>
        <SwatchSlider
          value={accentValue}
          theme={theme}
          onChange={(v) => set({ accent: { [theme]: v } })}
        />
        <div style={{ fontSize: 11, color: "var(--fg-dim)" }}>
          Each theme keeps its own accent — flipping to light won't lose your dark choice.
        </div>
      </div>

      <Slider
        label="Glass intensity"
        value={a.glass ?? 50}
        onChange={(v) => set({ glass: v })}
      />

      <div className="ap-section">
        <div className="ap-label">Density</div>
        <Seg
          ariaLabel="Spacing density"
          value={a.density}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
          onChange={(v) => set({ density: v })}
        />
      </div>

      <div className="ap-section">
        <div className="ap-label">Navigation</div>
        <Seg
          ariaLabel="Navigation layout"
          value={a.nav}
          options={[
            { value: "top", label: "Top bar" },
            { value: "sidebar", label: "Sidebar" },
          ]}
          onChange={(v) => set({ nav: v })}
        />
      </div>

      <div className="ap-section" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <div className="ap-label">AI features</div>
        <div className="ap-row" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "var(--font-sm)", color: "var(--fg)" }}>
              NotebookLM briefings
            </div>
            <div className="dim" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.45 }}>
              Daily coach audio, weekly market briefings, interview prep, per-job briefings. Hides the dashboard strip, the Briefings entry in the nav, the NotebookLM auth + auto-briefing sections in Settings, and the per-job Briefings menu on applied cards.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={a.briefings}
            aria-label="Toggle NotebookLM briefings"
            data-agent-action="toggle-briefings-feature"
            onClick={() => set({ briefings: !a.briefings })}
            style={{
              width: 36,
              height: 20,
              borderRadius: 999,
              border: 0,
              cursor: "pointer",
              padding: 2,
              background: a.briefings ? "var(--accent-1)" : "var(--bg-3)",
              transition: "background .14s",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                display: "block",
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "white",
                transform: a.briefings ? "translateX(16px)" : "translateX(0)",
                transition: "transform .14s",
              }}
            />
          </button>
        </div>
      </div>

      {inline && (
        <div
          className="ap-section"
          style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}
        >
          <button
            type="button"
            className="btn btn-sm"
            onClick={reset}
            data-agent-action="reset-appearance"
            style={{ alignSelf: "flex-start" }}
          >
            Reset to defaults
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Top-nav trigger + dropdown popover. Click-outside-to-close, Esc-to-close.
 */
export function AppearanceTrigger() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const { reset } = useAppearance();

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", off);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="appearance-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-agent-action="open-appearance-panel"
        title="Appearance"
      >
        <SlidersHorizontal size={14} />
        <span style={{ fontSize: "var(--font-xs)" }}>Appearance</span>
      </button>
      {open && (
        <div className="appearance-popover" role="dialog" aria-label="Appearance">
          <div className="ap-head">
            <h3>Appearance</h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-iconly"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
          <div className="ap-body">
            <AppearanceBody />
          </div>
          <div className="ap-foot">
            <span>Saved to this browser</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={reset}
              data-agent-action="reset-appearance"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Standalone settings-tab variant. Wraps the same body with a card and a
 * local-first explanation card. Will be mounted from the Settings page once
 * that page is ported.
 */
export function SettingsAppearance() {
  return (
    <div className="card card-pad stack" style={{ maxWidth: 640 }}>
      <div className="row-between">
        <div>
          <div className="eyebrow">Appearance</div>
          <div className="dim" style={{ fontSize: "var(--font-sm)", marginTop: 4 }}>
            Personalize the look without touching CSS. Saved per browser
            (localStorage). Per-theme accent — flipping themes preserves your
            other choice.
          </div>
        </div>
        <SlidersHorizontal size={20} className="dim" />
      </div>
      <hr className="divider" />
      <AppearanceBody inline />
      <div className="card card-pad" style={{ background: "var(--bg-2)", marginTop: 4 }}>
        <div className="row-tight" style={{ alignItems: "flex-start" }}>
          <Info size={14} className="dim" style={{ marginTop: 2 }} />
          <div className="dim" style={{ fontSize: "var(--font-xs)", lineHeight: 1.55 }}>
            All preferences live in{" "}
            <span className="mono">localStorage["jobmatrix.appearance"]</span>.
            Wipe your browser data to reset, or hit the button above. Local-first
            by default — no sync, no cloud, no telemetry.
          </div>
        </div>
      </div>
    </div>
  );
}

// Re-export the defaults so consumers can do "reset to defaults" if needed.
export { APPEARANCE_DEFAULTS };
