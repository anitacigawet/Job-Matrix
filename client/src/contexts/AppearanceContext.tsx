import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "dark" | "light";
export type AccentKey = "aurora" | "plasma" | "terminal" | "mint";
export type Density = "comfortable" | "compact";
export type NavLayout = "top" | "sidebar";

export interface Appearance {
  theme: Theme;
  accent: { dark: AccentKey; light: AccentKey };
  glass: number;
  density: Density;
  nav: NavLayout;
  /**
   * Master toggle for NotebookLM-powered features. When false, the
   * DailyBriefingStrip on the dashboard, the Briefings entry in the
   * TopNav, the NotebookLM auth + auto-briefing sub-sections in
   * Settings, and the per-job Briefings dropdown on applied cards
   * all disappear. The /briefings route stays reachable by direct
   * URL so users keep access to any briefings they already
   * generated — only the surfaces that nudge new generation hide.
   */
  briefings: boolean;
}

export interface AccentPalette {
  label: string;
  dark: [string, string, string];
  light: [string, string, string];
}

export const ACCENT_PALETTES: Record<AccentKey, AccentPalette> = {
  aurora: {
    label: "Aurora",
    dark: ["#7dd3fc", "#a78bfa", "#f0abfc"],
    light: ["#5fa8e8", "#8b5cf6", "#d946ef"],
  },
  plasma: {
    label: "Plasma",
    dark: ["#c084fc", "#f0abfc", "#a5b4fc"],
    light: ["#9333ea", "#c026d3", "#6366f1"],
  },
  terminal: {
    label: "Terminal",
    dark: ["#fbbf24", "#fb923c", "#facc15"],
    light: ["#b45309", "#c2410c", "#a16207"],
  },
  mint: {
    label: "Mint",
    dark: ["#5eead4", "#86efac", "#22d3ee"],
    light: ["#0d9488", "#15803d", "#0891b2"],
  },
};

export const ACCENT_KEYS: AccentKey[] = Object.keys(ACCENT_PALETTES) as AccentKey[];

const STORAGE_KEY = "jobmatrix.appearance";

export const APPEARANCE_DEFAULTS: Appearance = {
  theme: "dark",
  accent: { dark: "aurora", light: "aurora" },
  glass: 50,
  density: "comfortable",
  nav: "top",
  briefings: true,
};

function loadAppearance(): Appearance {
  if (typeof window === "undefined") return APPEARANCE_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return APPEARANCE_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return {
      ...APPEARANCE_DEFAULTS,
      ...parsed,
      accent: { ...APPEARANCE_DEFAULTS.accent, ...(parsed.accent ?? {}) },
    };
  } catch {
    return APPEARANCE_DEFAULTS;
  }
}

function saveAppearance(a: Appearance) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    /* localStorage may be unavailable; ignore */
  }
}

function applyAppearance(a: Appearance) {
  const r = document.documentElement;
  const theme: Theme = a.theme === "light" ? "light" : "dark";
  r.setAttribute("data-theme", theme);

  // Mirror to .dark class so Tailwind's `dark:` variant keeps working
  // on unported pages.
  if (theme === "dark") r.classList.add("dark");
  else r.classList.remove("dark");

  const accent = a.accent[theme] ?? "aurora";
  r.setAttribute("data-accent", accent);
  r.setAttribute("data-density", a.density === "compact" ? "compact" : "comfortable");
  r.setAttribute("data-nav", a.nav === "sidebar" ? "sidebar" : "top");

  // Glass slider 0..100 — same ramp as the prototype
  const intensity = Math.max(0, Math.min(100, a.glass ?? 50));
  if (intensity === 0) {
    r.setAttribute("data-glass", "off");
    r.style.removeProperty("--glass-blur");
    r.style.removeProperty("--glass-bg");
    r.style.removeProperty("--glass-haze-opacity");
  } else {
    r.setAttribute("data-glass", "on");
    const blurPx = (intensity / 100) * 22;
    const alphaPct = 95 - (intensity / 100) * 45;
    r.style.setProperty("--glass-blur", `${blurPx.toFixed(1)}px`);
    if (theme === "light") {
      r.style.setProperty("--glass-bg", `oklch(1 0 0 / ${alphaPct.toFixed(1)}%)`);
    } else {
      r.style.setProperty("--glass-bg", `oklch(0.21 0.012 265 / ${alphaPct.toFixed(1)}%)`);
    }
    r.style.setProperty("--glass-haze-opacity", `${((intensity / 100) * 0.95).toFixed(2)}`);
  }
}

export interface AppearancePatch {
  theme?: Theme;
  accent?: Partial<{ dark: AccentKey; light: AccentKey }>;
  glass?: number;
  density?: Density;
  nav?: NavLayout;
  briefings?: boolean;
}

interface AppearanceContextValue {
  value: Appearance;
  set: (patch: AppearancePatch) => void;
  reset: () => void;
}

const AppearanceContext = createContext<AppearanceContextValue | undefined>(undefined);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<Appearance>(() => loadAppearance());

  useEffect(() => {
    applyAppearance(value);
    saveAppearance(value);
  }, [value]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as Partial<Appearance>;
        setValue((prev) => ({
          ...prev,
          ...parsed,
          accent: { ...prev.accent, ...(parsed.accent ?? {}) },
        }));
      } catch {
        /* ignore malformed storage updates */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const set = useCallback<AppearanceContextValue["set"]>((patch) => {
    setValue((prev) => {
      const { accent: accentPatch, ...rest } = patch;
      return {
        ...prev,
        ...rest,
        accent: accentPatch ? { ...prev.accent, ...accentPatch } : prev.accent,
      };
    });
  }, []);

  const reset = useCallback(() => setValue(APPEARANCE_DEFAULTS), []);

  return (
    <AppearanceContext.Provider value={{ value, set, reset }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error("useAppearance must be used within AppearanceProvider");
  }
  return ctx;
}
