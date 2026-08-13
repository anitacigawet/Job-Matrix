/**
 * server/services/briefings.ts
 *
 * Orchestrator for NotebookLM-powered briefings (the daily/weekly/on-demand
 * audio + infographic + text outputs documented in ROADMAP.md).
 *
 * Per-briefing flow:
 *   1. Gather context from the local DB (varies by briefingType)
 *   2. Serialize the context to a temp markdown file
 *   3. Insert a briefings row in "generating" state
 *   4. Spawn server/notebooklm/run.py with a JSON config on stdin
 *   5. On success: persist mediaPath / textContent to the row, mark "complete"
 *   6. On failure: mark "failed" with errorMessage
 *
 * The Python subprocess uses the unofficial notebooklm-py library — see
 * server/notebooklm/REFERENCE_NOTES.md for the auth and rate-limit story.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { and, desc, eq } from "drizzle-orm";
import {
  appliedJobs,
  briefings,
  jobScanHistory,
  trackedJobs,
  userJobTitles,
  userProfiles,
  type Briefing,
  type InsertBriefing,
} from "../../drizzle/schema";
import { getDb, LOCAL_USER_ID } from "../db";
import { ENV } from "../_core/env";
import {
  ensurePythonVenv,
  getCleanPythonEnv,
  getVenvPython,
} from "../python_manager";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUN_PY = path.resolve(__dirname, "..", "notebooklm", "run.py");

// ── briefing-type taxonomy ───────────────────────────────────────────

export type BriefingType = NonNullable<Briefing["briefingType"]>;

type ArtifactKind = "audio" | "video" | "infographic" | "text";

interface BriefingSpec {
  type: BriefingType;
  kind: ArtifactKind;
  promptFile: string;
  notebookTitle: (now: Date) => string;
  defaultTitle: (now: Date) => string;
  studio?: Record<string, string>;
  // Optional per-type metadata. For per-job briefings the caller supplies a
  // jobId via the generate() opts; this lets the context gatherer find it.
  requiresJobId?: boolean;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const BRIEFING_SPECS: Record<BriefingType, BriefingSpec> = {
  daily_coach_audio: {
    type: "daily_coach_audio",
    kind: "audio",
    promptFile: "daily_coach_audio.md",
    notebookTitle: (n) => `Daily Coach Briefing — ${isoDate(n)}`,
    defaultTitle: (n) => `Daily Coach Briefing — ${isoDate(n)}`,
    studio: { audio_format: "DEEP_DIVE", audio_length: "DEFAULT", language: "en" },
  },
  weekly_market_audio: {
    type: "weekly_market_audio",
    kind: "audio",
    promptFile: "weekly_market_audio.md",
    notebookTitle: (n) => `Weekly Market Pulse — ${isoDate(n)}`,
    defaultTitle: (n) => `Weekly Market Pulse — ${isoDate(n)}`,
    studio: { audio_format: "BRIEF", audio_length: "DEFAULT", language: "en" },
  },
  interview_prep_audio: {
    type: "interview_prep_audio",
    kind: "audio",
    promptFile: "interview_prep_audio.md",
    notebookTitle: (n) => `Interview Prep — ${isoDate(n)}`,
    defaultTitle: (n) => `Interview Prep — ${isoDate(n)}`,
    studio: { audio_format: "DEEP_DIVE", audio_length: "DEFAULT", language: "en" },
    requiresJobId: true,
  },
  resume_critique_audio: {
    type: "resume_critique_audio",
    kind: "audio",
    promptFile: "resume_critique_audio.md",
    notebookTitle: (n) => `Resume Critique — ${isoDate(n)}`,
    defaultTitle: (n) => `Resume Critique — ${isoDate(n)}`,
    studio: { audio_format: "CRITIQUE", audio_length: "DEFAULT", language: "en" },
  },
  career_debate_audio: {
    type: "career_debate_audio",
    kind: "audio",
    promptFile: "career_debate_audio.md",
    notebookTitle: (n) => `Career Direction Debate — ${isoDate(n)}`,
    defaultTitle: (n) => `Career Direction Debate — ${isoDate(n)}`,
    studio: { audio_format: "DEBATE", audio_length: "LONG", language: "en" },
  },
  daily_dashboard_infographic: {
    type: "daily_dashboard_infographic",
    kind: "infographic",
    promptFile: "daily_dashboard_infographic.md",
    notebookTitle: (n) => `Daily Dashboard — ${isoDate(n)}`,
    defaultTitle: (n) => `Daily Dashboard — ${isoDate(n)}`,
    studio: {
      orientation: "PORTRAIT",
      detail_level: "STANDARD",
      style: "BENTO_GRID",
      language: "en",
    },
  },
  funnel_infographic: {
    type: "funnel_infographic",
    kind: "infographic",
    promptFile: "funnel_infographic.md",
    notebookTitle: (n) => `Search Funnel — ${isoDate(n)}`,
    defaultTitle: (n) => `Search Funnel — ${isoDate(n)}`,
    studio: {
      orientation: "LANDSCAPE",
      detail_level: "DETAILED",
      style: "INSTRUCTIONAL",
      language: "en",
    },
  },
  application_status_infographic: {
    type: "application_status_infographic",
    kind: "infographic",
    promptFile: "application_status_infographic.md",
    notebookTitle: (n) => `Application Status Board — ${isoDate(n)}`,
    defaultTitle: (n) => `Application Status Board — ${isoDate(n)}`,
    studio: {
      orientation: "LANDSCAPE",
      detail_level: "DETAILED",
      style: "BENTO_GRID",
      language: "en",
    },
  },
  pre_application_brief: {
    type: "pre_application_brief",
    kind: "text",
    promptFile: "pre_application_brief.md",
    notebookTitle: (n) => `Pre-Application Brief — ${isoDate(n)}`,
    defaultTitle: (n) => `Pre-Application Brief — ${isoDate(n)}`,
    requiresJobId: true,
  },
  monthly_retrospective: {
    type: "monthly_retrospective",
    kind: "text",
    promptFile: "monthly_retrospective.md",
    notebookTitle: (n) => `Monthly Retrospective — ${isoDate(n)}`,
    defaultTitle: (n) => `Monthly Retrospective — ${isoDate(n)}`,
  },
  career_mindmap: {
    type: "career_mindmap",
    kind: "text",
    promptFile: "career_mindmap.md",
    notebookTitle: (n) => `Career Path Mind Map — ${isoDate(n)}`,
    defaultTitle: (n) => `Career Path Mind Map — ${isoDate(n)}`,
  },
  interview_flashcards: {
    type: "interview_flashcards",
    kind: "text",
    promptFile: "interview_flashcards.md",
    notebookTitle: (n) => `Interview Flashcards — ${isoDate(n)}`,
    defaultTitle: (n) => `Interview Flashcards — ${isoDate(n)}`,
    requiresJobId: true,
  },
  interview_quiz: {
    type: "interview_quiz",
    kind: "text",
    promptFile: "interview_quiz.md",
    notebookTitle: (n) => `Interview Quiz — ${isoDate(n)}`,
    defaultTitle: (n) => `Interview Quiz — ${isoDate(n)}`,
    requiresJobId: true,
  },
};

// ── storage paths ────────────────────────────────────────────────────

function briefingsRoot(): string {
  const dataDir = path.dirname(ENV.databasePath);
  return path.join(dataDir, "briefings");
}

export function getBriefingsMediaDir(kind: "audio" | "image" | "video"): string {
  const dir = path.join(briefingsRoot(), kind);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function mediaTypeFor(kind: ArtifactKind): "audio" | "image" | "video" | null {
  if (kind === "audio") return "audio";
  if (kind === "video") return "video";
  if (kind === "infographic") return "image";
  return null;
}

function extensionFor(kind: ArtifactKind): string {
  if (kind === "audio") return "mp4";
  if (kind === "video") return "mp4";
  if (kind === "infographic") return "png";
  return "";
}

// ── context gathering ────────────────────────────────────────────────

interface GeneratedContext {
  markdown: string;
  relatedAppliedJobId?: number | null;
  relatedTrackedJobId?: number | null;
  inlineMetadata: Record<string, unknown>;
}

async function loadProfileSummary(userId: number): Promise<string> {
  const profile = await (await getDb()).select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  const titles = await (await getDb())
    .select()
    .from(userJobTitles)
    .where(and(eq(userJobTitles.userId, userId), eq(userJobTitles.isActive, 1)));
  if (!profile.length) {
    return "## User Profile\n\n(No profile has been configured yet.)\n";
  }
  const p = profile[0];
  const lines: string[] = ["## User Profile", ""];
  lines.push(`- Location: ${p.city}, ${p.state}`);
  lines.push(`- Remote preference: ${p.remotePreference}`);
  lines.push(`- Search radius: ${p.searchRadiusMiles} miles`);
  lines.push(`- Willing to relocate: ${p.willingToRelocate ? "yes" : "no"}`);
  lines.push(`- Education: ${p.educationLevel}`);
  lines.push(`- Years of experience: ${p.yearsExperience}`);
  if (p.salaryFilterEnabled && p.minSalary) {
    lines.push(`- Minimum salary requested: $${p.minSalary.toLocaleString()}`);
  }
  if (titles.length) {
    lines.push(`- Active target titles: ${titles.map((t) => t.jobTitle).join(", ")}`);
  }
  if (p.skillsRaw) {
    lines.push("");
    lines.push("### Skills (user-described)");
    lines.push(p.skillsRaw);
  }
  return lines.join("\n") + "\n";
}

async function loadRecentTrackedJobs(userId: number, sinceHours: number, limit = 50): Promise<string> {
  const cutoff = new Date(Date.now() - sinceHours * 3600 * 1000);
  const rows = await (await getDb()).select().from(trackedJobs).where(eq(trackedJobs.userId, userId));
  const recent = rows
    .filter((r) => r.firstSeenAt && r.firstSeenAt >= cutoff)
    .sort((a, b) => {
      const fa = a.aiAnalysis?.fitScore ?? -1;
      const fb = b.aiAnalysis?.fitScore ?? -1;
      return fb - fa;
    })
    .slice(0, limit);
  if (!recent.length) {
    return `## Recent listings (last ${sinceHours}h)\n\n(No new listings in this window.)\n`;
  }
  const lines: string[] = [`## Recent listings (last ${sinceHours}h)`, ""];
  for (const j of recent) {
    const fit = j.aiAnalysis?.fitScore ?? null;
    const salaryRange =
      j.salaryMin && j.salaryMax
        ? `$${j.salaryMin.toLocaleString()}–$${j.salaryMax.toLocaleString()}${j.salaryInterval ? "/" + j.salaryInterval : ""}`
        : "(salary not posted)";
    lines.push(
      `- **${j.title}** at ${j.company} (${j.location || "remote / unspecified"}) — ${salaryRange}${
        fit != null ? ` · fit ${fit}%` : ""
      } · platform ${j.platform}${j.aiAnalysis?.eligible === false ? " · INELIGIBLE: " + (j.aiAnalysis.reason ?? "") : ""}`,
    );
  }
  return lines.join("\n") + "\n";
}

async function loadAppliedJobsSummary(userId: number): Promise<string> {
  const rows = await (await getDb()).select().from(appliedJobs).where(eq(appliedJobs.userId, userId));
  if (!rows.length) return "## Applied jobs\n\n(No active applications.)\n";
  const byStatus = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byStatus.get(r.applicationStatus) ?? [];
    arr.push(r);
    byStatus.set(r.applicationStatus, arr);
  }
  const lines: string[] = ["## Applied jobs", ""];
  for (const [status, group] of Array.from(byStatus.entries())) {
    lines.push(`### ${status} (${group.length})`);
    for (const j of group) {
      const days = j.appliedAt
        ? Math.floor((Date.now() - j.appliedAt.getTime()) / 86_400_000)
        : null;
      lines.push(
        `- **${j.title}** at ${j.company} — applied ${days != null ? `${days} day${days === 1 ? "" : "s"} ago` : "recently"}${
          j.notes ? ` · notes: ${j.notes.replace(/\s+/g, " ").slice(0, 200)}` : ""
        }`,
      );
    }
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

async function loadScanHistory(userId: number, sinceHours: number): Promise<string> {
  const rows = await (await getDb()).select().from(jobScanHistory).where(eq(jobScanHistory.userId, userId));
  const cutoff = new Date(Date.now() - sinceHours * 3600 * 1000);
  const recent = rows.filter((r) => r.startedAt >= cutoff);
  if (!recent.length) return `## Scan history (last ${sinceHours}h)\n\n(No scans in this window.)\n`;
  const lines: string[] = [`## Scan history (last ${sinceHours}h)`, ""];
  for (const s of recent) {
    lines.push(
      `- ${s.scanType} on ${s.platform} — terms “${s.searchTerms}” @ ${s.location} → ${s.totalJobsFound} found, ${s.newJobsFound} new · status ${s.status}`,
    );
  }
  return lines.join("\n") + "\n";
}

async function gatherContext(
  type: BriefingType,
  userId: number,
  opts: { jobId?: number; now?: Date } = {},
): Promise<GeneratedContext> {
  const now = opts.now ?? new Date();
  const spec = BRIEFING_SPECS[type];
  const head = `# Briefing context — ${spec.defaultTitle(now)}\n\nGenerated ${now.toISOString()} for the local user.\n\n`;
  const profileMd = await loadProfileSummary(userId);

  if (type === "daily_coach_audio" || type === "daily_dashboard_infographic") {
    return {
      markdown:
        head +
        profileMd +
        "\n" +
        (await loadRecentTrackedJobs(userId, 24)) +
        "\n" +
        (await loadAppliedJobsSummary(userId)) +
        "\n" +
        (await loadScanHistory(userId, 24)),
      inlineMetadata: { windowHours: 24 },
    };
  }

  if (type === "weekly_market_audio" || type === "funnel_infographic") {
    return {
      markdown:
        head +
        profileMd +
        "\n" +
        (await loadRecentTrackedJobs(userId, 24 * 7, 100)) +
        "\n" +
        (await loadAppliedJobsSummary(userId)) +
        "\n" +
        (await loadScanHistory(userId, 24 * 7)),
      inlineMetadata: { windowHours: 168 },
    };
  }

  if (type === "application_status_infographic") {
    return {
      markdown: head + profileMd + "\n" + (await loadAppliedJobsSummary(userId)),
      inlineMetadata: {},
    };
  }

  if (type === "monthly_retrospective" || type === "career_mindmap") {
    return {
      markdown:
        head +
        profileMd +
        "\n" +
        (await loadRecentTrackedJobs(userId, 24 * 30, 200)) +
        "\n" +
        (await loadAppliedJobsSummary(userId)) +
        "\n" +
        (await loadScanHistory(userId, 24 * 30)),
      inlineMetadata: { windowHours: 720 },
    };
  }

  if (type === "resume_critique_audio") {
    const profile = await (await getDb())
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    const resume = profile[0]?.resumeText ?? "";
    return {
      markdown:
        head +
        profileMd +
        "\n## Resume (user-supplied text)\n\n" +
        (resume.trim() || "(No resume text saved. The user has not pasted their résumé into the profile yet.)") +
        "\n",
      inlineMetadata: { hasResume: Boolean(resume.trim()) },
    };
  }

  if (type === "career_debate_audio") {
    return {
      markdown:
        head +
        profileMd +
        "\n" +
        (await loadRecentTrackedJobs(userId, 24 * 14, 50)) +
        "\n" +
        (await loadAppliedJobsSummary(userId)),
      inlineMetadata: {},
    };
  }

  // Per-job briefings
  if (spec.requiresJobId) {
    if (!opts.jobId) {
      throw new Error(`Briefing type ${type} requires a jobId`);
    }
    const applied = await (await getDb())
      .select()
      .from(appliedJobs)
      .where(and(eq(appliedJobs.id, opts.jobId), eq(appliedJobs.userId, userId)))
      .limit(1);
    const tracked = applied.length
      ? []
      : await (await getDb())
          .select()
          .from(trackedJobs)
          .where(and(eq(trackedJobs.id, opts.jobId), eq(trackedJobs.userId, userId)))
          .limit(1);
    const job = applied[0] ?? tracked[0];
    if (!job) throw new Error(`Job ${opts.jobId} not found for user ${userId}`);
    const jobMd = [
      "## Target role",
      "",
      `- Title: ${job.title}`,
      `- Company: ${job.company}`,
      `- Platform: ${job.platform}`,
      `- Location: ${job.location ?? "(unspecified)"}`,
      job.salaryMin && job.salaryMax
        ? `- Posted salary: $${job.salaryMin.toLocaleString()}–$${job.salaryMax.toLocaleString()}`
        : null,
      "",
      "### Description",
      "",
      job.description?.slice(0, 8000) ?? "(no description text available)",
    ]
      .filter((x) => x !== null)
      .join("\n");
    return {
      markdown: head + profileMd + "\n" + jobMd + "\n",
      relatedAppliedJobId: applied[0]?.id ?? null,
      relatedTrackedJobId: tracked[0]?.id ?? null,
      inlineMetadata: { jobTitle: job.title, company: job.company },
    };
  }

  // Default
  return {
    markdown: head + profileMd,
    inlineMetadata: {},
  };
}

// ── Python subprocess ────────────────────────────────────────────────

interface PythonResult {
  status: string;
  details?: string;
  notebook_id?: string;
  task_id?: string;
  downloaded_path?: string | null;
  text_content?: string;
  is_complete?: boolean;
  auth?: unknown;
  relogin?: unknown;
}

async function runPython(payload: Record<string, unknown>, timeoutMs = 30 * 60 * 1000): Promise<PythonResult> {
  // Make sure the venv has notebooklm-py available.
  await ensurePythonVenv();
  const py = getVenvPython();
  const env = getCleanPythonEnv();

  return new Promise((resolve, reject) => {
    const proc = spawn(py, [RUN_PY], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Python subprocess timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      const lines = stdout.trim().split("\n").filter(Boolean);
      const lastLine = lines[lines.length - 1] ?? "";
      try {
        const parsed = JSON.parse(lastLine) as PythonResult;
        if (code !== 0 && parsed.status !== "ok" && parsed.status !== "timeout" && parsed.status !== "silent_rejection") {
          console.error("[briefings] python stderr:", stderr.slice(-2000));
        }
        resolve(parsed);
      } catch (err) {
        console.error("[briefings] failed to parse python stdout:", err);
        console.error("[briefings] stdout:", stdout.slice(-2000));
        console.error("[briefings] stderr:", stderr.slice(-2000));
        reject(new Error(`Python output not parseable as JSON (exit ${code}): ${stderr.slice(-500)}`));
      }
    });

    proc.stdin?.write(JSON.stringify(payload));
    proc.stdin?.end();
  });
}

// ── public API ───────────────────────────────────────────────────────

export interface GenerateOptions {
  userId?: number;
  jobId?: number;
  customTitle?: string;
  now?: Date;
}

/**
 * Kick off a briefing generation. Returns the just-created "generating" row
 * synchronously; the Python subprocess runs in the background and updates the
 * row to "complete" or "failed" when it finishes. The UI polls by ID.
 *
 * NotebookLM audio generation can take 20+ minutes, so we never block the
 * HTTP request on the subprocess.
 */
