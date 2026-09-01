import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Save,
  MapPin,
  GraduationCap,
  Clock,
  Briefcase,
  Wrench,
  DollarSign,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Settings,
  KeyRound,
  X,
  FileText,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useSubNav } from "@/components/SubNav";
import { SearchPresetsContent } from "./SearchPresets";
import { WorkStyleQuickFillDialog } from "@/components/WorkStyleQuickFill";
import { toast } from "sonner";
import { ApplicationProfilePanel } from "@/components/ApplicationProfilePanel";

const US_STATES = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
];

const EDUCATION_LABELS: Record<string, string> = {
  no_degree: "No Degree Required",
  high_school: "High School Diploma / GED",
  associates: "Associate's Degree",
  bachelors: "Bachelor's Degree",
  masters: "Master's Degree",
  phd: "PhD / Doctorate",
};

const EXPERIENCE_LABELS: Record<string, string> = {
  "0-1": "0-1 years (Entry Level)",
  "1-3": "1-3 years",
  "3-5": "3-5 years",
  "5-10": "5-10 years",
  "10+": "10+ years (Senior)",
};

const REMOTE_LABELS: Record<string, string> = {
  remote_only: "Remote Only",
  hybrid: "Hybrid (Remote + On-site)",
  on_site: "On-site Only",
  any: "Any (No Preference)",
};

