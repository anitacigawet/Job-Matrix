import { describe, expect, it } from "vitest";
import { settingsWithoutProviderKey } from "./settings";

describe("hosted provider key removal", () => {
  it("removes only the selected key from replacement settings", () => {
    const original = {
      activeProvider: "gemini" as const,
      geminiKey: "gemini-secret",
      openaiKey: "openai-secret",
    };
    const replacement = settingsWithoutProviderKey(original, "gemini");
    expect(replacement.geminiKey).toBeUndefined();
    expect(replacement.openaiKey).toBe("openai-secret");
    expect(original.geminiKey).toBe("gemini-secret");
  });
});
