import { describe, expect, it, vi, beforeEach } from "vitest";
import { DEFAULT_USER_PROFILE, loadAIFilterRules, loadJobSearchCriteria, loadUserProfileForFilter } from "./user-profile";

// Mock the db module
vi.mock("./db", () => ({
  getUserProfile: vi.fn(),
}));

import { getUserProfile } from "./db";
const mockedGetUserProfile = vi.mocked(getUserProfile);

describe("DEFAULT_USER_PROFILE", () => {
  it("has correct default values", () => {
    expect(DEFAULT_USER_PROFILE.education.level).toBe("no_degree");
    expect(DEFAULT_USER_PROFILE.location.currentState).toBe("");
    expect(DEFAULT_USER_PROFILE.location.currentCity).toBe("");
    expect(DEFAULT_USER_PROFILE.location.currentStateAbbr).toBe("");
    expect(DEFAULT_USER_PROFILE.location.remotePreference).toBe("any");
    expect(DEFAULT_USER_PROFILE.experience.yearsRange).toBe("0-1");
  });
});

describe("loadUserProfileForFilter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty profile when no database profile exists", async () => {
    mockedGetUserProfile.mockResolvedValue(undefined);

    const profile = await loadUserProfileForFilter(1);

    expect(profile.state).toBe("");
    expect(profile.city).toBe("");
    expect(profile.stateAbbr).toBe("");
    expect(profile.remotePreference).toBe("any");
    expect(profile.educationLevel).toBe("no_degree");
    expect(profile.yearsExperience).toBe("0-1");
    expect(profile.skillsParsed).toBeNull();
    expect(profile.searchRadiusMiles).toBe(50);
    expect(profile.isRealProfile).toBe(false);
  });

  it("loads profile from database with correct state abbreviation", async () => {
    mockedGetUserProfile.mockResolvedValue({
      id: 1,
      userId: 1,
      state: "California",
      city: "Los Angeles",
      willingToRelocate: false,
      remotePreference: "hybrid",
      educationLevel: "bachelors",
      yearsExperience: "3-5",
      skillsRaw: "Python, JavaScript",
      skillsParsed: [{ skill: "Python", yearsExperience: 3, level: "intermediate" }],
      searchRadiusMiles: 25,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const profile = await loadUserProfileForFilter(1);

    expect(profile.state).toBe("California");
    expect(profile.city).toBe("Los Angeles");
    expect(profile.stateAbbr).toBe("CA");
    expect(profile.remotePreference).toBe("hybrid");
    expect(profile.educationLevel).toBe("bachelors");
    expect(profile.yearsExperience).toBe("3-5");
    expect(profile.skillsParsed).toBe("Python");
    expect(profile.searchRadiusMiles).toBe(25);
  });

  it("returns empty profile on database error", async () => {
    mockedGetUserProfile.mockRejectedValue(new Error("DB connection failed"));

    const profile = await loadUserProfileForFilter(1);

    expect(profile.state).toBe("");
    expect(profile.educationLevel).toBe("no_degree");
    expect(profile.isRealProfile).toBe(false);
  });
});

