type ScoredJob = { aiAnalysis?: unknown };

/** Read current numeric scores and the earlier { overall } representation. */
export function getJobFitScore(job: ScoredJob): number | null {
  const analysis = job.aiAnalysis;
  if (!analysis || typeof analysis !== "object") return null;
  const value = (analysis as { fitScore?: unknown }).fitScore;
  const score =
    value && typeof value === "object"
      ? (value as { overall?: unknown }).overall
      : value;
  return typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100
    ? score
    : null;
}
