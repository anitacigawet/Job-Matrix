import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, CheckCircle, HelpCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Briefcase,
  MapPin,
  GraduationCap,
  Wrench,
  Upload,
  FileText,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { WorkStyleQuickFillDialog } from "@/components/WorkStyleQuickFill";

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming"
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

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [step, setStep] = useState(1);
  const [showEnvTroubleshoot, setShowEnvTroubleshoot] = useState(false);
  const [setupMode, setSetupMode] = useState<"manual" | "auto">("manual");
  const [selectedResumeFileName, setSelectedResumeFileName] = useState("");
  const [resumePasteText, setResumePasteText] = useState("");
  /** True after a successful resume auto-fill so we can show a short review hint on step 2. */
  const [resumeAiSuggestionsApplied, setResumeAiSuggestionsApplied] = useState(false);
  const resumeFileInputRef = useRef<HTMLInputElement>(null);

  const { data: envStatus } = trpc.environment.status.useQuery();

  // Step 2: Job type
  const [jobType, setJobType] = useState("");
  const [generatedTitles, setGeneratedTitles] = useState<Array<{ title: string; isActive: boolean }>>([]);
  const [quickFillOpen, setQuickFillOpen] = useState(false);

  // Step 3: Profile questions
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [searchRadius, setSearchRadius] = useState(50);
  const [willingToRelocate, setWillingToRelocate] = useState(false);
  const [remotePreference, setRemotePreference] = useState("");
  const [educationLevel, setEducationLevel] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");

  // Step 4: Skills
  const [skillsRaw, setSkillsRaw] = useState("");

  const generateMutation = trpc.onboarding.generateJobTitles.useMutation({
    onSuccess: (data) => {
      setGeneratedTitles(data.titles.map(title => ({ title, isActive: true })));
      toast.success("Job titles generated successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to generate job titles: ${error.message}`);
    },
  });

  const saveProfileMutation = trpc.onboarding.saveProfile.useMutation({
    onError: (error) => {
      toast.error(`Failed to save profile: ${error.message}`);
    },
  });

  const saveTitlesMutation = trpc.onboarding.saveJobTitles.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("Onboarding complete! Welcome to Job Matrix.");
      setLocation("/jobs");
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  const resumeParseMutation = trpc.onboarding.uploadResumeAndParse.useMutation({
    onSuccess: (data) => {
      if (data.success && data.parsedProfile) {
        const p = data.parsedProfile;
        setResumeAiSuggestionsApplied(true);
        if (p.jobTypeTarget) setJobType(p.jobTypeTarget);
        if (p.state) setState(p.state);
        if (p.city) setCity(p.city);
        if (p.remotePreference) setRemotePreference(p.remotePreference);
        if (p.educationLevel) setEducationLevel(p.educationLevel);
        if (p.yearsExperience) setYearsExperience(p.yearsExperience);
        if (p.skillsRaw) setSkillsRaw(p.skillsRaw);
        if (p.suggestedJobTitles.length > 0) {
          setGeneratedTitles(p.suggestedJobTitles.map(title => ({ title, isActive: true })));
        }
        toast.success(data.message, {
          description: "Review every field in the next steps—you can edit or clear anything.",
        });
      } else {
        toast.message("No auto-fill this time", {
          description: data.message,
        });
      }
    },
    onError: (error) => {
      toast.message("Resume auto-fill failed", {
        description: `${error.message} Continue manually—onboarding is not blocked.`,
      });
    },
  });

  const handleGenerate = () => {
    if (!jobType.trim()) {
      toast.error("Please enter a job type");
      return;
    }
    generateMutation.mutate({ jobType: jobType.trim() });
  };

  const handleToggle = (index: number) => {
    setGeneratedTitles(prev =>
      prev.map((item, i) =>
        i === index ? { ...item, isActive: !item.isActive } : item
      )
    );
  };

  const handleAddTitle = () => {
    if (!jobType.trim()) return;
    const title = jobType.trim();
    if (generatedTitles.some(t => t.title.toLowerCase() === title.toLowerCase())) {
      toast.error("This title is already in your list");
      return;
    }
    setGeneratedTitles(prev => [{ title, isActive: true, isManual: true }, ...prev]);
    toast.success(`"${title}" added to your list`);
    // NOTE: Not clearing input anymore so user can click "Generate variations" immediately after
  };

  // Quick Fill apply (D-021): stage new titles into the local
  // generatedTitles array — onboarding persists at step 5, not now.
  const handleQuickFillApply = (newTitles: string[]) => {
    const existing = new Set(generatedTitles.map(t => t.title.toLowerCase().trim()));
    const fresh = newTitles.filter(t => !existing.has(t.toLowerCase().trim()));
    if (fresh.length === 0) {
      toast.info("All of those are already in your list.");
      return;
    }
    setGeneratedTitles(prev => [
      ...fresh.map(title => ({ title, isActive: true, isManual: true } as { title: string; isActive: boolean })),
      ...prev,
    ]);
    toast.success(`Added ${fresh.length} title${fresh.length === 1 ? "" : "s"}`);
  };

  const handleProfileNext = () => {
    if (!state) { toast.error("Please select your state"); return; }
    if (!city.trim()) { toast.error("Please enter your city"); return; }
    if (!remotePreference) { toast.error("Please select a remote work preference"); return; }
    if (!educationLevel) { toast.error("Please select your education level"); return; }
    if (!yearsExperience) { toast.error("Please select your years of experience"); return; }
    setStep(4);
  };

  const handleComplete = async () => {
    const activeTitles = generatedTitles.filter(t => t.isActive);
    if (activeTitles.length === 0) {
      toast.error("Please select at least one job title");
      return;
    }

    try {
      // Save profile first
      await saveProfileMutation.mutateAsync({
        state,
        city: city.trim(),
        searchRadiusMiles: searchRadius,
        willingToRelocate,
        remotePreference: remotePreference as "remote_only" | "hybrid" | "on_site" | "any",
        educationLevel: educationLevel as "no_degree" | "high_school" | "associates" | "bachelors" | "masters" | "phd",
        yearsExperience: yearsExperience as "0-1" | "1-3" | "3-5" | "5-10" | "10+",
        skillsRaw: skillsRaw.trim() || undefined,
      });

      // Then save job titles (this also marks onboarding complete)
      await saveTitlesMutation.mutateAsync({ titles: generatedTitles });
    } catch {
      // Errors handled by mutation callbacks
    }
  };

  const handleResumeSelection = async (file: File | null) => {
    if (!file) return;
    setSelectedResumeFileName(file.name);
    const lower = file.name.toLowerCase();
    const isPlain =
      file.type === "text/plain" ||
      lower.endsWith(".txt") ||
      lower.endsWith(".md");
    if (isPlain) {
      try {
        const text = await file.text();
        resumeParseMutation.mutate({
          fileName: file.name,
          fileType: file.type || undefined,
          fileSize: file.size,
          resumeText: text,
        });
      } catch {
        toast.error("Could not read that file. Paste resume text below instead.");
      }
      return;
    }
    toast.message("Plain text only", {
      description:
        "PDF/Word are not opened here. Paste resume text below or save as .txt and upload—then AI can suggest fields.",
    });
  };

  const handleParsePastedResume = () => {
    const t = resumePasteText.trim();
    if (!t) {
      toast.error("Paste some resume text first, or choose manual setup.");
      return;
    }
    setSelectedResumeFileName("pasted-resume.txt");
    resumeParseMutation.mutate({
      fileName: "pasted-resume.txt",
      resumeText: t,
    });
  };

  const activeCount = generatedTitles.filter(t => t.isActive).length;
  const totalSteps = 5;
  const isSaving = saveProfileMutation.isPending || saveTitlesMutation.isPending;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-900/20 via-background to-blue-900/20">
      <div className="w-full max-w-3xl">
        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4, 5].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full transition-all ${
                step > s ? 'bg-green-500 text-white' : step === s ? 'bg-purple-500 text-white' : 'bg-muted text-muted-foreground'
              }`}>
                {step > s ? <CheckCircle2 className="h-5 w-5" /> : s}
              </div>
              {i < 4 && <div className={`h-1 w-8 md:w-12 transition-all ${step > s ? 'bg-green-500' : step === s ? 'bg-purple-500' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        <Card className="glass-card border-purple-500/30" data-agent-status="onboarding-card">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-purple-500/20" data-agent-status="onboarding-step-icon">
                {step === 1 && <Briefcase className="h-12 w-12 text-purple-400" />}
                {step === 2 && <Sparkles className="h-12 w-12 text-purple-400" />}
                {step === 3 && <MapPin className="h-12 w-12 text-purple-400" />}
                {step === 4 && <Wrench className="h-12 w-12 text-purple-400" />}
                {step === 5 && <CheckCircle2 className="h-12 w-12 text-green-400" />}
              </div>
            </div>
            <CardTitle className="text-3xl gradient-text" aria-live="polite" aria-atomic="true" data-agent-status="onboarding-step-title">
              {step === 1 && "Welcome to Job Matrix"}
              {step === 2 && "Target Positions"}
              {step === 3 && "Location & Preferences"}
              {step === 4 && "Skills & Experience"}
              {step === 5 && "Review & Complete"}
            </CardTitle>
            <CardDescription className="text-base" aria-live="polite" data-agent-status="onboarding-step-description">
              {step === 1 && "Personalize your job search experience in just a few steps"}
              {step === 2 && "Enter your target roles to build your search list"}
              {step === 3 && "Set your location and preferred work style"}
              {step === 4 && "Describe your professional skills and expertise"}
              {step === 5 && "Review your profile and finalize setup"}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Step 1: Welcome */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Personalized Job Matching</h3>
                      <p className="text-sm text-muted-foreground">
                        Custom job title variations and filters tailored to your unique profile.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Location-Aware Search</h3>
                      <p className="text-sm text-muted-foreground">
                        Find remote, hybrid, and local jobs based on your preferred location and distance.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <GraduationCap className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Qualification Filtering</h3>
                      <p className="text-sm text-muted-foreground">
                        Smart filtering based on your highest degree and total years of career experience.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Environment Status Banner */}
                {envStatus && (
                  <div className={`border rounded-lg p-4 ${
                    envStatus.isConfigured
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-yellow-500/10 border-yellow-500/30'
                  }`}>
                    <div className="flex items-start gap-3">
                      {envStatus.isConfigured ? (
                        <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <h3 className={`font-semibold mb-1 ${
                          envStatus.isConfigured ? 'text-green-300' : 'text-yellow-300'
                        }`}>
                          {envStatus.isConfigured
                            ? `${envStatus.label} — AI ready`
                            : `${envStatus.activeProviderLabel} key not set`}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {envStatus.isConfigured
                            ? `Your ${envStatus.activeProviderLabel} key is configured. AI features are ready to go.`
                            : `Save your ${envStatus.activeProviderLabel} API key in Settings before using AI-powered scans, or switch the active provider on the Settings page.`}
                        </p>
                        {!envStatus.isConfigured && (
                          <div className="mt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-yellow-300 border-yellow-500/50 hover:bg-yellow-500/10"
                              onClick={() => { window.location.href = '/settings'; }}
                            >
                              <HelpCircle className="h-4 w-4 mr-1" />
                              Open Settings
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Mode selector + (conditional) auto-fill upload widget come
                    FIRST — the Continue button's label depends on the mode
                    picked here, so it lives at the bottom of the step. */}
                <div className="space-y-3 pt-2">
                  <Label className="text-sm font-medium">How do you want to start?</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSetupMode("manual")}
                      className={`rounded-lg border p-4 text-left transition-colors ${
                        setupMode === "manual"
                          ? "border-purple-500 bg-purple-500/10"
                          : "border-muted bg-muted/20 hover:bg-muted/40"
                      }`}
                    >
                      <div className="font-semibold">Manual setup (recommended)</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Fast and reliable. You fill fields directly in the next steps.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSetupMode("auto")}
                      className={`rounded-lg border p-4 text-left transition-colors ${
                        setupMode === "auto"
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-muted bg-muted/20 hover:bg-muted/40"
                      }`}
                    >
                      <div className="font-semibold">Auto-fill from resume (optional)</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        The AI reads your text and suggests fields. You always review and edit before saving—manual path stays available.
                      </div>
                    </button>
                  </div>
                </div>

                {setupMode === "auto" && (
                  <div className="border border-blue-500/30 bg-blue-500/10 rounded-lg p-4 space-y-3">
                    <input
                      ref={resumeFileInputRef}
                      type="file"
                      accept=".txt,text/plain,.md"
                      className="hidden"
                      onChange={(event) => void handleResumeSelection(event.target.files?.[0] ?? null)}
                    />
                    <div className="flex items-start gap-3">
                      <FileText className="h-5 w-5 text-blue-300 mt-0.5" />
                      <div>
                        <p className="font-medium">Resume text → AI suggestions</p>
                        <p className="text-sm text-muted-foreground">
                          Upload .txt or paste plain text. Suggestions are optional; if anything looks wrong, edit or ignore and continue manually.
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      onClick={() => resumeFileInputRef.current?.click()}
                      disabled={resumeParseMutation.isPending}
                      className="w-full"
                    >
                      {resumeParseMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Analyzing…
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Upload .txt resume
                        </>
                      )}
                    </Button>

                    <div className="space-y-2">
                      <Label htmlFor="resume-paste" className="text-sm">
                        Or paste resume text
                      </Label>
                      <Textarea
                        id="resume-paste"
                        placeholder="Paste plain text from your resume…"
                        value={resumePasteText}
                        onChange={(e) => setResumePasteText(e.target.value)}
                        rows={5}
                        disabled={resumeParseMutation.isPending}
                        className="resize-y min-h-[100px]"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        disabled={resumeParseMutation.isPending || !resumePasteText.trim()}
                        onClick={handleParsePastedResume}
                      >
                        {resumeParseMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Asking AI…
                          </>
                        ) : (
                          "Suggest fields from pasted text"
                        )}
                      </Button>
                    </div>

                    {selectedResumeFileName && (
                      <p className="text-xs text-muted-foreground">
                        Last source: {selectedResumeFileName}
                      </p>
                    )}
                  </div>
                )}

                <Button
                  onClick={() => setStep(2)}
                  data-agent-action="onboarding-next"
                  className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                  size="lg"
                >
                  Continue with {setupMode === "manual" ? "Manual Setup" : "Optional Auto-fill"}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            )}

            {/* Step 2: Job Type Input + Title Generation */}
            {step === 2 && (
              <div className="space-y-6">
                {resumeAiSuggestionsApplied && (
                  <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm text-muted-foreground">
                    Some fields below may have been filled from your resume. Treat them as <span className="text-foreground font-medium">suggestions</span>—edit or replace anything before you finish onboarding.
                  </div>
                )}
                {/* Quiet "need ideas?" link — D-021 Phase 15. Opens the
                    same WorkStyleQuickFillDialog the Preferences page
                    uses. Apply appends to the local generatedTitles
                    array; onboarding persists at step 5 like normal. */}
                <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-sm">
                    <span className="font-medium text-foreground">Not sure what to type?</span>
                    <span className="text-muted-foreground"> Grab a starter pack by work style — you can uncheck what doesn't fit.</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    data-agent-action="open-work-style-quickfill"
                    onClick={() => setQuickFillOpen(true)}
                    className="shrink-0 border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
                  >
                    <Sparkles className="mr-1.5 h-4 w-4" />
                    Quick fill
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jobType" className="text-base font-semibold">Manually Add or Generate Job Titles</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="jobType"
                        placeholder="e.g., Remote Data Entry, Customer Service..."
                        value={jobType}
                        onChange={(e) => setJobType(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddTitle();
                          }
                        }}
                        className="text-lg py-6 pr-10"
                        disabled={generateMutation.isPending}
                        data-agent-input="user-job-type"
                      />
                      {jobType && (
                        <button
                          onClick={() => setJobType("")}
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
                      disabled={!jobType.trim() || generateMutation.isPending}
                      variant="secondary"
                      className="h-auto px-6 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                      data-agent-action="add-title-manually"
                    >
                      Manually add
                    </Button>
                  </div>
                  <div className="text-sm space-y-1 mt-1">
                    <p className="text-foreground/80 font-medium">Titles you are searching for:</p>
                    <div className="flex flex-col gap-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-blue-400 font-medium">Blue titles</span> are jobs you have manually saved
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        <span className="text-purple-400 font-medium">Purple titles</span> are AI suggestions
                      </p>
                    </div>
                  </div>
                </div>

                {generateMutation.isPending && (
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-6">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                      <div>
                        <p className="font-semibold text-foreground">Generating variations...</p>
                        <p className="text-sm text-muted-foreground">Finding more ways to describe your role</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Show generated titles inline */}
                {generatedTitles.length > 0 && (
                  <div className="space-y-3">
                    <div className="max-h-72 overflow-y-auto space-y-2 pr-2">
                      {generatedTitles.map((item, index) => (
                        <div
                          key={index}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                            item.isActive
                              ? (item as any).isManual ? "bg-blue-500/10 border-blue-500/30" : "bg-purple-500/10 border-purple-500/30"
                              : "bg-muted/50 border-muted opacity-60"
                          }`}
                        >
                          <span className={`font-medium text-sm ${item.isActive ? "text-foreground" : "text-muted-foreground line-through"}`}>
                            {item.title}
                          </span>
                          <Switch
                            checked={item.isActive}
                            onCheckedChange={() => handleToggle(index)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-border/40">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    disabled={generateMutation.isPending}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleGenerate}
                    disabled={!jobType.trim() || generateMutation.isPending}
                    className="flex-1 border-purple-500/50 text-purple-300 hover:bg-purple-500/10"
                    variant="outline"
                    data-agent-action="generate-titles"
                  >
                    {generateMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate variations
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => activeCount > 0 ? setStep(3) : toast.error("Select at least one job title")}
                    disabled={activeCount === 0 || generateMutation.isPending}
                    className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                    data-agent-action="onboarding-next"
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Location & Preferences */}
            {step === 3 && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">State</Label>
                    <Select value={state} onValueChange={setState}>
                      <SelectTrigger data-agent-input="user-state">
                        <SelectValue placeholder="Select your state" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-sm font-medium">City</Label>
                    <Input
                      id="city"
                      placeholder="e.g., Austin"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      data-agent-input="user-city"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Search Radius (miles)</Label>
                    <Input
                      type="number"
                      min={5}
                      max={500}
                      value={searchRadius}
                      onChange={(e) => setSearchRadius(Number(e.target.value))}
                      data-agent-input="user-search-radius"
                    />
                    <p className="text-xs text-muted-foreground">How far from your city to search for on-site jobs</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Willing to Relocate?</Label>
                    <div className="flex items-center gap-3 pt-2">
                      <Switch
                        checked={willingToRelocate}
                        onCheckedChange={setWillingToRelocate}
                        data-agent-input="user-relocate-willingness"
                      />
                      <span className="text-sm text-muted-foreground">{willingToRelocate ? "Yes" : "No"}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Remote Work Preference</Label>
                  <Select value={remotePreference} onValueChange={setRemotePreference}>
                    <SelectTrigger data-agent-input="user-remote-preference">
                      <SelectValue placeholder="Select your preference" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(REMOTE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Highest Degree Earned</Label>
                    <Select value={educationLevel} onValueChange={setEducationLevel}>
                      <SelectTrigger data-agent-input="user-education-level">
                        <SelectValue placeholder="Select highest degree" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(EDUCATION_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Total Career Experience</Label>
                    <Select value={yearsExperience} onValueChange={setYearsExperience}>
                      <SelectTrigger data-agent-input="user-experience-years">
                        <SelectValue placeholder="Select career length" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(EXPERIENCE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" data-agent-action="onboarding-back" onClick={() => setStep(2)} className="flex-1">
                    Back
                  </Button>
                  <Button
                    onClick={handleProfileNext}
                    data-agent-action="onboarding-next"
                    className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>                </div>
              </div>
            )}

            {/* Step 4: Skills */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">
                    Describe your professional skills and expertise in your own words.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="skills" className="text-sm font-medium">Skills & Experience</Label>
                  <Textarea
                    id="skills"
                    placeholder="e.g., 5 years customer service, 2 years data entry, basic Python programming, proficient in Microsoft Office, some experience with CRM systems like Salesforce"
                    value={skillsRaw}
                    onChange={(e) => setSkillsRaw(e.target.value)}
                    rows={6}
                    className="resize-none"
                    data-agent-input="user-skills-raw"
                  />
                  <p className="text-xs text-muted-foreground">
                    Be as specific as possible — mention tools and proficiency levels.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" data-agent-action="onboarding-back" onClick={() => setStep(3)} className="flex-1">
                    Back
                  </Button>
                  <Button
                    onClick={() => setStep(5)}
                    data-agent-action="onboarding-next"
                    className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                  >
                    {skillsRaw.trim() ? "Continue" : "Skip & Continue"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>                </div>
              </div>
            )}

            {/* Step 5: Review */}
            {step === 5 && (
              <div className="space-y-6">
                {/* Job Titles Summary */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-purple-400" />
                    Job Titles ({activeCount} selected)
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {generatedTitles.filter(t => t.isActive).map((t, i) => (
                      <span key={i} className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-sm border border-purple-500/30">
                        {t.title}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Profile Summary */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-green-400" />
                    Location & Preferences
                  </h3>
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Location:</span>
                      <span className="text-foreground font-medium">{city}, {state}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Search Radius:</span>
                      <span className="text-foreground font-medium">{searchRadius} miles</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Willing to Relocate:</span>
                      <span className="text-foreground font-medium">{willingToRelocate ? "Yes" : "No"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Remote Preference:</span>
                      <span className="text-foreground font-medium">{REMOTE_LABELS[remotePreference] || remotePreference}</span>
                    </div>
                  </div>
                </div>

                {/* Qualifications Summary */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-blue-400" />
                    Highest Degree & Experience
                  </h3>
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Highest Degree:</span>
                      <span className="text-foreground font-medium">{EDUCATION_LABELS[educationLevel] || educationLevel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Career History:</span>
                      <span className="text-foreground font-medium">{EXPERIENCE_LABELS[yearsExperience] || yearsExperience}</span>
                    </div>
                  </div>
                </div>

                {/* Skills Summary */}
                {skillsRaw.trim() && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-orange-400" />
                      Skills
                    </h3>
                    <div className="bg-muted/50 rounded-lg p-4 text-sm text-foreground">
                      {skillsRaw}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" data-agent-action="onboarding-back" onClick={() => setStep(4)} disabled={isSaving} className="flex-1">
                    Back
                  </Button>
                  <Button
                    onClick={handleComplete}
                    data-agent-action="onboarding-complete"
                    disabled={isSaving}
                    className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                  >                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        Complete Setup
                        <CheckCircle2 className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Step {step} of {totalSteps}
        </p>
      </div>

      <WorkStyleQuickFillDialog
        open={quickFillOpen}
        onOpenChange={setQuickFillOpen}
        onApply={handleQuickFillApply}
        existingTitles={generatedTitles.map(t => t.title)}
      />
    </div>
  );
}
