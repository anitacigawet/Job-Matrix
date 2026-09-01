import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, BriefcaseBusiness, CheckCircle2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import NotFound from "./NotFound";
import { getFictionalEmployerPosting } from "@/showroom/showroomPostings";

const initialForm = {
  fullName: "Jordan Example",
  email: "jordan@example.com",
  phone: "(555) 010-2026",
  experience: "I coordinate schedules, document processes, review data, and support people who need clear next steps.",
};

export default function ShowroomFictionalEmployer() {
  const isShowroom = import.meta.env.VITE_SHOWROOM_MODE === "true";
  const posting = useMemo(() => {
    const jobId = Number(new URLSearchParams(window.location.search).get("job"));
    return Number.isInteger(jobId) ? getFictionalEmployerPosting(jobId) : undefined;
  }, []);
  const [form, setForm] = useState(initialForm);
  const [reviewing, setReviewing] = useState(false);

  if (!isShowroom || !posting) return <NotFound />;

  const update = (field: keyof typeof form, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
    setReviewing(false);
  };

  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setReviewing(true);
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6" data-agent-status="showroom-employer-posting">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-4 text-sm">
          <p className="font-semibold text-amber-200">Fictional employer form — showroom only</p>
          <p className="mt-1 text-muted-foreground">This page demonstrates the guided-application workflow. It does not represent a real employer, send data, create an account, or submit an application.</p>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl"><BriefcaseBusiness className="h-6 w-6 text-cyan-400" />{posting.title}</CardTitle>
                <CardDescription className="mt-2 text-base">{posting.company} · {posting.location}</CardDescription>
              </div>
              <Badge variant="outline">Deterministic fixture</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="font-medium">{posting.pay}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{posting.summary}</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Application</CardTitle>
            <CardDescription>These fictional answers are prefilled from the Job Matrix application packet. Change them to test the workflow.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={review}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="showroom-name">
                  <Input id="showroom-name" required value={form.fullName} onChange={event => update("fullName", event.target.value)} data-agent-input="showroom-employer-name" />
                </Field>
                <Field label="Email" htmlFor="showroom-email">
                  <Input id="showroom-email" type="email" required value={form.email} onChange={event => update("email", event.target.value)} data-agent-input="showroom-employer-email" />
                </Field>
                <Field label="Phone" htmlFor="showroom-phone">
                  <Input id="showroom-phone" value={form.phone} onChange={event => update("phone", event.target.value)} data-agent-input="showroom-employer-phone" />
                </Field>
              </div>
              <Field label="Relevant experience" htmlFor="showroom-experience">
                <Textarea id="showroom-experience" required rows={5} value={form.experience} onChange={event => update("experience", event.target.value)} data-agent-input="showroom-employer-experience" />
              </Field>

              {!reviewing ? (
                <Button type="submit" data-agent-action="showroom-review-application"><CheckCircle2 className="mr-2 h-4 w-4" />Continue to final review</Button>
              ) : (
                <section className="space-y-4 rounded-lg border border-green-500/30 bg-green-500/5 p-4" data-agent-status="showroom-application-final-review">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
                    <div>
                      <h2 className="font-semibold">Final review reached</h2>
                      <p className="text-sm text-muted-foreground">The form is ready for review. Job Matrix and an in-browser AI agent must stop here until the user explicitly approves submission.</p>
                    </div>
                  </div>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <ReviewItem label="Name" value={form.fullName} />
                    <ReviewItem label="Email" value={form.email} />
                    <ReviewItem label="Phone" value={form.phone || "Not provided"} />
                    <ReviewItem label="Role" value={posting.title} />
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => setReviewing(false)}>Edit answers</Button>
                    <Button type="button" disabled data-agent-action="showroom-final-submit-disabled">Submit application (disabled in showroom)</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">The final button is intentionally disabled. No employer or external service is contacted.</p>
                </section>
              )}
            </form>
          </CardContent>
        </Card>

        <Button asChild variant="outline"><a href="/jobs"><ArrowLeft className="mr-2 h-4 w-4" />Back to Job Matrix</a></Button>
      </div>
    </main>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>;
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-muted/30 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>;
}
