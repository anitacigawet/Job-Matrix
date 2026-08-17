import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { AppearanceTrigger } from "./AppearancePopover";
import { Menu, X } from "lucide-react";

/**
 * The design's top navigation. Brand + primary nav + Appearance trigger +
 * live LLM-key status pill. Mounted at the top of the page-shell on every
 * route — replaces the old per-page header chrome as pages are ported.
 */

interface RouteEntry {
  id: string;
  label: string;
  path: string;
  hook?: string;
}

const NAV_ROUTES: RouteEntry[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    path: "/jobs",
    hook: "go-to-dashboard",
  },
  { id: "applied", label: "Applied", path: "/applied", hook: "go-to-applied" },
  {
    id: "preferences",
    label: "Preferences",
    path: "/preferences",
    hook: "go-to-preferences",
  },
  {
    id: "analytics",
    label: "Analytics",
    path: "/analytics",
    hook: "go-to-analytics",
  },
  {
    id: "platforms",
    label: "Platforms",
    path: "/home",
    hook: "go-to-platforms",
  },
  {
    id: "settings",
    label: "Settings",
    path: "/settings",
    hook: "go-to-settings-global",
  },
];

function KeyStatusPill() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = trpc.settings.getLlm.useQuery(undefined, {
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <button
        type="button"
        className="badge"
        data-agent-status="llm-key-status"
        style={{ cursor: "pointer" }}
        onClick={() => setLocation("/settings")}
      >
        Loading…
      </button>
    );
  }

  const active = data?.activeProvider ?? "gemini";
  const providerInfo = data?.providers?.find(p => p.id === active);
  const hasKey = !!providerInfo?.hasKey;
  const label =
    active === "gemini"
      ? "Gemini"
      : active === "openai"
        ? "OpenAI"
        : "DeepSeek";

  return (
    <button
      type="button"
      className={`badge ${hasKey ? "badge-ok" : "badge-warn"} dot`}
      onClick={() => setLocation("/settings")}
      data-agent-action="go-to-settings-global"
      data-agent-status="llm-key-status"
      style={{ cursor: "pointer" }}
      title={
        hasKey
          ? `${label} key configured (click to view Settings)`
          : `${label} key missing — click to configure`
      }
    >
      {label} · {hasKey ? "key set" : "no key"}
    </button>
  );
}

export function TopNav() {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const routes = NAV_ROUTES;
  // Match the active nav by longest-prefix path match.
  const activeId =
    routes.find(r => location === r.path)?.id ??
    routes.find(r => location.startsWith(r.path) && r.path !== "/")?.id;

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  function navigate(path: string) {
    setMobileOpen(false);
    setLocation(path);
  }

  // Publish the active TopNav button's horizontal offset so the SubNav
  // can left-align itself directly under the active tab — making the
  // SubNav feel like a dropdown extension of the parent rather than a
  // disconnected secondary bar. Recomputes on active-route change and
  // on window resize (so the nav-links reflow doesn't strand it).
  const innerRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    function syncAnchor() {
      const inner = innerRef.current;
      if (!inner) return;
      const active = inner.querySelector<HTMLElement>(".nav-link.active");
      const root = document.documentElement;
      const subnav = document.querySelector<HTMLElement>(".subnav-inner");
      const links = subnav
        ? Array.from(subnav.querySelectorAll<HTMLElement>(".subnav-link"))
        : [];
      // No active tab, no SubNav, or no items → fall back to the default
      // left padding (handled by the CSS `max(space-8, ...)` rule).
      if (!active || !subnav || links.length === 0) {
        root.style.removeProperty("--subnav-anchor-x");
        return;
      }
      // Center the entire SubNav row under the active TopNav button.
      // 1) Active button's horizontal center, in viewport coords.
      // 2) Subtract the SubNav inner's own viewport left so we end up
      //    with an offset measured from the SubNav's left edge.
      // 3) Subtract half the SubNav content's measured width so the
      //    midpoint of the row lands on the button's center.
      // The content width is read from `lastLink.right - firstLink.left`
      // (so any padding/gap changes propagate automatically), and
      // clamp at 0 so an active button near the left edge can't push
      // padding negative.
      const activeRect = active.getBoundingClientRect();
      const activeCenter = activeRect.left + activeRect.width / 2;
      const innerLeft = subnav.getBoundingClientRect().left;
      const firstLeft = links[0].getBoundingClientRect().left;
      const lastRight = links[links.length - 1].getBoundingClientRect().right;
      const contentWidth = lastRight - firstLeft;
      const offset = activeCenter - innerLeft - contentWidth / 2;
      root.style.setProperty("--subnav-anchor-x", `${Math.max(0, offset)}px`);
    }
    // Defer one frame so flex reflow + font metrics have settled before
    // we measure — otherwise the first measurement can be ~10px short
    // of the final layout.
    const raf = requestAnimationFrame(syncAnchor);
    window.addEventListener("resize", syncAnchor);
    // Observe SubNav size so changes recenter under the active route.
    const subnav = document.querySelector<HTMLElement>(".subnav-inner");
    const obs = new ResizeObserver(syncAnchor);
    if (subnav) obs.observe(subnav);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", syncAnchor);
      obs.disconnect();
    };
  }, [activeId]);

  return (
    <nav className="topnav" role="navigation" aria-label="Primary">
      <div ref={innerRef} className="topnav-inner">
        <button
          type="button"
          className="brand"
          onClick={() => navigate("/")}
          aria-label="Job Matrix home"
          data-agent-action="go-to-landing"
        >
          <span className="brand-mark">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>Job&nbsp;Matrix</span>
          <span
            className="badge badge-mono topnav-version"
            style={{ marginLeft: 4, fontSize: 10, padding: "1px 6px" }}
          >
            v0.2.0
          </span>
        </button>
        <div className="nav-links">
          {routes.map(r => (
            <button
              key={r.id}
              type="button"
              className={`nav-link ${activeId === r.id ? "active" : ""}`}
              onClick={() => navigate(r.path)}
              data-agent-action={r.hook}
              aria-current={activeId === r.id ? "page" : undefined}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="nav-spacer" />
        <button
          type="button"
          className="mobile-nav-toggle"
          onClick={() => setMobileOpen(open => !open)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-primary-navigation"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          data-agent-action="toggle-mobile-navigation"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <AppearanceTrigger />
        <div className="key-status-desktop">
          <KeyStatusPill />
        </div>
      </div>
      {mobileOpen && (
        <div id="mobile-primary-navigation" className="mobile-nav-panel">
          {routes.map(route => (
            <button
              key={route.id}
              type="button"
              className={`mobile-nav-link ${activeId === route.id ? "active" : ""}`}
              onClick={() => navigate(route.path)}
              data-agent-action={route.hook}
              aria-current={activeId === route.id ? "page" : undefined}
            >
              {route.label}
            </button>
          ))}
          <div className="mobile-key-status">
            <KeyStatusPill />
          </div>
        </div>
      )}
    </nav>
  );
}
