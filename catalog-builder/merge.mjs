// Catalog-builder merge script.
//
// Reads every catalog-builder/staging/*.yaml, validates each entry against
// the same rules as shared/companies-catalog-schema.ts, dedupes by slug
// (first occurrence wins) + against the live companies-catalog.yaml,
// sorts by ATS (greenhouse → lever → ashby) then by name alpha,
// and writes catalog-builder/final-catalog.yaml.
//
// Also reads catalog-builder/unsupported/*.md, groups entries by the
// unsupported ATS host, and writes catalog-builder/final-catalog.summary.md
// with the prioritisation signal for which next ATS to support.
//
// Run from the repo root: `node catalog-builder/merge.mjs`

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_DIR = path.join(REPO_ROOT, "catalog-builder", "staging");
const UNSUPPORTED_DIR = path.join(REPO_ROOT, "catalog-builder", "unsupported");
const LIVE_CATALOG = path.join(REPO_ROOT, "companies-catalog.yaml");
const OUT_CATALOG = path.join(REPO_ROOT, "catalog-builder", "final-catalog.yaml");
const OUT_SUMMARY = path.join(REPO_ROOT, "catalog-builder", "final-catalog.summary.md");

const ATS_IDS = ["greenhouse", "lever", "ashby", "workday"];
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function validateEntry(e, source) {
  const errs = [];
  if (typeof e?.name !== "string" || !e.name.trim() || e.name.length > 120) errs.push("name");
  if (typeof e?.slug !== "string" || !SLUG_RE.test(e.slug.trim()) || e.slug.length > 80) errs.push("slug");
  if (!ATS_IDS.includes(e?.ats)) errs.push("ats");
  if (typeof e?.boardId !== "string" || !e.boardId.trim() || e.boardId.length > 120) errs.push("boardId");
  if (e?.ats === "workday") {
    if (typeof e?.host !== "string" || !e.host.trim()) errs.push("host");
    if (typeof e?.site !== "string" || !e.site.trim()) errs.push("site");
  }
  if (e?.website !== undefined) {
    try { new URL(e.website); } catch { errs.push("website"); }
  }
  if (e?.tags !== undefined) {
    if (!Array.isArray(e.tags)) errs.push("tags");
    else for (const t of e.tags) {
      if (typeof t !== "string" || !t.trim() || t.length > 40) { errs.push("tag"); break; }
    }
  }
  return errs.length ? `${source}: invalid (${errs.join(", ")}) → ${JSON.stringify(e).slice(0, 100)}` : null;
}

function normalise(e) {
  const out = {
    name: e.name.trim(),
    slug: e.slug.trim().toLowerCase(),
    ats: e.ats,
    boardId: e.boardId.trim(),
  };
  if (e.host) out.host = e.host.trim();
  if (e.site) out.site = e.site.trim();
  if (e.website) out.website = e.website.trim();
  if (e.tags?.length) out.tags = e.tags.map((t) => t.trim());
  return out;
}

// ── Load existing live catalog (for dedupe-against-seed) ──
const liveDoc = yaml.load(fs.readFileSync(LIVE_CATALOG, "utf8"));
const liveSlugs = new Set((liveDoc?.companies ?? []).map((e) => e.slug.toLowerCase()));
console.log(`Live catalog: ${liveSlugs.size} existing slugs — will dedupe staging against these.`);