export async function startBriefingGeneration(
  type: BriefingType,
  opts: GenerateOptions = {},
): Promise<Briefing> {
  const userId = opts.userId ?? LOCAL_USER_ID;
  const now = opts.now ?? new Date();
  const spec = BRIEFING_SPECS[type];
  if (!spec) throw new Error(`Unknown briefing type: ${type}`);

  // 1. Gather context (fast, DB queries only)
  const ctx = await gatherContext(type, userId, { jobId: opts.jobId, now });

  // 2. Insert "generating" row
  const title = opts.customTitle ?? spec.defaultTitle(now);
  const insert: InsertBriefing = {
    userId,
    briefingType: type,
    status: "generating",
    title,
    relatedAppliedJobId: ctx.relatedAppliedJobId ?? null,
    relatedTrackedJobId: ctx.relatedTrackedJobId ?? null,
    contextSnapshot: ctx.markdown,
    metadata: {
      studio: spec.studio ?? null,
      promptFile: spec.promptFile,
      ...ctx.inlineMetadata,
    },
    startedAt: now,
  };
  const inserted = await (await getDb()).insert(briefings).values(insert).returning();
  const briefing = inserted[0];

  // 3. Fire-and-forget the long-running Python work
  void runBriefingGeneration(briefing.id, type, spec, ctx, now).catch((err) => {
    console.error(`[briefings] background generation for #${briefing.id} threw:`, err);
  });

  return briefing;
}

