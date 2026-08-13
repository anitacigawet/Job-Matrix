import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) {
    return `~${seconds}s remaining`;
  } else if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return `~${minutes} minute${minutes === 1 ? '' : 's'} remaining`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    if (minutes === 0) {
      return `~${hours} hour${hours === 1 ? '' : 's'} remaining`;
    }
    return `~${hours}h ${minutes}m remaining`;
  }
}

interface OperationProgressProps {
  progressDetails: {
    phase?: string;
    current?: number;
    total?: number;
    message?: string;
  } | null;
  timeEstimate: {
    estimatedSecondsRemaining: number;
  } | null;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  isPauseLoading: boolean;
  isResumeLoading: boolean;
  isCancelLoading: boolean;
}

export function OperationProgress({
  progressDetails,
  timeEstimate,
  isPaused,
  onPause,
  onResume,
  onCancel,
  isPauseLoading,
  isResumeLoading,
  isCancelLoading,
}: OperationProgressProps) {
  return (
    <Card className="mb-6 glass-card neon-glow border-primary/50" role="status" aria-live="polite" aria-atomic="true" data-agent-status="operation-progress">
      <CardContent className="pt-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" aria-live="polite" aria-atomic="true" data-agent-status="operation-phase">
              {progressDetails?.phase || "AI-Powered Job Search in Progress"}
            </span>
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
          {progressDetails && (progressDetails.total || 0) > 0 ? (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Progress: {progressDetails.current}/{progressDetails.total}
                  {timeEstimate && timeEstimate.estimatedSecondsRemaining > 0 && (
                    <span className="ml-2 text-primary" data-agent-status="time-estimate">
                      • {formatTimeRemaining(timeEstimate.estimatedSecondsRemaining)}
                    </span>
                  )}
                </span>
                <span className="text-xs font-medium text-primary">
                  {Math.round(((progressDetails.current || 0) / (progressDetails.total || 1)) * 100)}%
                </span>
              </div>
              <Progress 
                data-agent-status="progress-bar"
                role="progressbar"
                aria-valuenow={Math.round(((progressDetails.current || 0) / (progressDetails.total || 1)) * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                value={((progressDetails.current || 0) / (progressDetails.total || 1)) * 100} 
                className="h-2" 
              />
              <p className="text-xs text-muted-foreground" aria-live="polite" aria-atomic="true" data-agent-status="progress-message">
                {progressDetails.message}
              </p>
            </>
          ) : (
            <>
              <div className="h-2 w-full bg-secondary rounded-full overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} data-agent-status="progress-bar-indeterminate">
                <div className="h-full bg-primary animate-pulse" style={{ width: '40%', animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
              <p className="text-xs text-muted-foreground" aria-live="polite" aria-atomic="true" data-agent-status="progress-message">
                {progressDetails?.message || "Processing..."}
              </p>
            </>
          )}
          
          {/* Pause/Cancel buttons */}
          <div className="flex gap-2 mt-4">
            {isPaused ? (
              <Button
                data-agent-action="resume-operation"
                onClick={onResume}
                disabled={isResumeLoading}
                size="sm"
                variant="outline"
                className="flex-1"
              >
                {isResumeLoading ? (
                  <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Resuming...</>
                ) : (
                  "Resume"
                )}
              </Button>
            ) : (
              <Button
                data-agent-action="pause-operation"
                onClick={onPause}
                disabled={isPauseLoading}
                size="sm"
                variant="outline"
                className="flex-1"
              >
                {isPauseLoading ? (
                  <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Pausing...</>
                ) : (
                  "Pause"
                )}
              </Button>
            )}
            <Button
              data-agent-action="cancel-operation"
              onClick={onCancel}
              disabled={isCancelLoading}
              size="sm"
              variant="destructive"
              className="flex-1"
            >
              {isCancelLoading ? (
                <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Cancelling...</>
              ) : (
                "Cancel"
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
