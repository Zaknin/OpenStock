import {
    request as httpRequest,
    type RequestOptions,
} from 'node:http';
import { request as httpsRequest } from 'node:https';
import {
    AIProviderError,
    type AIProviderFailureCategory,
    type AIProviderJsonSchema,
    type AIProviderStructuredRequest,
} from '@/lib/ai-provider';

export type SoxlAiProviderRole = 'primary' | 'fallback';

export type SoxlAiPrimaryFallbackReason =
    | 'primary_not_configured'
    | 'primary_circuit_open'
    | 'primary_health_timeout'
    | 'primary_health_unreachable'
    | 'primary_health_http_error'
    | 'primary_model_not_ready'
    | 'primary_request_timeout'
    | 'primary_request_error'
    | 'primary_invalid_response'
    | 'primary_validation_rejected';

export interface SoxlAiLocalProviderRequest extends AIProviderStructuredRequest {
    readonly allowedEvidenceRefs?: readonly string[];
}

export interface SoxlAiRoutedProviderResult {
    readonly providerId: string;
    readonly text: string;
}

export interface SoxlAiProviderCandidate {
    readonly providerId: string;
    readonly role: SoxlAiProviderRole;
    readonly model: string;
    readonly strictStructuredOutput: true;
    readonly call: (
        request: SoxlAiLocalProviderRequest,
    ) => Promise<SoxlAiRoutedProviderResult>;
}

export interface SoxlAiProviderRoutePlan {
    readonly attempts: readonly SoxlAiProviderCandidate[];
    readonly initialFallbackReason: SoxlAiPrimaryFallbackReason | null;
}

export type SoxlAiProviderRouteResolver = () => Promise<SoxlAiProviderRoutePlan>;

interface SoxlAiLocalProviderConfig {
    readonly providerId: string;
    readonly role: SoxlAiProviderRole;
    readonly baseUrl: string;
    readonly model: string;
    readonly apiKey: string;
    readonly healthPath: string;
    readonly healthTimeoutMs: number;
    readonly requestTimeoutMs: number;
    readonly maxTokens: number;
    readonly cachePrompt: boolean;
}

interface SoxlAiLocalRouterConfig {
    readonly enabled: boolean;
    readonly primary: SoxlAiLocalProviderConfig | null;
    readonly fallback: SoxlAiLocalProviderConfig;
    readonly primaryCircuitOpenMs: number;
}

export interface SoxlAiHttpRequestInput {
    readonly url: string;
    readonly method: 'GET' | 'POST';
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: string;
    readonly timeoutMs: number;
}

export interface SoxlAiHttpResponse {
    readonly status: number;
    readonly body: string;
}

export type SoxlAiHttpRequest = (
    input: SoxlAiHttpRequestInput,
) => Promise<SoxlAiHttpResponse>;

export interface SoxlAiLocalProviderRouterDependencies {
    readonly request?: SoxlAiHttpRequest;
    readonly now?: () => number;
}

interface PrimaryCircuitState {
    openUntilMs: number;
    reason: SoxlAiPrimaryFallbackReason | null;
}

const defaultPrimaryHealthTimeoutMs = 3_000;
const defaultPrimaryRequestTimeoutMs = 600_000;
const defaultFallbackRequestTimeoutMs = 1_200_000;
const defaultPrimaryCircuitOpenMs = 60_000;
const defaultMaxTokens = 2_048;

const primaryCircuit: PrimaryCircuitState = {
    openUntilMs: 0,
    reason: null,
};

function envBoolean(name: string, fallback: boolean): boolean {
    const value = process.env[name]?.trim().toLowerCase();
    if (value === undefined || value.length === 0) {
        return fallback;
    }

    if (['1', 'true', 'yes', 'on'].includes(value)) {
        return true;
    }
    if (['0', 'false', 'no', 'off'].includes(value)) {
        return false;
    }

    return fallback;
}

function envPositiveInteger(
    name: string,
    fallback: number,
): number {
    const parsed = Number.parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0
        ? parsed
        : fallback;
}

function normalizedBaseUrl(value: string): string {
    return value.trim().replace(/\/+$/u, '');
}

