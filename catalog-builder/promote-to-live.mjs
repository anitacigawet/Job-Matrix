// Promote the merged catalog into the live companies-catalog.yaml.
//
// Reads the existing seed entries from companies-catalog.yaml AND the
// merged delta from final-catalog.yaml, combines them, dedupes by slug,
// sorts by ATS (greenhouse → lever → ashby) then alphabetically by name,
// and overwrites companies-catalog.yaml with a maintainer-facing header.
//
// This is the operator-only catalog (NOT community-contributable), so the
// header documents the schema + endpoint mapping for the maintainer's own
// reference + future health-check tooling, rather than a PR walkthrough.
//
// Run from the repo root: `node catalog-builder/promote-to-live.mjs`

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = path.join(REPO_ROOT, "companies-catalog.yaml");
const FINAL = path.join(REPO_ROOT, "catalog-builder", "final-catalog.yaml");

const ATS_IDS = ["greenhouse", "lever", "ashby", "workday"];

const seedDoc = yaml.load(fs.readFileSync(LIVE, "utf8")) ?? {};
const seed = seedDoc.companies ?? [];
const finalDoc = yaml.load(fs.readFileSync(FINAL, "utf8")) ?? {};
const delta = finalDoc.companies ?? [];

console.log(`Seed entries (current live): ${seed.length}`);
console.log(`Merged delta (final-catalog): ${delta.length}`);

// Combine — seed first so seed wins any slug collision (it won't; the
// delta was already deduped against the seed during merge.mjs).
const bySlug = new Map();
let dupes = 0;
for (const e of [...seed, ...delta]) {
  const slug = e.slug.toLowerCase();
  if (bySlug.has(slug)) { dupes++; continue; }
  bySlug.set(slug, e);
}
const all = [...bySlug.values()].sort((a, b) => {
  const ai = ATS_IDS.indexOf(a.ats);
  const bi = ATS_IDS.indexOf(b.ats);
  if (ai !== bi) return ai - bi;
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
});

const counts = { greenhouse: 0, lever: 0, ashby: 0, workday: 0 };
for (const e of all) counts[e.ats]++;

function q(v) { return `"${String(v).replace(/"/g, '\\"')}"`; }
function emit(e) {
  let s = `  - name: ${q(e.name)}\n`;
  s += `    slug: ${q(e.slug)}\n`;
  s += `    ats: ${q(e.ats)}\n`;
  s += `    boardId: ${q(e.boardId)}\n`;
  if (e.host) s += `    host: ${q(e.host)}\n`;
  if (e.site) s += `    site: ${q(e.site)}\n`;
  if (e.website) s += `    website: ${q(e.website)}\n`;
  if (e.tags?.length) s += `    tags: [${e.tags.map(q).join(", ")}]\n`;
  return s;
}

const header = `# Job Matrix — Companies Catalog
#
# Operator-maintained. Each entry maps a company to its public ATS
# job-board API so the scan path can pull that company's listings
# directly (no scraping — these are documented endpoints the ATS serves).
# The Preferences -> Companies tab reads this file; tick a company to
# include it in every scan.
#
# ── Endpoint mapping (for reference + health-check tooling) ───────────
#   greenhouse -> https://boards-api.greenhouse.io/v1/boards/{boardId}/jobs
#   lever      -> https://api.lever.co/v0/postings/{boardId}?mode=json
#   ashby      -> https://api.ashbyhq.com/posting-api/job-board/{boardId}
#
# ── Schema ────────────────────────────────────────────────────────────
#   name:     str    — human-readable company name shown in the UI
#   slug:     str    — stable internal id (watched_companies FK).
#                      Lowercase, hyphenated. Usually == boardId.
#   ats:      str    — one of: greenhouse | lever | ashby
#   boardId:  str    — the {slug} segment in the ATS URL above
#   website:  str?   — optional company marketing site
#   tags:     []str? — optional free-form tags for UI filtering
#
# Entries are grouped by ATS, alphabetical by name within each group.
# Extended in bulk via catalog-builder/ (see that folder's README).
# Total entries: ${all.length}.

companies:
`;

let body = "";
let lastAts = null;
const labels = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", workday: "Workday" };
for (const e of all) {
  if (e.ats !== lastAts) {
    body += `\n  # ── ${labels[e.ats]} ──────────────────────────────────────────────────\n\n`;
    lastAts = e.ats;
  }
  body += emit(e);
}

fs.writeFileSync(LIVE, header + body, "utf8");
console.log(`\nWrote ${LIVE}`);
console.log(`  Total: ${all.length} (Greenhouse ${counts.greenhouse} · Lever ${counts.lever} · Ashby ${counts.ashby})`);
if (dupes) console.log(`  Dropped ${dupes} slug collisions during combine.`);
