/**
 * Settings → Data Sources sub-tab.
 *
 * Tier-1 (real API) data sources live here — credentials saved to
 * `data/settings.json`; environment variables override it. Each source declares
 * its credential fields via `getDataSources`, so this component renders
 * dynamically per-source without hardcoding shapes.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, KeyRound, Database, ExternalLink, Zap, Trash2, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getFriendlyApiErrorMessage } from "@/lib/api-errors";

type SourceId = "adzuna" | "usajobs" | "jooble" | "themuse";
type FieldValues = Record<string, string>;

function safeHost(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function DataSourcesCard() {
  const utils = trpc.useUtils();
  const dsQuery = trpc.settings.getDataSources.useQuery();
  const [inputs, setInputs] = useState<Record<string, FieldValues>>({});

  useEffect(() => {
    if (dsQuery.data) {
      const seeded: Record<string, FieldValues> = {};
      for (const s of dsQuery.data.sources) {
        const blank: FieldValues = {};
        for (const f of s.fields) blank[f.name] = "";
        seeded[s.id] = inputs[s.id] ?? blank;
      }
      setInputs(seeded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dsQuery.data?.sources.length]);

  const saveMutation = trpc.settings.saveDataSource.useMutation({
    onSuccess: () => {
      toast.success("Data source saved");
      // Clear all input fields after save (mirrors the LLM tab)
      setInputs((cur) => Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, Object.fromEntries(Object.keys(v).map((kk) => [kk, ""]))])));
      utils.settings.getDataSources.invalidate();
    },
    onError: (e) => toast.error(`Save failed: ${getFriendlyApiErrorMessage(e)}`),
  });

  const clearMutation = trpc.settings.clearDataSource.useMutation({
    onSuccess: () => {
      toast.success("Credentials cleared");
      utils.settings.getDataSources.invalidate();
    },
    onError: (e) => toast.error(`Clear failed: ${getFriendlyApiErrorMessage(e)}`),
  });

  const testMutation = trpc.settings.testDataSource.useMutation({
    onSuccess: (result: any) => {
      if (result?.ok) toast.success(result.message ?? "Connection OK");
      else toast.error(result?.message ?? "Connection test failed");
    },
    onError: (e) => toast.error(`Test failed: ${getFriendlyApiErrorMessage(e)}`),
  });

  if (dsQuery.isLoading) {
    return (
      <Card className="glass-card">
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {dsQuery.data?.sources.map((s) => {
        const current = inputs[s.id] ?? {};
        const isPending = saveMutation.isPending || clearMutation.isPending || testMutation.isPending;
        const fromEnv = s.source === "env";
        const hasNoFields = s.fields.length === 0; // pure no-auth source (Remotive, RemoteOK)
        const hasTypedValues = Object.values(current).some((v) => v.trim().length > 0);

        return (
          <Card key={s.id} className="glass-card" data-agent-status={`data-source-${s.id}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 flex-wrap">
                <Database className="h-5 w-5 text-emerald-400" />
                {s.label}
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/40">
                  Tier {s.tier} · API
                </Badge>
                {hasNoFields && (
                  <Badge variant="outline" className="bg-sky-500/10 text-sky-300 border-sky-500/40 gap-1">
                    <Sparkles className="h-3 w-3" />
                    No setup needed
                  </Badge>
                )}
                {!hasNoFields && (
                  <Badge
                    variant="outline"
                    className={s.configured
                      ? "bg-green-500/10 text-green-400 border-green-500/40"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/40"
                    }
                    aria-live="polite"
                    data-agent-status={`data-source-${s.id}-status`}
                  >
                    {s.configured ? "Configured" : "Not configured"}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Tier-1 real API source.{" "}
                {s.signupUrl && (
                  <>
                    Sign up at{" "}
                    <a href={s.signupUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline inline-flex items-center gap-1">
                      {safeHost(s.signupUrl)}<ExternalLink className="h-3 w-3" />
                    </a>
                    .{" "}
                  </>
                )}
                {hasNoFields
                  ? "No credentials required — scans include this source automatically when toggled on at Platforms."
                  : "Credentials are stored in ./data/settings.json; env vars override."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {s.configured && !hasNoFields && (
                <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5 text-sm space-y-1" aria-live="polite">
                  {s.fields.map((f) => (
                    f.valueMasked ? (
                      <div key={f.name}>
                        {f.label}: <code className="font-mono">{f.valueMasked}</code>
                      </div>
                    ) : null
                  ))}
                  <div className="text-xs text-muted-foreground">
                    (from {s.source === "env" ? "env var" : "settings file"})
                  </div>
                </div>
              )}

              {s.fields.map((f) => (
                <div key={f.name} className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" />
                    {f.label}
                  </Label>
                  <Input
                    type={f.inputType}
                    placeholder={f.placeholder ?? ""}
                    value={current[f.name] ?? ""}
                    onChange={(e) => setInputs((st) => ({ ...st, [s.id]: { ...current, [f.name]: e.target.value } }))}
                    autoComplete="off"
                    data-agent-input={`${s.id}-${f.name.toLowerCase()}`}
                    disabled={fromEnv}
                  />
                </div>
              ))}

              {!hasNoFields && (
                <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                  <p className="text-xs text-muted-foreground flex-1 min-w-0">
                    {fromEnv
                      ? "Credentials are set via environment variables — clear them there to edit here."
                      : "All required fields above must be filled for this source to authenticate."}
                  </p>
                  <Button
                    variant="default"
                    size="sm"
                    data-agent-action={`test-${s.id}-credentials`}
                    onClick={() => testMutation.mutate({
                      source: s.id as SourceId,
                      fields: hasTypedValues ? current : undefined,
                    })}
                    disabled={isPending}
                    className="bg-emerald-500/80 hover:bg-emerald-500 shrink-0"
                    title={hasTypedValues ? "Test the typed credentials (not saved yet)" : "Test the saved credentials"}
                  >
                    {testMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                    Test Connection
                  </Button>
                </div>
              )}

              {!hasNoFields && (
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    data-agent-action={`save-${s.id}-credentials`}
                    onClick={() => saveMutation.mutate({
                      source: s.id as SourceId,
                      fields: Object.fromEntries(
                        Object.entries(current).filter(([, v]) => v.trim().length > 0)
                      ),
                    })}
                    disabled={isPending || fromEnv || !hasTypedValues}
                    className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                  >
                    {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="default"
                    data-agent-action={`clear-${s.id}-credentials`}
                    onClick={() => clearMutation.mutate({ source: s.id as SourceId })}
                    disabled={isPending || !s.configured || fromEnv}
                    className="w-full sm:w-auto"
                  >
                    {clearMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Clear
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