function normalizedHealthPath(value: string | undefined): string {
    const path = value?.trim() || '/models';
    return path.startsWith('/') ? path : `/${path}`;
}

function providerConfig(
    role: SoxlAiProviderRole,
): SoxlAiLocalProviderConfig | null {
    const prefix = role === 'primary'
        ? 'SOXL_AI_PRIMARY'
        : 'SOXL_AI_FALLBACK';
    const defaultBaseUrl = role === 'fallback'
        ? 'http://192.168.23.130:8083/v1'
        : '';
    const defaultModel = role === 'fallback'
        ? 'fin-r1-q4km'
        : '';
    const baseUrl = normalizedBaseUrl(
        process.env[`${prefix}_BASE_URL`] ?? defaultBaseUrl,
    );
    const model = (process.env[`${prefix}_MODEL`] ?? defaultModel).trim();

    if (baseUrl.length === 0 || model.length === 0) {
        return null;
    }

    return {
        providerId: (
            process.env[`${prefix}_PROVIDER_ID`]
            ?? (role === 'primary' ? 'ornith-35b-primary' : 'fin-r1-fallback')
        ).trim(),
        role,
        baseUrl,
        model,
        apiKey: process.env[`${prefix}_API_KEY`] ?? '',
        healthPath: normalizedHealthPath(
            process.env[`${prefix}_HEALTH_PATH`],
        ),
        healthTimeoutMs: envPositiveInteger(
            `${prefix}_HEALTH_TIMEOUT_MS`,
            role === 'primary'
                ? defaultPrimaryHealthTimeoutMs
                : 10_000,
        ),
        requestTimeoutMs: envPositiveInteger(
            `${prefix}_REQUEST_TIMEOUT_MS`,
            role === 'primary'
                ? defaultPrimaryRequestTimeoutMs
                : defaultFallbackRequestTimeoutMs,
        ),
        maxTokens: envPositiveInteger('SOXL_AI_MAX_TOKENS', defaultMaxTokens),
        cachePrompt: envBoolean('SOXL_AI_CACHE_PROMPT', false),
    };
}

function localRouterConfig(): SoxlAiLocalRouterConfig {
    const fallback = providerConfig('fallback');
    if (fallback === null) {
        throw new AIProviderError(
            'provider_not_configured',
            'fin-r1-fallback',
        );
    }

    return {
        enabled: envBoolean('SOXL_AI_LOCAL_ROUTING_ENABLED', false),
        primary: providerConfig('primary'),
        fallback,
        primaryCircuitOpenMs: envPositiveInteger(
            'SOXL_AI_PRIMARY_CIRCUIT_OPEN_MS',
            defaultPrimaryCircuitOpenMs,
        ),
    };
}

export function isSoxlAiLocalRoutingEnabled(): boolean {
    return envBoolean('SOXL_AI_LOCAL_ROUTING_ENABLED', false);
}

function requestErrorCode(error: unknown): string | null {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
        return null;
    }

    return typeof error.code === 'string' ? error.code : null;
}

function requestFailureCategory(error: unknown): AIProviderFailureCategory {
    const code = requestErrorCode(error);
    if (code === 'SOXL_LOCAL_REQUEST_TIMEOUT') {
        return 'provider_timeout';
    }
    if (code === 'ECONNREFUSED') {
        return 'connection_refused';
    }
    if (code === 'ECONNRESET') {
        return 'connection_reset';
    }
    if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH') {
        return 'network_unreachable';
    }
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        return 'dns_failure';
    }
    if (code === 'ETIMEDOUT') {
        return 'socket_timeout';
    }

    return 'network_error';
}

function timeoutError(timeoutMs: number): Error & { code: string } {
    const error = new Error(`request_timeout_after_${String(timeoutMs)}ms`) as Error & {
        code: string;
    };
    error.code = 'SOXL_LOCAL_REQUEST_TIMEOUT';
    return error;
}

