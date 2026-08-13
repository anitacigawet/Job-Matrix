/**
 * Personalized Router - Composed from sub-routers
 * 
 * The retired 1500-line legacy router was split into:
 * - scan.ts: Global Search, AI Analysis, Test, Clean, Progress, Pause/Resume/Cancel
 * - jobs.ts: Eligible jobs, Applied jobs, Bulk actions, Export, Detail
 * - stats.ts: Counts, timestamps, system stats, legacy scan, user profile
 */

import { router } from "../_core/trpc";
import { scanRouter } from "./scan";
import { jobsRouter } from "./jobs";
import { statsRouter } from "./stats";

export const personalizedRouter = router({
  // Scan operations
  runGlobalSearch: scanRouter.runGlobalSearch,
  runAIAnalysis: scanRouter.runAIAnalysis,
  runAIAnalysisTest: scanRouter.runAIAnalysisTest,
  cleanDatabase: scanRouter.cleanDatabase,
  getCurrentScanProgress: scanRouter.getCurrentScanProgress,
  pauseOperation: scanRouter.pauseOperation,
  resumeOperation: scanRouter.resumeOperation,
  cancelOperation: scanRouter.cancelOperation,
  runFitScoring: scanRouter.runFitScoring,
  nukeEverything: scanRouter.nukeEverything,

  // Job management
  markJobAsApplied: jobsRouter.markJobAsApplied,
  getEligibleJobs: jobsRouter.getEligibleJobs,
  getAppliedJobs: jobsRouter.getAppliedJobs,
  removeAppliedJob: jobsRouter.removeAppliedJob,
  updateApplicationStatus: jobsRouter.updateApplicationStatus,
  bulkMarkApplied: jobsRouter.bulkMarkApplied,
  bulkRejectJobs: jobsRouter.bulkRejectJobs,
  getJobDetail: jobsRouter.getJobDetail,
  exportEligibleJobsCSV: jobsRouter.exportEligibleJobsCSV,
  getDuplicateGroups: jobsRouter.getDuplicateGroups,

  // Stats & queries
  getTotalJobCount: statsRouter.getTotalJobCount,
  getLastGlobalSearch: statsRouter.getLastGlobalSearch,
  getLastAIAnalysis: statsRouter.getLastAIAnalysis,
  getPendingJobCounts: statsRouter.getPendingJobCounts,
  getSystemStats: statsRouter.getSystemStats,
  runPersonalizedScan: statsRouter.runPersonalizedScan,
  getUserProfile: statsRouter.getUserProfile,
});
