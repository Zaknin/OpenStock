import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSoxlAiModelExplanationResponseFormat } from './soxl-ai-prompt';
import {
    createSoxlAiLocalProviderRouteResolver,
    noteSoxlAiPrimaryFailure,
    noteSoxlAiPrimarySuccess,
    resetSoxlAiLocalProviderRouterStateForTests,
    type SoxlAiHttpRequest,
} from './soxl-ai-local-provider-router.server';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetSoxlAiLocalProviderRouterStateForTests();
});

function configureLocalRouting(): void {
    vi.stubEnv('SOXL_AI_LOCAL_ROUTING_ENABLED', 'true');
    vi.stubEnv('SOXL_AI_PRIMARY_BASE_URL', 'http://192.168.23.99:1234/v1');
    vi.stubEnv('SOXL_AI_PRIMARY_MODEL', 'ornith-35b');
    vi.stubEnv('SOXL_AI_PRIMARY_PROVIDER_ID', 'ornith-primary');
    vi.stubEnv('SOXL_AI_PRIMARY_HEALTH_TIMEOUT_MS', '3000');
    vi.stubEnv('SOXL_AI_PRIMARY_REQUEST_TIMEOUT_MS', '600000');
    vi.stubEnv('SOXL_AI_FALLBACK_BASE_URL', 'http://192.168.23.130:8083/v1');
    vi.stubEnv('SOXL_AI_FALLBACK_MODEL', 'fin-r1-q4km');
    vi.stubEnv('SOXL_AI_FALLBACK_PROVIDER_ID', 'fin-fallback');
    vi.stubEnv('SOXL_AI_FALLBACK_REQUEST_TIMEOUT_MS', '1200000');
    vi.stubEnv('SOXL_AI_PRIMARY_CIRCUIT_OPEN_MS', '60000');
}

function timeoutFailure(): Error & { code: string } {
    const error = new Error('timeout') as Error & { code: string };
    error.code = 'SOXL_LOCAL_REQUEST_TIMEOUT';
    return error;
}

function connectionFailure(): Error & { code: string } {
    const error = new Error('connection refused') as Error & { code: string };
    error.code = 'ECONNREFUSED';
    return error;
}

