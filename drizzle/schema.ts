import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * SQLite schema (was MySQL — converted for local-first deployment).
 * Notes:
 *  - boolean fields use integer with 0/1 (consistent with original code which
 *    treated booleans as ints already).
 *  - timestamps use integer mode "timestamp" (Date <-> unix-seconds).
 *  - "onUpdate" is now app-managed (callers explicitly set updatedAt: new Date()).
 *  - enums become plain text (SQLite has no native enum); the app validates via Zod.
 */

const ts = (name: string) =>
  integer(name, { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull();

const tsNullable = (name: string) => integer(name, { mode: "timestamp" });

// ── users ────────────────────────────────────────────────────────────
// In single-user mode the app keeps one row with id = 1 ("Local User").
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role").$type<"user" | "admin">().notNull().default("admin"),
  onboardingCompleted: integer("onboarding_completed").notNull().default(0),
  createdAt: ts("createdAt"),
  updatedAt: ts("updatedAt"),
  lastSignedIn: ts("lastSignedIn"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── job_preferences ──────────────────────────────────────────────────
export const jobPreferences = sqliteTable("job_preferences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  targetTitles: text("target_titles").notNull(),
  location: text("location").notNull(),
  radiusMiles: integer("radius_miles").notNull().default(50),
  minSalary: integer("min_salary"),
  maxSalary: integer("max_salary"),
  jobType: text("job_type"),
  remoteOnly: integer("remote_only").notNull().default(0),
  monitoringEnabled: integer("monitoring_enabled").notNull().default(1),
  scanIntervalMinutes: integer("scan_interval_minutes").notNull().default(30),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export type JobPreferences = typeof jobPreferences.$inferSelect;
export type InsertJobPreferences = typeof jobPreferences.$inferInsert;

// ── platform_credentials ─────────────────────────────────────────────
export const platformCredentials = sqliteTable("platform_credentials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform")
    .$type<
      | "indeed"
      | "glassdoor"
      | "linkedin"
      | "ziprecruiter"
      | "google"
      | "adzuna"
      | "usajobs"
      | "jooble"
      | "themuse"
      | "remotive"
      | "remoteok"
    >()
    .notNull(),
  cookiesJson: text("cookies_json"),
  cookieString: text("cookie_string"),
  localStorageJson: text("local_storage_json"),
  userAgent: text("user_agent"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export type PlatformCredentials = typeof platformCredentials.$inferSelect;
export type InsertPlatformCredentials = typeof platformCredentials.$inferInsert;

// ── tracked_jobs ─────────────────────────────────────────────────────
export const trackedJobs = sqliteTable("tracked_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform")
    .$type<
      | "indeed"
      | "glassdoor"
      | "linkedin"
      | "ziprecruiter"
      | "google"
      | "adzuna"
      | "usajobs"
      | "jooble"
      | "themuse"
      | "remotive"
      | "remoteok"
    >()
    .notNull(),
  jobId: text("job_id").notNull(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location"),
  city: text("city"),
  state: text("state"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  salaryInterval: text("salary_interval"),
  jobType: text("job_type"),
  description: text("description"),
  jobUrl: text("job_url").notNull(),
  datePosted: text("date_posted"),
  status: text("status")
    .$type<"new" | "viewed" | "applied" | "interested" | "rejected">()
    .notNull()
    .default("new"),
  firstSeenAt: ts("first_seen_at"),
  lastSeenAt: ts("last_seen_at"),
  aiAnalysis: text("ai_analysis", { mode: "json" }).$type<{
    eligible?: boolean;
    reason?: string;
    requiresBachelors?: boolean;
    requiresYearsExperience?: number | null;
    remoteStateRestriction?: string | null;
    isScamOrMLM?: boolean;
    redFlags?: string[];
    confidence?: number;
    analyzedAt?: string;
    fitScore?: number;
    fitBreakdown?: {
      skillsMatch: number;
      educationMatch: number;
      experienceMatch: number;
      locationMatch: number;
      overallNotes: string;
    };
    fitScoredAt?: string;
    duplicateOf?: number;
    duplicatePlatforms?: string[];
  }>(),
});

export type TrackedJob = typeof trackedJobs.$inferSelect;
export type InsertTrackedJob = typeof trackedJobs.$inferInsert;

// ── applied_jobs ─────────────────────────────────────────────────────
export const appliedJobs = sqliteTable("applied_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  trackedJobId: integer("tracked_job_id"),
  platform: text("platform")
    .$type<
      | "indeed"
      | "glassdoor"
      | "linkedin"
      | "ziprecruiter"
      | "google"
      | "adzuna"
      | "usajobs"
      | "jooble"
      | "themuse"
      | "remotive"
      | "remoteok"
    >()
    .notNull(),
  jobId: text("job_id").notNull(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  salaryInterval: text("salary_interval"),
  jobType: text("job_type"),
  description: text("description"),
  jobUrl: text("job_url").notNull(),
  applicationStatus: text("application_status")
    .$type<
      "applied" | "interview" | "offer" | "accepted" | "rejected" | "ghosted"
    >()
    .notNull()
    .default("applied"),
  firstTrackedAt: integer("first_tracked_at", { mode: "timestamp" }).notNull(),
  appliedAt: ts("applied_at"),
  interviewAt: tsNullable("interview_at"),
  offerAt: tsNullable("offer_at"),
  resolvedAt: tsNullable("resolved_at"),
  notes: text("notes"),
});

export type AppliedJob = typeof appliedJobs.$inferSelect;
export type InsertAppliedJob = typeof appliedJobs.$inferInsert;

// ── job_scan_history ─────────────────────────────────────────────────
export const jobScanHistory = sqliteTable("job_scan_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform")
    .$type<
      | "indeed"
      | "glassdoor"
      | "linkedin"
      | "ziprecruiter"
      | "google"
      | "adzuna"
      | "usajobs"
      | "jooble"
      | "themuse"
      | "remotive"
      | "remoteok"
      | "multi"
    >()
    .notNull(),
  scanType: text("scan_type")
    .$type<"broad_search" | "ai_analysis" | "clean_database" | "fit_scoring">()
    .notNull(),
  searchTerms: text("search_terms").notNull(),
  location: text("location").notNull(),
  radiusMiles: integer("radius_miles").notNull(),
  totalJobsFound: integer("total_jobs_found").notNull(),
  newJobsFound: integer("new_jobs_found").notNull(),
  status: text("status")
    .$type<"running" | "completed" | "failed">()
    .notNull()
    .default("running"),
  errorMessage: text("error_message"),
  currentPhase: text("current_phase"),
  currentProgress: integer("current_progress"),
  totalProgress: integer("total_progress"),
  progressMessage: text("progress_message"),
  lastProgressUpdate: tsNullable("last_progress_update"),
  completedSearches: text("completed_searches", { mode: "json" }).$type<
    Array<{ title: string; location: string }>
  >(),
  operationPaused: integer("operation_paused", { mode: "boolean" })
    .notNull()
    .default(false),
  operationCancelled: integer("operation_cancelled", { mode: "boolean" })
    .notNull()
    .default(false),
  startedAt: ts("started_at"),
  completedAt: tsNullable("completed_at"),
});

export type JobScanHistory = typeof jobScanHistory.$inferSelect;
export type InsertJobScanHistory = typeof jobScanHistory.$inferInsert;

// ── debug_logs ───────────────────────────────────────────────────────
export const debugLogs = sqliteTable("debug_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  sessionId: text("session_id").notNull(),
  level: text("level")
    .$type<"info" | "success" | "warning" | "error">()
    .notNull(),
  message: text("message").notNull(),
  metadata: text("metadata"),
  createdAt: ts("created_at"),
});

export type DebugLog = typeof debugLogs.$inferSelect;
export type InsertDebugLog = typeof debugLogs.$inferInsert;

// ── user_job_titles ──────────────────────────────────────────────────
export const userJobTitles = sqliteTable("user_job_titles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  jobTitle: text("job_title").notNull(),
  isActive: integer("is_active").notNull().default(1),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export type UserJobTitle = typeof userJobTitles.$inferSelect;
export type InsertUserJobTitle = typeof userJobTitles.$inferInsert;

// ── user_profiles ────────────────────────────────────────────────────
export const userProfiles = sqliteTable("user_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  state: text("state").notNull(),
  city: text("city").notNull(),
  searchRadiusMiles: integer("search_radius_miles").notNull().default(50),
  willingToRelocate: integer("willing_to_relocate").notNull().default(0),
  remotePreference: text("remote_preference")
    .$type<"remote_only" | "hybrid" | "on_site" | "any">()
    .notNull()
    .default("any"),
  educationLevel: text("education_level")
    .$type<
      | "no_degree"
      | "high_school"
      | "associates"
      | "bachelors"
      | "masters"
      | "phd"
    >()
    .notNull()
    .default("no_degree"),
  yearsExperience: text("years_experience")
    .$type<"0-1" | "1-3" | "3-5" | "5-10" | "10+">()
    .notNull()
    .default("0-1"),
  minSalary: integer("min_salary"),
  salaryFilterEnabled: integer("salary_filter_enabled").notNull().default(0),
  skillsRaw: text("skills_raw"),
  skillsParsed: text("skills_parsed", { mode: "json" }).$type<
    Array<{ skill: string; yearsExperience: number; level: string }>
  >(),
  resumeText: text("resume_text"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

// ── application_profiles ─────────────────────────────────────────────
// Optional defaults used by the browser-assisted application workflow. Search
// preferences stay in user_profiles; this row contains only answers that are
// relevant while filling an employer's application form.
export const applicationProfiles = sqliteTable("application_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  fullName: text("full_name"),
  email: text("email"),
  phone: text("phone"),
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  availability: text("availability"),
  earliestStartDate: text("earliest_start_date"),
  workAuthorized: integer("work_authorized", { mode: "boolean" }),
  sponsorshipRequired: integer("sponsorship_required", { mode: "boolean" }),
  transportation: text("transportation"),
  desiredPay: text("desired_pay"),
  resumeFileName: text("resume_file_name"),
  resumeFilePath: text("resume_file_path"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export type ApplicationProfile = typeof applicationProfiles.$inferSelect;
export type InsertApplicationProfile = typeof applicationProfiles.$inferInsert;

// ── invite_codes ─────────────────────────────────────────────────────
// Kept for schema compatibility; not exposed in single-user mode.
export const inviteCodes = sqliteTable("invite_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  usedBy: integer("used_by").references(() => users.id, {
    onDelete: "set null",
  }),
  usedAt: tsNullable("used_at"),
  expiresAt: tsNullable("expires_at"),
  maxUses: integer("max_uses").notNull().default(1),
  currentUses: integer("current_uses").notNull().default(0),
  createdAt: ts("created_at"),
});

export type InviteCode = typeof inviteCodes.$inferSelect;
export type InsertInviteCode = typeof inviteCodes.$inferInsert;

// ── user_settings ────────────────────────────────────────────────────
export const userSettings = sqliteTable("user_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  notificationsEnabled: integer("notifications_enabled").notNull().default(1),
  notifyOnNewEligible: integer("notify_on_new_eligible").notNull().default(1),
  notifyOnScanComplete: integer("notify_on_scan_complete").notNull().default(1),
  notifyOnEmployerResponse: integer("notify_on_employer_response")
    .notNull()
    .default(1),
  notifyDigestFrequency: text("notify_digest_frequency")
    .$type<"immediate" | "daily" | "weekly" | "never">()
    .notNull()
    .default("daily"),
  autoScanEnabled: integer("auto_scan_enabled").notNull().default(0),
  autoScanFrequency: text("auto_scan_frequency")
    .$type<"every_6h" | "every_12h" | "daily" | "every_2d" | "weekly">()
    .notNull()
    .default("daily"),
  autoScanIncludeAI: integer("auto_scan_include_ai").notNull().default(1),
  autoScanLastRun: tsNullable("auto_scan_last_run"),
  autoScanNextRun: tsNullable("auto_scan_next_run"),
  enabledPlatforms: text("enabled_platforms", { mode: "json" })
    .$type<string[]>()
    .default(["indeed"]),
  inboxMonitoringEnabled: integer("inbox_monitoring_enabled")
    .notNull()
    .default(0),
  gmailHistoryId: text("gmail_history_id"),
  inboxLastCheckedAt: tsNullable("inbox_last_checked_at"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = typeof userSettings.$inferInsert;

// ── search_presets ───────────────────────────────────────────────────
export const searchPresets = sqliteTable("search_presets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  jobTitles: text("job_titles", { mode: "json" }).$type<string[]>().notNull(),
  location: text("location").notNull(),
  radiusMiles: integer("radius_miles").notNull().default(50),
  remotePreference: text("remote_preference")
    .$type<"remote_only" | "hybrid" | "on_site" | "any">()
    .notNull()
    .default("any"),
  platforms: text("platforms", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(["indeed"]),
  minSalary: integer("min_salary"),
  jobType: text("job_type"),
  isDefault: integer("is_default").notNull().default(0),
  lastUsedAt: tsNullable("last_used_at"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export type SearchPreset = typeof searchPresets.$inferSelect;
export type InsertSearchPreset = typeof searchPresets.$inferInsert;

// ── application_notes ────────────────────────────────────────────────
export const applicationNotes = sqliteTable("application_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  jobId: integer("job_id").notNull(),
  noteType: text("note_type")
    .$type<
      | "note"
      | "status_change"
      | "interview"
      | "follow_up"
      | "offer"
      | "rejection"
    >()
    .notNull()
    .default("note"),
  content: text("content").notNull(),
  oldStatus: text("old_status"),
  newStatus: text("new_status"),
  createdAt: ts("created_at"),
});

export type ApplicationNote = typeof applicationNotes.$inferSelect;
export type InsertApplicationNote = typeof applicationNotes.$inferInsert;

// ── inbox_messages ───────────────────────────────────────────────────
// Minimal, privacy-conscious record of an incoming employer/Voice event. The
// full email body is classified in memory and discarded; only the short snippet
// and human-readable summary needed by the Responses screen are retained.
export const inboxMessages = sqliteTable("inbox_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  appliedJobId: integer("applied_job_id").references(() => appliedJobs.id, {
    onDelete: "set null",
  }),
  provider: text("provider").$type<"gmail">().notNull().default("gmail"),
  providerMessageId: text("provider_message_id").notNull().unique(),
  providerThreadId: text("provider_thread_id"),
  source: text("source")
    .$type<"email" | "voice_missed_call" | "voice_voicemail">()
    .notNull()
    .default("email"),
  sender: text("sender"),
  senderAddress: text("sender_address"),
  senderPhone: text("sender_phone"),
  subject: text("subject").notNull(),
  snippet: text("snippet"),
  category: text("category")
    .$type<
      | "confirmation"
      | "action_required"
      | "recruiter_reply"
      | "interview"
      | "rejection"
      | "offer"
      | "missed_call"
      | "voicemail"
      | "uncertain"
    >()
    .notNull(),
  summary: text("summary").notNull(),
  matchConfidence: integer("match_confidence").notNull().default(0),
  classificationConfidence: integer("classification_confidence")
    .notNull()
    .default(0),
  needsReview: integer("needs_review", { mode: "boolean" })
    .notNull()
    .default(true),
  receivedAt: integer("received_at", { mode: "timestamp" }).notNull(),
  reviewedAt: tsNullable("reviewed_at"),
  createdAt: ts("created_at"),
});

export type InboxMessage = typeof inboxMessages.$inferSelect;
export type InsertInboxMessage = typeof inboxMessages.$inferInsert;

// ── watched_companies ───────────────────────────────────────────────
// Phase 14 — per-company ATS sources via the catalog at
// companies-catalog.yaml. One row per (user, company-slug) the user has
// added from the catalog. Scan path fans out to each one alongside the
// existing per-platform dispatch. See DECISIONS.md D-020.
export const watchedCompanies = sqliteTable("watched_companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Catalog slug — must match an entry in companies-catalog.yaml at scan time. */
  companySlug: text("company_slug").notNull(),
  addedAt: ts("added_at"),
});

export type WatchedCompany = typeof watchedCompanies.$inferSelect;
export type InsertWatchedCompany = typeof watchedCompanies.$inferInsert;

// ── scraper_health ───────────────────────────────────────────────────
// One row per supported scraper platform. Updated by every scrape attempt
// so the UI can surface honest "Working / Recently failed / Blocked"
// status without users having to read JobSpy library logs.
export const scraperHealth = sqliteTable("scraper_health", {
  platform: text("platform").primaryKey(),
  // Latest results
  lastSuccessAt: tsNullable("last_success_at"),
  lastAttemptAt: tsNullable("last_attempt_at"),
  lastError: text("last_error"),
  // Rolling counters (lifetime since first attempt — cheap and useful)
  totalAttempts: integer("total_attempts").notNull().default(0),
  totalFailures: integer("total_failures").notNull().default(0),
  updatedAt: ts("updated_at"),
});

export type ScraperHealth = typeof scraperHealth.$inferSelect;
export type InsertScraperHealth = typeof scraperHealth.$inferInsert;
