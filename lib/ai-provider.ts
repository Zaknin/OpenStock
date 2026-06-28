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
  readonly responseFormat?: AIProviderResponseFormat;
  readonly timeoutMs?: number;
}

export type AIProviderRequest =
  | string
  | AIProviderStructuredRequest;

export type AIProviderJsonSchemaType =
  | 'OBJECT'
  | 'ARRAY'
  | 'STRING'
  | 'BOOLEAN'
  | 'NUMBER'
  | 'INTEGER'
  | 'object'
  | 'array'
  | 'string'
  | 'boolean'
  | 'number'
  | 'integer'
  | 'null';

export interface AIProviderJsonSchema {
  readonly $id?: string;
  readonly $defs?: Readonly<Record<string, AIProviderJsonSchema>>;
  readonly $ref?: string;
  readonly $anchor?: string;
  readonly type?: AIProviderJsonSchemaType | readonly AIProviderJsonSchemaType[];
  readonly format?: string;
  readonly title?: string;
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly items?: AIProviderJsonSchema;
  readonly prefixItems?: readonly AIProviderJsonSchema[];
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly anyOf?: readonly AIProviderJsonSchema[];
  readonly oneOf?: readonly AIProviderJsonSchema[];
  readonly properties?: Readonly<Record<string, AIProviderJsonSchema>>;
  readonly additionalProperties?: boolean | AIProviderJsonSchema;
  readonly required?: readonly string[];
  readonly propertyOrdering?: readonly string[];
}

export interface AIProviderResponseFormat {
  readonly mimeType: 'application/json';
  readonly schema: AIProviderJsonSchema;
}

export interface AIProviderCallResult {
  readonly providerId: AIProviderName;
  readonly text: string;
}

export type AIProviderErrorCode =
  | 'provider_not_configured'
  | 'provider_timeout'
  | 'provider_http_error'
  | 'provider_invalid_response'
  | 'all_providers_failed';

export type AIProviderFailureCategory =
  | 'bad_request'
  | 'structured_output_rejected'
  | 'authentication_failed'
  | 'permission_denied'
  | 'model_not_found'
  | 'rate_limited'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'structured_schema_invalid'
  | 'dns_failure'
  | 'tls_failure'
  | 'connection_refused'
  | 'connection_reset'
  | 'socket_timeout'
  | 'network_unreachable'
  | 'network_error'
  | 'invalid_provider_response'
  | 'unknown_provider_error';

export interface AIProviderErrorOptions {
  readonly category?: AIProviderFailureCategory;
  readonly httpStatus?: number | null;
}

export class AIProviderError extends Error {
  readonly code: AIProviderErrorCode;
  readonly providerId: string | null;
  readonly category: AIProviderFailureCategory;
  readonly httpStatus: number | null;

  constructor(
    code: AIProviderErrorCode,
    providerId: string | null,
    options: AIProviderErrorOptions = {},
  ) {
    super(providerErrorMessage(code));
    this.name = 'AIProviderError';
    this.code = code;
    this.providerId = providerId;
    this.category = options.category ?? defaultFailureCategory(code);
    this.httpStatus = options.httpStatus ?? null;
  }
}

export const AI_PROVIDER_TIMEOUT_MS = 30_000;
export const AI_PROVIDER_MAX_TIMEOUT_MS = 60_000;

const AI_PROVIDER_TIMEOUT_ABORT_REASON = 'openstock_ai_provider_timeout';

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

function defaultFailureCategory(code: AIProviderErrorCode): AIProviderFailureCategory {
  if (code === 'provider_timeout') {
    return 'provider_timeout';
  }

  if (code === 'provider_invalid_response') {
    return 'invalid_provider_response';
  }

  return 'unknown_provider_error';
}