const nativeHttpRequest: SoxlAiHttpRequest = (input) => {
    const target = new URL(input.url);
    const requestImplementation = target.protocol === 'https:'
        ? httpsRequest
        : httpRequest;
    const options: RequestOptions = {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: input.method,
        headers: input.headers,
    };

    return new Promise((resolvePromise, rejectPromise) => {
        let settled = false;
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
        const finish = (callback: () => void): void => {
            if (settled) {
                return;
            }
            settled = true;
            if (timeoutHandle !== null) {
                clearTimeout(timeoutHandle);
            }
            callback();
        };

        const request = requestImplementation(options, (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer | string) => {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            response.on('end', () => {
                finish(() => resolvePromise({
                    status: response.statusCode ?? 0,
                    body: Buffer.concat(chunks).toString('utf8'),
                }));
            });
            response.on('error', (error) => {
                finish(() => rejectPromise(error));
            });
        });

        timeoutHandle = setTimeout(() => {
            request.destroy(timeoutError(input.timeoutMs));
        }, input.timeoutMs);

        request.on('error', (error) => {
            finish(() => rejectPromise(error));
        });

        if (input.body !== undefined) {
            request.write(input.body);
        }
        request.end();
    });
};

function joinEndpoint(baseUrl: string, path: string): string {
    return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function objectValue(value: unknown, key: string): unknown {
    if (typeof value !== 'object' || value === null || !(key in value)) {
        return undefined;
    }

    return (value as Record<string, unknown>)[key];
}

function healthModelIds(body: string): readonly string[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(body) as unknown;
    } catch {
        return [];
    }

    const data = objectValue(parsed, 'data');
    if (!Array.isArray(data)) {
        return [];
    }

    return data.flatMap((entry) => {
        const id = objectValue(entry, 'id');
        return typeof id === 'string' && id.trim().length > 0
            ? [id]
            : [];
    });
}

function primaryHealthFailureReason(error: unknown): SoxlAiPrimaryFallbackReason {
    const category = requestFailureCategory(error);
    if (category === 'provider_timeout' || category === 'socket_timeout') {
        return 'primary_health_timeout';
    }

    return 'primary_health_unreachable';
}

async function probePrimary(
    config: SoxlAiLocalProviderConfig,
    request: SoxlAiHttpRequest,
): Promise<{
    readonly ready: boolean;
    readonly reason: SoxlAiPrimaryFallbackReason | null;
}> {
    let response: SoxlAiHttpResponse;
    try {
        response = await request({
            url: joinEndpoint(config.baseUrl, config.healthPath),
            method: 'GET',
            timeoutMs: config.healthTimeoutMs,
        });
    } catch (error) {
        return {
            ready: false,
            reason: primaryHealthFailureReason(error),
        };
    }

    if (response.status < 200 || response.status >= 300) {
        return {
            ready: false,
            reason: 'primary_health_http_error',
        };
    }

    const modelIds = healthModelIds(response.body);
    if (!modelIds.includes(config.model)) {
        return {
            ready: false,
            reason: 'primary_model_not_ready',
        };
    }

    return {
        ready: true,
        reason: null,
    };
}

function schemaType(value: unknown): unknown {
    if (typeof value === 'string') {
        return value.toLowerCase();
    }
    if (Array.isArray(value)) {
        return value.map((item) => (
            typeof item === 'string' ? item.toLowerCase() : item
        ));
    }
    return value;
}

function normalizedOpenAiSchema(schema: AIProviderJsonSchema): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};

    Object.entries(schema).forEach(([key, value]) => {
        if (value === undefined) {
            return;
        }

        if (key === 'type') {
            normalized.type = schemaType(value);
            return;
        }

        if (key === 'properties' || key === '$defs') {
            normalized[key] = Object.fromEntries(
                Object.entries(value as Readonly<Record<string, AIProviderJsonSchema>>)
                    .map(([propertyName, propertySchema]) => [
                        propertyName,
                        normalizedOpenAiSchema(propertySchema),
                    ]),
            );
            return;
        }

        if (key === 'items' || key === 'additionalProperties') {
            normalized[key] = typeof value === 'boolean'
                ? value
                : normalizedOpenAiSchema(value as AIProviderJsonSchema);
            return;
        }

        if (key === 'prefixItems' || key === 'anyOf' || key === 'oneOf') {
            normalized[key] = (value as readonly AIProviderJsonSchema[])
                .map((item) => normalizedOpenAiSchema(item));
            return;
        }

        normalized[key] = value;
    });

    if (normalized.type === 'object' && normalized.additionalProperties === undefined) {
        normalized.additionalProperties = false;
    }

    return normalized;
}

