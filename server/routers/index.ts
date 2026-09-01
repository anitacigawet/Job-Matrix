/** Personalized workflows composed from the scan, job, and stats routers. */

import { router } from "../_core/trpc";
import { scanRouter } from "./scan";
import { jobsRouter } from "./jobs";
import { statsRouter } from "./stats";

export const personalizedRouter = router({
  // Scan operations
  runGlobalSearch: scanRouter.runGlobalSearch,
  runAIAnalysis: scanRouter.runAIAnalysis,
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
  getUserProfile: statsRouter.getUserProfile,
});
