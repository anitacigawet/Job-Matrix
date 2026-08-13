import { ALL_PLATFORMS } from "../../shared/platforms";

const ATS_PREFIXES = ["gh:", "lever:", "ashby:", "wd:"] as const;

/**
 * Preserve a source identifier exactly when it belongs to a supported search
 * platform or per-company ATS namespace. Unknown/missing values fall back to
 * Indeed for compatibility with older imported rows.
 */
export function normalizeStoredJobSource(site: string | null | undefined): string {
  if (!site) return "indeed";
  if ((ALL_PLATFORMS as readonly string[]).includes(site)) return site;
  if (ATS_PREFIXES.some((prefix) => site.startsWith(prefix))) return site;
  return "indeed";
}
