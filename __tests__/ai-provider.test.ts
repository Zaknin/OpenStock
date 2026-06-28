import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AIProviderError,
  AI_PROVIDER_TIMEOUT_MS,
  callAIProvider,
  callAIProviderDetailed,
  callAIProviderWithFallback,
  callAIProviderWithFallbackDetailed,
  getFallbackProviderName,
  getProviderConfig,
  type AIProviderResponseFormat,
} from "@/lib/ai-provider";

const originalEnv = { ...process.env };

function resetProviderEnvironment(): void {
  process.env = { ...originalEnv };
  delete process.env.AI_PROVIDER;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  delete process.env.MINIMAX_API_KEY;
  delete process.env.MINIMAX_BASE_URL;
  delete process.env.MINIMAX_MODEL;
  delete process.env.SIRAY_API_KEY;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Bad Request",
    headers: { "Content-Type": "application/json" },
  });
}

function geminiBody(text = "gemini text"): unknown {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

function chatBody(text = "chat text"): unknown {
  return { choices: [{ message: { content: text } }] };
}

function fetchMock(response: Response): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(response);
}

function requestBody(callIndex = 0): Record<string, unknown> {
  const fetch = vi.mocked(global.fetch);
  const init = fetch.mock.calls[callIndex]?.[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

const jsonResponseFormat: AIProviderResponseFormat = {
  mimeType: "application/json",
  schema: {
    type: "OBJECT",
    properties: {
      status: { type: "STRING", enum: ["available", "unavailable"] },
      evidenceIds: {
        type: "ARRAY",
        items: { type: "STRING" },
        minItems: 1,
        maxItems: 20,
      },
    },
    required: ["status", "evidenceIds"],
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetProviderEnvironment();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

describe("getProviderConfig", () => {
  it("defaults to gemini when no env var is set", () => {
    const config = getProviderConfig();

    expect(config.name).toBe("gemini");
    expect(config.baseUrl).toContain("generativelanguage.googleapis.com");
    expect(config.model).toBe("gemini-2.5-flash-lite");
  });

  it("returns minimax config and respects minimax environment overrides", () => {
    process.env.MINIMAX_API_KEY = "test-key";
    process.env.MINIMAX_MODEL = "MiniMax-M2.5-highspeed";
    process.env.MINIMAX_BASE_URL = "https://custom.minimax.example/v1";

    const config = getProviderConfig("minimax");

    expect(config).toEqual({
      name: "minimax",
      apiKey: "test-key",
      baseUrl: "https://custom.minimax.example/v1",
      model: "MiniMax-M2.5-highspeed",
    });
  });

  it("returns siray config when provider is siray", () => {
    process.env.SIRAY_API_KEY = "siray-key";

    const config = getProviderConfig("siray");

    expect(config).toEqual({
      name: "siray",
      apiKey: "siray-key",
      baseUrl: "https://api.siray.ai/v1",
      model: "siray-1.0-ultra",
    });
  });

  it("reads AI_PROVIDER from env when no argument is given", () => {
    process.env.AI_PROVIDER = "minimax";
    process.env.MINIMAX_API_KEY = "k";

    expect(getProviderConfig().name).toBe("minimax");
  });

  it("respects GEMINI_MODEL env var", () => {
    process.env.GEMINI_MODEL = "gemini-2.0-flash";

    expect(getProviderConfig("gemini").model).toBe("gemini-2.0-flash");
  });
});

describe("getFallbackProviderName", () => {
  it("returns minimax when primary is gemini and MINIMAX_API_KEY is set", () => {
    process.env.MINIMAX_API_KEY = "k";

    expect(getFallbackProviderName("gemini")).toBe("minimax");
  });

  it("returns siray when primary is gemini and only SIRAY_API_KEY is set", () => {
    process.env.SIRAY_API_KEY = "s";

    expect(getFallbackProviderName("gemini")).toBe("siray");
  });

  it("returns gemini when primary is OpenAI-compatible", () => {
    expect(getFallbackProviderName("minimax")).toBe("gemini");
    expect(getFallbackProviderName("siray")).toBe("gemini");
  });
});

describe("callAIProvider", () => {
  it("keeps plain-string Gemini behavior compatible", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", fetchMock(jsonResponse(geminiBody())));

    await expect(callAIProvider("plain prompt", "gemini")).resolves.toBe("gemini text");
    expect(requestBody()).toEqual({
      contents: [{ role: "user", parts: [{ text: "plain prompt" }] }],
    });
  });

  it("keeps plain-string OpenAI-compatible behavior compatible", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    vi.stubGlobal("fetch", fetchMock(jsonResponse(chatBody())));

    await expect(callAIProvider("plain prompt", "minimax")).resolves.toBe("chat text");
    expect(requestBody()).toMatchObject({
      model: "MiniMax-M2.7",
      messages: [{ role: "user", content: "plain prompt" }],
      temperature: 0.7,
    });
  });

  it("keeps plain-string Siray behavior compatible", async () => {
    process.env.SIRAY_API_KEY = "test-siray-key";
    vi.stubGlobal("fetch", fetchMock(jsonResponse(chatBody("siray text"))));

    await expect(callAIProvider("plain prompt", "siray")).resolves.toBe("siray text");
    const fetch = vi.mocked(global.fetch);
    expect(String(fetch.mock.calls[0][0])).toBe("https://api.siray.ai/v1/chat/completions");
    expect((fetch.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer test-siray-key",
    });
  });

  it("separates structured Gemini system and user content", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", fetchMock(jsonResponse(geminiBody())));

    await callAIProvider({
      systemInstruction: "system text",
      userInstruction: "user text",
    }, "gemini");

    expect(requestBody()).toEqual({
      systemInstruction: { parts: [{ text: "system text" }] },
      contents: [{ role: "user", parts: [{ text: "user text" }] }],
    });
  });

  it("keeps structured Gemini requests without schema backwards compatible", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", fetchMock(jsonResponse(geminiBody())));

    await callAIProvider({
      systemInstruction: "system text",
      userInstruction: "user text",
    }, "gemini");

    expect(requestBody()).not.toHaveProperty("generationConfig");
  });

  it("adds Gemini JSON output configuration only when a response schema is supplied", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", fetchMock(jsonResponse(geminiBody('{"status":"available"}'))));

    await expect(callAIProvider({
      systemInstruction: "system text",
      userInstruction: "user text",
      responseFormat: jsonResponseFormat,
    }, "gemini")).resolves.toBe('{"status":"available"}');

    expect(requestBody()).toEqual({
      systemInstruction: { parts: [{ text: "system text" }] },
      contents: [{ role: "user", parts: [{ text: "user text" }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: jsonResponseFormat.schema,
      },
    });
  });

  it("uses system and user roles for structured OpenAI-compatible requests", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    vi.stubGlobal("fetch", fetchMock(jsonResponse(chatBody())));

    await callAIProvider({
      systemInstruction: "system text",
      userInstruction: "user text",
    }, "minimax");

    expect(requestBody().messages).toEqual([
      { role: "system", content: "system text" },
      { role: "user", content: "user text" },
    ]);
    expect(requestBody()).not.toHaveProperty("generationConfig");
    expect(requestBody()).not.toHaveProperty("response_format");
  });

  it("does not change MiniMax or Siray request bodies when response format is supplied", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    process.env.SIRAY_API_KEY = "test-siray-key";
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(chatBody("minimax text")))
      .mockResolvedValueOnce(jsonResponse(chatBody("siray text"))));

    await callAIProvider({
      systemInstruction: "system",
      userInstruction: "user",
      responseFormat: jsonResponseFormat,
    }, "minimax");
    await callAIProvider({
      systemInstruction: "system",
      userInstruction: "user",
      responseFormat: jsonResponseFormat,
    }, "siray");

    expect(requestBody(0)).toEqual({
      model: "MiniMax-M2.7",
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "user" },
      ],
      temperature: 0.7,
    });
    expect(requestBody(1)).toEqual({
      model: "siray-1.0-ultra",
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "user" },
      ],
      temperature: 0.7,
    });
  });

  it("can return the provider identity without changing string-only callers", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", fetchMock(jsonResponse(geminiBody("gemini text"))));

    await expect(callAIProviderDetailed("plain prompt", "gemini")).resolves.toEqual({
      providerId: "gemini",
      text: "gemini text",
    });

    expect(requestBody()).toEqual({
      contents: [{ role: "user", parts: [{ text: "plain prompt" }] }],
    });
  });

  it("keeps provider configuration lazy", async () => {
    expect(() => getProviderConfig("gemini")).not.toThrow();

    await expect(callAIProvider("prompt", "gemini")).rejects.toMatchObject({
      code: "provider_not_configured",
      providerId: "gemini",
      message: "AI provider is not configured.",
    });
  });

  it("returns safe typed errors for missing provider configuration", async () => {
    await expect(callAIProvider("prompt", "gemini")).rejects.toMatchObject({
      code: "provider_not_configured",
      providerId: "gemini",
      message: "AI provider is not configured.",
    });
    await expect(callAIProvider("prompt", "minimax")).rejects.toMatchObject({
      code: "provider_not_configured",
      providerId: "minimax",
      message: "AI provider is not configured.",
    });
    await expect(callAIProvider("prompt", "siray")).rejects.toMatchObject({
      code: "provider_not_configured",
      providerId: "siray",
      message: "AI provider is not configured.",
    });
  });

  it("maps fetch aborts to provider_timeout", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const abortError = new DOMException("secret timeout body", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(callAIProvider("prompt", "gemini")).rejects.toMatchObject({
      code: "provider_timeout",
      providerId: "gemini",
      message: "AI provider request timed out.",
    });
  });

  it("maps HTTP failures safely without raw response body", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", fetchMock(new Response("raw-secret-body", { status: 500 })));

    await expect(callAIProvider("prompt", "gemini")).rejects.toSatisfy((error: unknown) => (
      error instanceof AIProviderError
      && error.code === "provider_http_error"
      && error.providerId === "gemini"
      && error.message === "AI provider request failed."
      && !error.message.includes("raw-secret-body")
    ));
  });

  it("maps malformed provider response shapes safely", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", fetchMock(jsonResponse({ candidates: [] })));

    await expect(callAIProvider("prompt", "gemini")).rejects.toMatchObject({
      code: "provider_invalid_response",
      providerId: "gemini",
      message: "AI provider returned an invalid response.",
    });
  });

  it("rejects empty provider text as invalid response", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    vi.stubGlobal("fetch", fetchMock(jsonResponse(chatBody("   "))));

    await expect(callAIProvider("prompt", "minimax")).rejects.toMatchObject({
      code: "provider_invalid_response",
      providerId: "minimax",
      message: "AI provider returned an invalid response.",
    });
  });

  it("keeps secret-shaped values out of thrown errors", async () => {
    process.env.SIRAY_API_KEY = "secret-siray-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("https://secret.example/?token=secret-siray-key")),
    );

    await expect(callAIProvider("prompt", "siray")).rejects.toSatisfy((error: unknown) => (
      error instanceof AIProviderError
      && !error.message.includes("secret-siray-key")
      && !error.message.includes("https://secret.example")
      && !JSON.stringify(error).includes("secret-siray-key")
    ));
  });

  it("sends authorization headers without exposing them in errors", async () => {
    process.env.MINIMAX_API_KEY = "secret-minimax-key";
    vi.stubGlobal("fetch", fetchMock(new Response("raw-body", { status: 401 })));

    await expect(callAIProvider("prompt", "minimax")).rejects.toSatisfy((error: unknown) => (
      error instanceof AIProviderError
      && error.message === "AI provider request failed."
      && !JSON.stringify(error).includes("secret-minimax-key")
    ));
    const init = vi.mocked(global.fetch).mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: "Bearer secret-minimax-key" });
  });

  it("passes an abort signal and clears timeout resources", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
    vi.stubGlobal("fetch", fetchMock(jsonResponse(geminiBody())));

    await callAIProvider("prompt", "gemini");

    const init = vi.mocked(global.fetch).mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("uses the fixed provider timeout constant", () => {
    expect(AI_PROVIDER_TIMEOUT_MS).toBe(30_000);
  });
});

