import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

interface UserProfile {
  remotePreference?: string;
  city?: string;
  stateAbbr?: string;
  state?: string;
  searchRadiusMiles?: number;
  educationLevel?: string;
  yearsExperience?: string;
  skillsParsed?: string;
}

interface JobTitle {
  id: number;
  title: string;
  isActive: boolean;
}

interface SearchCriteriaCardProps {
  userProfile: UserProfile | null | undefined;
  userJobTitlesList: JobTitle[];
}

export function SearchCriteriaCard({ userProfile, userJobTitlesList }: SearchCriteriaCardProps) {
  const activeTitles = userJobTitlesList.filter(t => t.isActive);
  const titleColors = [
    "bg-blue-500/20 text-blue-300 border-blue-500/40",
    "bg-purple-500/20 text-purple-300 border-purple-500/40",
    "bg-pink-500/20 text-pink-300 border-pink-500/40",
    "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
    "bg-violet-500/20 text-violet-300 border-violet-500/40",
    "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40",
  ];

  const educationLabels: Record<string, string> = {
    no_degree: "No Degree",
    high_school: "High School / GED",
    associates: "Associate's Degree",
    bachelors: "Bachelor's Degree",
    masters: "Master's Degree",
    phd: "PhD / Doctorate",
  };

  const experienceThreshold = (() => {
    switch (userProfile?.yearsExperience) {
      case "0-1": return "1";
      case "1-3": return "3";
      case "3-5": return "5";
      case "5-10": return "10";
      default: return "1";
    }
  })();

  return (
    <Card className="mb-6 glass-card" data-agent-status="search-criteria">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Search Criteria & AI Filters
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium mb-2">Target Positions:</p>
            <div className="flex flex-wrap gap-2">
              {activeTitles.slice(0, 6).map((t, i) => (
                <Badge key={t.id} variant="secondary" className={titleColors[i % titleColors.length]}>
                  {t.title}
                </Badge>
              ))}
              {activeTitles.length > 6 && (
                <Badge variant="secondary" className="bg-gray-500/20 text-gray-300 border-gray-500/40">
                  +{activeTitles.length - 6} more
                </Badge>
              )}
            </div>
          </div>
          <div>
            <p className="font-medium mb-2">Locations:</p>
            <div className="flex flex-wrap gap-2">
              {(userProfile?.remotePreference === "remote_only" || userProfile?.remotePreference === "any") && (
                <Badge variant="secondary" className="bg-green-500/20 text-green-300 border-green-500/40">🌎 Remote (Nationwide)</Badge>
              )}
              {userProfile?.city && userProfile?.stateAbbr && (
                <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-300 border-cyan-500/40">
                  🏠 {userProfile.city}, {userProfile.stateAbbr} ({userProfile?.searchRadiusMiles || 50} mi)
                </Badge>
              )}
            </div>
          </div>
          <div>
            <p className="font-medium mb-2">AI Filters:</p>
            <ul className="text-xs space-y-1">
              <li className="flex items-center gap-2"><span className="text-red-400 font-bold">-</span><span className="text-muted-foreground">Education Requirement</span></li>
              <li className="flex items-center gap-2"><span className="text-red-400 font-bold">-</span><span className="text-muted-foreground">
                Over {experienceThreshold} Year Experience
              </span></li>
              <li className="flex items-center gap-2"><span className="text-red-400 font-bold">-</span><span className="text-muted-foreground">Not Remote Eligible</span></li>
              {userProfile?.state && (
                <li className="flex items-center gap-2"><span className="text-red-400 font-bold">-</span><span className="text-muted-foreground">Not {userProfile.state} Eligible</span></li>
              )}
            </ul>
          </div>
          <div>
            <p className="font-medium mb-2">Your Profile:</p>
            <ul className="text-xs space-y-1">
              <li className="flex items-center gap-2"><span className="text-green-400 font-bold">+</span><span className="text-muted-foreground">
                Education: {educationLabels[userProfile?.educationLevel || ""] || "Not specified"}
              </span></li>
              <li className="flex items-center gap-2"><span className="text-green-400 font-bold">+</span><span className="text-muted-foreground">
                Experience: {userProfile?.yearsExperience || "0-1"} years
              </span></li>
              {userProfile?.skillsParsed && (
                <li className="flex items-center gap-2"><span className="text-green-400 font-bold">+</span><span className="text-muted-foreground">
                  Skills: {userProfile.skillsParsed}
                </span></li>
              )}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
