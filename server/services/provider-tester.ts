/**
 * server/services/provider-tester.ts
 *
 * Validates a provider's API key + model by sending one tiny round-trip
 * request, before anything is saved to settings. Used by the "Test
 * connection" buttons on the Settings page so users find out about a
 * bad key / wrong model / dead network *before* their next scan
 * silently fails on it.
 *
 * Intentionally does NOT go through the production LLM router — it
 * validates the values the user is currently typing, not what's
 * already saved.
 */
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

export type ProviderId = "gemini" | "openai" | "deepseek";

export interface TestResult {
  ok: boolean;
  message: string;
  latencyMs: number;
  /** HTTP status from the provider when applicable. */
  status?: number;
}

const TEST_PROMPT = "Reply with the single word OK.";
const TEST_TIMEOUT_MS = 15_000;

const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  deepseek: "DeepSeek",
};

function humanizeHttpError(status: number, body: string, providerLabel: string): string {
  if (status === 401 || status === 403) {
    return `${providerLabel} rejected the API key. Double-check it's correct and active.`;
  }
  if (status === 404) {
    return `${providerLabel} returned 404 — the model name is likely wrong for this provider.`;
  }
  if (status === 429) {
    return `${providerLabel} rate-limited the request. Either the key is over its quota, or the rate-limit setting is too aggressive.`;
  }
  if (status === 400) {
    // Try to surface the provider's own error message if it's compact
    const snippet = body.slice(0, 280).replace(/\s+/g, " ").trim();
    return `${providerLabel} returned 400: ${snippet || "request was rejected as malformed"}.`;
  }
  if (status >= 500) {
    return `${providerLabel} is having a server-side issue (HTTP ${status}). Try again in a minute.`;
  }
  return `${providerLabel} returned HTTP ${status}: ${body.slice(0, 200)}`;
}

function humanizeProviderError(err: unknown, providerLabel: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  const status = typeof (err as any)?.status === "number" ? (err as any).status : undefined;
  if (status) return humanizeHttpError(status, msg, providerLabel);
  if (msg.includes("AbortError") || msg.includes("timed out")) {
    return `Could not reach ${providerLabel} within ${TEST_TIMEOUT_MS / 1000}s. Check your network or firewall.`;
  }
  if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
    return `Could not resolve ${providerLabel}'s hostname. Network or DNS issue.`;
  }
  if (msg.includes("ECONNREFUSED")) {
    return `Connection refused when reaching ${providerLabel}.`;
  }
  return `Network error reaching ${providerLabel}: ${msg}`;
}

async function testOpenAICompatible(
  providerId: "openai" | "deepseek",
  apiKey: string,
  model: string,
): Promise<TestResult> {
  const label = PROVIDER_LABELS[providerId];
  const t0 = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: providerId === "deepseek" ? "https://api.deepseek.com" : "https://api.openai.com/v1",
    });
    await client.chat.completions.create(
      {
        model,
        messages: [{ role: "user", content: TEST_PROMPT }],
        max_tokens: 8,
        temperature: 0,
      },
      { signal: controller.signal },
    );
    const latencyMs = Date.now() - t0;
    return {
      ok: true,
      message: `Connected to ${label} (${model}) in ${latencyMs}ms.`,
      latencyMs,
      status: 200,
    };
  } catch (err) {
    return {
      ok: false,
      message: humanizeProviderError(err, label),
      latencyMs: Date.now() - t0,
      status: typeof (err as any)?.status === "number" ? (err as any).status : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function testGemini(apiKey: string, model: string): Promise<TestResult> {
  const label = PROVIDER_LABELS.gemini;
  const t0 = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  try {
    const client = new GoogleGenAI({ apiKey });
    await client.models.generateContent({
      model,
      contents: TEST_PROMPT,
      config: {
        maxOutputTokens: 8,
        temperature: 0,
        abortSignal: controller.signal,
      },
    });
    const latencyMs = Date.now() - t0;
    return {
      ok: true,
      message: `Connected to ${label} (${model}) in ${latencyMs}ms.`,
      latencyMs,
      status: 200,
    };
  } catch (err) {
    return {
      ok: false,
      message: humanizeProviderError(err, label),
      latencyMs: Date.now() - t0,
      status: typeof (err as any)?.status === "number" ? (err as any).status : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function testProviderConnection(
  provider: ProviderId,
  apiKey: string,
  model: string,
): Promise<TestResult> {
  if (!apiKey || apiKey.trim().length < 8) {
    return {
      ok: false,
      message: `Enter an API key for ${PROVIDER_LABELS[provider]} before testing.`,
      latencyMs: 0,
    };
  }
  if (!model || model.trim().length === 0) {
    return {
      ok: false,
      message: `Enter a model name for ${PROVIDER_LABELS[provider]} before testing.`,
      latencyMs: 0,
    };
  }

  if (provider === "gemini") return testGemini(apiKey.trim(), model.trim());
  return testOpenAICompatible(provider, apiKey.trim(), model.trim());
}