// ── Load every staging file ──
const stagingFiles = fs.readdirSync(STAGING_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();
console.log(`Found ${stagingFiles.length} staging files.`);

const droppedInvalid = [];
const droppedDupeWithinStaging = [];
const droppedDupeWithSeed = [];
const merged = new Map(); // slug → {entry, sourceCategory}
const perCategoryCount = {};

for (const file of stagingFiles) {
  const cat = file.replace(/\.yaml$/, "");
  const doc = yaml.load(fs.readFileSync(path.join(STAGING_DIR, file), "utf8")) ?? {};
  const entries = doc.companies ?? [];
  perCategoryCount[cat] = { input: entries.length, kept: 0, droppedInvalid: 0, droppedDupe: 0, droppedSeed: 0 };
  for (const raw of entries) {
    const err = validateEntry(raw, `${cat}.yaml`);
    if (err) { droppedInvalid.push(err); perCategoryCount[cat].droppedInvalid++; continue; }
    const e = normalise(raw);
    if (liveSlugs.has(e.slug)) {
      droppedDupeWithSeed.push(`${cat}: ${e.slug} (already in seed catalog)`);
      perCategoryCount[cat].droppedSeed++;
      continue;
    }
    if (merged.has(e.slug)) {
      const first = merged.get(e.slug);
      droppedDupeWithinStaging.push(`${cat}: ${e.slug} — already added from ${first.cat}`);
      perCategoryCount[cat].droppedDupe++;
      continue;
    }
    merged.set(e.slug, { entry: e, cat });
    perCategoryCount[cat].kept++;
  }
}

console.log(`Merged: ${merged.size} unique entries.`);
console.log(`Dropped — invalid: ${droppedInvalid.length}, within-staging dupes: ${droppedDupeWithinStaging.length}, against-seed dupes: ${droppedDupeWithSeed.length}.`);

// ── Sort: ATS (greenhouse → lever → ashby), then name alpha (case-insensitive) ──
const sorted = [...merged.values()].sort((a, b) => {
  const aiA = ATS_IDS.indexOf(a.entry.ats);
  const biA = ATS_IDS.indexOf(b.entry.ats);
  if (aiA !== biA) return aiA - biA;
  return a.entry.name.toLowerCase().localeCompare(b.entry.name.toLowerCase());
});

// ── Emit YAML with section headers per ATS ──
function yamlScalar(v) {
  // Always double-quote string scalars to match the existing catalog style.
  if (typeof v === "string") return `"${v.replace(/"/g, '\\"')}"`;
  return String(v);
}
function emitEntry(e) {
  let s = `  - name: ${yamlScalar(e.name)}\n`;
  s += `    slug: ${yamlScalar(e.slug)}\n`;
  s += `    ats: ${yamlScalar(e.ats)}\n`;
  s += `    boardId: ${yamlScalar(e.boardId)}\n`;
  if (e.host) s += `    host: ${yamlScalar(e.host)}\n`;
  if (e.site) s += `    site: ${yamlScalar(e.site)}\n`;
  if (e.website) s += `    website: ${yamlScalar(e.website)}\n`;
  if (e.tags?.length) {
    s += `    tags: [${e.tags.map(yamlScalar).join(", ")}]\n`;
  }
  return s;
}

const header = `# Job Matrix — Companies Catalog (merged delta from catalog-builder sweep)
#
# This file is the OUTPUT of catalog-builder/merge.mjs. It contains the
# new verified entries from all staging/*.yaml files, deduped against the
# live companies-catalog.yaml seed and sorted by ATS then name.
#
# To land it: review the entries, then either append them to
# companies-catalog.yaml under the appropriate ATS section or replace
# companies-catalog.yaml with this file's contents (after manually
# merging in the seed entries the operator wants to keep).
#
# Generated: ${new Date().toISOString().slice(0, 10)}
# Source: catalog-builder/staging/*.yaml (${stagingFiles.length} files)
# Total entries: ${sorted.length}

companies:
`;

let body = "";
let lastAts = null;
const atsSectionLabels = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", workday: "Workday" };
const atsCounts = { greenhouse: 0, lever: 0, ashby: 0, workday: 0 };
for (const { entry } of sorted) {
  atsCounts[entry.ats]++;
  if (entry.ats !== lastAts) {
    body += `\n  # ── ${atsSectionLabels[entry.ats]} ──────────────────────────────────────────────────\n\n`;
    lastAts = entry.ats;
  }
  body += emitEntry(entry);
}

fs.writeFileSync(OUT_CATALOG, header + body, "utf8");
console.log(`Wrote ${OUT_CATALOG}`);
console.log(`  Greenhouse: ${atsCounts.greenhouse} · Lever: ${atsCounts.lever} · Ashby: ${atsCounts.ashby}`);

// ── Consolidate unsupported logs ──
const unsupportedFiles = fs.existsSync(UNSUPPORTED_DIR)
  ? fs.readdirSync(UNSUPPORTED_DIR).filter((f) => f.endsWith(".md")).sort()
  : [];

const unsupportedByAts = new Map(); // canonical ATS host → [{ company, host, category }]
const knownAtsHosts = [
  "Workday", "SmartRecruiters", "Workable", "BambooHR", "iCIMS",
  "Jobvite", "Taleo", "ADP", "Eightfold", "Phenom", "Avature",
  "Brassring", "PageUp", "Oracle", "SAP SuccessFactors", "SuccessFactors",
  "Personio", "Recruitee", "Teamtailor", "JazzHR", "Breezy", "TalentLyft",
  "Lano", "Pinpoint", "Polymer", "Rooster",
];

function canonicaliseAtsLabel(raw) {
  const r = raw.trim().toLowerCase();

  // True unsupported ATSes — these are the prioritisation signal.
  // Check Workday first since "myworkdayjobs.com" subdomains often
  // appear alongside other host fragments in the same line.
  if (r.includes("myworkdayjobs") || r.includes("workday")) return "Workday";
  if (r.includes("smartrecruiters")) return "SmartRecruiters";
  if (r.includes("workable")) return "Workable";
  if (r.includes("bamboohr")) return "BambooHR";
  if (r.includes("icims")) return "iCIMS";
  if (r.includes("jobvite")) return "Jobvite";
  if (r.includes("taleo")) return "Taleo";
  if (r.includes("successfactors")) return "SAP SuccessFactors";
  if (r.includes("eightfold")) return "Eightfold";
  if (r.includes("rippling")) return "Rippling";
  if (r.includes("recruitee")) return "Recruitee";
  if (r.includes("comeet")) return "Comeet";
  if (r.includes("phenom")) return "Phenom";
  if (r.includes("breezy")) return "Breezy";
  if (r.includes("teamtailor")) return "Teamtailor";
  if (r.includes("jazzhr")) return "JazzHR";
  if (r.includes("ultipro") || r.includes("ukg")) return "UKG / UltiPro";
  if (r.includes("deel")) return "Deel";
  if (r.includes("pinpoint")) return "Pinpoint";
  if (r.includes("personio")) return "Personio";
  if (r.includes("polymer")) return "Polymer";
  if (r.includes("pageup")) return "PageUp";
  if (r.includes("brassring")) return "BrassRing";
  if (r.includes("avature")) return "Avature";
  if (r.includes("adp")) return "ADP";
  if (r.includes("oracle")) return "Oracle";

  // Company-state reasons — out of scope for an adapter strategy.
  if (r.includes("defunct") || r.includes("bankruptcy") || r.includes("administration")) return "Defunct / shut down";
  if (r.includes("acquired") || r.includes("folded into") || r.includes("merged into") || r.includes("consolidated") || r.includes("rolled into")) return "Acquired / consolidated";

  // Custom / in-house (an adapter can't solve these — each is bespoke).
  if (r.includes("custom") || r.includes("in-house") || r.includes("in house") || r.includes("bespoke") || r.includes("amazon.jobs") || r.includes("apple.com/careers") || r.includes("careers.google")) return "Custom / in-house";

  // Board-state issues on a SUPPORTED ATS — these companies are already
  // reachable via our adapters; they were skipped because the slug guess
  // wasn't right, the board was empty, or the API was 404 at scan time.
  // Worth flagging separately as a re-investigation opportunity.
  if (r.startsWith("greenhouse") || r.startsWith("lever") || r.startsWith("ashby")) {
    return "Supported ATS — board state issue (re-investigate)";
  }

  // Dormant / unclear — generally out of scope.
  if (r.includes("unclear") || r.includes("unknown") || r.includes("manual review") || r.includes("unidentified") || r.includes("unverified") || r.includes("not hiring") || r.includes("dormant") || r.includes("not discoverable") || r.includes("not accessible") || r.includes("removed") || r.includes("deactivated") || r.includes("not found")) {
    return "Unclear / dormant / needs review";
  }

  if (r === "n/a" || r === "na" || r === "" || r === "-") return "Unspecified";

  return "Other";
}

const unsupportedRowRe = /^[\s>*-]*\s*([^—–-]+?)\s+[—–-]\s+([^—–-]+?)(?:\s+[—–-]\s+(.+))?$/;

for (const file of unsupportedFiles) {
  const cat = file.replace(/\.md$/, "");
  const content = fs.readFileSync(path.join(UNSUPPORTED_DIR, file), "utf8");
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    if (!line.startsWith("-") && !line.startsWith("*")) continue;
    const m = line.match(unsupportedRowRe);
    if (!m) continue;
    const company = m[1].trim();
    const rawAts = m[2].trim();
    const evidence = (m[3] ?? "").trim();
    const canonical = canonicaliseAtsLabel(rawAts);
    if (!unsupportedByAts.has(canonical)) unsupportedByAts.set(canonical, []);
    unsupportedByAts.get(canonical).push({ company, rawAts, evidence, category: cat });
  }
}

