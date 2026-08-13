import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Inbox, KeyRound, Loader2, Mail, Play, Save, Send, Unplug } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getFriendlyApiErrorMessage } from "@/lib/api-errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function AutomationConnectionsCard() {
  const utils = trpc.useUtils();
  const setup = trpc.automation.getSetup.useQuery(undefined, { refetchInterval: 30_000 });
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [monitoring, setMonitoring] = useState(false);
  const [notifySlack, setNotifySlack] = useState(true);

  useEffect(() => {
    if (!setup.data) return;
    setMonitoring(setup.data.monitoring.enabled);
    setNotifySlack(setup.data.monitoring.notifyOnEmployerResponse);
  }, [setup.data]);

  useEffect(() => {
    const handleConnected = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === "job-matrix-gmail-connected") {
        toast.success("Gmail connected");
        void setup.refetch();
      }
    };
    window.addEventListener("message", handleConnected);
    return () => window.removeEventListener("message", handleConnected);
  }, [setup]);

  const saveGmail = trpc.automation.saveGmailClient.useMutation({
    onSuccess: async () => {
      setClientSecret("");
      toast.success("Google OAuth credentials saved");
      await setup.refetch();
    },
    onError: (error) => toast.error(getFriendlyApiErrorMessage(error)),
  });
  const createAuth = trpc.automation.createGmailAuthUrl.useMutation({
    onError: (error) => toast.error(getFriendlyApiErrorMessage(error)),
  });
  const disconnect = trpc.automation.disconnectGmail.useMutation({
    onSuccess: async () => {
      toast.success("Gmail disconnected");
      await setup.refetch();
    },
    onError: (error) => toast.error(getFriendlyApiErrorMessage(error)),
  });
  const saveSlack = trpc.automation.saveSlackWebhook.useMutation({
    onSuccess: async () => {
      setWebhookUrl("");
      toast.success("Slack webhook saved");
      await setup.refetch();
    },
    onError: (error) => toast.error(getFriendlyApiErrorMessage(error)),
  });
  const testSlack = trpc.automation.testSlack.useMutation({
    onSuccess: (result) => result.success ? toast.success("Test sent to Slack") : toast.error("Slack did not accept the test message"),
    onError: (error) => toast.error(getFriendlyApiErrorMessage(error)),
  });
  const updateMonitoring = trpc.automation.updateMonitoring.useMutation({
    onSuccess: async () => {
      toast.success("Inbox monitoring updated");
      await utils.automation.getSetup.invalidate();
    },
    onError: (error) => toast.error(getFriendlyApiErrorMessage(error)),
  });
  const checkInbox = trpc.automation.checkInboxNow.useMutation({
    onSuccess: async (result) => {
      toast.success(result.message);
      await Promise.all([utils.automation.getSetup.invalidate(), utils.automation.listInbox.invalidate()]);
    },
    onError: (error) => toast.error(getFriendlyApiErrorMessage(error)),
  });

  const connectGmail = async () => {
    const popup = window.open("about:blank", "job-matrix-gmail", "popup,width=620,height=760");
    try {
      const result = await createAuth.mutateAsync({ origin: window.location.origin });
      if (popup) popup.location.href = result.url;
      else window.open(result.url, "_blank", "noopener,noreferrer");
    } catch {
      popup?.close();
    }
  };

  if (setup.isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  }

  const gmail = setup.data?.gmail;
  const slack = setup.data?.slack;

  return (
    <div className="space-y-6">
      <Card className="glass-card" data-agent-status="gmail-connection">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Mail className="h-5 w-5 text-red-400" />Gmail response monitoring
            <Badge variant="outline" className={gmail?.connected ? "border-green-500/40 bg-green-500/10 text-green-400" : ""}>
              {gmail?.connected ? `Connected: ${gmail.email}` : "Not connected"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Read-only access watches new inbox events while Job Matrix is running. Unrelated personal mail is ignored before AI classification and is never stored.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!gmail?.clientConfigured && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 text-sm space-y-2">
              <p className="font-medium">One-time Google setup</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Create or open a Google Cloud project and enable the Gmail API.</li>
                <li>Configure the OAuth consent screen for your own Google account.</li>
                <li>Create an OAuth client of type <strong>Desktop app</strong>, then paste its ID and secret below.</li>
              </ol>
              <a className="inline-flex items-center gap-1 text-primary underline" href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noreferrer" data-agent-action="open-gmail-api-setup">
                Open Gmail API setup <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
          {gmail?.clientConfigured && (
            <p className="text-sm text-muted-foreground">OAuth client saved: <code>{gmail.clientIdMasked}</code>. Enter replacements below only if you want to change it.</p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>Google OAuth client ID</Label><Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="…apps.googleusercontent.com" data-agent-input="gmail-client-id" /></div>
            <div className="space-y-2"><Label>Google OAuth client secret</Label><Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" data-agent-input="gmail-client-secret" /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!clientId.trim() || !clientSecret.trim() || saveGmail.isPending} onClick={() => saveGmail.mutate({ clientId, clientSecret })} data-agent-action="save-gmail-client">
              {saveGmail.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save OAuth client
            </Button>
            {gmail?.clientConfigured && !gmail.connected && (
              <Button onClick={connectGmail} disabled={createAuth.isPending} data-agent-action="connect-gmail">
                {createAuth.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}Connect Gmail
              </Button>
            )}
            {gmail?.connected && (
              <Button variant="outline" onClick={() => disconnect.mutate()} disabled={disconnect.isPending} data-agent-action="disconnect-gmail"><Unplug className="mr-2 h-4 w-4" />Disconnect</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card" data-agent-status="slack-connection">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Send className="h-5 w-5 text-purple-400" />Slack alerts
            <Badge variant="outline" className={slack?.configured ? "border-green-500/40 bg-green-500/10 text-green-400" : ""}>{slack?.configured ? "Connected" : "Not connected"}</Badge>
          </CardTitle>
          <CardDescription>A private incoming webhook sends one-way employer response alerts to the Slack channel you choose.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Slack incoming webhook URL</Label>
            <Input type="password" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/services/…" autoComplete="off" data-agent-input="slack-webhook" />
            <p className="text-xs text-muted-foreground">Create an incoming webhook for your chosen channel. The full URL is stored locally and never shown again.</p>
            <a className="inline-flex items-center gap-1 text-xs text-primary underline" href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer" data-agent-action="open-slack-webhook-instructions">Slack webhook instructions <ExternalLink className="h-3 w-3" /></a>
          </div>
          {slack?.masked && <p className="text-sm text-muted-foreground" data-agent-status="slack-webhook-saved">{slack.masked}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!webhookUrl.trim() || saveSlack.isPending} onClick={() => saveSlack.mutate({ webhookUrl })} data-agent-action="save-slack-webhook"><Save className="mr-2 h-4 w-4" />Save webhook</Button>
            {slack?.configured && <Button variant="outline" disabled={testSlack.isPending} onClick={() => testSlack.mutate()} data-agent-action="test-slack"><Send className="mr-2 h-4 w-4" />Send test</Button>}
            {slack?.configured && <Button variant="ghost" onClick={() => saveSlack.mutate({ webhookUrl: "" })} data-agent-action="clear-slack-webhook"><Unplug className="mr-2 h-4 w-4" />Disconnect</Button>}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card" data-agent-status="inbox-monitoring-controls">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5 text-cyan-400" />Monitoring controls</CardTitle>
          <CardDescription>Polling runs every five minutes only while the local Job Matrix server is open and this computer is awake.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div><p className="font-medium">Watch Gmail for employer replies</p><p className="text-sm text-muted-foreground">Includes Google Voice missed-call and voicemail notification emails.</p></div>
            <Switch checked={monitoring} onCheckedChange={setMonitoring} disabled={!gmail?.connected} data-agent-input="inbox-monitoring-enabled" />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div><p className="font-medium">Send matched responses to Slack</p><p className="text-sm text-muted-foreground">The Responses tab remains available even when Slack alerts are off.</p></div>
            <Switch checked={notifySlack} onCheckedChange={setNotifySlack} data-agent-input="employer-response-alerts" />
          </div>
          {setup.data?.monitoring.lastCheckedAt && <p className="text-xs text-muted-foreground">Last checked {new Date(setup.data.monitoring.lastCheckedAt).toLocaleString()}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => updateMonitoring.mutate({ enabled: monitoring, notifyOnEmployerResponse: notifySlack })} disabled={updateMonitoring.isPending || (monitoring && !gmail?.connected)} data-agent-action="save-inbox-monitoring"><CheckCircle2 className="mr-2 h-4 w-4" />Save monitoring</Button>
            {gmail?.connected && <Button variant="outline" onClick={() => checkInbox.mutate()} disabled={checkInbox.isPending} data-agent-action="check-inbox-now">{checkInbox.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Check now</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
