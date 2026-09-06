import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart3, TrendingUp, Target, Clock, CheckCircle2, XCircle,
  Ghost, MessageSquare, Database, Zap, PieChart,
  Calendar, Activity, Star, Award, Globe
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { useSubNav } from "@/components/SubNav";
import { getJobFitScore } from "@/lib/job-fit-score";

export function Analytics() {
  const [, setLocation] = useLocation();
  const { current: subNavTab } = useSubNav();
  const activeTab = subNavTab ?? "pipeline";

  // Fetch all the data we need
  const { data: systemStats } = trpc.personalized.getSystemStats.useQuery();
  const { data: eligibleJobs } = trpc.personalized.getEligibleJobs.useQuery({});
  const { data: appliedJobs } = trpc.personalized.getAppliedJobs.useQuery();
  const { data: pendingCounts } = trpc.personalized.getPendingJobCounts.useQuery();
  const { data: scanHistory } = trpc.indeed.getScanHistory.useQuery();
  const { data: profile } = trpc.onboarding.getProfile.useQuery();
  const { data: jobTitles } = trpc.onboarding.getJobTitles.useQuery();

  // Calculate application pipeline stats
  const pipelineStats = {
    applied: appliedJobs?.filter((j: any) => j.applicationStatus === "applied").length || 0,
    interview: appliedJobs?.filter((j: any) => j.applicationStatus === "interview").length || 0,
    offer: appliedJobs?.filter((j: any) => j.applicationStatus === "offer").length || 0,
    accepted: appliedJobs?.filter((j: any) => j.applicationStatus === "accepted").length || 0,
    rejected: appliedJobs?.filter((j: any) => j.applicationStatus === "rejected").length || 0,
    ghosted: appliedJobs?.filter((j: any) => j.applicationStatus === "ghosted").length || 0,
  };
  const totalApplied = appliedJobs?.length || 0;

  // Calculate conversion rates
  const interviewRate = totalApplied > 0 ? ((pipelineStats.interview + pipelineStats.offer + pipelineStats.accepted) / totalApplied * 100).toFixed(1) : "0";
  const offerRate = totalApplied > 0 ? ((pipelineStats.offer + pipelineStats.accepted) / totalApplied * 100).toFixed(1) : "0";

  // Job type distribution from eligible jobs
  const jobTypeDistribution: Record<string, number> = {};
  eligibleJobs?.forEach((job: any) => {
    const type = job.jobType || "Unknown";
    jobTypeDistribution[type] = (jobTypeDistribution[type] || 0) + 1;
  });

  // Company distribution (top 10)
  const companyDistribution: Record<string, number> = {};
  eligibleJobs?.forEach((job: any) => {
    const company = job.company || "Unknown";
    companyDistribution[company] = (companyDistribution[company] || 0) + 1;
  });
  const topCompanies = Object.entries(companyDistribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  // Scan history stats
  const completedScans = scanHistory?.filter((s: any) => s.status === "completed") || [];
  const totalJobsScanned = completedScans.reduce((sum: number, s: any) => sum + (s.totalJobsFound || 0), 0);
  const totalNewJobs = completedScans.reduce((sum: number, s: any) => sum + (s.newJobsFound || 0), 0);

  // Fit score distribution (histogram buckets: 0-20, 21-40, 41-60, 61-80, 81-100)
  const fitScoreBuckets = [0, 0, 0, 0, 0]; // [0-20, 21-40, 41-60, 61-80, 81-100]
  const fitScoreLabels = ["0-20%", "21-40%", "41-60%", "61-80%", "81-100%"];
  const fitScoreColors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-blue-500", "bg-green-500"];
  let scoredJobCount = 0;
  let avgFitScore = 0;
  eligibleJobs?.forEach((job: any) => {
    const score = getJobFitScore(job);
    if (score != null) {
      scoredJobCount++;
      avgFitScore += score;
      if (score <= 20) fitScoreBuckets[0]++;
      else if (score <= 40) fitScoreBuckets[1]++;
      else if (score <= 60) fitScoreBuckets[2]++;
      else if (score <= 80) fitScoreBuckets[3]++;
      else fitScoreBuckets[4]++;
    }
  });
  avgFitScore = scoredJobCount > 0 ? Math.round(avgFitScore / scoredJobCount) : 0;
  const maxBucket = Math.max(...fitScoreBuckets, 1);

  // Best matches (top 5 by match score)
  const bestMatches = (eligibleJobs || [])
    .filter((job: any) => getJobFitScore(job) !== null)
    .sort((a: any, b: any) => (getJobFitScore(b) ?? 0) - (getJobFitScore(a) ?? 0))
    .slice(0, 5);

  // Platform distribution
  const platformDistribution: Record<string, number> = {};
  eligibleJobs?.forEach((job: any) => {
    const platform = job.platform || "indeed";
    platformDistribution[platform] = (platformDistribution[platform] || 0) + 1;
  });
  const platformEntries = Object.entries(platformDistribution).sort(([, a], [, b]) => b - a);
  const platformColors: Record<string, string> = {
    indeed: "bg-blue-500",
    glassdoor: "bg-green-500",
    linkedin: "bg-sky-500",
    ziprecruiter: "bg-emerald-500",
    google: "bg-red-500",
  };

  // AI filter funnel
  const totalTracked = systemStats?.totalTrackedJobs || 0;
  const totalEligible = systemStats?.totalEligibleJobs || 0;
  const filterRate = totalTracked > 0 ? ((totalEligible / totalTracked) * 100).toFixed(1) : "0";

  return (
    <div className="container max-w-7xl mx-auto py-8 relative">
      {/* Background effects */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -z-10" />

      <PageHeader title="Analytics" subtitle="Job search performance and insights" />

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="glass-card border-cyan-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-cyan-400" />
              <span className="text-xs text-muted-foreground">Total Scanned</span>
            </div>
            <div className="text-2xl font-bold gradient-text">{totalTracked.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="glass-card border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-green-400" />
              <span className="text-xs text-muted-foreground">Eligible</span>
            </div>
            <div className="text-2xl font-bold text-green-400">{totalEligible.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">{filterRate}% pass rate</div>
          </CardContent>
        </Card>

        <Card className="glass-card border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">Applied</span>
            </div>
            <div className="text-2xl font-bold text-blue-400">{totalApplied}</div>
          </CardContent>
        </Card>

        <Card className="glass-card border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-purple-400" />
              <span className="text-xs text-muted-foreground">Interview Rate</span>
            </div>
            <div className="text-2xl font-bold text-purple-400">{interviewRate}%</div>
          </CardContent>
        </Card>
      </div>

      {activeTab === "pipeline" && (<>
      {/* AI Filter Funnel */}
      <Card className="glass-card border-cyan-500/20 mb-8">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-cyan-400" />
            <CardTitle className="text-lg">AI Filter Funnel</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Funnel visualization */}
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Total Jobs Scanned</span>
                  <span className="font-semibold">{totalTracked.toLocaleString()}</span>
                </div>
                <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" style={{ width: "100%" }} />
                </div>
              </div>

              {pendingCounts && (
                <>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Stage 1: Location/Remote</span>
                      <span className="font-semibold text-cyan-400">
                        {(pendingCounts as any).stage1Passed || "—"}
                      </span>
                    </div>
                    <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all" 
                        style={{ width: totalTracked > 0 ? `${Math.max(((pendingCounts as any).stage1Passed || 0) / totalTracked * 100, 2)}%` : "0%" }} 
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Stage 2: Education</span>
                      <span className="font-semibold text-purple-400">
                        {(pendingCounts as any).stage2Passed || "—"}
                      </span>
                    </div>
                    <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full transition-all" 
                        style={{ width: totalTracked > 0 ? `${Math.max(((pendingCounts as any).stage2Passed || 0) / totalTracked * 100, 2)}%` : "0%" }} 
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Final: Eligible Jobs</span>
                  <span className="font-semibold text-green-400">{totalEligible.toLocaleString()}</span>
                </div>
                <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all" 
                    style={{ width: totalTracked > 0 ? `${Math.max(totalEligible / totalTracked * 100, 2)}%` : "0%" }} 
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Application Pipeline */}
        <Card className="glass-card border-blue-500/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-blue-400" />
              <CardTitle className="text-lg">Application Pipeline</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {totalApplied === 0 ? (
              <div className="text-center py-8 text-muted-foreground" aria-live="polite" data-agent-status="empty-pipeline">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No applications tracked yet</p>
                <p className="text-xs mt-1 mb-3">Mark jobs as applied from the dashboard to see your pipeline funnel.</p>
                <Button variant="outline" size="sm" onClick={() => setLocation("/jobs")} data-agent-action="go-to-dashboard">
                  Go to Dashboard
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { label: "Applied", count: pipelineStats.applied, color: "bg-blue-500", icon: CheckCircle2 },
                  { label: "Interview", count: pipelineStats.interview, color: "bg-purple-500", icon: MessageSquare },
                  { label: "Offer", count: pipelineStats.offer, color: "bg-amber-500", icon: Target },
                  { label: "Accepted", count: pipelineStats.accepted, color: "bg-green-500", icon: CheckCircle2 },
                  { label: "Rejected", count: pipelineStats.rejected, color: "bg-red-500", icon: XCircle },
                  { label: "Ghosted", count: pipelineStats.ghosted, color: "bg-gray-500", icon: Ghost },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <item.icon className={`h-4 w-4 ${item.color.replace("bg-", "text-")}`} />
                    <span className="text-sm w-20">{item.label}</span>
                    <div className="flex-1 h-2.5 bg-muted/30 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${item.color} rounded-full transition-all`} 
                        style={{ width: `${Math.max(item.count / totalApplied * 100, item.count > 0 ? 5 : 0)}%` }} 
                      />
                    </div>
                    <span className="text-sm font-semibold w-8 text-right">{item.count}</span>
                  </div>
                ))}

                <div className="border-t border-border/50 pt-3 mt-3 space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Interview Rate</span>
                    <span className="font-semibold text-foreground">{interviewRate}%</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Offer Rate</span>
                    <span className="font-semibold text-foreground">{offerRate}%</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Companies */}
        <Card className="glass-card border-purple-500/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-purple-400" />
              <CardTitle className="text-lg">Top Companies</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">Most frequent in eligible jobs</p>
          </CardHeader>
          <CardContent>
            {topCompanies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" aria-live="polite" data-agent-status="empty-top-companies">
                <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No companies to rank yet</p>
                <p className="text-xs mt-1 mb-3">Run a scan and AI filtering to populate the eligible-jobs list.</p>
                <Button variant="outline" size="sm" onClick={() => setLocation("/jobs")} data-agent-action="go-to-dashboard">
                  Go to Dashboard
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {topCompanies.map(([company, count], i) => (
                  <div key={company} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                    <span className="text-sm flex-1 truncate">{company}</span>
                    <div className="w-24 h-2 bg-muted/30 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" 
                        style={{ width: `${(count / topCompanies[0][1]) * 100}%` }} 
                      />
                    </div>
                    <span className="text-xs font-semibold w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-8">
        {/* Job Type Distribution */}
        <Card className="glass-card border-green-500/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-400" />
              <CardTitle className="text-lg">Job Types</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {Object.keys(jobTypeDistribution).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" aria-live="polite" data-agent-status="empty-job-types">
                <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No job-type breakdown yet</p>
                <p className="text-xs mt-1 mb-3">This populates once eligible jobs exist after a scan + AI filter.</p>
                <Button variant="outline" size="sm" onClick={() => setLocation("/jobs")} data-agent-action="go-to-dashboard">
                  Go to Dashboard
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(jobTypeDistribution)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center gap-3">
                      <Badge variant="outline" className="text-[10px] w-24 justify-center">
                        {type.replace(/_/g, " ")}
                      </Badge>
                      <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full" 
                          style={{ width: `${(count / (eligibleJobs?.length || 1)) * 100}%` }} 
                        />
                      </div>
                      <span className="text-xs font-semibold w-8 text-right">{count}</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </>)}

      {activeTab === "scans" && (
      <div className="mb-8">
        {/* Scan History */}
        <Card className="glass-card border-amber-500/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-amber-400" />
              <CardTitle className="text-lg">Recent Scans</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {!scanHistory || scanHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" aria-live="polite" data-agent-status="empty-recent-scans">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No scans have run yet</p>
                <p className="text-xs mt-1 mb-3">Click <span className="text-foreground font-medium">Run New Scan</span> on the dashboard to populate this.</p>
                <Button variant="outline" size="sm" onClick={() => setLocation("/jobs")} data-agent-action="go-to-dashboard">
                  Go to Dashboard
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {scanHistory.slice(0, 10).map((scan: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                    <div className={`w-2 h-2 rounded-full ${
                      scan.status === "completed" ? "bg-green-500" : 
                      scan.status === "running" ? "bg-blue-500 animate-pulse" : "bg-red-500"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {scan.scanType === "broad_search" ? "Global Scan" : 
                         scan.scanType === "ai_analysis" ? "AI Job Filtering" : scan.scanType}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {scan.startedAt ? new Date(scan.startedAt).toLocaleString() : "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold">
                        {scan.totalJobsFound || 0} found
                      </div>
                      <div className="text-[10px] text-green-400">
                        +{scan.newJobsFound || 0} new
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Scan summary */}
            <div className="border-t border-border/50 pt-3 mt-3 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Total Scans</div>
                <div className="text-lg font-bold">{scanHistory?.length || 0}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Jobs Discovered</div>
                <div className="text-lg font-bold text-green-400">{totalNewJobs.toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {activeTab === "matches" && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Match Score Distribution Histogram */}
        <Card className="glass-card border-yellow-500/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-400" />
              <CardTitle className="text-lg">Match Score Distribution</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">
              {scoredJobCount} scored jobs &middot; {avgFitScore}% average match
            </p>
          </CardHeader>
          <CardContent>
            {scoredJobCount === 0 ? (
              <div className="text-center py-8 text-muted-foreground" aria-live="polite" data-agent-status="empty-match-scores">
                <Star className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No match scores yet</p>
                <p className="text-xs mt-1 mb-3">Click <span className="text-foreground font-medium">Match Score</span> on the dashboard to score each eligible job against your profile.</p>
                <Button variant="outline" size="sm" onClick={() => setLocation("/jobs")} data-agent-action="go-to-dashboard">
                  Go to Dashboard
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Histogram bars */}
                <div className="flex items-end gap-2 h-32">
                  {fitScoreBuckets.map((count, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-semibold">{count}</span>
                      <div className="w-full rounded-t-sm overflow-hidden bg-muted/20" style={{ height: '100%' }}>
                        <div
                          className={`w-full ${fitScoreColors[i]} rounded-t-sm transition-all`}
                          style={{ height: `${(count / maxBucket) * 100}%`, marginTop: 'auto', position: 'relative', top: `${100 - (count / maxBucket) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{fitScoreLabels[i]}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/50 pt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xs text-muted-foreground">High (80%+)</div>
                    <div className="text-lg font-bold text-green-400">{fitScoreBuckets[4]}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Medium (40-80%)</div>
                    <div className="text-lg font-bold text-blue-400">{fitScoreBuckets[2] + fitScoreBuckets[3]}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Low (&lt;40%)</div>
                    <div className="text-lg font-bold text-red-400">{fitScoreBuckets[0] + fitScoreBuckets[1]}</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Best Matches */}
        <Card className="glass-card border-green-500/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-green-400" />
              <CardTitle className="text-lg">Top Matches</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">Highest match scores from eligible jobs</p>
          </CardHeader>
          <CardContent>
            {bestMatches.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" aria-live="polite" data-agent-status="empty-top-matches">
                <Award className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No top matches yet</p>
                <p className="text-xs mt-1 mb-3">Top matches appear once jobs have been scored. Run Match Score from the dashboard.</p>
                <Button variant="outline" size="sm" onClick={() => setLocation("/jobs")} data-agent-action="go-to-dashboard">
                  Go to Dashboard
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {bestMatches.map((job: any, i: number) => {
                  const score = getJobFitScore(job) ?? 0;
                  const breakdown = typeof job.aiAnalysis?.fitScore === "object"
                    ? job.aiAnalysis.fitScore
                    : null;
                  return (
                    <div key={job.id} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                        i === 1 ? 'bg-gray-400/20 text-gray-300' :
                        i === 2 ? 'bg-orange-500/20 text-orange-400' :
                        'bg-muted/30 text-muted-foreground'
                      }`}>
                        #{i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{job.title}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{job.company}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${
                          score >= 80 ? 'text-green-400' :
                          score >= 60 ? 'text-blue-400' :
                          score >= 40 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {score}%
                        </div>
                        {breakdown && (
                          <div className="text-[9px] text-muted-foreground">
                            S:{breakdown.skills || 0} E:{breakdown.education || 0} X:{breakdown.experience || 0} L:{breakdown.location || 0}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      )}

      {/* Platform Distribution */}
      {activeTab === "scans" && platformEntries.length > 0 && (
        <Card className="glass-card border-sky-500/20 mb-8">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-sky-400" />
              <CardTitle className="text-lg">Jobs by Platform</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {platformEntries.map(([platform, count]) => (
                <div key={platform} className="text-center">
                  <div className={`w-12 h-12 rounded-xl mx-auto mb-2 flex items-center justify-center ${platformColors[platform] || 'bg-gray-500'} bg-opacity-20`}>
                    <span className="text-lg font-bold">{count}</span>
                  </div>
                  <div className="text-xs font-medium capitalize">{platform}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {totalEligible > 0 ? Math.round((count / totalEligible) * 100) : 0}%
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profile Summary */}
      {profile && (
        <Card className="glass-card border-cyan-500/20 mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-cyan-400" />
                <CardTitle className="text-lg">Search Profile Summary</CardTitle>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setLocation("/preferences")}
                data-agent-action="edit-preferences"
              >
                Edit Preferences
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Location</div>
                <div className="text-sm font-medium">
                  {profile.city && profile.state ? `${profile.city}, ${profile.state}` : profile.state || "Not set"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Remote Preference</div>
                <div className="text-sm font-medium">
                  {profile.remotePreference?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Any"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Education</div>
                <div className="text-sm font-medium">
                  {profile.educationLevel?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Not set"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Job Titles Tracked</div>
                <div className="text-sm font-medium">{jobTitles?.length || 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
