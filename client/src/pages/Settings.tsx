import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Bell,
  BellOff,
  Clock,
  Play,
  Send,
  Settings as SettingsIcon,
  Zap,
  CalendarClock,
  CheckCircle2,
  KeyRound,
  ExternalLink,
  Trash2,
  DatabaseBackup,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { getFriendlyApiErrorMessage } from "@/lib/api-errors";
import { DataSourcesCard } from "@/components/DataSourcesCard";
import { PageHeader } from "@/components/PageHeader";
import { useSubNav } from "@/components/SubNav";
import { SettingsAppearance } from "@/components/AppearancePopover";
import { AutomationConnectionsCard } from "@/components/AutomationConnectionsCard";

const FREQUENCY_LABELS: Record<string, string> = {
  every_6h: "Every 6 Hours",
  every_12h: "Every 12 Hours",
  daily: "Once Daily",
  every_2d: "Every 2 Days",
  weekly: "Weekly",
};

const DIGEST_LABELS: Record<string, string> = {
  immediate: "Immediately (as events happen)",
  daily: "Daily Digest",
  weekly: "Weekly Summary",
  never: "Never (notifications disabled)",
};

type ProviderId = "gemini" | "openai" | "deepseek";

const PROVIDER_META: Record<
  ProviderId,
  {
    label: string;
    keyHelpText: string;
    keyHref: string;
    modelHint: string;
    rateLimitHint: string;
  }
> = {
  gemini: {
    label: "Google Gemini",
    keyHelpText: "Get a key at",
    keyHref: "https://aistudio.google.com/app/apikey",
    modelHint:
      "Default is gemini-2.0-flash. Other options include gemini-2.0-pro-exp-02-05 and gemini-1.5-flash-001.",
    rateLimitHint:
      "Recommended: 1.0 RPS for the free tier; raise it for paid keys.",
  },
  openai: {
    label: "OpenAI",
    keyHelpText: "Get a key at",
    keyHref: "https://platform.openai.com/api-keys",
    modelHint:
      "Default is gpt-4o-mini. Other options include gpt-4o and gpt-4.1-mini.",
    rateLimitHint:
      "Recommended: 1.0 RPS for low tiers; raise it for higher org limits.",
  },
  deepseek: {
    label: "DeepSeek",
    keyHelpText: "Get a key at",
    keyHref: "https://platform.deepseek.com/api_keys",
    modelHint:
      "Default is deepseek-chat. You can also use deepseek-reasoner for harder filtering.",
    rateLimitHint:
      "Recommended: 1.0 RPS for DeepSeek Free/Tier 1; higher for paid tiers.",
  },
};

const PROVIDER_TAB_ORDER: ProviderId[] = ["gemini", "openai", "deepseek"];