function httpFailureCategory(
  status: number,
  structuredOutputSupplied: boolean,
): AIProviderFailureCategory {
  if (status === 400) {
    return structuredOutputSupplied ? 'structured_output_rejected' : 'bad_request';
  }
  if (status === 401) {
    return 'authentication_failed';
  }
  if (status === 403) {
    return 'permission_denied';
  }
  if (status === 404) {
    return 'model_not_found';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  if (status >= 500 && status <= 599) {
    return 'provider_unavailable';
  }

  return 'unknown_provider_error';
}

function providerHttpError(
  providerId: AIProviderName,
  status: number,
  structuredOutputSupplied: boolean,
): AIProviderError {
  return new AIProviderError('provider_http_error', providerId, {
    category: httpFailureCategory(status, structuredOutputSupplied),
    httpStatus: status,
  });
}

const geminiJsonSchemaKeywords = new Set([
  '$id',
  '$defs',
  '$ref',
  '$anchor',
  'type',
  'format',
  'title',
  'description',
  'enum',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'anyOf',
  'oneOf',
  'properties',
  'additionalProperties',
  'required',
  'propertyOrdering',
]);

const jsonSchemaTypeMap: Readonly<Record<string, AIProviderJsonSchemaType>> = {
  OBJECT: 'object',
  ARRAY: 'array',
  STRING: 'string',
  BOOLEAN: 'boolean',
  NUMBER: 'number',
  INTEGER: 'integer',
  object: 'object',
  array: 'array',
  string: 'string',
  boolean: 'boolean',
  number: 'number',
  integer: 'integer',
  null: 'null',
};

function providerSchemaError(providerId: AIProviderName): AIProviderError {
  return new AIProviderError('provider_http_error', providerId, {
    category: 'structured_schema_invalid',
  });
}

function normalizeJsonSchemaType(
  value: AIProviderJsonSchema['type'],
  providerId: AIProviderName,
): AIProviderJsonSchema['type'] {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = jsonSchemaTypeMap[item];
      if (normalized === undefined) {
        throw providerSchemaError(providerId);
      }
      return normalized;
    });
  }

  if (typeof value !== 'string') {
    throw providerSchemaError(providerId);
  }

  const normalized = jsonSchemaTypeMap[value];
  if (normalized === undefined) {
    throw providerSchemaError(providerId);
  }
  return normalized;
}

function geminiJsonSchema(
  schema: AIProviderJsonSchema,
  providerId: AIProviderName,
): AIProviderJsonSchema {
  const normalized: Record<string, unknown> = {};

  Object.entries(schema).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    if (!geminiJsonSchemaKeywords.has(key)) {
      throw providerSchemaError(providerId);
    }

    switch (key) {
      case 'type':
        normalized.type = normalizeJsonSchemaType(value as AIProviderJsonSchema['type'], providerId);
        break;
      case '$defs':
      case 'properties':
        normalized[key] = Object.fromEntries(
          Object.entries(value as Readonly<Record<string, AIProviderJsonSchema>>)
            .map(([propertyKey, propertySchema]) => [
              propertyKey,
              geminiJsonSchema(propertySchema, providerId),
            ]),
        );
        break;
      case 'items':
        normalized.items = geminiJsonSchema(value as AIProviderJsonSchema, providerId);
        break;
      case 'prefixItems':
      case 'anyOf':
      case 'oneOf':
        normalized[key] = (value as readonly AIProviderJsonSchema[])
          .map((item) => geminiJsonSchema(item, providerId));
        break;
      case 'additionalProperties':
        normalized.additionalProperties = typeof value === 'boolean'
          ? value
          : geminiJsonSchema(value as AIProviderJsonSchema, providerId);
        break;
      default:
        normalized[key] = value;
    }
  });

  return normalized as AIProviderJsonSchema;
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

function providerRequestTimeoutMs(request: AIProviderRequest): number {
  if (!isStructuredRequest(request) || request.timeoutMs === undefined) {
    return AI_PROVIDER_TIMEOUT_MS;
  }

  if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0) {
    return AI_PROVIDER_TIMEOUT_MS;
  }

  return Math.min(Math.trunc(request.timeoutMs), AI_PROVIDER_MAX_TIMEOUT_MS);
}

function ensureConfigured(config: AIProviderConfig): void {
  if (!config.apiKey) {
    throw new AIProviderError('provider_not_configured', config.name);
  }
}

interface ProviderTransportContext {
  readonly signal: AbortSignal;
  readonly timedOut: boolean;
  readonly timeoutMs: number;
  readonly elapsedMs: number;
}

function objectValue(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !(key in value)) {
    return undefined;
  }

  return (value as Record<string, unknown>)[key];
}

function stringObjectValue(value: unknown, key: string): string | null {
  const found = objectValue(value, key);
  return typeof found === 'string' ? found : null;
}

function errorCauseCode(error: unknown): string | null {
  let current: unknown = error;

  for (let depth = 0; depth < 4; depth += 1) {
    const directCode = stringObjectValue(current, 'code');
    if (directCode !== null) {
      return directCode;
    }

    current = objectValue(current, 'cause');
    if (current === undefined || current === null) {
      return null;
    }
  }

  return null;
}

function isApplicationTimeout(
  error: unknown,
  context?: ProviderTransportContext,
): boolean {
  const errorName = stringObjectValue(error, 'name');
  if (errorName === 'AbortError' || errorName === 'TimeoutError') {
    return true;
  }

  if (context === undefined) {
    return false;
  }

  if (context.timedOut) {
    return true;
  }

  if (
    context.signal.aborted
    && context.signal.reason === AI_PROVIDER_TIMEOUT_ABORT_REASON
  ) {
    return true;
  }

  return context.signal.aborted && context.elapsedMs >= context.timeoutMs - 250;
}

