import { Badge } from "@/components/ui/badge";

const PLATFORM_STYLES: Record<string, string> = {
  indeed: "border-blue-500/40 text-blue-400",
  glassdoor: "border-green-500/40 text-green-400",
  linkedin: "border-blue-600/40 text-blue-300",
  ziprecruiter: "border-orange-500/40 text-orange-400",
  google: "border-red-500/40 text-red-400",
};

const PLATFORM_NAMES: Record<string, string> = {
  indeed: "Indeed",
  glassdoor: "Glassdoor",
  linkedin: "LinkedIn",
  ziprecruiter: "ZipRecruiter",
  google: "Google Jobs",
};

interface PlatformBadgeProps {
  platform: string | null | undefined;
  className?: string;
}

export function PlatformBadge({ platform, className = "" }: PlatformBadgeProps) {
  const key = platform || "indeed";
  const style = PLATFORM_STYLES[key] || "border-muted-foreground/40 text-muted-foreground";
  const name = PLATFORM_NAMES[key] || key.charAt(0).toUpperCase() + key.slice(1);

  return (
    <Badge
      variant="outline"
      className={`text-[10px] flex-shrink-0 ${style} ${className}`}
    >
      {name}
    </Badge>
  );
}

export function getPlatformName(platform: string | null | undefined): string {
  const key = platform || "indeed";
  return PLATFORM_NAMES[key] || key.charAt(0).toUpperCase() + key.slice(1);
}