function strictLocalSchema(
    schema: AIProviderJsonSchema,
    allowedEvidenceRefs: readonly string[],
): Record<string, unknown> {
    const normalized = normalizedOpenAiSchema(schema);
    const properties = normalized.properties;
    if (typeof properties !== 'object' || properties === null) {
        return normalized;
    }

    Object.values(properties as Record<string, unknown>).forEach((sectionSchema) => {
        if (typeof sectionSchema !== 'object' || sectionSchema === null) {
            return;
        }
        const pointSchema = objectValue(sectionSchema, 'items');
        const pointProperties = objectValue(pointSchema, 'properties');
        const refsSchema = objectValue(pointProperties, 'evidenceRefs');
        if (typeof refsSchema !== 'object' || refsSchema === null) {
            return;
        }

        const itemSchema: Record<string, unknown> = {
            type: 'string',
        };
        if (allowedEvidenceRefs.length > 0) {
            itemSchema.enum = allowedEvidenceRefs;
        }

        Object.assign(refsSchema, {
            uniqueItems: true,
            items: itemSchema,
        });
    });

    return normalized;
}

function openAiResponseContent(body: string): string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(body) as unknown;
    } catch {
        return '';
    }

    const choices = objectValue(parsed, 'choices');
    if (!Array.isArray(choices)) {
        return '';
    }

    const choice = choices[0];
    if (objectValue(choice, 'finish_reason') !== 'stop') {
        return '';
    }

    const message = objectValue(choice, 'message');
    const content = objectValue(message, 'content');
    return typeof content === 'string' && content.trim().length > 0
        ? content
        : '';
}

function localProviderBody(
    request: SoxlAiLocalProviderRequest,
    config: SoxlAiLocalProviderConfig,
): Record<string, unknown> {
    const body: Record<string, unknown> = {
        model: config.model,
        messages: [
            { role: 'system', content: request.systemInstruction },
            { role: 'user', content: request.userInstruction },
        ],
        temperature: 0,
        max_tokens: config.maxTokens,
        stream: false,
        cache_prompt: config.cachePrompt,
    };

    if (config.role === 'primary') {
        body.chat_template_kwargs = {
            enable_thinking: false,
        };
    }

    if (request.responseFormat !== undefined) {
        body.response_format = {
            type: 'json_schema',
            json_schema: {
                name: 'soxl_grounded_explanation_v1',
                strict: true,
                schema: strictLocalSchema(
                    request.responseFormat.schema,
                    request.allowedEvidenceRefs ?? [],
                ),
            },
        };
    } else if (request.responseMimeType === 'application/json') {
        body.response_format = {
            type: 'json_object',
        };
    }

    return body;
}