describe("callAIProviderWithFallback", () => {
  it("returns primary provider result on success", async () => {
    process.env.AI_PROVIDER = "minimax";
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    vi.stubGlobal("fetch", fetchMock(jsonResponse(chatBody("MiniMax response"))));

    await expect(callAIProviderWithFallback("test")).resolves.toBe("MiniMax response");
  });

  it("preserves fallback order and falls back from Gemini to MiniMax when configured", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(chatBody("fallback text"))));

    await expect(callAIProviderWithFallback("prompt")).resolves.toBe("fallback text");
    const fetch = vi.mocked(global.fetch);
    expect(String(fetch.mock.calls[0][0])).toContain("generativelanguage");
    expect(String(fetch.mock.calls[1][0])).toContain("/chat/completions");
  });

  it("uses Gemini fallback for non-Gemini primary providers", async () => {
    process.env.AI_PROVIDER = "minimax";
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(geminiBody("gemini fallback"))));

    await expect(callAIProviderWithFallback("prompt")).resolves.toBe("gemini fallback");
    const fetch = vi.mocked(global.fetch);
    expect(String(fetch.mock.calls[0][0])).toContain("/chat/completions");
    expect(String(fetch.mock.calls[1][0])).toContain("generativelanguage");
  });

  it("returns a safe all-provider failure when fallback also fails", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("", { status: 500 })));

    await expect(callAIProviderWithFallback("prompt")).rejects.toMatchObject({
      code: "all_providers_failed",
      providerId: null,
      message: "All AI providers failed.",
    });
  });

  it("does not log raw error objects, prompts, or model output during fallback", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(chatBody("model output"))));

    await callAIProviderWithFallback("prompt");

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("supports existing Inngest-style string callers without source changes", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", fetchMock(jsonResponse(geminiBody("plain result"))));

    const result = await callAIProviderWithFallback("existing string prompt");

    expect(result).toBe("plain result");
    expect(requestBody()).toEqual({
      contents: [{ role: "user", parts: [{ text: "existing string prompt" }] }],
    });
  });

  it("returns provider identity from fallback without logging sensitive data", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(chatBody("fallback text"))));

    await expect(callAIProviderWithFallbackDetailed("prompt")).resolves.toEqual({
      providerId: "minimax",
      text: "fallback text",
    });
  });
});
