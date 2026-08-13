import { useEffect, useRef, useState } from "react";
import { Play, Pause, Download, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";

const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;
type PlaybackRate = (typeof PLAYBACK_RATES)[number];

interface BriefingAudioPlayerProps {
  src: string;
  title?: string;
  /** Stable id used for the `briefing-audio-{id}` agent hook and friends. */
  id: number | string;
  className?: string;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function BriefingAudioPlayer({ src, title, id, className }: BriefingAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState<PlaybackRate>(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = rate;
  }, [rate]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  function onSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const t = parseFloat(e.target.value);
    audio.currentTime = t;
    setCurrent(t);
  }

  function handleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    // Don't intercept arrow keys when focus is on the scrubber (native behavior is correct).
    const target = e.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.type === "range") return;

    if (e.key === " " || e.key === "k" || e.key === "K") {
      e.preventDefault();
      togglePlay();
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const audio = audioRef.current;
      if (!audio) return;
      const delta = e.key === "ArrowLeft" ? -5 : 5;
      const next = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + delta));
      audio.currentTime = next;
      setCurrent(next);
      e.preventDefault();
    }
  }

  const downloadName = title ? `${title.replace(/[^\w.-]+/g, "_")}.mp4` : undefined;

  return (
    <div
      role="region"
      aria-label={title ? `Audio player for ${title}` : "Audio player"}
      tabIndex={0}
      onKeyDown={handleKey}
      data-agent-status={`briefing-audio-${id}`}
      className={
        "rounded-lg border border-border/40 bg-muted/10 p-3 space-y-3 " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50 " +
        (className ?? "")
      }
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime || 0)}
        onEnded={() => setPlaying(false)}
      />

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="default"
          size="icon"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          data-agent-action={`toggle-briefing-audio-${id}`}
          className="bg-purple-500/80 hover:bg-purple-500 h-9 w-9 shrink-0"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <span className="text-xs text-muted-foreground tabular-nums shrink-0" aria-label="Elapsed">
            {formatTime(current)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            onChange={onSeek}
            aria-label="Seek"
            aria-valuetext={`${formatTime(current)} of ${formatTime(duration)}`}
            className="flex-1 accent-purple-500 cursor-pointer"
            disabled={!duration}
          />
          <span className="text-xs text-muted-foreground tabular-nums shrink-0" aria-label="Total duration">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Gauge className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <div role="radiogroup" aria-label="Playback speed" className="flex items-center gap-1">
            {PLAYBACK_RATES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={rate === r}
                onClick={() => setRate(r)}
                data-agent-action={`set-playback-rate-${r}`}
                className={
                  "text-xs px-2 py-0.5 rounded transition-colors border " +
                  (rate === r
                    ? "bg-purple-500/25 text-purple-200 border-purple-500/50"
                    : "text-muted-foreground hover:text-foreground border-transparent hover:border-border/50")
                }
              >
                {r}×
              </button>
            ))}
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
          <a
            href={src}
            download={downloadName}
            data-agent-action={`download-briefing-audio-${id}`}
          >
            <Download className="h-3 w-3" />
            Download
          </a>
        </Button>
      </div>
    </div>
  );
}