function transportFailureCategory(
  error: unknown,
  context?: ProviderTransportContext,
): AIProviderFailureCategory {
  if (isApplicationTimeout(error, context)) {
    return 'provider_timeout';
  }

  const code = errorCauseCode(error);
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'dns_failure';
  }
  if (
    code === 'ERR_TLS_CERT_ALTNAME_INVALID'
    || code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
    || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    || code?.startsWith('ERR_TLS_') === true
    || code?.startsWith('ERR_SSL_') === true
  ) {
    return 'tls_failure';
  }
  if (code === 'ECONNREFUSED') {
    return 'connection_refused';
  }
  if (code === 'ECONNRESET') {
    return 'connection_reset';
  }
  if (
    code === 'ETIMEDOUT'
    || code === 'UND_ERR_CONNECT_TIMEOUT'
    || code === 'UND_ERR_HEADERS_TIMEOUT'
    || code === 'UND_ERR_BODY_TIMEOUT'
  ) {
    return 'socket_timeout';
  }
  if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH') {
    return 'network_unreachable';
  }

  return 'network_error';
}

function asProviderError(
  error: unknown,
  providerId: AIProviderName,
  context?: ProviderTransportContext,
): AIProviderError {
  if (error instanceof AIProviderError) {
    return error;
  }

  const category = transportFailureCategory(error, context);
  if (category === 'provider_timeout') {
    return new AIProviderError('provider_timeout', providerId, {
      category,
    });
  }

  return new AIProviderError('provider_http_error', providerId, {
    category,
  });
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  providerId: AIProviderName,
  timeoutMs: number = AI_PROVIDER_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const startedAt = Date.now();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(AI_PROVIDER_TIMEOUT_ABORT_REASON);
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    throw asProviderError(error, providerId, {
      signal: controller.signal,
      timedOut,
      timeoutMs,
      elapsedMs: Date.now() - startedAt,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function geminiBody(request: AIProviderRequest, providerId: AIProviderName): object {
  if (!isStructuredRequest(request)) {
    return {
      contents: [{ role: 'user', parts: [{ text: request }] }],
    };
  }

  const body: {
    systemInstruction: { readonly parts: readonly [{ readonly text: string }] };
    contents: readonly [{ readonly role: 'user'; readonly parts: readonly [{ readonly text: string }] }];
    generationConfig?: {
      readonly responseMimeType: string;
      readonly responseJsonSchema: AIProviderJsonSchema;
    };
  } = {
    systemInstruction: {
      parts: [{ text: request.systemInstruction }],
    },
    contents: [{ role: 'user', parts: [{ text: request.userInstruction }] }],
  };

  if (request.responseFormat !== undefined) {
    body.generationConfig = {
      responseMimeType: request.responseFormat.mimeType,
      responseJsonSchema: geminiJsonSchema(request.responseFormat.schema, providerId),
    };
  }

  return body;
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
    body: JSON.stringify(geminiBody(request, config.name)),
  }, config.name, providerRequestTimeoutMs(request));

  if (!res.ok) {
    throw providerHttpError(
      config.name,
      res.status,
      isStructuredRequest(request) && request.responseFormat !== undefined,
    );
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
    throw new AIProviderError('provider_invalid_response', config.name, {
      category: 'invalid_provider_response',
    });
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
  }, config.name, providerRequestTimeoutMs(request));

  if (!res.ok) {
    throw providerHttpError(config.name, res.status, false);
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
    throw new AIProviderError('provider_invalid_response', config.name, {
      category: 'invalid_provider_response',
    });
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

export async function callAIProviderDetailed(
  request: AIProviderRequest,
  provider?: AIProviderName,
): Promise<AIProviderCallResult> {
  const config = getProviderConfig(provider);
  const text = config.name === 'gemini'
    ? await callGemini(request, config)
    : await callOpenAICompatible(request, config);

  return {
    providerId: config.name,
    text,
  };
}

export async function callAIProviderWithFallback(
  request: AIProviderRequest,
): Promise<string> {
  return (await callAIProviderWithFallbackDetailed(request)).text;
}

export async function callAIProviderWithFallbackDetailed(
  request: AIProviderRequest,
): Promise<AIProviderCallResult> {
  const primaryName =
    (process.env.AI_PROVIDER as AIProviderName) || 'gemini';
  const fallbackName = getFallbackProviderName(primaryName);

  try {
    return await callAIProviderDetailed(request, primaryName);
  } catch {
    try {
      return await callAIProviderDetailed(request, fallbackName);
    } catch {
      throw new AIProviderError('all_providers_failed', null);
    }
  }
}
