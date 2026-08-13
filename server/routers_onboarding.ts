import { z } from "zod";
import { router, userProcedure } from "./_core/trpc";
import { getDb, saveUserProfile, getUserProfile } from "./db";
import { users, userJobTitles, inviteCodes } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { TRPCError } from "@trpc/server";

type ParsedResumeSuggestions = {
  jobTypeTarget: string | null;
  city: string | null;
  state: string | null;
  remotePreference: "remote_only" | "hybrid" | "on_site" | "any" | null;
  educationLevel: "no_degree" | "high_school" | "associates" | "bachelors" | "masters" | "phd" | null;
  yearsExperience: "0-1" | "1-3" | "3-5" | "5-10" | "10+" | null;
  skillsRaw: string | null;
  suggestedJobTitles: string[];
};

// Retry helper for LLM calls (max 2 retries)
async function retryLLM<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[Onboarding] Retry attempt ${attempt}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.error(`[Onboarding] Attempt ${attempt + 1} failed:`, error);
    }
  }
  
  throw lastError || new Error("LLM call failed after retries");
}

export const onboardingRouter = router({
  uploadResumeAndParse: userProcedure
    .input(z.object({
      fileName: z.string().min(1).max(255),
      fileType: z.string().max(150).optional(),
      fileSize: z.number().positive().max(10 * 1024 * 1024).optional(),
      resumeText: z.string().max(120_000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log("[Onboarding] Resume auto-fill requested", {
        userId: ctx.user.id,
        fileName: input.fileName,
        fileType: input.fileType || "unknown",
        fileSize: input.fileSize || 0,
        textLen: input.resumeText?.length ?? 0,
      });

      const trimmed = input.resumeText?.trim() ?? "";
      if (!trimmed) {
        return {
          success: false as const,
          parsedProfile: null,
          message: "No text to analyze. Upload a .txt resume, paste plain text, or continue manually.",
        };
      }

      const clipped = trimmed.slice(0, 24_000);

      try {
        const response = await retryLLM(async () =>
          invokeLLM({
            messages: [
              {
                role: "system",
                content:
                  'You are the user\'s onboarding assistant. Read the resume carefully and extract structured onboarding fields. Return ONLY a JSON object with this structure: {"jobTypeTarget": "string", "city": "string", "state": "string", "remotePreference": "remote_only"|"hybrid"|"on_site"|"any", "educationLevel": "no_degree"|"high_school"|"associates"|"bachelors"|"masters"|"phd", "yearsExperience": "0-1"|"1-3"|"3-5"|"5-10"|"10+", "skillsRaw": "string", "suggestedJobTitles": ["string", ...]}. suggestedJobTitles should have up to 15 realistic titles.',
              },
              {
                role: "user",
                content: `Resume text:\n\n${clipped}`,
              },
            ],
            response_format: { type: "json_object" },
          })
        );

        const content = response?.choices?.[0]?.message?.content;
        if (!content || typeof content !== "string") {
          throw new Error("Empty LLM content");
        }

        let raw: Record<string, unknown>;
        try {
          raw = JSON.parse(content) as Record<string, unknown>;
        } catch {
          return {
            success: false as const,
            parsedProfile: null,
            message:
              "The model returned unreadable data. Continue manually—nothing was saved.",
          };
        }
        const asText = (v: unknown) => (typeof v === "string" ? v.trim() : "");
        const asEnum = <T extends string>(v: unknown, allowed: T[]): T | null =>
          typeof v === "string" && allowed.includes(v as T) ? (v as T) : null;
        const titles = Array.isArray(raw.suggestedJobTitles)
          ? raw.suggestedJobTitles
              .filter((x): x is string => typeof x === "string")
              .map((t) => t.trim())
              .filter(Boolean)
              .slice(0, 15)
          : [];

        const parsedProfile: ParsedResumeSuggestions = {
          jobTypeTarget: asText(raw.jobTypeTarget) || null,
          city: asText(raw.city) || null,
          state: asText(raw.state) || null,
          remotePreference: asEnum(raw.remotePreference, ["remote_only", "hybrid", "on_site", "any"]),
          educationLevel: asEnum(raw.educationLevel, ["no_degree", "high_school", "associates", "bachelors", "masters", "phd"]),
          yearsExperience: asEnum(raw.yearsExperience, ["0-1", "1-3", "3-5", "5-10", "10+"]),
          skillsRaw: asText(raw.skillsRaw) || null,
          suggestedJobTitles: titles,
        };

        const filled =
          (parsedProfile.jobTypeTarget ? 1 : 0) +
          (parsedProfile.state && parsedProfile.city ? 1 : 0) +
          (parsedProfile.skillsRaw ? 1 : 0) +
          (parsedProfile.suggestedJobTitles.length ? 1 : 0);

        if (filled === 0) {
          return {
            success: false as const,
            parsedProfile: null,
            message: "No useful fields were inferred. Continue with manual setup.",
          };
        }

        return {
          success: true as const,
          parsedProfile,
          message: "AI suggestions applied — review and edit every field before finishing.",
        };
      } catch (err) {
        console.error("[Onboarding] Resume parse failed (non-blocking):", err);
        return {
          success: false as const,
          parsedProfile: null,
          message:
            "Auto-fill did not complete (AI busy or error). Continue manually—onboarding is not blocked.",
        };
      }
    }),

  // Generate 15 job title variations from user input
  generateJobTitles: userProcedure
    .input(z.object({
      jobType: z.string().min(1).max(255),
    }))
    .mutation(async ({ input, ctx }) => {
      const { jobType } = input;
      
      console.log(`[Onboarding] Generating job titles for: ${jobType}`);
      
      try {
        const response = await retryLLM(async () => {
          return await invokeLLM({
            messages: [
              {
                role: "system",
                content: "You are a job search expert. Generate exactly 15 related job title variations based on the user's desired job type. Return ONLY a JSON object with this structure: {\"titles\": [\"string\", ...]}"
              },
              {
                role: "user",
                content: `Generate 15 job title variations for: "${jobType}"`
              }
            ],
            response_format: { type: "json_object" }
          });
        });

        if (!response || !response.choices || response.choices.length === 0) {
          console.error("[Onboarding] Invalid response structure");
          throw new Error("LLM returned invalid response structure");
        }

        const content = response.choices[0].message.content;
        if (!content || typeof content !== "string") {
          throw new Error("LLM returned empty or invalid content");
        }

        const parsed = JSON.parse(content);
        const titles = parsed.titles;

        if (!Array.isArray(titles) || titles.length === 0) {
          throw new Error(`Expected titles array, got ${titles?.length || 0}`);
        }

        // Take up to 15 titles
        const finalTitles = titles.slice(0, 15);
        console.log(`[Onboarding] Successfully generated ${finalTitles.length} job titles`);
        return { titles: finalTitles };

      } catch (error) {
        console.error("[Onboarding] Job title generation failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to generate job titles: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Save user profile from onboarding questions
  saveProfile: userProcedure
    .input(z.object({
      state: z.string().min(1).max(100),
      city: z.string().min(1).max(100),
      searchRadiusMiles: z.number().min(5).max(500).default(50),
      willingToRelocate: z.boolean().default(false),
      remotePreference: z.enum(["remote_only", "hybrid", "on_site", "any"]),
      educationLevel: z.enum(["no_degree", "high_school", "associates", "bachelors", "masters", "phd"]),
      yearsExperience: z.enum(["0-1", "1-3", "3-5", "5-10", "10+"]),
      skillsRaw: z.string().max(2000).optional(),
      resumeText: z.string().max(40000).optional(),
      minSalary: z.number().min(0).max(500000).nullable().optional(),
      salaryFilterEnabled: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.id;
      console.log(`[Onboarding] Saving profile for user ${userId}`);

      try {
        // Save the profile
        await saveUserProfile({
          userId,
          state: input.state,
          city: input.city,
          searchRadiusMiles: input.searchRadiusMiles,
          willingToRelocate: input.willingToRelocate ? 1 : 0,
          remotePreference: input.remotePreference,
          educationLevel: input.educationLevel,
          yearsExperience: input.yearsExperience,
          skillsRaw: input.skillsRaw || null,
          skillsParsed: null,
          resumeText: input.resumeText || null,
          minSalary: input.minSalary || null,
          salaryFilterEnabled: input.salaryFilterEnabled ? 1 : 0,
        });

        // If skills were provided, parse them with AI
        if (input.skillsRaw && input.skillsRaw.trim().length > 0) {
          try {
            const skillsResponse = await retryLLM(async () => {
              return await invokeLLM({
                messages: [
                  {
                    role: "system",
                    content: "You are a career skills analyst. Parse the user's free-form skills description into structured data. Return ONLY a JSON object with a \"skills\" array where each item is {\"skill\": \"string\", \"yearsExperience\": number, \"level\": \"beginner\"|\"intermediate\"|\"advanced\"|\"expert\"}."
                  },
                  {
                    role: "user",
                    content: `Parse these skills into structured data:\n\n"${input.skillsRaw}"`
                  }
                ],
                response_format: { type: "json_object" }
              });
            });

            if (skillsResponse?.choices?.[0]?.message?.content) {
              const parsedSkills = JSON.parse(skillsResponse.choices[0].message.content as string);
              if (parsedSkills.skills && Array.isArray(parsedSkills.skills)) {
                // Update profile with parsed skills
                const { updateUserProfileSkills } = await import("./db");
                await updateUserProfileSkills(userId, input.skillsRaw, parsedSkills.skills);
                console.log(`[Onboarding] Parsed ${parsedSkills.skills.length} skills for user ${userId}`);
              }
            }
          } catch (skillError) {
            // Skills parsing is non-critical, log and continue
            console.error("[Onboarding] Skills parsing failed (non-critical):", skillError);
          }
        }

        console.log(`[Onboarding] Profile saved successfully for user ${userId}`);
        return { success: true };

      } catch (error) {
        console.error("[Onboarding] Failed to save profile:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save profile",
        });
      }
    }),

  // Get user profile
  getProfile: userProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.user.id;
      const profile = await getUserProfile(userId);
      if (!profile) return null;

      return {
        state: profile.state,
        city: profile.city,
        searchRadiusMiles: profile.searchRadiusMiles,
        willingToRelocate: profile.willingToRelocate === 1,
        remotePreference: profile.remotePreference,
        educationLevel: profile.educationLevel,
        yearsExperience: profile.yearsExperience,
        skillsRaw: profile.skillsRaw,
        skillsParsed: profile.skillsParsed,
        resumeText: profile.resumeText,
        minSalary: (profile as any).minSalary || null,
        salaryFilterEnabled: (profile as any).salaryFilterEnabled === 1,
      };
    }),

  // Save selected job titles and mark onboarding as complete
  saveJobTitles: userProcedure
    .input(z.object({
      titles: z.array(z.object({
        title: z.string(),
        isActive: z.boolean(),
      })).min(1).max(15),
    }))
    .mutation(async ({ input, ctx }) => {
      const { titles } = input;
      const userId = ctx.user.id;

      console.log(`[Onboarding] Saving ${titles.length} job titles for user ${userId}`);

      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // Delete existing job titles for this user (in case of re-onboarding)
        await db.delete(userJobTitles).where(eq(userJobTitles.userId, userId));

        // Insert all job titles
        for (const { title, isActive } of titles) {
          await db.insert(userJobTitles).values({
            userId,
            jobTitle: title,
            isActive: isActive ? 1 : 0,
          });
        }

        // Mark onboarding as complete
        await db.update(users)
          .set({ onboardingCompleted: 1 })
          .where(eq(users.id, userId));

        console.log(`[Onboarding] Successfully saved job titles and marked onboarding complete`);
        return { success: true };

      } catch (error) {
        console.error("[Onboarding] Failed to save job titles:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save job titles",
        });
      }
    }),

  // Get user's job titles (for config page)
  getJobTitles: userProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.user.id;
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const titles = await db.select()
        .from(userJobTitles)
        .where(eq(userJobTitles.userId, userId));

      return titles.map((t: any) => ({
        id: t.id,
        title: t.jobTitle,
        isActive: t.isActive === 1,
        createdAt: t.createdAt,
      }));
    }),

  // Update job title active status (for config page)
  updateJobTitleStatus: userProcedure
    .input(z.object({
      titleId: z.number(),
      isActive: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { titleId, isActive } = input;
      const userId = ctx.user.id;
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.update(userJobTitles)
        .set({ isActive: isActive ? 1 : 0 })
        .where(and(
          eq(userJobTitles.id, titleId),
          eq(userJobTitles.userId, userId)
        ));

      return { success: true };
    }),

  // Validate invite code
  validateInviteCode: userProcedure
    .input(z.object({
      code: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const { code } = input;
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const inviteCode = await db.select()
        .from(inviteCodes)
        .where(eq(inviteCodes.code, code))
        .limit(1);

      if (inviteCode.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid invite code",
        });
      }

      const invite = inviteCode[0];

      // Check if expired
      if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invite code has expired",
        });
      }

      // Check if max uses reached
      if (invite.currentUses >= invite.maxUses) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invite code has reached maximum uses",
        });
      }

      return { valid: true };
    }),
});
