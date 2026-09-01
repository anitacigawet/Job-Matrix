import { Bot, CheckCircle2, Clipboard, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getFriendlyApiErrorMessage } from "@/lib/api-errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ApplicationAssistantDialog({ jobId, open, onOpenChange }: {
  jobId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const packet = trpc.automation.getApplicationPacket.useQuery(
    { jobId: jobId ?? 0 },
    { enabled: open && jobId !== null },
  );
  const markApplied = trpc.personalized.markJobAsApplied.useMutation({
    onSuccess: async (result) => {
      if (!result.success) {
        toast.info(result.message);
        return;
      }
      toast.success("Application recorded");
      onOpenChange(false);
      await Promise.all([
        utils.personalized.getEligibleJobs.invalidate(),
        utils.personalized.getAppliedJobs.invalidate(),
      ]);
    },
    onError: (error) => toast.error(getFriendlyApiErrorMessage(error)),
  });

  const data = packet.data;
  const applicant = data?.applicant;
  const applicationUrl = data
    ? new URL(data.job.jobUrl, window.location.origin).toString()
    : "";
  const prompt = data ? [
    `Help me apply for ${data.job.title} at ${data.job.company}.`,
    ...data.instructions,
    `The application URL is ${applicationUrl}`,
  ].join("\n") : "";

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("Browser assistant instructions copied");
    } catch {
      toast.error("Could not copy to the clipboard");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" data-agent-status="application-assistant-packet">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2"><Bot className="h-5 w-5 text-purple-400" />Guided application</DialogTitle>
          <DialogDescription>
            Job Matrix supplies your saved answers. An in-browser AI agent can fill the employer form, but you approve the final submission.
          </DialogDescription>
        </DialogHeader>

        {packet.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : packet.error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{getFriendlyApiErrorMessage(packet.error)}</p>
        ) : data ? (
          <div className="space-y-5">
            <section className="rounded-lg border p-4" data-agent-status={`application-job-${data.job.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="text-lg font-semibold">{data.job.title}</h3><p className="text-muted-foreground">{data.job.company}{data.job.location ? ` · ${data.job.location}` : ""}</p></div>
                <Badge variant="outline">{data.job.platform}</Badge>
              </div>
            </section>

            <section className="space-y-3" data-agent-status="saved-application-answers">
              <div className="flex items-center justify-between"><h3 className="font-semibold">Saved answers</h3><a href="/preferences" className="text-xs text-primary underline" data-agent-action="edit-application-details">Edit in Preferences</a></div>
              {!applicant ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">No application details are saved yet. The assistant can still open the form, but it must ask you for every personal answer.</p>
              ) : (
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <Answer label="Name" value={applicant.fullName} hook="applicant-name" />
                  <Answer label="Email" value={applicant.email} hook="applicant-email" />
                  <Answer label="Phone" value={applicant.phone} hook="applicant-phone" />
                  <Answer label="Address" value={[applicant.addressLine1, applicant.addressLine2, applicant.city, applicant.state, applicant.postalCode].filter(Boolean).join(", ")} hook="applicant-address" />
                  <Answer label="Available" value={applicant.availability} hook="applicant-availability" />
                  <Answer label="Start date" value={applicant.earliestStartDate} hook="applicant-start-date" />
                  <Answer label="Work authorization" value={applicant.workAuthorized === true ? "Yes" : applicant.workAuthorized === false ? "No" : null} hook="applicant-work-authorization" />
                  <Answer label="Needs sponsorship" value={applicant.sponsorshipRequired === true ? "Yes" : applicant.sponsorshipRequired === false ? "No" : null} hook="applicant-sponsorship" />
                  <Answer label="Transportation" value={applicant.transportation} hook="applicant-transportation" />
                  <Answer label="Desired pay" value={applicant.desiredPay} hook="applicant-desired-pay" />
                  <Answer label="Résumé" value={applicant.resumeFileName} hook="applicant-resume">
                    {applicant.resumeUrl && <a className="ml-2 text-primary underline" href={applicant.resumeUrl} target="_blank" rel="noreferrer" data-agent-action="download-application-resume">Open file</a>}
                  </Answer>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
              <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-400" /><div><h3 className="font-semibold">Final-submit guardrail</h3><p className="text-sm text-muted-foreground">The assistant may navigate and fill fields. It must stop on the final review page and wait for your approval before clicking the employer's Submit button. Missing or sensitive answers stay with you.</p></div></div>
            </section>

            <div className="rounded-lg border p-4 text-sm space-y-2">
              <p className="font-medium">Using an in-browser AI agent</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Click <strong>Open application</strong>.</li>
                <li>Start your browser assistant and paste the copied instructions, or tell it to use this Job Matrix packet.</li>
                <li>Review every answer and personally approve the employer's final Submit button.</li>
                <li>Return here and click <strong>I submitted it</strong>.</li>
              </ol>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={copyPrompt} data-agent-action="copy-application-agent-instructions"><Clipboard className="mr-2 h-4 w-4" />Copy assistant instructions</Button>
              <Button asChild data-agent-action={`open-guided-application-${data.job.id}`}><a href={data.job.jobUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open application</a></Button>
              <Button className="ml-auto bg-green-600 hover:bg-green-700" onClick={() => markApplied.mutate({ jobId: data.job.id })} disabled={markApplied.isPending} data-agent-action={`confirm-application-submitted-${data.job.id}`}>
                {markApplied.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}I submitted it
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Answer({ label, value, hook, children }: { label: string; value?: string | null; hook: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-md bg-muted/30 p-3" data-agent-value={hook}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value || "Ask me"}{children}</p>
    </div>
  );
}
