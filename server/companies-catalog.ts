/**
 * Companies Catalog — server-side parser + cache. See DECISIONS.md D-020.
 *
 * Reads `companies-catalog.yaml` at the repo root, validates with Zod,
 * caches the parsed result in memory. Invalid entries log a warning and
 * are dropped (do not crash the app — a bad community PR should not
 * kill the deploy).
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import {
  companiesCatalogSchema,
  companyEntrySchema,
  type CompanyEntry,
} from "../shared/companies-catalog-schema";

const CATALOG_PATH = path.resolve(process.cwd(), "companies-catalog.yaml");

let cached: CompanyEntry[] | null = null;

/**
 * Read + parse + validate the catalog. Memoized — subsequent calls return
 * the cached list until the process restarts. Use `invalidateCatalog()`
 * to force a re-read during a hot-edit session if needed.
 */
export function readCompaniesCatalog(): CompanyEntry[] {
  if (cached !== null) return cached;

  if (!fs.existsSync(CATALOG_PATH)) {
    console.warn(`[Catalog] No companies-catalog.yaml at ${CATALOG_PATH}; returning empty list`);
    cached = [];
    return cached;
  }

  let raw: unknown;
  try {
    const text = fs.readFileSync(CATALOG_PATH, "utf-8");
    raw = yaml.load(text);
  } catch (err) {
    console.error("[Catalog] Failed to parse companies-catalog.yaml:", err);
    cached = [];
    return cached;
  }

  // Validate the top-level shape, then drop individual bad entries so one
  // malformed line in a contribution doesn't blank out the whole list.
  const topLevel = companiesCatalogSchema.safeParse(raw);
  if (!topLevel.success) {
    // Maybe just the inner entries are bad — try per-entry validation.
    const list = (raw as { companies?: unknown[] })?.companies;
    if (!Array.isArray(list)) {
      console.error("[Catalog] Top-level `companies` is not an array; ignoring catalog.");
      cached = [];
      return cached;
    }
    const validated: CompanyEntry[] = [];
    for (const entry of list) {
      const r = companyEntrySchema.safeParse(entry);
      if (r.success) {
        validated.push(r.data);
      } else {
        console.warn("[Catalog] Skipping invalid entry:", entry, r.error.issues);
      }
    }
    cached = dedupeBySlug(validated);
    console.log(`[Catalog] Loaded ${cached.length} companies (after dropping invalid entries)`);
    return cached;
  }

  cached = dedupeBySlug(topLevel.data.companies);
  console.log(`[Catalog] Loaded ${cached.length} companies from ${CATALOG_PATH}`);
  return cached;
}

/** First-occurrence-wins de-dupe by slug. Logs duplicates so contributors notice. */
function dedupeBySlug(entries: CompanyEntry[]): CompanyEntry[] {
  const seen = new Set<string>();
  const out: CompanyEntry[] = [];
  for (const e of entries) {
    if (seen.has(e.slug)) {
      console.warn(`[Catalog] Duplicate slug "${e.slug}" — keeping first occurrence (${out.find(x => x.slug === e.slug)?.name}), dropping ${e.name}`);
      continue;
    }
    seen.add(e.slug);
    out.push(e);
  }
  return out;
}

/** Look up one company by slug. Returns null if not in catalog. */
export function getCompanyBySlug(slug: string): CompanyEntry | null {
  return readCompaniesCatalog().find((c) => c.slug === slug) ?? null;
}

/** Force a re-read on next call. Useful during dev when editing the YAML. */
export function invalidateCatalog(): void {
  cached = null;
}