const unsupportedTotal = [...unsupportedByAts.values()].reduce((s, arr) => s + arr.length, 0);
const sortedUnsupportedAts = [...unsupportedByAts.entries()].sort((a, b) => b[1].length - a[1].length);

// ── Emit summary ──
const ts = new Date().toISOString().slice(0, 10);
let summary = `# Catalog-builder — Final Merge Summary

Generated: ${ts}
Source: \`catalog-builder/staging/\` (${stagingFiles.length} category files) + \`catalog-builder/unsupported/\` (${unsupportedFiles.length} category files)

## Headline numbers

- **Total verified entries written to \`catalog-builder/final-catalog.yaml\`:** ${sorted.length}
  - Greenhouse: ${atsCounts.greenhouse}
  - Lever: ${atsCounts.lever}
  - Ashby: ${atsCounts.ashby}
- **Total companies on unsupported ATSes logged:** ${unsupportedTotal}
- Existing seed entries in \`companies-catalog.yaml\`: ${liveSlugs.size} (Anthropic / Cloudflare / GitLab / Netlify / PostHog)
- Catalog after merge: ${liveSlugs.size + sorted.length} total entries

## Per-category breakdown (staging)

| Category | Input | Kept | Invalid | Within-staging dupes | Seed dupes |
|---|---:|---:|---:|---:|---:|
`;
const categories = Object.keys(perCategoryCount).sort();
for (const cat of categories) {
  const c = perCategoryCount[cat];
  summary += `| \`${cat}\` | ${c.input} | ${c.kept} | ${c.droppedInvalid} | ${c.droppedDupe} | ${c.droppedSeed} |\n`;
}

