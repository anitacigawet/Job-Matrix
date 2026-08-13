import {
  resolveActiveProvider,
  resolveProviderKey,
  resolveProviderModel,
  resolveRateLimitRps,
} from "./settings";
import { DEFAULT_MAX_TOKENS } from "./llm-defaults";
import type { ProviderId } from "./env";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

export type {
  Role,
  Message,
  MessageContent,
  TextContent,
  ImageContent,
  FileContent,
  Tool,
  ToolChoice,
  InvokeParams,
  InvokeResult,
  JsonSchema,
  OutputSchema,
  ResponseFormat,
} from "./llm";

import type { InvokeParams, InvokeResult, Message, Tool } from "./llm";

// ─────────────────────────────────────────────────────────────────────────────
// Shared rate limiter (one bucket across all providers — local, single user).
// ─────────────────────────────────────────────────────────────────────────────

let lastRequestTime = 0;
async function applyRateLimit(): Promise<void> {
  const rps = resolveRateLimitRps();
  if (rps <= 0) {
    lastRequestTime = Date.now();
    return;
  }
  const minIntervalMs = 1000 / rps;
  const wait = minIntervalMs - (Date.now() - lastRequestTime);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestTime = Date.now();
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider interface (kept stable — call sites already depend on this shape).
// ─────────────────────────────────────────────────────────────────────────────

export interface LLMProvider {
  invoke(params: InvokeParams): Promise<InvokeResult>;
  validate(): Promise<boolean>;
  getName(): string;
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI-compatible (covers OpenAI and DeepSeek, since DeepSeek's API mirrors
// OpenAI's Chat Completions schema).
// ─────────────────────────────────────────────────────────────────────────────

class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    private readonly providerId: ProviderId,
    private readonly displayName: string,
    private readonly baseURL: string,
  ) {}

  getName(): string {
    return `${this.displayName} (${resolveProviderModel(this.providerId)})`;
  }

  async validate(): Promise<boolean> {
    return !!resolveProviderKey(this.providerId);
  }

  async invoke(params: InvokeParams): Promise<InvokeResult> {
    const key = resolveProviderKey(this.providerId);
    if (!key) {
      throw new Error(
        `${this.displayName} API key not configured. Set the env var or save a key via the Settings page.`,
      );
    }

    await applyRateLimit();

    const body: Record<string, unknown> = {
      model: resolveProviderModel(this.providerId),
      messages: params.messages,
      max_tokens: params.maxTokens ?? params.max_tokens ?? DEFAULT_MAX_TOKENS,
    };
    if (params.tools) body.tools = params.tools;
    const toolChoice = params.toolChoice ?? params.tool_choice;
    if (toolChoice) body.tool_choice = toolChoice;
    const responseFormat = params.responseFormat ?? params.response_format;
    if (responseFormat) body.response_format = responseFormat;

    const client = new OpenAI({ apiKey: key, baseURL: this.baseURL });
    try {
      const response = await client.chat.completions.create(body as any);
      return response as unknown as InvokeResult;
    } catch (error: any) {
      const status = typeof error?.status === "number" ? `HTTP ${error.status}: ` : "";
      throw new Error(`${this.displayName} invoke failed: ${status}${error?.message ?? error}`);
    }
  }
}

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor() {
    super("openai", "OpenAI", "https://api.openai.com/v1");
  }
}

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor() {
    super("deepseek", "DeepSeek", "https://api.deepseek.com");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini — different request/response shape; translates to/from the OpenAI
// shape that the rest of the app uses.
// ─────────────────────────────────────────────────────────────────────────────

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

function messageContentToText(message: Message): string {
  if (typeof message.content === "string") return message.content;
  const parts = Array.isArray(message.content) ? message.content : [message.content];
  return parts
    .map((p) => {
      if (typeof p === "string") return p;
      if (p.type === "text") return p.text;
      // image_url / file_url not currently used by the app's filtering pipeline.
      // If/when they are, expand this with inline_data parts for Gemini.
      return JSON.stringify(p);
    })
    .join("\n");
}

function toGeminiContents(messages: Message[]): {
  systemInstruction?: { parts: { text: string }[] };
  contents: GeminiContent[];
} {
  const systemBits: string[] = [];
  const contents: GeminiContent[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemBits.push(messageContentToText(m));
      continue;
    }
    if (m.role === "tool" || m.role === "function") {
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: m.name ?? "tool",
              response: { content: messageContentToText(m) },
            },
          },
        ],
      });
      continue;
    }
    const role: "user" | "model" = m.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: messageContentToText(m) }] });
  }

  return {
    systemInstruction: systemBits.length
      ? { parts: [{ text: systemBits.join("\n\n") }] }
      : undefined,
    contents,
  };
}

