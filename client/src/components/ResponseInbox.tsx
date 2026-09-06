import { useMemo, useState } from "react";
import { AlertCircle, Briefcase, Check, ExternalLink, Inbox, Loader2, Mail, PhoneMissed, Voicemail } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getFriendlyApiErrorMessage } from "@/lib/api-errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORY: Record<string, { label: string; className: string }> = {
  confirmation: { label: "Application received", className: "border-blue-500/40 bg-blue-500/10 text-blue-300" },
  action_required: { label: "Action needed", className: "border-orange-500/40 bg-orange-500/10 text-orange-300" },
  recruiter_reply: { label: "Employer replied", className: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" },
  interview: { label: "Interview request", className: "border-purple-500/40 bg-purple-500/10 text-purple-300" },
  rejection: { label: "Not moving forward", className: "border-red-500/40 bg-red-500/10 text-red-300" },
  offer: { label: "Offer", className: "border-green-500/40 bg-green-500/10 text-green-300" },
  missed_call: { label: "Missed call", className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300" },
  voicemail: { label: "Voicemail", className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300" },
  uncertain: { label: "Needs review", className: "border-muted-foreground/40 bg-muted/30 text-muted-foreground" },
};

export function ResponseInbox() {
  const utils = trpc.useUtils();
  const responses = trpc.automation.listInbox.useQuery(undefined, { refetchInterval: 60_000 });
  const applications = trpc.personalized.getAppliedJobs.useQuery();
  const [showAll, setShowAll] = useState(false);
  const [links, setLinks] = useState<Record<number, string>>({});

  const markReviewed = trpc.automation.markResponseReviewed.useMutation({
    onSuccess: () => utils.automation.listInbox.invalidate(),
    onError: (error) => toast.error(getFriendlyApiErrorMessage(error)),
  });
  const linkResponse = trpc.automation.linkResponse.useMutation({
    onSuccess: async () => {
      toast.success("Response linked to application");
      await Promise.all([utils.automation.listInbox.invalidate(), utils.notes.getNoteCounts.invalidate()]);
    },
    onError: (error) => toast.error(getFriendlyApiErrorMessage(error)),
  });

  const rows = useMemo(
    () => (responses.data ?? []).filter((message) => showAll || message.needsReview || !message.reviewedAt),
    [responses.data, showAll],
  );
  const reviewCount = (responses.data ?? []).filter((message) => message.needsReview).length;

  if (responses.isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4" data-agent-status="employer-responses">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/10 p-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><Inbox className="h-5 w-5 text-cyan-400" />Employer responses</h2>
          <p className="mt-1 text-sm text-muted-foreground">Email summaries and Google Voice alerts found since Gmail monitoring was connected.</p>
          <p className="mt-1 text-sm text-muted-foreground">Classifications and matches are suggestions. Check the original message, then use the Applications tab to change a status. Reviewing or linking a response does not change it.</p>
        </div>
        <div className="flex items-center gap-2">
          {reviewCount > 0 && <Badge className="bg-orange-500/20 text-orange-300">{reviewCount} need review</Badge>}
          <Button variant="outline" size="sm" onClick={() => setShowAll((value) => !value)} data-agent-action="toggle-reviewed-responses">{showAll ? "Hide reviewed" : "Show all"}</Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="glass-card"><CardContent className="py-12 text-center"><Mail className="mx-auto mb-4 h-11 w-11 text-muted-foreground" /><h3 className="font-semibold">No responses waiting</h3><p className="mt-2 text-sm text-muted-foreground">New matched employer replies will appear here. Configure Gmail and Slack under Settings → Inbox & Slack.</p></CardContent></Card>
      ) : rows.map((message) => {
        const category = CATEGORY[message.category] ?? CATEGORY.uncertain;
        const Icon = message.source === "voice_missed_call" ? PhoneMissed : message.source === "voice_voicemail" ? Voicemail : Mail;
        const selected = links[message.id] ?? "";
        const gmailTarget = message.providerThreadId ? `https://mail.google.com/mail/u/0/#inbox/${message.providerThreadId}` : "https://mail.google.com/mail/u/0/#inbox";
        return (
          <Card key={message.id} className={`glass-card ${message.needsReview ? "border-l-4 border-l-orange-500" : ""}`} data-agent-status={`response-${message.id}`}>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start gap-3">
                <Icon className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{message.subject}</h3>
                    <Badge variant="outline" className={category.className}>{category.label}</Badge>
                    {message.needsReview && <Badge variant="outline" className="border-orange-500/40 text-orange-300"><AlertCircle className="mr-1 h-3 w-3" />Please review</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">From {message.sender || message.senderAddress || message.senderPhone || "Unknown sender"}{message.senderAddress && message.sender !== message.senderAddress ? ` <${message.senderAddress}>` : ""} · {new Date(message.receivedAt).toLocaleString()}</p>
                  <p className="mt-3 text-sm" data-agent-value="response-summary">{message.summary}</p>
                  {message.snippet && message.snippet !== message.summary && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{message.snippet}</p>}
                </div>
              </div>

              {message.application ? (
                <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm" data-agent-status="matched-application">
                  <Briefcase className="h-4 w-4 text-green-400" />{message.reviewedAt ? "Linked application:" : "Suggested application:"} <strong>{message.application.title}</strong> at {message.application.company}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-orange-500/30 bg-orange-500/5 p-3">
                  <span className="text-sm">Which application is this about?</span>
                  <Select value={selected} onValueChange={(value) => setLinks((current) => ({ ...current, [message.id]: value }))}>
                    <SelectTrigger className="min-w-[260px] flex-1" data-agent-input={`link-response-${message.id}`}><SelectValue placeholder="Choose an application" /></SelectTrigger>
                    <SelectContent>{(applications.data ?? []).map((job) => <SelectItem key={job.id} value={String(job.id)}>{job.title} · {job.company}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" disabled={!selected || linkResponse.isPending} onClick={() => linkResponse.mutate({ messageId: message.id, appliedJobId: Number(selected) })} data-agent-action={`confirm-response-link-${message.id}`}>Link</Button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild data-agent-action={`open-response-gmail-${message.id}`}><a href={gmailTarget} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-3 w-3" />Open in Gmail</a></Button>
                {!message.reviewedAt && <Button variant="outline" size="sm" disabled={markReviewed.isPending} onClick={() => markReviewed.mutate({ messageId: message.id })} data-agent-action={`mark-response-reviewed-${message.id}`}><Check className="mr-2 h-3 w-3" />Mark reviewed</Button>}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