describe('SOXL local provider router', () => {
    it('health-checks the primary and builds a strict OpenAI-compatible request', async () => {
        configureLocalRouting();
        const request = vi.fn<SoxlAiHttpRequest>(async (input) => {
            if (input.method === 'GET') {
                return {
                    status: 200,
                    body: JSON.stringify({ data: [{ id: 'ornith-35b' }] }),
                };
            }

            return {
                status: 200,
                body: JSON.stringify({
                    choices: [{
                        finish_reason: 'stop',
                        message: { content: '{"status":"available"}' },
                    }],
                }),
            };
        });
        const resolveRoute = createSoxlAiLocalProviderRouteResolver({ request });

        const route = await resolveRoute();

        expect(route.initialFallbackReason).toBeNull();
        const healthCall = request.mock.calls.find(([input]) => input.method === 'GET');
        expect(healthCall?.[0].timeoutMs).toBe(3000);
        expect(route.attempts.map(({ role, providerId }) => ({ role, providerId }))).toEqual([
            { role: 'primary', providerId: 'ornith-primary' },
            { role: 'fallback', providerId: 'fin-fallback' },
        ]);

        const result = await route.attempts[0].call({
            systemInstruction: 'system',
            userInstruction: 'user',
            responseMimeType: 'application/json',
            responseFormat: buildSoxlAiModelExplanationResponseFormat(),
            allowedEvidenceRefs: ['E001', 'E002'],
        });

        expect(result).toEqual({
            providerId: 'ornith-primary',
            text: '{"status":"available"}',
        });
        const postCall = request.mock.calls.find(([input]) => input.method === 'POST');
        expect(postCall).toBeDefined();
        const postInput = postCall?.[0];
        expect(postInput?.url).toBe('http://192.168.23.99:1234/v1/chat/completions');
        expect(postInput?.timeoutMs).toBe(600000);
        const body = JSON.parse(postInput?.body ?? '{}') as Record<string, unknown>;
        expect(body).toMatchObject({
            model: 'ornith-35b',
            temperature: 0,
            max_tokens: 2048,
            stream: false,
            chat_template_kwargs: { enable_thinking: false },
        });
        const responseFormat = body.response_format as {
            type?: string;
            json_schema?: {
                name?: string;
                strict?: boolean;
                schema?: Record<string, unknown>;
            };
        };
        expect(responseFormat.type).toBe('json_schema');
        expect(responseFormat.json_schema?.name).toBe('soxl_grounded_explanation_v1');
        expect(responseFormat.json_schema?.strict).toBe(true);
        const schema = responseFormat.json_schema?.schema as {
            properties?: Record<string, {
                items?: {
                    properties?: Record<string, {
                        items?: Record<string, unknown>;
                    }>;
                };
            }>;
        };
        expect(schema.properties?.summary.items?.properties?.evidenceRefs.items)
            .toEqual({ type: 'string' });
        expect(JSON.stringify(schema)).not.toMatch(/enum|minItems|maxItems|uniqueItems/u);
    });

    it('does not send Ornith-specific thinking controls to Fin-R1', async () => {
        configureLocalRouting();
        const request = vi.fn<SoxlAiHttpRequest>(async (input) => ({
            status: 200,
            body: input.method === 'GET'
                ? JSON.stringify({ data: [{ id: 'ornith-35b' }] })
                : JSON.stringify({
                    choices: [{
                        finish_reason: 'stop',
                        message: { content: '{"status":"available"}' },
                    }],
                }),
        }));
        const resolveRoute = createSoxlAiLocalProviderRouteResolver({ request });
        const route = await resolveRoute();

        await route.attempts[1].call({
            systemInstruction: 'system',
            userInstruction: 'user',
            responseMimeType: 'application/json',
            responseFormat: buildSoxlAiModelExplanationResponseFormat(),
        });

        const postCall = request.mock.calls.find(([input]) => (
            input.method === 'POST'
            && input.url.includes('192.168.23.130')
        ));
        const body = JSON.parse(postCall?.[0].body ?? '{}') as Record<string, unknown>;
        expect(body).not.toHaveProperty('chat_template_kwargs');
        expect(body.response_format).toMatchObject({
            type: 'json_schema',
            json_schema: {
                name: 'soxl_grounded_explanation_v1',
                strict: true,
            },
        });
        expect(JSON.stringify(body.response_format)).not.toMatch(/enum|minItems|maxItems|uniqueItems/u);
    });

    it('logs only request-size metadata and rejects an oversized fallback request before transport', async () => {
        configureLocalRouting();
        vi.stubEnv('SOXL_AI_FALLBACK_MAX_REQUEST_BYTES', '200');
        const request = vi.fn<SoxlAiHttpRequest>(async (input) => ({
            status: 200,
            body: input.method === 'GET'
                ? JSON.stringify({ data: [{ id: 'ornith-35b' }] })
                : JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }),
        }));
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const route = await createSoxlAiLocalProviderRouteResolver({ request })();

        await expect(route.attempts[1].call({
            systemInstruction: 'system-secret',
            userInstruction: 'user-secret'.repeat(100),
            responseMimeType: 'application/json',
            responseFormat: buildSoxlAiModelExplanationResponseFormat(),
            requestMetadata: {
                systemInstructionChars: 13,
                userInstructionChars: 1_100,
                evidenceItemCount: 37,
            },
        })).rejects.toMatchObject({
            code: 'provider_request_too_large',
            category: 'provider_request_too_large',
            providerId: 'fin-fallback',
        });
        expect(request.mock.calls.filter(([input]) => input.method === 'POST')).toHaveLength(0);
        expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(
            /^SOXL_AI_PROVIDER_REQUEST provider=fin-fallback systemChars=13 userChars=1100 schemaChars=\d+ evidenceItems=37 maxTokens=1024 bodyBytes=\d+$/u,
        ));
        expect(JSON.stringify(infoSpy.mock.calls)).not.toContain('secret');
    });

    it.each([
        ['a blank assistant response', {
            choices: [{ finish_reason: 'stop', message: { content: '  ' } }],
        }],
        ['a missing finish reason', {
            choices: [{ message: { content: '{}' } }],
        }],
        ['a non-stop finish reason', {
            choices: [{ finish_reason: 'length', message: { content: '{}' } }],
        }],
        ['an invalid response envelope', { result: 'not a chat completion' }],
    ] as const)('rejects %s', async (_label, body) => {
        configureLocalRouting();
        const request = vi.fn<SoxlAiHttpRequest>(async (input) => ({
            status: 200,
            body: input.method === 'GET'
                ? JSON.stringify({ data: [{ id: 'ornith-35b' }] })
                : JSON.stringify(body),
        }));
        const resolveRoute = createSoxlAiLocalProviderRouteResolver({ request });
        const route = await resolveRoute();

        await expect(route.attempts[0].call({
            systemInstruction: 'system',
            userInstruction: 'user',
            responseMimeType: 'application/json',
        })).rejects.toMatchObject({
            code: 'provider_invalid_response',
            category: 'invalid_provider_response',
        });
    });

    it.each([
        ['a connection error', () => { throw connectionFailure(); }, {
            code: 'provider_http_error',
            category: 'connection_refused',
        }],
        ['a request timeout', () => { throw timeoutFailure(); }, {
            code: 'provider_timeout',
            category: 'provider_timeout',
        }],
        ['a non-2xx response', () => ({ status: 503, body: '{}' }), {
            code: 'provider_http_error',
            category: 'provider_unavailable',
            httpStatus: 503,
        }],
    ] as const)('maps %s to an existing provider error category', async (
        _label,
        postResult,
        expected,
    ) => {
        configureLocalRouting();
        const request = vi.fn<SoxlAiHttpRequest>(async (input) => {
            if (input.method === 'GET') {
                return {
                    status: 200,
                    body: JSON.stringify({ data: [{ id: 'ornith-35b' }] }),
                };
            }

            return postResult();
        });
        const resolveRoute = createSoxlAiLocalProviderRouteResolver({ request });
        const route = await resolveRoute();

        await expect(route.attempts[0].call({
            systemInstruction: 'system',
            userInstruction: 'user',
            responseMimeType: 'application/json',
        })).rejects.toMatchObject(expected);
    });

    it('logs only a whitelisted reason for a provider HTTP rejection', async () => {
        configureLocalRouting();
        const request = vi.fn<SoxlAiHttpRequest>(async (input) => (
            input.method === 'GET'
                ? { status: 200, body: JSON.stringify({ data: [{ id: 'ornith-35b' }] }) }
                : {
                    status: 400,
                    body: JSON.stringify({
                        error: { message: 'Prompt exceeds the configured context token limit.' },
                    }),
                }
        ));
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const resolveRoute = createSoxlAiLocalProviderRouteResolver({ request });
        const route = await resolveRoute();

        await expect(route.attempts[1].call({
            systemInstruction: 'system',
            userInstruction: 'synthetic diagnostic only',
            responseMimeType: 'application/json',
        })).rejects.toMatchObject({
            code: 'provider_http_error',
            category: 'structured_output_rejected',
            httpStatus: 400,
        });
        expect(warnSpy).toHaveBeenCalledWith(
            'SOXL_AI_PROVIDER_HTTP_REJECTED provider=fin-fallback reason=context_limit',
        );
        expect(warnSpy.mock.calls.flat().join(' ')).not.toContain('Prompt exceeds');
    });

    it('falls back after a three-second health timeout and skips repeated probes while the circuit is open', async () => {
        configureLocalRouting();
        let now = 10_000;
        let healthAttempts = 0;
        const request = vi.fn<SoxlAiHttpRequest>(async (input) => {
            if (input.method === 'GET') {
                healthAttempts += 1;
                if (healthAttempts === 1) {
                    throw timeoutFailure();
                }
                return {
                    status: 200,
                    body: JSON.stringify({ data: [{ id: 'ornith-35b' }] }),
                };
            }

            return {
                status: 200,
                body: JSON.stringify({ choices: [{ message: { content: '{}' } }] }),
            };
        });
        const resolveRoute = createSoxlAiLocalProviderRouteResolver({
            request,
            now: () => now,
        });

        const first = await resolveRoute();
        expect(first.initialFallbackReason).toBe('primary_health_timeout');
        expect(first.attempts.map(({ role }) => role)).toEqual(['fallback']);
        expect(healthAttempts).toBe(1);

        const second = await resolveRoute();
        expect(second.initialFallbackReason).toBe('primary_health_timeout');
        expect(second.attempts.map(({ role }) => role)).toEqual(['fallback']);
        expect(healthAttempts).toBe(1);

        now += 60_001;
        const third = await resolveRoute();
        expect(third.initialFallbackReason).toBeNull();
        expect(third.attempts.map(({ role }) => role)).toEqual(['primary', 'fallback']);
        expect(healthAttempts).toBe(2);
    });

    it('uses the fallback when the expected primary model is not loaded', async () => {
        configureLocalRouting();
        const request = vi.fn<SoxlAiHttpRequest>(async () => ({
            status: 200,
            body: JSON.stringify({ data: [{ id: 'different-model' }] }),
        }));
        const resolveRoute = createSoxlAiLocalProviderRouteResolver({ request });

        const route = await resolveRoute();

        expect(route.initialFallbackReason).toBe('primary_model_not_ready');
        expect(route.attempts.map(({ role }) => role)).toEqual(['fallback']);
    });

    it('skips Ornith while its request-failure circuit is open and resumes after success', async () => {
        configureLocalRouting();
        const request = vi.fn<SoxlAiHttpRequest>(async () => ({
            status: 200,
            body: JSON.stringify({ data: [{ id: 'ornith-35b' }] }),
        }));
        const resolveRoute = createSoxlAiLocalProviderRouteResolver({ request });

        noteSoxlAiPrimaryFailure('primary_request_error');
        const whileOpen = await resolveRoute();
        expect(whileOpen.attempts.map(({ role }) => role)).toEqual(['fallback']);
        expect(request).not.toHaveBeenCalled();

        noteSoxlAiPrimarySuccess();
        const afterSuccess = await resolveRoute();
        expect(afterSuccess.attempts.map(({ role }) => role)).toEqual(['primary', 'fallback']);
        expect(request).toHaveBeenCalledTimes(1);
    });
});