async function runBriefingGeneration(
  briefingId: number,
  type: BriefingType,
  spec: BriefingSpec,
  ctx: GeneratedContext,
  now: Date,
): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jobmatrix-briefing-"));
  const contextPath = path.join(tmpDir, `context-${briefingId}.md`);
  fs.writeFileSync(contextPath, ctx.markdown, "utf-8");

  let payload: Record<string, unknown>;

  if (spec.kind === "text") {
    payload = {
      action: "generate_text",
      notebook_title: spec.notebookTitle(now),
      context_file: contextPath,
      prompt_file: spec.promptFile,
    };
  } else {
    const mediaDir = getBriefingsMediaDir(mediaTypeFor(spec.kind) as "audio" | "video" | "image");
    const ext = extensionFor(spec.kind);
    const mediaPath = path.join(mediaDir, `${type}_${briefingId}_${isoDate(now)}.${ext}`);
    payload = {
      action: "generate_studio_artifact",
      artifact_kind: spec.kind,
      notebook_title: spec.notebookTitle(now),
      context_file: contextPath,
      prompt_file: spec.promptFile,
      output_path: mediaPath,
      studio: spec.studio ?? {},
    };
  }

  try {
    const result = await runPython(payload);
    const completedAt = new Date();

    if (result.status === "ok") {
      const update: Partial<InsertBriefing> = {
        status: "complete",
        completedAt,
        notebookId: result.notebook_id ?? null,
        taskId: result.task_id ?? null,
      };
      if (spec.kind === "text") {
        update.textContent = result.text_content ?? "";
      } else if (result.downloaded_path) {
        update.mediaPath = path.relative(path.dirname(ENV.databasePath), result.downloaded_path);
        update.mediaType = mediaTypeFor(spec.kind);
      }
      await (await getDb()).update(briefings).set(update).where(eq(briefings.id, briefingId));
    } else {
      const msg =
        result.status === "auth_expired"
          ? "NotebookLM session expired. Re-authenticate from the Settings page."
          : result.status === "silent_rejection"
            ? "NotebookLM silently rejected the generation. Try again in a few minutes."
            : result.status === "timeout"
              ? "NotebookLM did not finish generating the artifact within the timeout."
              : `Generation failed: ${result.details ?? result.status}`;
      await (await getDb())
        .update(briefings)
        .set({
          status: "failed",
          completedAt,
          errorMessage: msg,
          notebookId: result.notebook_id ?? null,
          taskId: result.task_id ?? null,
        })
        .where(eq(briefings.id, briefingId));
    }
  } catch (err: any) {
    await (await getDb())
      .update(briefings)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: `Subprocess error: ${err?.message ?? String(err)}`,
      })
      .where(eq(briefings.id, briefingId));
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

