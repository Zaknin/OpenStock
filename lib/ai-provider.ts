export type AIProviderName = 'gemini' | 'minimax' | 'siray';

export interface AIProviderConfig {
  readonly name: AIProviderName;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
}

export interface AIProviderStructuredRequest {
  readonly systemInstruction: string;
  readonly userInstruction: string;
}

export type AIProviderRequest =
  | string
  | AIProviderStructuredRequest;

export type AIProviderErrorCode =
  | 'provider_not_configured'
  | 'provider_timeout'
  | 'provider_http_error'
  | 'provider_invalid_response'
  | 'all_providers_failed';

export class AIProviderError extends Error {
  readonly code: AIProviderErrorCode;
  readonly providerId: string | null;

  constructor(code: AIProviderErrorCode, providerId: string | null) {
    super(providerErrorMessage(code));
    this.name = 'AIProviderError';
    this.code = code;
    this.providerId = providerId;
  }
}

export const AI_PROVIDER_TIMEOUT_MS = 30_000;

function providerErrorMessage(code: AIProviderErrorCode): string {
  switch (code) {
    case 'provider_not_configured':
      return 'AI provider is not configured.';
    case 'provider_timeout':
      return 'AI provider request timed out.';
    case 'provider_http_error':
      return 'AI provider request failed.';
    case 'provider_invalid_response':
      return 'AI provider returned an invalid response.';
    case 'all_providers_failed':
      return 'All AI providers failed.';
  }
}

export function getProviderConfig(
  provider?: AIProviderName,
): AIProviderConfig {
  const name =
    provider
    || (process.env.AI_PROVIDER as AIProviderName)
    || 'gemini';

  switch (name) {
    case 'minimax':
      return {
        name: 'minimax',
        apiKey: process.env.MINIMAX_API_KEY || '',
        baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1',
        model: process.env.MINIMAX_MODEL || 'MiniMax-M2.7',
      };
    case 'siray':
      return {
        name: 'siray',
        apiKey: process.env.SIRAY_API_KEY || '',
        baseUrl: 'https://api.siray.ai/v1',
        model: 'siray-1.0-ultra',
      };
    case 'gemini':
    default:
      return {
        name: 'gemini',
        apiKey: process.env.GEMINI_API_KEY || '',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
      };
  }
}

export function getFallbackProviderName(
  primary: AIProviderName,
): AIProviderName {
  if (primary === 'gemini') {
    if (process.env.MINIMAX_API_KEY) {
      return 'minimax';
    }
    if (process.env.SIRAY_API_KEY) {
      return 'siray';
    }
    return 'minimax';
  }

  return 'gemini';
}

function isStructuredRequest(request: AIProviderRequest): request is AIProviderStructuredRequest {
  return typeof request !== 'string';
}

function ensureConfigured(config: AIProviderConfig): void {
  if (!config.apiKey) {
    throw new AIProviderError('provider_not_configured', config.name);
  }
}

function asProviderError(error: unknown, providerId: AIProviderName): AIProviderError {
  if (error instanceof AIProviderError) {
    return error;
  }

  if (
    typeof error === 'object'
    && error !== null
    && 'name' in error
    && (error as { readonly name?: unknown }).name === 'AbortError'
  ) {
    return new AIProviderError('provider_timeout', providerId);
  }

  return new AIProviderError('provider_http_error', providerId);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  providerId: AIProviderName,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_PROVIDER_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    throw asProviderError(error, providerId);
  } finally {
    clearTimeout(timeoutId);
  }
}

function geminiBody(request: AIProviderRequest): object {
  if (!isStructuredRequest(request)) {
    return {
      contents: [{ role: 'user', parts: [{ text: request }] }],
    };
  }

  return {
    systemInstruction: {
      parts: [{ text: request.systemInstruction }],
    },
    contents: [{ role: 'user', parts: [{ text: request.userInstruction }] }],
  };
}

function openAiMessages(request: AIProviderRequest): readonly object[] {
  if (!isStructuredRequest(request)) {
    return [{ role: 'user', content: request }];
  }

  return [
    { role: 'system', content: request.systemInstruction },
    { role: 'user', content: request.userInstruction },
  ];
}

function nonEmptyText(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : '';
}

async function callGemini(
  request: AIProviderRequest,
  config: AIProviderConfig,
): Promise<string> {
  ensureConfigured(config);

  const url = `${config.baseUrl}/${config.model}:generateContent?key=${config.apiKey}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiBody(request)),
  }, config.name);

  if (!res.ok) {
    throw new AIProviderError('provider_http_error', config.name);
  }

  const data: unknown = await res.json();
  const text = nonEmptyText(
    typeof data === 'object'
      && data !== null
      && 'candidates' in data
      && Array.isArray(data.candidates)
      ? data.candidates[0]?.content?.parts?.[0]?.text
      : null,
  );

  if (!text) {
    throw new AIProviderError('provider_invalid_response', config.name);
  }

  return text;
}

async function callOpenAICompatible(
  request: AIProviderRequest,
  config: AIProviderConfig,
): Promise<string> {
  ensureConfigured(config);

  const res = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: openAiMessages(request),
      temperature: 0.7,
    }),
  }, config.name);

  if (!res.ok) {
    throw new AIProviderError('provider_http_error', config.name);
  }

  const data: unknown = await res.json();
  const text = nonEmptyText(
    typeof data === 'object'
      && data !== null
      && 'choices' in data
      && Array.isArray(data.choices)
      ? data.choices[0]?.message?.content
      : null,
  );

  if (!text) {
    throw new AIProviderError('provider_invalid_response', config.name);
  }

  return text;
}

export async function callAIProvider(
  request: AIProviderRequest,
  provider?: AIProviderName,
): Promise<string> {
  const config = getProviderConfig(provider);

  if (config.name === 'gemini') {
    return callGemini(request, config);
  }

  return callOpenAICompatible(request, config);
}

export async function callAIProviderWithFallback(
  request: AIProviderRequest,
): Promise<string> {
  const primaryName =
    (process.env.AI_PROVIDER as AIProviderName) || 'gemini';
  const fallbackName = getFallbackProviderName(primaryName);

  try {
    return await callAIProvider(request, primaryName);
  } catch {
    try {
      return await callAIProvider(request, fallbackName);
    } catch {
      throw new AIProviderError('all_providers_failed', null);
    }
  }
}
