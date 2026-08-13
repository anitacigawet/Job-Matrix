/**
 * User Profile Configuration
 * Dynamic profile loaded from database, with fallback defaults
 */

import { getUserProfile, getEnabledPlatforms } from "./db";
import type { UserProfileForFilter } from "./ai-job-filter-csv";
import type { SupportedPlatform } from "./routers_indeed";
import { DEFAULT_PLATFORMS } from "./routers_indeed";

/**
 * State abbreviation lookup
 */
const STATE_ABBREVIATIONS: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
  "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
  "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
  "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
  "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
  "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
  "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
  "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
  "Wisconsin": "WI", "Wyoming": "WY"
};

/**
 * Default profile for backwards compatibility (Stripped of hard-coded locations)
 */
export const DEFAULT_USER_PROFILE = {
  name: "User",
  education: {
    level: "no_degree" as const,
    hasBachelors: false,
    hasAssociates: false,
  },
  experience: {
    yearsRange: "0-1" as const,
  },
  location: {
    currentCity: "",
    currentState: "",
    currentStateAbbr: "",
    remotePreference: "any" as const,
  },
};

/**
 * Load user profile from database and convert to filter-compatible format
 */
export async function loadUserProfileForFilter(userId: number): Promise<UserProfileForFilter> {
  try {
    const dbProfile = await getUserProfile(userId);
    
    if (!dbProfile) {
      console.log(`[Profile] No profile found for user ${userId}, returning empty profile`);
      return {
        state: "",
        city: "",
        stateAbbr: "",
        remotePreference: "any",
        educationLevel: "no_degree",
        yearsExperience: "0-1",
        skillsParsed: null,
        searchRadiusMiles: 50,
        minSalary: null,
        salaryFilterEnabled: false,
        isRealProfile: false,
      };
    }

    const state = dbProfile.state || "";
    const stateAbbr = state ? (STATE_ABBREVIATIONS[state] || state.substring(0, 2).toUpperCase()) : "";

    return {
      state: state,
      city: dbProfile.city || "",
      stateAbbr: stateAbbr,
      remotePreference: (dbProfile.remotePreference as UserProfileForFilter["remotePreference"]) || "any",
      educationLevel: (dbProfile.educationLevel as UserProfileForFilter["educationLevel"]) || "no_degree",
      yearsExperience: dbProfile.yearsExperience || "0-1",
      skillsParsed: dbProfile.skillsParsed ? dbProfile.skillsParsed.map((s: any) => s.skill).join(", ") : null,
      searchRadiusMiles: dbProfile.searchRadiusMiles || 50,
      minSalary: (dbProfile as any).minSalary || null,
      salaryFilterEnabled: (dbProfile as any).salaryFilterEnabled === 1,
      isRealProfile: true,
    };
    } catch (error) {
    console.error(`[Profile] Error loading profile for user ${userId}:`, error);
    return {
      state: "",
      city: "",
      stateAbbr: "",
      remotePreference: "any",
      educationLevel: "no_degree",
      yearsExperience: "0-1",
      skillsParsed: null,
      searchRadiusMiles: 50,
      minSalary: null,
      salaryFilterEnabled: false,
      isRealProfile: false,
    };  }
}

/**
 * Build dynamic job search criteria from user profile
 */
export async function loadJobSearchCriteria(userId: number) {
  const profile = await loadUserProfileForFilter(userId);
  
  const locations: Array<{
    type: "remote" | "local";
    searchTerm: string;
    description: string;
    radiusMiles: number;
  }> = [];

  // Add remote search if user wants remote or any
  if (profile.remotePreference === "remote_only" || profile.remotePreference === "any") {
    locations.push({
      type: "remote",
      searchTerm: "",
      description: "Remote (Nationwide)",
      radiusMiles: 0,
    });
  }

  // Add local search if user wants hybrid, on-site, or any
  if (profile.remotePreference !== "remote_only") {
    locations.push({
      type: "local",
      searchTerm: `${profile.city}, ${profile.stateAbbr}`,
      description: `${profile.city}, ${profile.state} Area`,
      radiusMiles: profile.searchRadiusMiles || 50,
    });
  }

  // If remote_only, also add local as secondary search
  if (profile.remotePreference === "remote_only") {
    locations.push({
      type: "local",
      searchTerm: `${profile.city}, ${profile.stateAbbr}`,
      description: `${profile.city}, ${profile.state} Area`,
      radiusMiles: profile.searchRadiusMiles || 50,
    });
  }

  return {
    locations,
    resultsPerTitle: 50,
  };
}

/**
 * Build dynamic AI filter rules from user profile
 */
/**
 * Load user's enabled job platforms
 */
export async function loadEnabledPlatforms(userId: number): Promise<SupportedPlatform[]> {
  try {
    const platforms = await getEnabledPlatforms(userId);
    if (platforms && platforms.length > 0) {
      return platforms as SupportedPlatform[];
    }
    return [...DEFAULT_PLATFORMS];
  } catch (error) {
    console.error(`[Profile] Error loading platforms for user ${userId}:`, error);
    return [...DEFAULT_PLATFORMS];
  }
}

export async function loadAIFilterRules(userId: number) {
  const profile = await loadUserProfileForFilter(userId);
  
  // Determine which degrees to reject based on user's education
  const rejectDegrees = {
    bachelors: ["no_degree", "high_school", "associates"].includes(profile.educationLevel),
    masters: ["no_degree", "high_school", "associates", "bachelors"].includes(profile.educationLevel),
    phd: ["no_degree", "high_school", "associates", "bachelors", "masters"].includes(profile.educationLevel),
  };

  // Determine max experience based on user's range
  const maxExpMap: Record<string, number> = {
    "0-1": 1,
    "1-3": 3,
    "3-5": 5,
    "5-10": 10,
    "10+": 99,
  };

  return {
    rejectIfRequires: {
      ...rejectDegrees,
      specificCertifications: [],
    },
    maxExperienceYears: maxExpMap[profile.yearsExperience] || 2,
    remoteStateCheck: {
      enabled: true,
      requiredState: profile.state,
    },
    rejectJobTypes: [
      "commission_only",
      "mlm",
      "multi_level_marketing",
      "pyramid_scheme",
      "insurance_sales",
      "1099_only",
    ],
    redFlags: [
      "unlimited earning potential",
      "be your own boss",
      "work from home opportunity",
      "no experience necessary, make $$$",
      "pay to start",
      "buy starter kit",
      "recruit others",
      "downline",
    ],
  };
}