export async function listBriefings(userId = LOCAL_USER_ID, limit = 100): Promise<Briefing[]> {
  return (await getDb())
    .select()
    .from(briefings)
    .where(eq(briefings.userId, userId))
    .orderBy(desc(briefings.createdAt))
    .limit(limit);
}

export async function getBriefing(id: number, userId = LOCAL_USER_ID): Promise<Briefing | null> {
  const rows = await (await getDb())
    .select()
    .from(briefings)
    .where(and(eq(briefings.id, id), eq(briefings.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Recent briefing activity for the NotebookLM auth-card health surface.
 * Returns aggregate counts + a small slice of recent failures so the UI
 * can warn the user about rate-limit / silent-rejection spikes before they
 * hit one mid-generation.
 */
export async function getRecentBriefingActivity(
  userId: number = LOCAL_USER_ID,
  windowHours: number = 168, // 7 days
): Promise<{
  windowHours: number;
  total: number;
  byStatus: Record<string, number>;
  recentFailures: Array<{
    id: number;
    type: string;
    title: string;
    errorMessage: string | null;
    completedAt: Date | null;
  }>;
}> {
  const cutoff = new Date(Date.now() - windowHours * 3600 * 1000);
  const db = await getDb();
  const rows = await db
    .select()
    .from(briefings)
    .where(eq(briefings.userId, userId));
  const inWindow = rows.filter((r) => r.createdAt && r.createdAt >= cutoff);

  const byStatus: Record<string, number> = {
    pending: 0,
    generating: 0,
    complete: 0,
    failed: 0,
  };
  for (const r of inWindow) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }

  const recentFailures = inWindow
    .filter((r) => r.status === "failed")
    .sort((a, b) => {
      const ta = a.completedAt?.getTime() ?? 0;
      const tb = b.completedAt?.getTime() ?? 0;
      return tb - ta;
    })
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      type: r.briefingType,
      title: r.title,
      errorMessage: r.errorMessage,
      completedAt: r.completedAt,
    }));

  return {
    windowHours,
    total: inWindow.length,
    byStatus,
    recentFailures,
  };
}

