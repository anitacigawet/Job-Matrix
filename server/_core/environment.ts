import {
  resolveActiveProvider,
  resolveProviderKey,
  resolveProviderModel,
} from "./settings";

const PROVIDER_LABEL = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  deepseek: "DeepSeek",
} as const;

export type DeploymentEnvironment = "local";
export function getDeploymentEnvironment(): DeploymentEnvironment { return "local"; }

export function getActiveProviderLabel(): string {
  return PROVIDER_LABEL[resolveActiveProvider()];
}

export function getEnvironmentLabel(): string {
  const provider = resolveActiveProvider();
  const label = PROVIDER_LABEL[provider];
  const key = resolveProviderKey(provider);
  return key
    ? `Local (${label} • ${resolveProviderModel(provider)})`
    : `Local (${label} key missing)`;
}

export function validateEnvironment(): string[] {
  const errors: string[] = [];
  const provider = resolveActiveProvider();
  if (!resolveProviderKey(provider)) {
    errors.push(
      `${PROVIDER_LABEL[provider]} API key not configured. Add a key in Settings, or set the env var.`,
    );
  }
  return errors;
}

export function logEnvironmentBanner(): void {
  const errors = validateEnvironment();
  console.log("─────────────────────────────────────────");
  console.log("  Job Matrix — Local-First Build");
  console.log("─────────────────────────────────────────");
  console.log(`  • LLM:    ${getEnvironmentLabel()}`);
  if (errors.length > 0) {
    console.log("");
    console.log("  Notes:");
    errors.forEach((e) => console.log(`  ⚠ ${e}`));
  } else {
    console.log("  ✓ All required configuration present");
  }
  console.log("─────────────────────────────────────────");
}