export function JobPreferences() {
  const { current: subNavTab } = useSubNav();
  const activeTab = subNavTab ?? "profile";
  const utils = trpc.useUtils();

  // Fetch existing profile and job titles
  const { data: profile, isLoading: profileLoading } =
    trpc.onboarding.getProfile.useQuery();
  const { data: jobTitles = [], isLoading: titlesLoading } =
    trpc.onboarding.getJobTitles.useQuery();

  // Profile form state
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [searchRadius, setSearchRadius] = useState(50);
  const [willingToRelocate, setWillingToRelocate] = useState(false);
  const [remotePreference, setRemotePreference] = useState("");
  const [educationLevel, setEducationLevel] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [skillsRaw, setSkillsRaw] = useState("");
  const [resumeText, setResumeText] = useState("");

  // Salary preferences
  const [minSalary, setMinSalary] = useState("");
  const [salaryFilterEnabled, setSalaryFilterEnabled] = useState(false);

  // Job title management
  const [newJobType, setNewJobType] = useState("");
  const [quickFillOpen, setQuickFillOpen] = useState(false);

  // Track if form has been initialized from server data
  const [initialized, setInitialized] = useState(false);

  // Dirty tracking
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileSavedAt, setProfileSavedAt] = useState<number | null>(null);

  // Initialize form from server data
  useEffect(() => {
    if (profile && !initialized) {
      setState(profile.state || "");
      setCity(profile.city || "");
      setSearchRadius(profile.searchRadiusMiles || 50);
      setWillingToRelocate(profile.willingToRelocate || false);
      setRemotePreference(profile.remotePreference || "");
      setEducationLevel(profile.educationLevel || "");
      setYearsExperience(profile.yearsExperience || "");
      setSkillsRaw(profile.skillsRaw || "");
      setResumeText(profile.resumeText || "");
      setMinSalary(profile.minSalary ? String(profile.minSalary) : "");
      setSalaryFilterEnabled(profile.salaryFilterEnabled || false);
      setInitialized(true);
    }
  }, [profile, initialized]);

  // Mutations
  const saveProfileMutation = trpc.onboarding.saveProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated successfully!", {
        description: "Your search criteria and AI filters have been updated.",
      });
      setProfileDirty(false);
      setProfileSavedAt(Date.now());
      // Auto-clear the agent-observable "saved" indicator after 4s.
      setTimeout(() => {
        setProfileSavedAt(prev =>
          prev && Date.now() - prev >= 4000 ? null : prev
        );
      }, 4000);
      utils.onboarding.getProfile.invalidate();
      utils.personalized.getUserProfile.invalidate();
    },
    onError: error => {
      toast.error(`Failed to save profile: ${error.message}`);
    },
  });

  const updateTitleStatusMutation =
    trpc.onboarding.updateJobTitleStatus.useMutation({
      onSuccess: () => {
        utils.onboarding.getJobTitles.invalidate();
      },
      onError: error => {
        toast.error(`Failed to update title: ${error.message}`);
      },
    });

  const generateMutation = trpc.onboarding.generateJobTitles.useMutation({
    onSuccess: data => {
      toast.success(`Generated ${data.titles.length} new job titles!`, {
        description: "Review and save them below.",
      });
    },
    onError: error => {
      toast.error(`Failed to generate titles: ${error.message}`);
    },
  });

  const saveTitlesMutation = trpc.onboarding.saveJobTitles.useMutation({
    onSuccess: () => {
      toast.success("Job titles updated!");
      utils.onboarding.getJobTitles.invalidate();
    },
    onError: error => {
      toast.error(`Failed to save titles: ${error.message}`);
    },
  });

  // Handle manual title add
  const handleAddTitle = () => {
    if (!newJobType.trim()) return;
    const title = newJobType.trim();
    // Check if duplicate
    if (jobTitles.some(t => t.title.toLowerCase() === title.toLowerCase())) {
      toast.error("This title is already in your list");
      return;
    }

    saveTitlesMutation.mutate({
      titles: [
        ...jobTitles.map(t => ({ title: t.title, isActive: t.isActive })),
        { title, isActive: true },
      ],
    });
    // NOTE: Not clearing input anymore so user can click "Generate variations" immediately after
  };

  // Handle Quick Fill apply — append-only merge into existing titles.
  // Parent dedups against existing titles before calling here,
  // but we re-check just in case to keep this resilient.
  const handleQuickFillApply = (newTitles: string[]) => {
    const existingLower = new Set(
      jobTitles.map(t => t.title.toLowerCase().trim())
    );
    const fresh = newTitles.filter(
      t => !existingLower.has(t.toLowerCase().trim())
    );
    if (fresh.length === 0) {
      toast.info("All of those are already in your list.");
      return;
    }
    saveTitlesMutation.mutate({
      titles: [
        ...jobTitles.map(t => ({ title: t.title, isActive: t.isActive })),
        ...fresh.map(title => ({ title, isActive: true })),
      ],
    });
    toast.success(
      `Added ${fresh.length} title${fresh.length === 1 ? "" : "s"} to your list`
    );
  };

  // Handle profile save
  const handleSaveProfile = () => {
    if (!state) {
      toast.error("Please select your state");
      return;
    }
    if (!city.trim()) {
      toast.error("Please enter your city");
      return;
    }
    if (!remotePreference) {
      toast.error("Please select a remote work preference");
      return;
    }
    if (!educationLevel) {
      toast.error("Please select your education level");
      return;
    }
    if (!yearsExperience) {
      toast.error("Please select your years of experience");
      return;
    }

    saveProfileMutation.mutate({
      state,
      city: city.trim(),
      searchRadiusMiles: searchRadius,
      willingToRelocate,
      remotePreference: remotePreference as
        | "remote_only"
        | "hybrid"
        | "on_site"
        | "any",
      educationLevel: educationLevel as
        | "no_degree"
        | "high_school"
        | "associates"
        | "bachelors"
        | "masters"
        | "phd",
      yearsExperience: yearsExperience as
        | "0-1"
        | "1-3"
        | "3-5"
        | "5-10"
        | "10+",
      skillsRaw: skillsRaw.trim() || undefined,
      resumeText: resumeText.trim() || undefined,
      minSalary: minSalary ? parseInt(minSalary, 10) : null,
      salaryFilterEnabled,
    });
  };

  // Handle title toggle
  const handleToggleTitle = (titleId: number, currentActive: boolean) => {
    updateTitleStatusMutation.mutate({ titleId, isActive: !currentActive });
  };

  // Handle regenerate titles
  const handleRegenerate = () => {
    if (!newJobType.trim()) {
      toast.error("Please enter a job type to generate titles");
      return;
    }
    generateMutation.mutate({ jobType: newJobType.trim() });
  };

  // Handle save new generated titles (replaces existing)
  const handleSaveNewTitles = () => {
    if (!generateMutation.data?.titles) return;
    saveTitlesMutation.mutate({
      titles: generateMutation.data.titles.map(title => ({
        title,
        isActive: true,
      })),
    });
  };

  // Computed values
  const activeTitles = useMemo(
    () => jobTitles.filter(t => t.isActive),
    [jobTitles]
  );
  const inactiveTitles = useMemo(
    () => jobTitles.filter(t => !t.isActive),
    [jobTitles]
  );

  const isLoading = profileLoading || titlesLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-8">
        <PageHeader
          title="Job Preferences"
          subtitle="Update your profile, job titles, and search criteria. Changes affect future scans and AI filtering."
          icon={<Settings className="h-8 w-8" />}
        />

        <div className="space-y-6">
          {activeTab === "applications" && <ApplicationProfilePanel />}
          {activeTab === "profile" && (
            <>
              {/* ============================================================ */}
              {/* SECTION 1: Location & Work Preferences */}
              {/* ============================================================ */}
              <Card
                className="glass-card"
                data-agent-status="location-work-preferences"
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-green-400" />
                    Location & Work Preferences
                  </CardTitle>
                  <CardDescription>
                    Where you want to work and how you want to work
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">State</Label>
                      <Select
                        value={state}
                        onValueChange={v => {
                          setState(v);
                          setProfileDirty(true);
                        }}
                      >
                        <SelectTrigger data-agent-input="user-state">
                          <SelectValue placeholder="Select your state" />
                        </SelectTrigger>
                        <SelectContent>
                          {US_STATES.map(s => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city" className="text-sm font-medium">
                        City
                      </Label>
                      <Input
                        id="city"
                        placeholder="e.g., Austin"
                        value={city}
                        onChange={e => {
                          setCity(e.target.value);
                          setProfileDirty(true);
                        }}
                        data-agent-input="user-city"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Search Radius (miles)
                      </Label>
                      <Input
                        type="number"
                        min={5}
                        max={500}
                        value={searchRadius}
                        onChange={e => {
                          setSearchRadius(Number(e.target.value));
                          setProfileDirty(true);
                        }}
                        data-agent-input="user-search-radius"
                      />
                      <p className="text-xs text-muted-foreground">
                        How far from your city to search for on-site jobs
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Willing to Relocate?
                      </Label>
                      <div className="flex items-center gap-3 pt-2">
                        <Switch
                          checked={willingToRelocate}
                          onCheckedChange={v => {
                            setWillingToRelocate(v);
                            setProfileDirty(true);
                          }}
                          data-agent-input="user-relocate-willingness"
                        />
                        <span className="text-sm text-muted-foreground">
                          {willingToRelocate ? "Yes" : "No"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Remote Work Preference
                    </Label>
                    <Select
                      value={remotePreference}
                      onValueChange={v => {
                        setRemotePreference(v);
                        setProfileDirty(true);
                      }}
                    >
                      <SelectTrigger data-agent-input="user-remote-preference">
                        <SelectValue placeholder="Select your preference" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(REMOTE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* ============================================================ */}
              {/* SECTION 2: Highest Degree & Career Experience */}
              {/* ============================================================ */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-blue-400" />
                    Highest Degree & Career Experience
                  </CardTitle>
                  <CardDescription>
                    Your professional background and current qualifications
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Highest Degree Earned
                      </Label>
                      <Select
                        value={educationLevel}
                        onValueChange={v => {
                          setEducationLevel(v);
                          setProfileDirty(true);
                        }}
                      >
                        <SelectTrigger data-agent-input="user-education-level">
                          <SelectValue placeholder="Select highest degree" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(EDUCATION_LABELS).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Total Years of Career Experience
                      </Label>
                      <Select
                        value={yearsExperience}
                        onValueChange={v => {
                          setYearsExperience(v);
                          setProfileDirty(true);
                        }}
                      >
                        <SelectTrigger data-agent-input="user-experience-years">
                          <SelectValue placeholder="Select years of experience" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(EXPERIENCE_LABELS).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ============================================================ */}
              {/* SECTION 3: Skills & Experience (Free-form) */}
              {/* ============================================================ */}
              <Card
                className="glass-card"
                data-agent-status="skills-experience-preferences"
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-orange-400" />
                    Skills & Experience
                  </CardTitle>
                  <CardDescription>
                    Describe your professional skills and expertise in your own
                    words
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="e.g., 5 years customer service, 2 years data entry, proficient in Microsoft Office, some experience with CRM systems like Salesforce"
                    value={skillsRaw}
                    onChange={e => {
                      setSkillsRaw(e.target.value);
                      setProfileDirty(true);
                    }}
                    data-agent-input="user-skills-raw"
                    rows={4}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Be as specific as possible — mention tools and proficiency
                    levels.
                  </p>

                  {/* Show currently parsed skills */}
                  {profile?.skillsParsed &&
                    Array.isArray(profile.skillsParsed) &&
                    profile.skillsParsed.length > 0 && (
                      <div
                        className="bg-green-500/10 border border-green-500/30 rounded-lg p-4"
                        data-agent-status="parsed-skills-list"
                      >
                        <p className="text-xs font-medium text-green-400 mb-2">
                          Currently parsed skills:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {profile.skillsParsed.map((s: any, i: number) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              className="bg-green-500/20 text-green-300 border-green-500/40"
                            >
                              {s.skill} ({s.level}, {s.yearsExperience}y)
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "resume" && (
            <>
              {/* ============================================================ */}
              {/* SECTION 3.5: Résumé text for guided applications */}
              {/* ============================================================ */}
              <Card
                className="glass-card"
                data-agent-status="resume-text-section"
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-cyan-400" />
                    Résumé Text
                    <Badge
                      variant="outline"
                      className="text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/40"
                    >
                      Optional
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Optional context that your browser assistant can reference
                    while preparing applications.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Textarea
                    placeholder="Paste the full text of your résumé here. Plain text only — formatting is stripped."
                    value={resumeText}
                    onChange={e => {
                      setResumeText(e.target.value);
                      setProfileDirty(true);
                    }}
                    data-agent-input="user-resume-text"
                    rows={10}
                    className="resize-y font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    This text is included only when you ask the guided
                    application flow to prepare an application packet.
                  </p>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "profile" && (
            <>
              {/* ============================================================ */}
              {/* SECTION 4: Salary Preferences (Soft Filter) */}
              {/* ============================================================ */}
              <Card
                className="glass-card"
                data-agent-status="salary-preferences"
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-yellow-400" />
                    Salary Preferences
                    <Badge
                      variant="outline"
                      className="text-xs bg-yellow-500/10 text-yellow-400 border-yellow-500/40"
                    >
                      Soft Filter
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Optional — jobs without salary info will NOT be rejected.
                    This only flags jobs that explicitly list a salary below
                    your minimum.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={salaryFilterEnabled}
                      onCheckedChange={v => {
                        setSalaryFilterEnabled(v);
                        setProfileDirty(true);
                      }}
                      data-agent-input="user-salary-filter-enabled"
                    />
                    <span className="text-sm text-muted-foreground">
                      {salaryFilterEnabled
                        ? "Salary filter enabled"
                        : "Salary filter disabled (all jobs pass)"}
                    </span>
                  </div>

                  {salaryFilterEnabled && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Minimum Annual Salary ($)
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step={1000}
                        placeholder="e.g., 30000"
                        value={minSalary}
                        onChange={e => {
                          setMinSalary(e.target.value);
                          setProfileDirty(true);
                        }}
                        data-agent-input="user-min-salary"
                      />
                      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-muted-foreground">
                            Many job listings don't include salary information.
                            This filter will only reject jobs that{" "}
                            <strong>explicitly list</strong> a salary below your
                            minimum. Jobs with no salary data will always pass
                            through.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Save Profile button is shared between the profile and resume
              tabs — both edit fields that this mutation persists. Hidden
              on tabs that don't edit the profile payload (titles have
              per-item mutations; presets are a separate entity with
              their own CRUD inside SearchPresetsContent). */}
          {(activeTab === "profile" || activeTab === "resume") && (
            <>
              <Button
                onClick={handleSaveProfile}
                disabled={saveProfileMutation.isPending}
                data-agent-action="save-profile"
                className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 h-12 text-lg"
                size="lg"
                aria-describedby="profile-saved-indicator"
              >
                {saveProfileMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Saving Profile...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-5 w-5" />
                    Save Profile Changes
                    {profileDirty && (
                      <span className="ml-2 text-xs opacity-75">
                        (unsaved changes)
                      </span>
                    )}
                  </>
                )}
              </Button>
              {profileSavedAt && (
                <p
                  id="profile-saved-indicator"
                  role="status"
                  aria-live="polite"
                  data-agent-status="profile-saved"
                  className="text-xs text-green-400 text-center mt-2 animate-in fade-in"
                >
                  ✓ Profile saved
                </p>
              )}
            </>
          )}

          {activeTab === "titles" && (
            <>
              {/* ============================================================ */}
              {/* SECTION 5: Manage Job Titles */}
              {/* ============================================================ */}
              <Card
                className="glass-card"
                data-agent-status="job-titles-management"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5 text-blue-400" />
                      Manage Job Titles ({activeTitles.length} active /{" "}
                      {jobTitles.length} total)
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      data-agent-action="open-work-style-quickfill"
                      onClick={() => setQuickFillOpen(true)}
                      className="shrink-0"
                      title="Pick a work style and grab a starter pack of job titles"
                    >
                      <Sparkles className="mr-1.5 h-4 w-4" />
                      Quick fill
                    </Button>
                  </div>
                  <div className="text-sm space-y-1 mt-1">
                    <p className="text-foreground/80 font-medium">
                      Titles you are searching for:
                    </p>
                    <div className="flex flex-col gap-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-blue-400 font-medium">
                          Blue titles
                        </span>{" "}
                        are jobs you have manually saved
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        <span className="text-purple-400 font-medium">
                          Purple titles
                        </span>{" "}
                        are AI suggestions
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Active titles */}
                  {jobTitles.length > 0 ? (
                    <div className="space-y-2">
                      {jobTitles.map(t => (
                        <div
                          key={t.id}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                            t.isActive
                              ? "bg-blue-500/10 border-blue-500/30"
                              : "bg-muted/30 border-muted/50 opacity-60"
                          }`}
                        >
                          <span
                            className={`font-medium text-sm ${t.isActive ? "text-foreground" : "text-muted-foreground line-through"}`}
                          >
                            {t.title}
                          </span>
                          <Switch
                            checked={t.isActive}
                            onCheckedChange={() =>
                              handleToggleTitle(t.id, t.isActive)
                            }
                            disabled={updateTitleStatusMutation.isPending}
                            aria-label={`Toggle ${t.title}`}
                            data-agent-action={`toggle-title-${t.id}`}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Briefcase className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No job titles configured yet.</p>
                    </div>
                  )}

                  <Separator />

                  {/* Add or Generate new titles */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">
                      Manually Add or Generate Job Titles
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Type a specific title to add it manually, or enter a
                      category and click Generate for AI variations.
                    </p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          placeholder="e.g., Remote Data Entry, Customer Service..."
                          value={newJobType}
                          onChange={e => setNewJobType(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddTitle();
                            }
                          }}
                          disabled={generateMutation.isPending}
                          data-agent-input="user-job-type"
                          className="pr-10"
                        />
                        {newJobType && (
                          <button
                            onClick={() => setNewJobType("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Clear job title input"
                            data-agent-action="clear-job-input"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <Button
                        onClick={handleAddTitle}
                        disabled={
                          !newJobType.trim() ||
                          generateMutation.isPending ||
                          saveTitlesMutation.isPending
                        }
                        variant="secondary"
                        className="shrink-0 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                        data-agent-action="add-title-manually"
                      >
                        Manually add
                      </Button>
                      <Button
                        onClick={handleRegenerate}
                        disabled={
                          !newJobType.trim() || generateMutation.isPending
                        }
                        data-agent-action="generate-titles"
                        variant="outline"
                        className="shrink-0 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                      >
                        {generateMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Generate
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Show newly generated titles */}
                    {generateMutation.data?.titles && (
                      <div className="space-y-3">
                        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                          <p className="text-sm font-medium text-purple-400 mb-3">
                            AI Suggested {generateMutation.data.titles.length}{" "}
                            titles:
                          </p>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {generateMutation.data.titles.map((title, i) => (
                              <Badge
                                key={i}
                                variant="secondary"
                                className="bg-purple-500/20 text-purple-300 border-purple-500/40"
                              >
                                {title}
                              </Badge>
                            ))}
                          </div>
                          <Button
                            onClick={handleSaveNewTitles}
                            disabled={saveTitlesMutation.isPending}
                            data-agent-action="replace-titles"
                            className="w-full bg-purple-600 hover:bg-purple-700 font-bold"
                            variant="default"
                          >
                            {saveTitlesMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Confirm AI Suggestions (Replaces Current List)
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "presets" && <SearchPresetsContent />}

        </div>
      </div>

      <WorkStyleQuickFillDialog
        open={quickFillOpen}
        onOpenChange={setQuickFillOpen}
        onApply={handleQuickFillApply}
        existingTitles={jobTitles.map(t => t.title)}
        isApplying={saveTitlesMutation.isPending}
      />
    </div>
  );
}