function toGeminiTools(tools?: Tool[]) {
  if (!tools || tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    },
  ];
}

export class GeminiProvider implements LLMProvider {
  getName(): string {
    return `Google Gemini (${resolveProviderModel("gemini")})`;
  }

  async validate(): Promise<boolean> {
    return !!resolveProviderKey("gemini");
  }

  async invoke(params: InvokeParams): Promise<InvokeResult> {
    const key = resolveProviderKey("gemini");
    if (!key) {
      throw new Error(
        "Gemini API key not configured. Set GEMINI_API_KEY env var or save a key via the Settings page.",
      );
    }

    await applyRateLimit();

    const model = resolveProviderModel("gemini");
    const { systemInstruction, contents } = toGeminiContents(params.messages);
    const tools = toGeminiTools(params.tools);

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: params.maxTokens ?? params.max_tokens ?? DEFAULT_MAX_TOKENS,
    };
    const responseFormat = params.responseFormat ?? params.response_format;
    if (responseFormat?.type === "json_object") {
      generationConfig.responseMimeType = "application/json";
    } else if (responseFormat?.type === "json_schema") {
      generationConfig.responseMimeType = "application/json";
      if (responseFormat.json_schema?.schema) {
        generationConfig.responseSchema = responseFormat.json_schema.schema;
      }
    }

    const config: Record<string, unknown> = { ...generationConfig };
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (tools) config.tools = tools;

    const client = new GoogleGenAI({ apiKey: key });
    const response = await client.models.generateContent({
      model,
      contents: contents as any,
      config: config as any,
    });

    const json = response as unknown as {
      candidates?: Array<{
        content?: { role?: string; parts?: GeminiPart[] };
        finishReason?: string;
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
      modelVersion?: string;
      responseId?: string;
    };

    const cand = json.candidates?.[0];
    const parts = cand?.content?.parts ?? [];
    const textParts = parts
      .filter((p): p is { text: string } => "text" in p)
      .map((p) => p.text)
      .join("");
    const functionCalls = parts.filter(
      (p): p is { functionCall: { name: string; args: Record<string, unknown> } } => "functionCall" in p,
    );

    return {
      id: json.responseId ?? `gemini-${Date.now()}`,
      created: Math.floor(Date.now() / 1000),
      model: json.modelVersion ?? model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: textParts,
            tool_calls: functionCalls.length
              ? functionCalls.map((fc, i) => ({
                  id: `call_${i}`,
                  type: "function" as const,
                  function: {
                    name: fc.functionCall.name,
                    arguments: JSON.stringify(fc.functionCall.args ?? {}),
                  },
                }))
              : undefined,
          },
          finish_reason: cand?.finishReason ?? null,
        },
      ],
      usage: {
        prompt_tokens: json.usageMetadata?.promptTokenCount ?? 0,
        completion_tokens: json.usageMetadata?.candidatesTokenCount ?? 0,
        total_tokens: json.usageMetadata?.totalTokenCount ?? 0,
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Router — picks the active provider from settings/env.
// ─────────────────────────────────────────────────────────────────────────────

function instantiate(provider: ProviderId): LLMProvider {
  switch (provider) {
    case "gemini": return new GeminiProvider();
    case "openai": return new OpenAIProvider();
    case "deepseek": return new DeepSeekProvider();
  }
}

export async function getActiveLLMProvider(): Promise<LLMProvider> {
  const id = resolveActiveProvider();
  const provider = instantiate(id);
  if (!(await provider.validate())) {
    throw new Error(
      `Active LLM provider "${id}" has no API key configured. Open Settings and add a key, or set the appropriate env var.`,
    );
  }
  return provider;
}