export function SettingsPage() {
  const utils = trpc.useUtils();
  const { data: settings, isLoading } = trpc.settings.getSettings.useQuery();
  const { current: subNavTab } = useSubNav();
  const activeTab = subNavTab ?? "llm";

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notifyOnNewEligible, setNotifyOnNewEligible] = useState(true);
  const [notifyOnScanComplete, setNotifyOnScanComplete] = useState(true);
  const [digestFrequency, setDigestFrequency] = useState("daily");
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [autoScanFrequency, setAutoScanFrequency] = useState("daily");
  const [autoScanIncludeAI, setAutoScanIncludeAI] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const resetLocalDataMutation = trpc.personalized.nukeEverything.useMutation({
    onSuccess: () => {
      toast.success("Local Job Matrix data reset");
      setResetDialogOpen(false);
      window.location.assign("/");
    },
    onError: e => toast.error(`Reset failed: ${getFriendlyApiErrorMessage(e)}`),
  });

  useEffect(() => {
    if (settings && !initialized) {
      setNotificationsEnabled(!!settings.notificationsEnabled);
      setNotifyOnNewEligible(!!settings.notifyOnNewEligible);
      setNotifyOnScanComplete(!!settings.notifyOnScanComplete);
      setDigestFrequency(settings.notifyDigestFrequency || "daily");
      setAutoScanEnabled(!!settings.autoScanEnabled);
      setAutoScanFrequency(settings.autoScanFrequency || "daily");
      setAutoScanIncludeAI(!!settings.autoScanIncludeAI);
      setInitialized(true);
    }
  }, [settings, initialized]);

  const updateNotifMutation = trpc.settings.updateNotifications.useMutation({
    onSuccess: () => {
      toast.success("Notification settings updated");
      utils.settings.getSettings.invalidate();
    },
    onError: e => toast.error(`Failed: ${getFriendlyApiErrorMessage(e)}`),
  });

  const updateAutoScanMutation = trpc.settings.updateAutoScan.useMutation({
    onSuccess: () => {
      toast.success("Auto-scan settings updated");
      utils.settings.getSettings.invalidate();
    },
    onError: e => toast.error(`Failed: ${getFriendlyApiErrorMessage(e)}`),
  });

  const testNotifMutation = trpc.settings.sendTestNotification.useMutation({
    onSuccess: data => {
      if (data.success)
        toast.success("Test notification sent! Check your server console.");
      else toast.error("Notification dispatch failed.");
    },
    onError: e => toast.error(`Failed: ${getFriendlyApiErrorMessage(e)}`),
  });

  // ── LLM provider management ─────────────────────────────────────
  // `activeProvider` is the provider that runs at AI-call time.
  // `editingProvider` is which provider's tab the user is currently editing.
  // They start in sync on initial load but become independent after that, so a
  // user can stash a backup OpenAI/DeepSeek key without changing which provider
  // is actually being used.
  const llmQuery = trpc.settings.getLlm.useQuery();
  const [activeProvider, setActiveProvider] = useState<ProviderId>("gemini");
  const [editingProvider, setEditingProvider] = useState<ProviderId>("gemini");
  const [keyInputs, setKeyInputs] = useState<Record<ProviderId, string>>({
    gemini: "",
    openai: "",
    deepseek: "",
  });
  const [modelInputs, setModelInputs] = useState<Record<ProviderId, string>>({
    gemini: "",
    openai: "",
    deepseek: "",
  });
  const [rateLimitEnabled, setRateLimitEnabled] = useState(false);
  const [rateLimitRps, setRateLimitRps] = useState(1);
  const [llmInitialized, setLlmInitialized] = useState(false);

  useEffect(() => {
    if (llmQuery.data && !llmInitialized) {
      setActiveProvider(llmQuery.data.activeProvider);
      setEditingProvider(llmQuery.data.activeProvider);
      const m: Record<ProviderId, string> = {
        gemini: "",
        openai: "",
        deepseek: "",
      };
      for (const p of llmQuery.data.providers)
        m[p.id as ProviderId] = p.model ?? "";
      setModelInputs(m);
      const rps = llmQuery.data.rateLimitRps ?? 0;
      setRateLimitEnabled(rps > 0);
      setRateLimitRps(rps > 0 ? rps : 1);
      setLlmInitialized(true);
    }
  }, [llmQuery.data, llmInitialized]);

  const llmSaveMutation = trpc.settings.saveLlm.useMutation({
    onSuccess: () => {
      toast.success("LLM settings saved");
      setKeyInputs({ gemini: "", openai: "", deepseek: "" });
      llmQuery.refetch();
    },
    onError: e => toast.error(`Save failed: ${getFriendlyApiErrorMessage(e)}`),
  });

  const llmClearMutation = trpc.settings.clearProviderKey.useMutation({
    onSuccess: () => {
      toast.success("Key cleared");
      llmQuery.refetch();
    },
    onError: e => toast.error(`Clear failed: ${getFriendlyApiErrorMessage(e)}`),
  });

  const testProviderMutation = trpc.settings.testProvider.useMutation({
    onSuccess: (result: any) => {
      if (result?.ok) {
        toast.success(result.message ?? "Connection OK");
      } else {
        toast.error(result?.message ?? "Connection test failed");
      }
    },
    onError: e => toast.error(`Test failed: ${getFriendlyApiErrorMessage(e)}`),
  });

  const testSavedProviderMutation = trpc.settings.testSavedProvider.useMutation(
    {
      onSuccess: (result: any) => {
        if (result?.ok) {
          toast.success(result.message ?? "Connection OK");
        } else {
          toast.error(result?.message ?? "Connection test failed");
        }
      },
      onError: e =>
        toast.error(`Test failed: ${getFriendlyApiErrorMessage(e)}`),
    }
  );
  const isTesting =
    testProviderMutation.isPending || testSavedProviderMutation.isPending;

  const providersById = useMemo(() => {
    const out: Partial<
      Record<ProviderId, NonNullable<typeof llmQuery.data>["providers"][number]>
    > = {};
    for (const p of llmQuery.data?.providers ?? []) out[p.id as ProviderId] = p;
    return out;
  }, [llmQuery.data]);

  const handleSaveLlm = () => {
    const payload: Record<string, unknown> = {
      activeProvider,
      rateLimitRps: rateLimitEnabled ? rateLimitRps : 0,
    };
    for (const p of PROVIDER_TAB_ORDER) {
      const k = keyInputs[p].trim();
      const m = modelInputs[p].trim();
      if (k) payload[`${p}Key`] = k;
      if (m) payload[`${p}Model`] = m;
    }
    llmSaveMutation.mutate(payload);
  };

  const handleSaveNotifications = () => {
    updateNotifMutation.mutate({
      notificationsEnabled,
      notifyOnNewEligible,
      notifyOnScanComplete,
      notifyDigestFrequency: digestFrequency as
        | "immediate"
        | "daily"
        | "weekly"
        | "never",
    });
  };

  const handleSaveAutoScan = () => {
    updateAutoScanMutation.mutate({
      autoScanEnabled,
      autoScanFrequency: autoScanFrequency as
        | "every_6h"
        | "every_12h"
        | "daily"
        | "every_2d"
        | "weekly",
      autoScanIncludeAI,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const nextRunFormatted = settings?.autoScanNextRun
    ? new Date(settings.autoScanNextRun).toLocaleString()
    : "Not scheduled";
  const lastRunFormatted = settings?.autoScanLastRun
    ? new Date(settings.autoScanLastRun).toLocaleString()
    : "Never";

  const activeProviderInfo = providersById[activeProvider];
  const activeHasKey = !!activeProviderInfo?.hasKey;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl mx-auto py-8">
        <PageHeader
          title="Settings"
          subtitle="Configure your AI provider, notifications, and automated scanning"
          icon={<SettingsIcon className="h-8 w-8" />}
        />

        <div className="space-y-6">
          {activeTab === "automation" && <AutomationConnectionsCard />}
          {activeTab === "llm" && (
            <div className="space-y-6">
              <Card
                className="glass-card"
                data-agent-status="llm-settings-card"
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 flex-wrap">
                    <KeyRound className="h-5 w-5 text-purple-400" />
                    AI Provider
                    <Badge
                      variant="outline"
                      className={
                        activeHasKey
                          ? "bg-green-500/10 text-green-400 border-green-500/40"
                          : "bg-red-500/10 text-red-400 border-red-500/40"
                      }
                      aria-live="polite"
                      data-agent-status="llm-key-status"
                    >
                      {activeHasKey ? "Active key configured" : "No key set"}
                    </Badge>
                    {activeHasKey && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-7 gap-1.5 text-xs"
                        data-agent-action="test-active-provider"
                        onClick={() =>
                          testSavedProviderMutation.mutate({
                            provider: activeProvider,
                          })
                        }
                        disabled={isTesting}
                        title={`Test the saved key for the active provider (${PROVIDER_META[activeProvider].label})`}
                      >
                        {testSavedProviderMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Zap className="h-3 w-3" />
                        )}
                        Test active provider
                      </Button>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Job Matrix uses an LLM to filter and score job listings.
                    Pick your provider and bring your own API key — it is stored
                    on your machine and sent only to that provider for
                    authentication.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Active Provider
                    </Label>
                    <Select
                      value={activeProvider}
                      onValueChange={v => {
                        const next = v as ProviderId;
                        setActiveProvider(next);
                        // If the user changes which provider runs, snap the
                        // editing tab to it so they can verify the key is set.
                        setEditingProvider(next);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDER_TAB_ORDER.map(p => {
                          const has = providersById[p]?.hasKey;
                          return (
                            <SelectItem key={p} value={p}>
                              {PROVIDER_META[p].label}
                              {has ? " ✓" : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Only the active provider's key is used for AI calls. The
                      other keys remain saved for quick switching — switch tabs
                      below to edit a non-active provider's key without changing
                      which one runs.
                    </p>
                  </div>

                  <Tabs
                    value={editingProvider}
                    onValueChange={v => setEditingProvider(v as ProviderId)}
                    className="space-y-4"
                  >
                    <TabsList className="grid w-full grid-cols-3">
                      {PROVIDER_TAB_ORDER.map(p => (
                        <TabsTrigger
                          key={p}
                          value={p}
                          data-agent-action={`edit-${p}-provider`}
                        >
                          {PROVIDER_META[p].label}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {PROVIDER_TAB_ORDER.map(p => {
                      const meta = PROVIDER_META[p];
                      const info = providersById[p];
                      return (
                        <TabsContent key={p} value={p} className="space-y-5">
                          {info?.hasKey && (
                            <div
                              className="p-3 rounded-lg border border-green-500/30 bg-green-500/5 text-sm"
                              aria-live="polite"
                              data-agent-status={`active-${p}-key`}
                            >
                              Saved key:{" "}
                              <code className="font-mono">
                                {info.keyMasked}
                              </code>{" "}
                              <span className="text-muted-foreground">
                                (
                                {info.keySource === "env"
                                  ? "from env var"
                                  : "from settings file"}
                                )
                              </span>
                            </div>
                          )}

                          <div className="space-y-2">
                            <Label className="text-sm font-medium">
                              API Key
                            </Label>
                            <Input
                              type="password"
                              placeholder={
                                p === "openai"
                                  ? "sk-..."
                                  : p === "deepseek"
                                    ? "sk-..."
                                    : "AIzaSy..."
                              }
                              value={keyInputs[p]}
                              onChange={e =>
                                setKeyInputs(s => ({
                                  ...s,
                                  [p]: e.target.value,
                                }))
                              }
                              autoComplete="off"
                              data-agent-input={`${p}-api-key`}
                            />
                            {/* Test Connection lives right under the input it tests
                              (D11.14, 2026-05-17). Previously buried in a button
                              row at the bottom of the form, which made it look
                              like a peer of Save — audit Theme 3. */}
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <p className="text-xs text-muted-foreground flex-1 min-w-0">
                                {meta.keyHelpText}{" "}
                                <a
                                  href={meta.keyHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-purple-400 hover:underline inline-flex items-center gap-1"
                                >
                                  {new URL(meta.keyHref).host}{" "}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                                . The key is stored in{" "}
                                <code>./data/settings.json</code>.
                              </p>
                              <Button
                                variant="default"
                                size="sm"
                                data-agent-action={`test-${p}-connection`}
                                onClick={() => {
                                  const typedKey = keyInputs[p].trim();
                                  const typedModel = modelInputs[p].trim();
                                  if (!typedKey && info?.hasKey) {
                                    // Saved key, nothing re-typed — test what's persisted
                                    // (sending the masked display value would always fail).
                                    testSavedProviderMutation.mutate({
                                      provider: p,
                                    });
                                    return;
                                  }
                                  testProviderMutation.mutate({
                                    provider: p,
                                    apiKey: typedKey,
                                    model:
                                      typedModel || info?.defaultModel || "",
                                  });
                                }}
                                disabled={isTesting}
                                className="bg-purple-500/80 hover:bg-purple-500 shrink-0"
                                title={
                                  keyInputs[p].trim()
                                    ? "Test the typed key (not saved yet)"
                                    : "Test the saved key"
                                }
                              >
                                {isTesting ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Zap className="mr-2 h-4 w-4" />
                                )}
                                Test Connection
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Model</Label>
                            <Input
                              placeholder={info?.defaultModel ?? ""}
                              value={modelInputs[p]}
                              onChange={e =>
                                setModelInputs(s => ({
                                  ...s,
                                  [p]: e.target.value,
                                }))
                              }
                              data-agent-input={`${p}-model-name`}
                            />
                            <p className="text-xs text-muted-foreground">
                              {meta.modelHint}
                            </p>
                          </div>

                          <div className="flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              data-agent-action={`clear-${p}-key`}
                              onClick={() =>
                                llmClearMutation.mutate({ provider: p })
                              }
                              disabled={
                                llmClearMutation.isPending ||
                                !info?.hasKey ||
                                info?.keySource === "env"
                              }
                            >
                              {llmClearMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="mr-2 h-4 w-4" />
                              )}
                              Clear {meta.label} Key
                            </Button>
                          </div>
                        </TabsContent>
                      );
                    })}
                  </Tabs>

                  <div className="space-y-4 pt-2 border-t border-border/40">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="rateLimitEnabled"
                        checked={rateLimitEnabled}
                        onCheckedChange={c => setRateLimitEnabled(!!c)}
                        data-agent-input="llm-rate-limit-enabled"
                      />
                      <Label
                        htmlFor="rateLimitEnabled"
                        className="text-sm font-medium cursor-pointer"
                      >
                        Enable Rate Limiting
                      </Label>
                    </div>

                    {rateLimitEnabled && (
                      <div className="space-y-2 pl-6 animate-in slide-in-from-top-1 duration-200">
                        <Label
                          htmlFor="rateLimitRps"
                          className="text-xs text-muted-foreground"
                        >
                          Requests per second (RPS)
                        </Label>
                        <Input
                          id="rateLimitRps"
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={rateLimitRps}
                          onChange={e =>
                            setRateLimitRps(parseFloat(e.target.value) || 1)
                          }
                          className="max-w-[120px]"
                          data-agent-input="llm-rate-limit-rps"
                        />
                        <p className="text-[10px] text-muted-foreground italic">
                          {PROVIDER_META[editingProvider].rateLimitHint}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button
                      data-agent-action="save-llm-settings"
                      onClick={handleSaveLlm}
                      disabled={llmSaveMutation.isPending}
                      className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                    >
                      {llmSaveMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      Save
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "notif" && (
            <div className="space-y-6">
              <Card
                className="glass-card"
                data-agent-status="notifications-settings-card"
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-blue-400" />
                    Notifications
                    <Badge
                      variant="outline"
                      className={
                        notificationsEnabled
                          ? "bg-green-500/10 text-green-400 border-green-500/40"
                          : "bg-red-500/10 text-red-400 border-red-500/40"
                      }
                    >
                      {notificationsEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Get notified when new eligible jobs are found or scans
                    complete. Notifications are logged to the server console
                    (local-first).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-muted/20">
                    <div className="flex items-center gap-3">
                      {notificationsEnabled ? (
                        <Bell className="h-5 w-5 text-blue-400" />
                      ) : (
                        <BellOff className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <Label className="text-sm font-medium">
                          Enable Notifications
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Master switch for all notifications
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={notificationsEnabled}
                      onCheckedChange={setNotificationsEnabled}
                    />
                  </div>

                  {notificationsEnabled && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <Label className="text-sm font-medium text-muted-foreground">
                          Notification Events
                        </Label>
                        <div className="flex items-center justify-between p-3 rounded-lg border border-border/30">
                          <div>
                            <Label className="text-sm font-medium">
                              New Eligible Jobs
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Notify when AI job filtering finds new jobs
                              matching your profile
                            </p>
                          </div>
                          <Switch
                            checked={notifyOnNewEligible}
                            onCheckedChange={setNotifyOnNewEligible}
                          />
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg border border-border/30">
                          <div>
                            <Label className="text-sm font-medium">
                              Scan Complete
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Notify when a Global Search or AI Job Filtering
                              finishes
                            </p>
                          </div>
                          <Switch
                            checked={notifyOnScanComplete}
                            onCheckedChange={setNotifyOnScanComplete}
                          />
                        </div>
                      </div>

                      <Separator />
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          Notification Frequency
                        </Label>
                        <Select
                          value={digestFrequency}
                          onValueChange={setDigestFrequency}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(DIGEST_LABELS).map(
                              ([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          How often to receive notification summaries
                        </p>
                      </div>
                    </>
                  )}

                  <div className="flex gap-3 pt-2">
                    <Button
                      data-agent-action="save-notifications"
                      onClick={handleSaveNotifications}
                      disabled={updateNotifMutation.isPending}
                      className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                    >
                      {updateNotifMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      Save Notification Settings
                    </Button>
                    <Button
                      variant="outline"
                      data-agent-action="test-notifications"
                      onClick={() => testNotifMutation.mutate()}
                      disabled={
                        testNotifMutation.isPending || !notificationsEnabled
                      }
                    >
                      {testNotifMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Test
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "scan" && (
            <div className="space-y-6">
              <Card
                className="glass-card"
                data-agent-status="autoscan-settings-card"
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarClock className="h-5 w-5 text-purple-400" />
                    Auto-Scan Scheduling
                    <Badge
                      variant="outline"
                      className={
                        autoScanEnabled
                          ? "bg-green-500/10 text-green-400 border-green-500/40"
                          : "bg-muted/30 text-muted-foreground border-muted/50"
                      }
                    >
                      {autoScanEnabled ? "Active" : "Inactive"}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Automatically run Global Search and AI Job Filtering on a
                    schedule so you don't have to click buttons manually.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-muted/20">
                    <div className="flex items-center gap-3">
                      {autoScanEnabled ? (
                        <Zap className="h-5 w-5 text-purple-400" />
                      ) : (
                        <Clock className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <Label className="text-sm font-medium">
                          Enable Auto-Scan
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Automatically search for new jobs on a schedule
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={autoScanEnabled}
                      onCheckedChange={setAutoScanEnabled}
                    />
                  </div>

                  {autoScanEnabled && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          Scan Frequency
                        </Label>
                        <Select
                          value={autoScanFrequency}
                          onValueChange={setAutoScanFrequency}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(FREQUENCY_LABELS).map(
                              ([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          How often to automatically search for new jobs
                        </p>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg border border-border/30">
                        <div className="flex items-center gap-3">
                          <Play className="h-5 w-5 text-cyan-400" />
                          <div>
                            <Label className="text-sm font-medium">
                              Include AI Job Filtering
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Automatically run AI filtering after each scan to
                              identify eligible jobs
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={autoScanIncludeAI}
                          onCheckedChange={setAutoScanIncludeAI}
                        />
                      </div>

                      <Separator />
                      <div
                        className="grid grid-cols-2 gap-4"
                        aria-live="polite"
                        data-agent-status="autoscan-schedule"
                      >
                        <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                          <p className="text-xs text-muted-foreground mb-1">
                            Last Run
                          </p>
                          <p className="text-sm font-medium">
                            {lastRunFormatted}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                          <p className="text-xs text-muted-foreground mb-1">
                            Next Scheduled
                          </p>
                          <p className="text-sm font-medium text-purple-400">
                            {nextRunFormatted}
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  <Button
                    data-agent-action="save-auto-scan"
                    onClick={handleSaveAutoScan}
                    disabled={updateAutoScanMutation.isPending}
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  >
                    {updateAutoScanMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Save Auto-Scan Settings
                  </Button>

                  {!autoScanEnabled && (
                    <div className="bg-muted/20 border border-border/30 rounded-lg p-4 text-center">
                      <Play className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                      <p className="text-sm text-muted-foreground">
                        Enable auto-scan to have the system automatically search
                        for new jobs and run AI job filtering on your behalf.
                        You can still run manual scans from the dashboard at any
                        time.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "sources" && <DataSourcesCard />}

          {activeTab === "appearance" && <SettingsAppearance />}

          {activeTab === "local-data" && (
            <Card className="glass-card border-red-500/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DatabaseBackup className="h-5 w-5 text-red-400" />
                  Reset local data
                </CardTitle>
                <CardDescription>
                  Return Job Matrix to first-run setup on this computer. This
                  does not delete the application itself or affect any external
                  account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  <p className="text-sm text-muted-foreground">
                    This permanently clears your profile, saved jobs, scan
                    history, presets, and application records from the local
                    SQLite database. Export anything you want to keep before
                    continuing.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setResetDialogOpen(true)}
                  data-agent-action="trigger-system-reset"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Reset Job Matrix on this computer
                </Button>
              </CardContent>
            </Card>
          )}

          <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
            <DialogContent className="max-w-md border-red-500/50 bg-background/95 backdrop-blur-xl">
              <DialogHeader>
                <DialogTitle className="text-red-400">
                  Reset all local Job Matrix data?
                </DialogTitle>
                <DialogDescription>
                  You will return to first-run setup. Job Matrix cannot undo
                  this action.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3 pt-3">
                <Button
                  variant="destructive"
                  onClick={() => resetLocalDataMutation.mutate()}
                  disabled={resetLocalDataMutation.isPending}
                  data-agent-action="nuke-everything-confirm"
                >
                  {resetLocalDataMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Permanently reset local data
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setResetDialogOpen(false)}
                >
                  Keep my data
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