function providerHttpCategory(status: number): AIProviderFailureCategory {
    if (status === 400) {
        return 'structured_output_rejected';
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

function providerCall(
    config: SoxlAiLocalProviderConfig,
    request: SoxlAiHttpRequest,
): SoxlAiProviderCandidate['call'] {
    return async (providerRequest) => {
        const requestBody = JSON.stringify(
            localProviderBody(providerRequest, config),
        );
        const headers: Record<string, string> = {
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(requestBody)),
            connection: 'close',
        };
        if (config.apiKey.trim().length > 0) {
            headers.authorization = `Bearer ${config.apiKey}`;
        }

        let response: SoxlAiHttpResponse;
        try {
            response = await request({
                url: joinEndpoint(config.baseUrl, '/chat/completions'),
                method: 'POST',
                headers,
                body: requestBody,
                timeoutMs: config.requestTimeoutMs,
            });
        } catch (error) {
            const category = requestFailureCategory(error);
            throw new AIProviderError(
                category === 'provider_timeout'
                    ? 'provider_timeout'
                    : 'provider_http_error',
                config.providerId,
                { category },
            );
        }

        if (response.status < 200 || response.status >= 300) {
            throw new AIProviderError(
                'provider_http_error',
                config.providerId,
                {
                    category: providerHttpCategory(response.status),
                    httpStatus: response.status,
                },
            );
        }

        const text = openAiResponseContent(response.body);
        if (text.length === 0) {
            throw new AIProviderError(
                'provider_invalid_response',
                config.providerId,
                { category: 'invalid_provider_response' },
            );
        }

        return {
            providerId: config.providerId,
            text,
        };
    };
}

function candidate(
    config: SoxlAiLocalProviderConfig,
    request: SoxlAiHttpRequest,
): SoxlAiProviderCandidate {
    return {
        providerId: config.providerId,
        role: config.role,
        model: config.model,
        strictStructuredOutput: true,
        call: providerCall(config, request),
    };
}

function openPrimaryCircuit(
    reason: SoxlAiPrimaryFallbackReason,
    durationMs: number,
    now: number,
): void {
    primaryCircuit.openUntilMs = now + durationMs;
    primaryCircuit.reason = reason;
}

export function noteSoxlAiPrimaryFailure(
    reason: SoxlAiPrimaryFallbackReason,
    now: number = Date.now(),
): void {
    openPrimaryCircuit(
        reason,
        envPositiveInteger(
            'SOXL_AI_PRIMARY_CIRCUIT_OPEN_MS',
            defaultPrimaryCircuitOpenMs,
        ),
        now,
    );
}

export function noteSoxlAiPrimarySuccess(): void {
    primaryCircuit.openUntilMs = 0;
    primaryCircuit.reason = null;
}

export function resetSoxlAiLocalProviderRouterStateForTests(): void {
    noteSoxlAiPrimarySuccess();
}

export function fallbackReasonForPrimaryError(
    error: unknown,
): SoxlAiPrimaryFallbackReason {
    if (error instanceof AIProviderError) {
        if (error.code === 'provider_timeout') {
            return 'primary_request_timeout';
        }
        if (error.code === 'provider_invalid_response') {
            return 'primary_invalid_response';
        }
    }

    return 'primary_request_error';
}

export function createSoxlAiLocalProviderRouteResolver(
    dependencies: SoxlAiLocalProviderRouterDependencies = {},
): SoxlAiProviderRouteResolver {
    const request = dependencies.request ?? nativeHttpRequest;
    const now = dependencies.now ?? Date.now;
    let primaryProbePromise: Promise<{
        readonly ready: boolean;
        readonly reason: SoxlAiPrimaryFallbackReason | null;
    }> | null = null;

    return async () => {
        const config = localRouterConfig();
        const fallbackCandidate = candidate(config.fallback, request);

        if (!config.enabled) {
            return {
                attempts: [fallbackCandidate],
                initialFallbackReason: 'primary_not_configured',
            };
        }

        if (config.primary === null) {
            return {
                attempts: [fallbackCandidate],
                initialFallbackReason: 'primary_not_configured',
            };
        }

        const currentTime = now();
        if (primaryCircuit.openUntilMs > currentTime) {
            return {
                attempts: [fallbackCandidate],
                initialFallbackReason: primaryCircuit.reason ?? 'primary_circuit_open',
            };
        }

        if (primaryProbePromise === null) {
            primaryProbePromise = probePrimary(config.primary, request)
                .finally(() => {
                    primaryProbePromise = null;
                });
        }

        const health = await primaryProbePromise;
        if (!health.ready) {
            const reason = health.reason ?? 'primary_health_unreachable';
            openPrimaryCircuit(
                reason,
                config.primaryCircuitOpenMs,
                now(),
            );
            return {
                attempts: [fallbackCandidate],
                initialFallbackReason: reason,
            };
        }

        return {
            attempts: [
                candidate(config.primary, request),
                fallbackCandidate,
            ],
            initialFallbackReason: null,
        };
    };
}

export const resolveSoxlAiLocalProviderRoute =
    createSoxlAiLocalProviderRouteResolver();