describe("loadJobSearchCriteria", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes remote and local searches for remote_only preference", async () => {
    mockedGetUserProfile.mockResolvedValue({
      id: 1,
      userId: 1,
      state: "Arizona",
      city: "Kingman",
      willingToRelocate: false,
      remotePreference: "remote_only",
      educationLevel: "no_degree",
      yearsExperience: "0-1",
      skillsRaw: null,
      skillsParsed: null,
      searchRadiusMiles: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const criteria = await loadJobSearchCriteria(1);

    expect(criteria.locations).toHaveLength(2);
    expect(criteria.locations[0].type).toBe("remote");
    expect(criteria.locations[0].description).toBe("Remote (Nationwide)");
    expect(criteria.locations[1].type).toBe("local");
    expect(criteria.locations[1].searchTerm).toBe("Kingman, AZ");
    expect(criteria.resultsPerTitle).toBe(50);
  });

  it("includes only local search for on_site preference", async () => {
    mockedGetUserProfile.mockResolvedValue({
      id: 1,
      userId: 1,
      state: "Texas",
      city: "Austin",
      willingToRelocate: false,
      remotePreference: "on_site",
      educationLevel: "bachelors",
      yearsExperience: "3-5",
      skillsRaw: null,
      skillsParsed: null,
      searchRadiusMiles: 30,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const criteria = await loadJobSearchCriteria(1);

    expect(criteria.locations).toHaveLength(1);
    expect(criteria.locations[0].type).toBe("local");
    expect(criteria.locations[0].searchTerm).toBe("Austin, TX");
    expect(criteria.locations[0].radiusMiles).toBe(30);
  });

  it("includes both remote and local for 'any' preference", async () => {
    mockedGetUserProfile.mockResolvedValue({
      id: 1,
      userId: 1,
      state: "New York",
      city: "New York City",
      willingToRelocate: true,
      remotePreference: "any",
      educationLevel: "masters",
      yearsExperience: "5-10",
      skillsRaw: null,
      skillsParsed: null,
      searchRadiusMiles: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const criteria = await loadJobSearchCriteria(1);

    expect(criteria.locations).toHaveLength(2);
    expect(criteria.locations[0].type).toBe("remote");
    expect(criteria.locations[1].type).toBe("local");
    expect(criteria.locations[1].searchTerm).toBe("New York City, NY");
  });
});

describe("loadAIFilterRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects bachelors for no_degree user", async () => {
    mockedGetUserProfile.mockResolvedValue({
      id: 1,
      userId: 1,
      state: "Arizona",
      city: "Kingman",
      willingToRelocate: false,
      remotePreference: "remote_only",
      educationLevel: "no_degree",
      yearsExperience: "0-1",
      skillsRaw: null,
      skillsParsed: null,
      searchRadiusMiles: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const rules = await loadAIFilterRules(1);

    expect(rules.rejectIfRequires.bachelors).toBe(true);
    expect(rules.rejectIfRequires.masters).toBe(true);
    expect(rules.rejectIfRequires.phd).toBe(true);
    expect(rules.maxExperienceYears).toBe(1);
    expect(rules.remoteStateCheck.requiredState).toBe("Arizona");
  });

  it("does not reject bachelors for bachelors user", async () => {
    mockedGetUserProfile.mockResolvedValue({
      id: 1,
      userId: 1,
      state: "California",
      city: "San Francisco",
      willingToRelocate: false,
      remotePreference: "remote_only",
      educationLevel: "bachelors",
      yearsExperience: "3-5",
      skillsRaw: null,
      skillsParsed: null,
      searchRadiusMiles: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const rules = await loadAIFilterRules(1);

    expect(rules.rejectIfRequires.bachelors).toBe(false);
    expect(rules.rejectIfRequires.masters).toBe(true);
    expect(rules.rejectIfRequires.phd).toBe(true);
    expect(rules.maxExperienceYears).toBe(5);
    expect(rules.remoteStateCheck.requiredState).toBe("California");
  });

  it("sets correct max experience for 10+ range", async () => {
    mockedGetUserProfile.mockResolvedValue({
      id: 1,
      userId: 1,
      state: "Texas",
      city: "Dallas",
      willingToRelocate: false,
      remotePreference: "any",
      educationLevel: "masters",
      yearsExperience: "10+",
      skillsRaw: null,
      skillsParsed: null,
      searchRadiusMiles: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const rules = await loadAIFilterRules(1);

    expect(rules.rejectIfRequires.bachelors).toBe(false);
    expect(rules.rejectIfRequires.masters).toBe(false);
    expect(rules.rejectIfRequires.phd).toBe(true);
    expect(rules.maxExperienceYears).toBe(99);
  });

  it("includes scam/MLM red flags", async () => {
    mockedGetUserProfile.mockResolvedValue(undefined);

    const rules = await loadAIFilterRules(1);

    expect(rules.redFlags).toContain("unlimited earning potential");
    expect(rules.redFlags).toContain("be your own boss");
    expect(rules.redFlags).toContain("recruit others");
    expect(rules.rejectJobTypes).toContain("mlm");
    expect(rules.rejectJobTypes).toContain("commission_only");
  });
});
