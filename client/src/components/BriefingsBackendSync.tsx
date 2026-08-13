import { useEffect, useRef } from "react";
import { useAppearance } from "@/contexts/AppearanceContext";
import { trpc } from "@/lib/trpc";

/**
 * Glue between the client-side `appearance.briefings` toggle and the
 * server-side cron schedules. The UI toggle is a localStorage flag, but
 * the auto-briefing schedulers run server-side off `user_settings`
 * (autoDailyBriefing / autoWeeklyBriefing) — flipping the UI off
 * without telling the server would leave the cron firing in the
 * background despite the user opting out.
 *
 * This component watches for the falling edge (true → false) and
 * forces the server-side schedules off. The rising edge (false → true)
 * does NOT auto-enable schedules — re-enabling generation is a fresh
 * opt-in via the Settings → Auto-scan tab.
 *
 * Mount once near the root of the app (inside the AppearanceProvider
 * and the tRPC provider). Renders nothing.
 */
export function BriefingsBackendSync() {
  const { value: appearance } = useAppearance();
  const utils = trpc.useUtils();
  const updateAutoScan = trpc.settings.updateAutoScan.useMutation({
    onSuccess: () => {
      utils.settings.getSettings.invalidate();
    },
  });
  // Use undefined as the "first render" sentinel so the falling-edge
  // detector doesn't misfire when briefings is already false on mount.
  const previous = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    const wasOn = previous.current;
    const isOn = appearance.briefings;
    previous.current = isOn;
    if (wasOn === true && isOn === false) {
      updateAutoScan.mutate({
        autoDailyBriefing: false,
        autoWeeklyBriefing: false,
      });
    }
  }, [appearance.briefings, updateAutoScan]);

  return null;
}
