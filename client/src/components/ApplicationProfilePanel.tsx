import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Save, Upload, UserRound } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getFriendlyApiErrorMessage } from "@/lib/api-errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type YesNoUnknown = "unknown" | "yes" | "no";
const RESUME_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
type ResumeMimeType = (typeof RESUME_MIME_TYPES)[number];

function isResumeMimeType(value: string): value is ResumeMimeType {
  return (RESUME_MIME_TYPES as readonly string[]).includes(value);
}

const blankForm = {
  fullName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  availability: "",
  earliestStartDate: "",
  workAuthorized: "unknown" as YesNoUnknown,
  sponsorshipRequired: "unknown" as YesNoUnknown,
  transportation: "",
  desiredPay: "",
};

function asChoice(value: boolean | null | undefined): YesNoUnknown {
  return value === true ? "yes" : value === false ? "no" : "unknown";
}

function asOptionalBoolean(value: YesNoUnknown): boolean | null {
  return value === "yes" ? true : value === "no" ? false : null;
}

export function ApplicationProfilePanel() {
  const utils = trpc.useUtils();
  const setup = trpc.automation.getSetup.useQuery();
  const [form, setForm] = useState(blankForm);
  const initialized = useRef(false);

  useEffect(() => {
    const profile = setup.data?.profile;
    if (!profile || initialized.current) return;
    setForm({
      fullName: profile.fullName ?? "",
      email: profile.email ?? "",
      phone: profile.phone ?? "",
      addressLine1: profile.addressLine1 ?? "",
      addressLine2: profile.addressLine2 ?? "",
      city: profile.city ?? "",
      state: profile.state ?? "",
      postalCode: profile.postalCode ?? "",
      availability: profile.availability ?? "",
      earliestStartDate: profile.earliestStartDate ?? "",
      workAuthorized: asChoice(profile.workAuthorized),
      sponsorshipRequired: asChoice(profile.sponsorshipRequired),
      transportation: profile.transportation ?? "",
      desiredPay: profile.desiredPay ?? "",
    });
    initialized.current = true;
  }, [setup.data]);

  const save = trpc.automation.saveApplicationProfile.useMutation({
    onSuccess: async () => {
      toast.success("Application details saved");
      await utils.automation.getSetup.invalidate();
    },
    onError: error => toast.error(getFriendlyApiErrorMessage(error)),
  });

  const upload = trpc.automation.uploadResume.useMutation({
    onSuccess: async () => {
      toast.success("Résumé saved on this computer");
      await utils.automation.getSetup.invalidate();
    },
    onError: error => toast.error(getFriendlyApiErrorMessage(error)),
  });

  const update = (key: keyof typeof blankForm, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const handleResume = (file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Résumé files must be 10 MB or smaller");
      return;
    }
    const extension = file.name.toLowerCase().split(".").pop();
    const mimeType =
      file.type ||
      (extension === "pdf"
        ? "application/pdf"
        : extension === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : extension === "doc"
            ? "application/msword"
            : "");
    if (!isResumeMimeType(mimeType)) {
      toast.error("Choose a PDF, DOC, or DOCX résumé");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => toast.error("Could not read that résumé file");
    reader.onload = () => {
      const encoded = String(reader.result ?? "").split(",")[1] ?? "";
      upload.mutate({ fileName: file.name, mimeType, base64: encoded });
    };
    reader.readAsDataURL(file);
  };

  if (setup.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-agent-status="application-profile">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-purple-400" />
            Application details
            <Badge variant="outline">Optional setup</Badge>
          </CardTitle>
          <CardDescription>
            Reusable answers for browser-assisted applications. They stay on
            this computer and are shown to the browser agent only when you open
            an application packet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Full name">
              <Input
                value={form.fullName}
                onChange={e => update("fullName", e.target.value)}
                autoComplete="name"
                data-agent-input="application-full-name"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={e => update("email", e.target.value)}
                autoComplete="email"
                data-agent-input="application-email"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={e => update("phone", e.target.value)}
                autoComplete="tel"
                data-agent-input="application-phone"
              />
            </Field>
            <Field label="Earliest start date">
              <Input
                type="date"
                value={form.earliestStartDate}
                onChange={e => update("earliestStartDate", e.target.value)}
                data-agent-input="application-start-date"
              />
            </Field>
            <Field label="Street address">
              <Input
                value={form.addressLine1}
                onChange={e => update("addressLine1", e.target.value)}
                autoComplete="address-line1"
                data-agent-input="application-address"
              />
            </Field>
            <Field label="Apartment, suite, etc.">
              <Input
                value={form.addressLine2}
                onChange={e => update("addressLine2", e.target.value)}
                autoComplete="address-line2"
                data-agent-input="application-address-line-2"
              />
            </Field>
            <Field label="City">
              <Input
                value={form.city}
                onChange={e => update("city", e.target.value)}
                autoComplete="address-level2"
                data-agent-input="application-city"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State">
                <Input
                  value={form.state}
                  onChange={e => update("state", e.target.value)}
                  autoComplete="address-level1"
                  data-agent-input="application-state"
                />
              </Field>
              <Field label="ZIP code">
                <Input
                  value={form.postalCode}
                  onChange={e => update("postalCode", e.target.value)}
                  autoComplete="postal-code"
                  data-agent-input="application-postal-code"
                />
              </Field>
            </div>
            <ChoiceField
              label="Authorized to work in the U.S."
              value={form.workAuthorized}
              onChange={value => update("workAuthorized", value)}
              hook="application-work-authorized"
            />
            <ChoiceField
              label="Will you need employer sponsorship?"
              value={form.sponsorshipRequired}
              onChange={value => update("sponsorshipRequired", value)}
              hook="application-sponsorship"
            />
            <Field label="Desired pay">
              <Input
                value={form.desiredPay}
                onChange={e => update("desiredPay", e.target.value)}
                placeholder="e.g., $18/hour or negotiable"
                data-agent-input="application-desired-pay"
              />
            </Field>
            <Field label="Transportation">
              <Input
                value={form.transportation}
                onChange={e => update("transportation", e.target.value)}
                placeholder="e.g., Reliable transportation"
                data-agent-input="application-transportation"
              />
            </Field>
          </div>
          <Field label="Availability">
            <Textarea
              value={form.availability}
              onChange={e => update("availability", e.target.value)}
              rows={3}
              placeholder="e.g., Open availability, including evenings and weekends"
              data-agent-input="application-availability"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Sensitive voluntary questions—race, gender, disability, veteran
            status, and similar disclosures—are intentionally not saved here.
            The agent will leave them for you.
          </p>
          <Button
            className="w-full"
            disabled={save.isPending}
            data-agent-action="save-application-profile"
            onClick={() =>
              save.mutate({
                ...form,
                workAuthorized: asOptionalBoolean(form.workAuthorized),
                sponsorshipRequired: asOptionalBoolean(
                  form.sponsorshipRequired
                ),
              })
            }
          >
            {save.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save application details
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-card" data-agent-status="application-resume">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-cyan-400" />
            Primary résumé file
          </CardTitle>
          <CardDescription>
            Upload the PDF or Word file the Chrome agent should attach to
            applications. This is separate from the résumé text saved with your
            search profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {setup.data?.profile?.resumeFileName && (
            <div
              className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-sm"
              data-agent-status="resume-file-ready"
            >
              Ready:{" "}
              <span className="font-medium">
                {setup.data.profile.resumeFileName}
              </span>
              {setup.data.profile.resumeUrl && (
                <a
                  className="ml-2 text-primary underline"
                  href={setup.data.profile.resumeUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-agent-action="open-application-resume"
                >
                  Open
                </a>
              )}
            </div>
          )}
          <Label
            className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-border p-6 hover:bg-muted/30"
            data-agent-action="upload-application-resume"
          >
            {upload.isPending ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Upload className="mr-2 h-5 w-5" />
            )}
            {upload.isPending
              ? "Uploading…"
              : "Choose PDF, DOC, or DOCX (up to 10 MB)"}
            <Input
              className="sr-only"
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={event => handleResume(event.target.files?.[0])}
            />
          </Label>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ChoiceField({
  label,
  value,
  onChange,
  hook,
}: {
  label: string;
  value: YesNoUnknown;
  onChange: (value: YesNoUnknown) => void;
  hook: string;
}) {
  return (
    <Field label={label}>
      <Select
        value={value}
        onValueChange={next => onChange(next as YesNoUnknown)}
      >
        <SelectTrigger data-agent-input={hook}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unknown">Leave unanswered</SelectItem>
          <SelectItem value="yes">Yes</SelectItem>
          <SelectItem value="no">No</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}