export async function deleteBriefing(id: number, userId = LOCAL_USER_ID): Promise<boolean> {
  const target = await getBriefing(id, userId);
  if (!target) return false;
  // Best-effort delete media file
  if (target.mediaPath) {
    const abs = path.resolve(path.dirname(ENV.databasePath), target.mediaPath);
    try {
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch (err) {
      console.warn(`[briefings] could not remove media file for #${id}:`, err);
    }
  }
  await (await getDb()).delete(briefings).where(and(eq(briefings.id, id), eq(briefings.userId, userId)));
  return true;
}

// ── auth status passthrough (used by the Settings card) ──────────────

export async function checkNotebookLmAuth(force = false): Promise<unknown> {
  const result = await runPython({ action: "check_auth", force }, 30_000);
  return result.auth ?? result;
}

export async function spawnNotebookLmRelogin(): Promise<unknown> {
  const result = await runPython({ action: "spawn_relogin" }, 30_000);
  return result.relogin ?? result;
}

export async function confirmNotebookLmRelogin(timeoutSeconds = 60): Promise<unknown> {
  const result = await runPython(
    { action: "confirm_relogin", timeout_seconds: timeoutSeconds },
    (timeoutSeconds + 30) * 1000,
  );
  return result.relogin ?? result;
}

export async function relogStatus(): Promise<unknown> {
  const result = await runPython({ action: "relogin_status" }, 15_000);
  return result.relogin ?? result;
}
