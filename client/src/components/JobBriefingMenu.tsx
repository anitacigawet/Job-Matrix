import { useState } from "react";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Headphones, FileText, Sparkles, Loader2, ListChecks, Brain } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { getFriendlyApiErrorMessage } from "@/lib/api-errors";

type Context = "applied" | "tracked";

/**
 * Per-job briefing trigger. Renders a "Briefings ▾" dropdown — each item
 * fires a NotebookLM generation for this specific job (interview prep,
 * flashcards, quiz, pre-application brief) and points the user at
 * /briefings for the result. Generation is fire-and-forget; the dropdown
 * never blocks waiting for the artifact.
 */
export function JobBriefingMenu({
  jobId,
  context,
  buttonSize = "sm",
  buttonVariant = "ghost",
}: {
  jobId: number;
  context: Context;
  buttonSize?: "default" | "sm" | "lg" | "icon";
  buttonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const generate = trpc.briefings.generate.useMutation({
    onSuccess: (_data, vars) => {
      setPending(null);
      toast.success("Briefing queued — view progress in Briefings.", {
        action: {
          label: "Open Briefings",
          onClick: () => setLocation("/briefings"),
        },
      });
    },
    onError: (err) => {
      setPending(null);
      toast.error(getFriendlyApiErrorMessage(err));
    },
  });

  const fire = (type: string, label: string) => {
    setPending(label);
    generate.mutate({ type: type as any, jobId });
  };

  const items: { type: string; label: string; description: string; icon: any; hook: string }[] = [];

  // Pre-application brief works for any job (pre or post-apply). Shown in both
  // contexts — useful for re-reading a job description before a follow-up call.
  items.push({
    type: "pre_application_brief",
    label: "Pre-Application Brief",
    description: "Markdown brief: company, role, fit angle, résumé tweaks.",
    icon: FileText,
    hook: `generate-pre-application-brief-${jobId}`,
  });

  if (context === "applied") {
    items.push({
      type: "interview_prep_audio",
      label: "Interview Prep (audio)",
      description: "Two-host briefing for an upcoming interview. 10–14 min.",
      icon: Headphones,
      hook: `generate-interview-prep-${jobId}`,
    });
    items.push({
      type: "interview_flashcards",
      label: "Interview Flashcards",
      description: "10 behavioural-question cards tailored to this role.",
      icon: ListChecks,
      hook: `generate-interview-flashcards-${jobId}`,
    });
    items.push({
      type: "interview_quiz",
      label: "Interview Quiz",
      description: "10-question prep quiz with answer key.",
      icon: Brain,
      hook: `generate-interview-quiz-${jobId}`,
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={buttonVariant}
          size={buttonSize}
          disabled={generate.isPending}
          data-agent-action={`open-briefing-menu-${jobId}`}
          className="gap-1 text-purple-300 hover:text-purple-200"
        >
          {generate.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          Briefings
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Generate a briefing for this job</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((it) => {
          const Icon = it.icon;
          const isLoading = pending === it.label;
          return (
            <DropdownMenuItem
              key={it.type}
              onSelect={(e) => {
                e.preventDefault();
                fire(it.type, it.label);
              }}
              disabled={generate.isPending}
              data-agent-action={it.hook}
              className="flex-col items-start gap-1 cursor-pointer py-2"
            >
              <div className="flex items-center gap-2 w-full">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                ) : (
                  <Icon className="h-4 w-4 shrink-0 text-purple-400" />
                )}
                <span className="font-medium">{it.label}</span>
              </div>
              <span className="text-xs text-muted-foreground pl-6">{it.description}</span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => setLocation("/briefings")}
          data-agent-action={`open-briefings-from-job-${jobId}`}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Open Briefings page
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
