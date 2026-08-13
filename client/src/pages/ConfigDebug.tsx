import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Briefcase, GraduationCap, Clock, AlertTriangle, CheckCircle2, Loader2, Pencil } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/PageHeader";

// Static AI filter rules (these are always the same logic)
const STATIC_FILTER_RULES = {
  rejectJobTypes: [
    "commission_only",
    "mlm",
    "multi_level_marketing",
    "pyramid_scheme",
    "insurance_sales",
    "1099_only",
  ],
  redFlags: [
    "unlimited earning potential",
    "be your own boss",
    "work from home opportunity",
    "no experience necessary, make $$$",
    "pay to start",
    "buy starter kit",
    "recruit others",
    "downline",
  ],
};

const EDUCATION_LABELS: Record<string, string> = {
  no_degree: "No Degree Required",
  high_school: "High School Diploma / GED",
  associates: "Associate's Degree",
  bachelors: "Bachelor's Degree",
  masters: "Master's Degree",
  phd: "PhD / Doctorate",
};

const MAX_EXP_MAP: Record<string, number> = {
  "0-1": 1,
  "1-3": 3,
  "3-5": 5,
  "5-10": 10,
  "10+": 99,
};

export function ConfigDebug() {
  const [, setLocation] = useLocation();
  const { data: userProfile, isLoading: profileLoading } = trpc.personalized.getUserProfile.useQuery();
  const { data: jobTitles = [], isLoading: titlesLoading } = trpc.onboarding.getJobTitles.useQuery();

  const isLoading = profileLoading || titlesLoading;

  // Derive dynamic filter rules from profile
  const educationLevel = userProfile?.educationLevel || "no_degree";
  const rejectBachelors = ["no_degree", "high_school", "associates"].includes(educationLevel);
  const rejectMasters = ["no_degree", "high_school", "associates", "bachelors"].includes(educationLevel);
  const rejectPhd = ["no_degree", "high_school", "associates", "bachelors", "masters"].includes(educationLevel);
  const maxExp = MAX_EXP_MAP[userProfile?.yearsExperience || "0-1"] || 1;

  if (isLoading) {
    return (
      <div className="container py-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container py-8">
      <PageHeader
        title="Configuration Debug"
        subtitle="Read-only view of current search criteria and AI filter rules (loaded from your profile)."
        rightAction={
          <Button
            variant="outline"
            onClick={() => setLocation("/preferences")}
            className="gap-2"
            data-agent-action="edit-preferences"
          >
            <Pencil className="h-4 w-4" />
            Edit in Preferences
          </Button>
        }
      />

      <div className="space-y-6">
        {/* User Profile */}
        <Card className="glass-card" data-agent-status="debug-user-profile">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              User Profile
            </CardTitle>
            <CardDescription>Your qualifications and experience</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Education */}
            <div>
              <h3 className="font-semibold mb-2">Education</h3>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Level:</span>{" "}
                  <Badge variant="outline">{EDUCATION_LABELS[educationLevel] || educationLevel}</Badge>
                </p>
              </div>
            </div>

            {/* Experience */}
            <div>
              <h3 className="font-semibold mb-2">Experience</h3>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Years:</span>{" "}
                  <Badge variant="outline">{userProfile?.yearsExperience || "0-1"} years</Badge>
                </p>
                {userProfile?.skillsParsed && (
                  <div>
                    <span className="text-muted-foreground">Skills:</span>{" "}
                    <span>{userProfile.skillsParsed}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Location */}
            <div>
              <h3 className="font-semibold mb-2">Location</h3>
              <div className="space-y-1 text-sm">
                <p>
                  <MapPin className="inline h-4 w-4 mr-1" />
                  {userProfile?.city && userProfile?.state
                    ? `${userProfile.city}, ${userProfile.state}`
                    : <span className="text-muted-foreground italic">Not configured</span>}
                </p>
                <p className="text-muted-foreground">
                  Remote preference: {userProfile?.remotePreference === "remote_only" ? "Remote Only" : userProfile?.remotePreference === "hybrid" ? "Hybrid" : userProfile?.remotePreference === "on_site" ? "On-site Only" : "Any"}
                </p>
                <p className="text-muted-foreground">
                  Search radius: {userProfile?.searchRadiusMiles || 50} miles
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search Criteria */}
        <Card className="glass-card" data-agent-status="debug-search-criteria">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Search Criteria
            </CardTitle>
            <CardDescription>Job titles and locations being searched</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Target Titles */}
            <div>
              <h3 className="font-semibold mb-2">
                Target Job Titles ({jobTitles.filter(t => t.isActive).length} active of {jobTitles.length} total)
              </h3>
              <div className="flex flex-wrap gap-2">
                {jobTitles.map((t) => (
                  <Badge key={t.id} variant={t.isActive ? "secondary" : "outline"} className={!t.isActive ? "opacity-50 line-through" : ""}>
                    {t.title}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Locations */}
            <div>
              <h3 className="font-semibold mb-2">Search Locations</h3>
              <div className="space-y-2">
                {(userProfile?.remotePreference === "remote_only" || userProfile?.remotePreference === "any") && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4" />
                    <span className="font-medium">Remote (Nationwide)</span>
                  </div>
                )}
                {userProfile?.city && userProfile?.stateAbbr && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4" />
                    <span className="font-medium">{userProfile.city}, {userProfile.stateAbbr} Area</span>
                    <Badge variant="outline" className="text-xs">
                      {userProfile?.searchRadiusMiles || 50} miles radius
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Results Per Title */}
            <div>
              <h3 className="font-semibold mb-2">Results Per Title</h3>
              <p className="text-sm text-muted-foreground">
                Up to 50 results per job title
              </p>
            </div>
          </CardContent>
        </Card>

        {/* AI Filter Rules */}
        <Card className="glass-card" data-agent-status="debug-ai-filter-rules">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              AI Filter Rules
            </CardTitle>
            <CardDescription>Automatic rejection criteria (derived from your profile)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Education Requirements */}
            <div>
              <h3 className="font-semibold mb-2">Reject if Requires</h3>
              <div className="flex flex-wrap gap-2">
                {rejectBachelors && (
                  <Badge variant="destructive">Bachelor's Degree</Badge>
                )}
                {rejectMasters && (
                  <Badge variant="destructive">Master's Degree</Badge>
                )}
                {rejectPhd && (
                  <Badge variant="destructive">PhD</Badge>
                )}
                {!rejectBachelors && !rejectMasters && !rejectPhd && (
                  <span className="text-sm text-muted-foreground">No education filters active (you have a PhD or equivalent)</span>
                )}
              </div>
            </div>

            {/* Experience Requirements */}
            <div>
              <h3 className="font-semibold mb-2">Maximum Experience Required</h3>
              <p className="text-sm text-muted-foreground">
                <Clock className="inline h-4 w-4 mr-1" />
                Jobs requiring more than {maxExp} year(s) of experience will be rejected
              </p>
            </div>

            {/* Remote State Check */}
            <div>
              <h3 className="font-semibold mb-2">Remote State Restrictions</h3>
              <p className="text-sm text-muted-foreground">
                <MapPin className="inline h-4 w-4 mr-1" />
                {userProfile?.state
                  ? `Remote jobs must allow ${userProfile.state} residents`
                  : "Remote jobs must allow residents of your configured state"}
              </p>
            </div>

            {/* Rejected Job Types */}
            <div>
              <h3 className="font-semibold mb-2">Rejected Job Types</h3>
              <div className="flex flex-wrap gap-2">
                {STATIC_FILTER_RULES.rejectJobTypes.map((type, index) => (
                  <Badge key={index} variant="destructive" className="text-xs">
                    {type.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Red Flag Keywords */}
            <div>
              <h3 className="font-semibold mb-2">Red Flag Keywords (Auto-Reject)</h3>
              <div className="flex flex-wrap gap-2">
                {STATIC_FILTER_RULES.redFlags.map((flag, index) => (
                  <Badge key={index} variant="outline" className="text-xs bg-red-500/10 text-red-400">
                    "{flag}"
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
