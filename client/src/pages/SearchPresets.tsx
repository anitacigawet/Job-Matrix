import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Star, Pencil, Trash2, Play, Bookmark, MapPin, Briefcase, Globe } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { PlatformBadge, getPlatformName } from "@/components/PlatformBadge";

const PLATFORMS = [
  { id: "indeed", name: "Indeed" },
  { id: "glassdoor", name: "Glassdoor" },
  { id: "linkedin", name: "LinkedIn" },
  { id: "ziprecruiter", name: "ZipRecruiter" },
  { id: "google", name: "Google Jobs" },
];

/**
 * Search-presets list + editor. Lives as the "Presets" sub-tab of
 * /preferences (see JobPreferences.tsx) — there's no longer a
 * standalone /presets route. The component is therefore body-only:
 * no PageHeader, no container wrapper, no background blurs.
 */
export function SearchPresetsContent() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: presets = [], isLoading } = trpc.presets.list.useQuery();
  const { data: userProfile } = trpc.personalized.getUserProfile.useQuery();
  const { data: userJobTitlesList = [] } = trpc.onboarding.getJobTitles.useQuery();

  // Form state for create/edit dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formJobTitles, setFormJobTitles] = useState<string[]>([]);
  const [formLocation, setFormLocation] = useState("");
  const [formRadius, setFormRadius] = useState(50);
  const [formRemotePref, setFormRemotePref] = useState<"remote_only" | "hybrid" | "on_site" | "any">("any");
  const [formPlatforms, setFormPlatforms] = useState<string[]>(["indeed"]);
  const [formMinSalary, setFormMinSalary] = useState<string>("");
  const [formIsDefault, setFormIsDefault] = useState(false);

  const activeTitles = useMemo(() => userJobTitlesList.filter(t => t.isActive).map(t => t.title), [userJobTitlesList]);

  const createPreset = trpc.presets.create.useMutation({
    onSuccess: () => {
      utils.presets.list.invalidate();
      setIsDialogOpen(false);
      toast.success("Search preset created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updatePreset = trpc.presets.update.useMutation({
    onSuccess: () => {
      utils.presets.list.invalidate();
      setIsDialogOpen(false);
      setEditingPreset(null);
      toast.success("Search preset updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deletePreset = trpc.presets.delete.useMutation({
    onSuccess: () => {
      utils.presets.list.invalidate();
      toast.success("Search preset deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  // Pending-apply state. We keep the whole preset (not just the id) so the
  // confirmation dialog can show the user what they're about to overwrite.
  const [applyingPreset, setApplyingPreset] = useState<(typeof presets)[number] | null>(null);

  const applyPreset = trpc.presets.activate.useMutation({
    onSuccess: (res) => {
      // Refresh every query the apply mutation could have changed so
      // /preferences, /jobs and /home reflect the new state immediately.
      utils.presets.list.invalidate();
      utils.personalized.getUserProfile.invalidate();
      utils.onboarding.getJobTitles.invalidate();
      utils.settings.getEnabledPlatforms.invalidate();
      const name = applyingPreset?.name ?? "Preset";
      setApplyingPreset(null);
      if (res.locationWarning) {
        toast.warning(`${name} applied. ${res.locationWarning}`);
      } else {
        toast.success(
          `${name} applied — ${res.appliedTitles} title${res.appliedTitles === 1 ? "" : "s"}, ${res.appliedPlatforms} platform${res.appliedPlatforms === 1 ? "" : "s"} active.`,
        );
      }
    },
    onError: (err) => toast.error(err.message),
  });

  function openCreateDialog() {
    setEditingPreset(null);
    setFormName("");
    setFormJobTitles(activeTitles.length > 0 ? [...activeTitles] : []);
    setFormLocation(userProfile ? `${userProfile.city}, ${userProfile.stateAbbr}` : "");
    setFormRadius(userProfile?.searchRadiusMiles || 50);
    setFormRemotePref(userProfile?.remotePreference as any || "any");
    setFormPlatforms(["indeed"]);
    setFormMinSalary("");
    setFormIsDefault(presets.length === 0);
    setIsDialogOpen(true);
  }

  function openEditDialog(preset: typeof presets[0]) {
    setEditingPreset(preset.id);
    setFormName(preset.name);
    setFormJobTitles(preset.jobTitles as string[]);
    setFormLocation(preset.location);
    setFormRadius(preset.radiusMiles);
    setFormRemotePref(preset.remotePreference);
    setFormPlatforms(preset.platforms as string[]);
    setFormMinSalary(preset.minSalary ? preset.minSalary.toString() : "");
    setFormIsDefault(preset.isDefault === 1);
    setIsDialogOpen(true);
  }

  function handleSave() {
    if (!formName.trim()) {
      toast.error("Please enter a preset name");
      return;
    }
    if (formJobTitles.length === 0) {
      toast.error("Please select at least one job title");
      return;
    }
    if (!formLocation.trim()) {
      toast.error("Please enter a location");
      return;
    }

    const data = {
      name: formName.trim(),
      jobTitles: formJobTitles,
      location: formLocation.trim(),
      radiusMiles: formRadius,
      remotePreference: formRemotePref,
      platforms: formPlatforms,
      minSalary: formMinSalary ? parseInt(formMinSalary) : null,
      isDefault: formIsDefault,
    };

    if (editingPreset) {
      updatePreset.mutate({ id: editingPreset, ...data });
    } else {
      createPreset.mutate(data);
    }
  }

  function toggleJobTitle(title: string) {
    setFormJobTitles(prev =>
      prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]
    );
  }

  function togglePlatform(platformId: string) {
    setFormPlatforms(prev => {
      if (prev.includes(platformId)) {
        if (prev.length === 1) return prev; // Must have at least one
        return prev.filter(p => p !== platformId);
      }
      return [...prev, platformId];
    });
  }

  const defaultPreset = presets.find(p => p.isDefault === 1);

  return (
    <div>
      {/* Header row — the "New Preset" CTA used to live in a
          page-level PageHeader's rightAction. Embedded under
          Preferences now, so we render an inline row with a short
          intro paragraph + the CTA. */}
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-prose">
          Save different search configurations for quick switching between job searches.
        </p>
        <Button
          onClick={openCreateDialog}
          className="gap-2 gradient-button text-white shrink-0"
          data-agent-action="new-preset"
        >
          <Plus className="h-4 w-4" />
          New Preset
        </Button>
      </div>

      {/* Presets List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16" aria-live="polite" data-agent-status="loading-presets">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : presets.length === 0 ? (
        <Card className="glass-card" data-agent-status="empty-presets">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Bookmark className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Search Presets Yet</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Create search presets to quickly switch between different job search configurations.
              Each preset saves your job titles, location, platforms, and filters.
            </p>
            <Button 
              onClick={openCreateDialog} 
              className="gap-2 gradient-button text-white"
              data-agent-action="create-first-preset"
            >
              <Plus className="h-4 w-4" />
              Create Your First Preset
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4" data-agent-status="preset-list">
          {presets.map(preset => (
            <Card key={preset.id} className={`glass-card transition-all hover:border-primary/30 ${preset.isDefault === 1 ? 'border-primary/50 ring-1 ring-primary/20' : ''}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-bold">{preset.name}</h3>
                      {preset.isDefault === 1 && (
                        <Badge className="bg-primary/20 text-primary border-primary/40 gap-1">
                          <Star className="h-3 w-3" /> Default
                        </Badge>
                      )}
                    </div>

                    {/* Job Titles */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {(preset.jobTitles as string[]).slice(0, 5).map(title => (
                        <Badge key={title} variant="secondary" className="bg-blue-500/20 text-blue-300 border-blue-500/40 text-xs">
                          {title}
                        </Badge>
                      ))}
                      {(preset.jobTitles as string[]).length > 5 && (
                        <Badge variant="secondary" className="bg-gray-500/20 text-gray-300 text-xs">
                          +{(preset.jobTitles as string[]).length - 5} more
                        </Badge>
                      )}
                    </div>

                    {/* Details Row */}
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {preset.location} ({preset.radiusMiles} mi)
                      </span>
                      <span className="flex items-center gap-1">
                        <Globe className="h-3.5 w-3.5" />
                        {preset.remotePreference === "remote_only" ? "Remote Only" :
                         preset.remotePreference === "hybrid" ? "Hybrid" :
                         preset.remotePreference === "on_site" ? "On-Site" : "Any"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5" />
                        {(preset.platforms as string[]).map(p => getPlatformName(p)).join(", ")}
                      </span>
                      {preset.minSalary && (
                        <span className="text-green-400">
                          Min ${preset.minSalary.toLocaleString()}/yr
                        </span>
                      )}
                    </div>

                    {preset.lastUsedAt && (
                      <p className="text-xs text-muted-foreground/60 mt-2">
                        Last used: {new Date(preset.lastUsedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 ml-4 items-start">
                    <Button
                      size="sm"
                      onClick={() => setApplyingPreset(preset)}
                      disabled={applyPreset.isPending}
                      aria-label={`Apply preset ${preset.name}`}
                      data-agent-action={`apply-preset-${preset.id}`}
                      title="Apply this preset (overwrites your active job titles, location, platforms, salary filter)"
                      className="gap-1.5 gradient-button text-white"
                    >
                      {applyPreset.isPending && applyingPreset?.id === preset.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      Apply
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(preset)}
                      aria-label={`Edit preset ${preset.name}`}
                      data-agent-action={`edit-preset-${preset.id}`}
                      title="Edit preset"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm("Delete this search preset?")) {
                          deletePreset.mutate({ id: preset.id });
                        }
                      }}
                      aria-label={`Delete preset ${preset.name}`}
                      data-agent-action={`delete-preset-${preset.id}`}
                      title="Delete preset"
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPreset ? "Edit Search Preset" : "Create Search Preset"}</DialogTitle>
            <DialogDescription>
              Configure a search preset to quickly switch between different job search configurations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Name */}
            <div className="space-y-2">
              <Label>Preset Name</Label>
              <Input
                placeholder="e.g., Remote Data Entry, Local Customer Service"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            {/* Job Titles */}
            <div className="space-y-2">
              <Label>Job Titles</Label>
              <div className="flex flex-wrap gap-2">
                {activeTitles.map(title => (
                  <Badge
                    key={title}
                    variant={formJobTitles.includes(title) ? "default" : "outline"}
                    className={`cursor-pointer transition-all ${
                      formJobTitles.includes(title)
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-primary/20"
                    }`}
                    onClick={() => toggleJobTitle(title)}
                    data-agent-action={`toggle-preset-title-${title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {title}
                  </Badge>
                ))}
              </div>
              {activeTitles.length === 0 && (
                <p className="text-xs text-muted-foreground">No job titles configured. Set them up in Preferences first.</p>
              )}
            </div>

            {/* Location */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  placeholder="City, State"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Radius (miles)</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={formRadius}
                  onChange={(e) => setFormRadius(parseInt(e.target.value) || 50)}
                />
              </div>
            </div>

            {/* Remote Preference */}
            <div className="space-y-2">
              <Label>Remote Preference</Label>
              <Select value={formRemotePref} onValueChange={(v: any) => setFormRemotePref(v)}>
                <SelectTrigger data-agent-action="select-preset-remote-pref">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any (Remote + On-Site)</SelectItem>
                  <SelectItem value="remote_only">Remote Only</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="on_site">On-Site Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Platforms */}
            <div className="space-y-2">
              <Label>Platforms</Label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map(platform => (
                  <Badge
                    key={platform.id}
                    variant={formPlatforms.includes(platform.id) ? "default" : "outline"}
                    className={`cursor-pointer transition-all ${
                      formPlatforms.includes(platform.id)
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-primary/20"
                    }`}
                    onClick={() => togglePlatform(platform.id)}
                    data-agent-action={`toggle-preset-platform-${platform.id}`}
                  >
                    {platform.name}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Min Salary */}
            <div className="space-y-2">
              <Label>Minimum Salary (optional)</Label>
              <Input
                type="number"
                placeholder="e.g., 30000"
                value={formMinSalary}
                onChange={(e) => setFormMinSalary(e.target.value)}
              />
            </div>

            {/* Default Toggle */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isDefault"
                checked={formIsDefault}
                onChange={(e) => setFormIsDefault(e.target.checked)}
                className="rounded"
                data-agent-action="toggle-preset-default"
              />
              <Label htmlFor="isDefault" className="cursor-pointer">
                Set as default preset (used for auto-scans)
              </Label>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button variant="outline" data-agent-action="cancel-preset-save">Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleSave}
              disabled={createPreset.isPending || updatePreset.isPending}
              className="gap-2 gradient-button text-white"
              data-agent-action="save-preset"
            >
              {(createPreset.isPending || updatePreset.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {editingPreset ? "Update Preset" : "Create Preset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply-preset confirmation Dialog (destructive: overwrites prefs). */}
      <Dialog
        open={applyingPreset !== null}
        onOpenChange={(open) => {
          if (!open && !applyPreset.isPending) setApplyingPreset(null);
        }}
      >
        <DialogContent
          className="max-w-md"
          data-agent-status={applyingPreset ? `apply-preset-confirm-${applyingPreset.id}` : undefined}
        >
          <DialogHeader>
            <DialogTitle>Apply preset?</DialogTitle>
            <DialogDescription>
              {applyingPreset && (
                <>
                  Applying <span className="text-foreground font-medium">{applyingPreset.name}</span> will overwrite
                  your active preferences:
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {applyingPreset && (
            <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
              <li>
                <span className="text-foreground">{applyingPreset.jobTitles.length}</span> job title
                {applyingPreset.jobTitles.length === 1 ? "" : "s"} → becomes your active list (existing titles not in the
                preset are deactivated, not deleted)
              </li>
              <li>
                Location → <span className="text-foreground">{applyingPreset.location}</span>, radius{" "}
                <span className="text-foreground">{applyingPreset.radiusMiles} mi</span>
              </li>
              <li>
                Remote preference → <span className="text-foreground">{applyingPreset.remotePreference.replace(/_/g, " ")}</span>
              </li>
              <li>
                Enabled platforms →{" "}
                <span className="text-foreground">{applyingPreset.platforms.join(", ")}</span>
              </li>
              <li>
                Salary filter →{" "}
                {applyingPreset.minSalary != null ? (
                  <>
                    enabled at <span className="text-foreground">${applyingPreset.minSalary.toLocaleString()}+</span>
                  </>
                ) : (
                  <span className="text-foreground">disabled</span>
                )}
              </li>
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Your education, years of experience, skills, and résumé text are not touched — presets don't track those.
          </p>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => setApplyingPreset(null)}
              disabled={applyPreset.isPending}
              data-agent-action="cancel-apply-preset"
            >
              Cancel
            </Button>
            <Button
              onClick={() => applyingPreset && applyPreset.mutate({ id: applyingPreset.id })}
              disabled={applyPreset.isPending || !applyingPreset}
              className="gap-2 gradient-button text-white"
              data-agent-action="confirm-apply-preset"
            >
              {applyPreset.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Apply preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
