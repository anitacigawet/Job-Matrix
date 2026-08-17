import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";

/**
 * Contextual sub-navigation under the top nav. Lists section-specific tabs
 * per route (Settings → LLM / Auto-scan / Notifications / …). State is held
 * here and exposed via useSubNav() so each page can render its own sub-tab
 * content as pages are ported.
 *
 * Pages that haven't been ported render their existing content regardless;
 * the subnav is a visual preview of the new IA in those cases.
 */

interface SubNavItem {
  id: string;
  label: string;
}

const SUBNAV_BY_ROUTE: Record<string, SubNavItem[]> = {
  "/settings": [
    { id: "llm", label: "LLM provider" },
    { id: "sources", label: "Data Sources" },
    { id: "scan", label: "Auto-scan" },
    { id: "notif", label: "Notifications" },
    { id: "appearance", label: "Appearance" },
    { id: "automation", label: "Inbox & Slack" },
    { id: "local-data", label: "Local data" },
  ],
  "/applied": [
    { id: "all", label: "All" },
    { id: "pipeline", label: "Pipeline view" },
    { id: "timeline", label: "Timeline" },
    { id: "responses", label: "Responses" },
  ],
  "/home": [
    { id: "sources", label: "Sources" },
    { id: "health", label: "Health & telemetry" },
  ],
  "/preferences": [
    { id: "profile", label: "Profile" },
    { id: "titles", label: "Job titles" },
    { id: "resume", label: "Résumé" },
    { id: "applications", label: "Application details" },
    { id: "presets", label: "Presets" },
  ],
  "/analytics": [
    { id: "pipeline", label: "Pipeline" },
    { id: "matches", label: "Match scores" },
    { id: "scans", label: "Scan history" },
  ],
};

interface SubNavContextValue {
  current: string | null;
  setCurrent: (id: string) => void;
  items: SubNavItem[];
}

const SubNavContext = createContext<SubNavContextValue | undefined>(undefined);

export function SubNavProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [perRoute, setPerRoute] = useState<Record<string, string>>({});
  const items = SUBNAV_BY_ROUTE[location] ?? [];
  const current = perRoute[location] ?? items[0]?.id ?? null;

  const setCurrent = (id: string) => {
    setPerRoute(prev => ({ ...prev, [location]: id }));
  };

  const value = useMemo(
    () => ({ current, setCurrent, items }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, items.length, location]
  );

  return (
    <SubNavContext.Provider value={value}>{children}</SubNavContext.Provider>
  );
}

export function useSubNav(): SubNavContextValue {
  const ctx = useContext(SubNavContext);
  if (!ctx) {
    throw new Error("useSubNav must be used within SubNavProvider");
  }
  return ctx;
}

export function SubNav() {
  const { items, current, setCurrent } = useSubNav();
  if (items.length === 0) return null;
  return (
    <div className="subnav">
      <div className="subnav-inner">
        {items.map(it => (
          <button
            key={it.id}
            type="button"
            className={`subnav-link ${current === it.id ? "active" : ""}`}
            onClick={() => setCurrent(it.id)}
            data-agent-action={`subnav-${it.id}`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}
