import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

/**
 * Global keyboard shortcuts. Single-letter and two-key (Gmail-style "g d")
 * navigation, plus a "?" help overlay. Listener mounts at app root via the
 * <KeyboardShortcuts /> component below; ignores key events whose target
 * is an input/textarea/contenteditable so the user can type freely in
 * forms.
 *
 * Pattern: press `g`, then within 1500ms press one of the second-key
 * targets to navigate. Press `?` (Shift+/) any time to open the help
 * overlay. Press Escape to close it.
 */

const G_PREFIX_TIMEOUT_MS = 1500;

const NAVIGATION: { secondKey: string; path: string; label: string }[] = [
  { secondKey: "d", path: "/jobs", label: "Dashboard" },
  { secondKey: "a", path: "/applied", label: "Applied" },
  { secondKey: "p", path: "/preferences", label: "Preferences (includes Presets)" },
  { secondKey: "n", path: "/analytics", label: "Analytics" },
  { secondKey: "b", path: "/briefings", label: "Briefings" },
  { secondKey: "s", path: "/settings", label: "Settings" },
];

function isFormElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function KeyboardShortcuts() {
  const [, setLocation] = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  const gPrefixTime = useRef<number | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isFormElement(e.target)) return;
      // Honor modifier keys — don't intercept Ctrl/Cmd combos.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();

      // "?" → help (Shift + / on US layout produces "?")
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      // Escape closes help if open
      if (e.key === "Escape" && helpOpen) {
        setHelpOpen(false);
        return;
      }

      // g-prefix navigation
      const now = Date.now();
      const prefixActive =
        gPrefixTime.current !== null &&
        now - gPrefixTime.current < G_PREFIX_TIMEOUT_MS;

      if (prefixActive) {
        const match = NAVIGATION.find((n) => n.secondKey === key);
        gPrefixTime.current = null;
        if (match) {
          e.preventDefault();
          setLocation(match.path);
          return;
        }
        // unmatched second key — just reset, don't intercept
        return;
      }

      if (key === "g") {
        gPrefixTime.current = now;
        // do NOT preventDefault — g by itself is harmless to fall through
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [helpOpen, setLocation]);

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent
        className="sm:max-w-md"
        data-agent-status="keyboard-shortcuts-help"
      >
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Press <Kbd>?</Kbd> any time to toggle this overlay. Press <Kbd>Esc</Kbd> to close.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium mb-2">Navigate</p>
            <ul className="space-y-1.5">
              {NAVIGATION.map((n) => (
                <li
                  key={n.secondKey}
                  className="flex items-center justify-between"
                >
                  <span className="text-muted-foreground">{n.label}</span>
                  <span className="flex items-center gap-1">
                    <Kbd>g</Kbd> <Kbd>{n.secondKey}</Kbd>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="pt-2 border-t border-border/40">
            <p className="text-xs text-muted-foreground">
              Two-key sequences: press <Kbd>g</Kbd>, then the second key
              within 1.5 seconds. Shortcuts are inactive while you're typing
              in an input or textarea.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
