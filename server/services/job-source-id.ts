import { ALL_PLATFORMS } from "../../shared/platforms";

/**
 * Preserve a source identifier when it belongs to a supported search
 * platform. Unknown and retired experimental source namespaces fall back to
 * Indeed for compatibility with older imported rows.
 */
export function normalizeStoredJobSource(site: string | null | undefined): string {
  if (!site) return "indeed";
  if ((ALL_PLATFORMS as readonly string[]).includes(site)) return site;
  return "indeed";
}