summary += `\n## Unsupported ATSes — Phase 14.5 prioritisation signal

The orchestrator agents logged every company they couldn't add because the company uses a non-supported ATS. Grouping these by ATS host gives a data-driven answer to "which ATS should Job Matrix support next?" — the larger the group, the more catalog entries we'd unlock.

`;
if (sortedUnsupportedAts.length === 0) {
  summary += "_No unsupported entries logged._\n";
} else {
  summary += `| Rank | ATS host | Companies | Unlock value |\n|---:|---|---:|---|\n`;
  let rank = 1;
  for (const [ats, entries] of sortedUnsupportedAts) {
    const pct = ((entries.length / unsupportedTotal) * 100).toFixed(1);
    summary += `| ${rank++} | **${ats}** | ${entries.length} | ${pct}% of unsupported pool |\n`;
  }
  summary += `\n### Top 3 — sample companies\n\n`;
  rank = 1;
  for (const [ats, entries] of sortedUnsupportedAts.slice(0, 3)) {
    summary += `**${rank++}. ${ats}** (${entries.length} companies)\n\n`;
    const samples = entries.slice(0, 12);
    for (const s of samples) {
      const cat = s.category ? ` _(${s.category})_` : "";
      summary += `- ${s.company}${cat}\n`;
    }
    if (entries.length > 12) summary += `- _…and ${entries.length - 12} more._\n`;
    summary += `\n`;
  }
}

if (droppedInvalid.length) {
  summary += `\n## Invalid entries dropped during merge (${droppedInvalid.length})\n\n`;
  for (const e of droppedInvalid.slice(0, 50)) summary += `- ${e}\n`;
  if (droppedInvalid.length > 50) summary += `- _…and ${droppedInvalid.length - 50} more._\n`;
}
if (droppedDupeWithinStaging.length) {
  summary += `\n## Within-staging duplicates dropped (${droppedDupeWithinStaging.length})\n\n`;
  for (const e of droppedDupeWithinStaging.slice(0, 50)) summary += `- ${e}\n`;
  if (droppedDupeWithinStaging.length > 50) summary += `- _…and ${droppedDupeWithinStaging.length - 50} more._\n`;
}
if (droppedDupeWithSeed.length) {
  summary += `\n## Against-seed duplicates dropped (${droppedDupeWithSeed.length})\n\n`;
  for (const e of droppedDupeWithSeed.slice(0, 50)) summary += `- ${e}\n`;
}

summary += `\n---

_Generated by \`catalog-builder/merge.mjs\`. Inputs: \`catalog-builder/staging/*.yaml\` + \`catalog-builder/unsupported/*.md\`. Outputs: \`catalog-builder/final-catalog.yaml\` + this file._
`;

fs.writeFileSync(OUT_SUMMARY, summary, "utf8");
console.log(`Wrote ${OUT_SUMMARY}`);
