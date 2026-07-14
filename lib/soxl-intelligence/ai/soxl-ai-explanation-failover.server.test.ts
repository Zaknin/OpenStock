import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIProviderError } from '@/lib/ai-provider';
import type { SoxlAiEvidencePackage } from './soxl-ai-evidence';
import {
    resetSoxlAiLocalProviderRouterStateForTests,
    type SoxlAiProviderCandidate,
    type SoxlAiProviderRoutePlan,
    type SoxlAiProviderRouteResolver,
} from './soxl-ai-local-provider-router.server';
import {
    generateSoxlAiExplanation,
} from './soxl-ai-explanation-service.server';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetSoxlAiLocalProviderRouterStateForTests();
});

const availableId = 'current.market_facts.status';

function evidence(): SoxlAiEvidencePackage {
    return {
        status: 'available',
        issues: [],
        snapshotIdentities: [{
            role: 'current',
            providerId: 'twelve-data',
            asOf: 1_787_654_321_123,
            factsStatus: 'available',
            assessmentStatus: 'available',
            coreStatus: 'available',
            sessionStatus: 'available',
            openingRangeComplete: null,
            regularSessionComplete: null,
        }],
        items: [{
            id: availableId,
            source: 'market_facts',
            snapshotRole: 'current',
            sourcePath: 'facts.status',
            label: 'Market facts status',
            trustClass: 'deterministic_market_fact',
            availability: 'available',
            value: 'available',
            unit: null,
        }],
        groups: {
            currentMarketFacts: [availableId],
            currentAssessment: [],
            planAssumptions: [],
            planCalculations: [],
            executionAssumptions: [],
            monitoringCalculations: [],
            missingEvidence: [],
        },
    };
}

function validResponse(): string {
    return JSON.stringify({
        status: 'available',
        summary: [{
            text: 'The current market facts are available.',
            evidenceRefs: ['E001'],
        }],
        supportingEvidence: [],
        conflictingEvidence: [],
        missingEvidence: [],
        riskReminders: [],
        limitations: [],
    });
}

function candidate(
    role: 'primary' | 'fallback',
    providerId: string,
    implementation: SoxlAiProviderCandidate['call'],
): SoxlAiProviderCandidate {
    return {
        providerId,
        role,
        model: providerId,
        strictStructuredOutput: true,
        call: implementation,
    };
}

function routeResolver(plan: SoxlAiProviderRoutePlan): SoxlAiProviderRouteResolver {
    return vi.fn<SoxlAiProviderRouteResolver>().mockResolvedValue(plan);
}

describe('SOXL AI provider failover', () => {
    it('uses the primary when it returns a validator-accepted response', async () => {
        const primaryCall = vi.fn<SoxlAiProviderCandidate['call']>()
            .mockResolvedValue({ providerId: 'ornith-primary', text: validResponse() });
        const fallbackCall = vi.fn<SoxlAiProviderCandidate['call']>()
            .mockResolvedValue({ providerId: 'fin-fallback', text: validResponse() });
        const resolveProviderRoute = routeResolver({
            attempts: [
                candidate('primary', 'ornith-primary', primaryCall),
                candidate('fallback', 'fin-fallback', fallbackCall),
            ],
            initialFallbackReason: null,
        });
        vi.spyOn(console, 'info').mockImplementation(() => undefined);

        const result = await generateSoxlAiExplanation(
            { evidence: evidence() },
            { resolveProviderRoute },
        );

        expect(result).toMatchObject({
            status: 'available',
            providerId: 'ornith-primary',
            providerRole: 'primary',
            fallbackUsed: false,
            fallbackReason: null,
        });
        expect(primaryCall).toHaveBeenCalledTimes(1);
        expect(fallbackCall).not.toHaveBeenCalled();
        const request = primaryCall.mock.calls[0][0];
        expect(request.responseFormat).toBeDefined();
        expect(request.allowedEvidenceRefs).toEqual(['E001']);
    });

    it('retries with Fin-R1 when Ornith fails the production validator', async () => {
        const primaryCall = vi.fn<SoxlAiProviderCandidate['call']>()
            .mockResolvedValue({ providerId: 'ornith-primary', text: '{bad json' });
        const fallbackCall = vi.fn<SoxlAiProviderCandidate['call']>()
            .mockResolvedValue({ providerId: 'fin-fallback', text: validResponse() });
        const resolveProviderRoute = routeResolver({
            attempts: [
                candidate('primary', 'ornith-primary', primaryCall),
                candidate('fallback', 'fin-fallback', fallbackCall),
            ],
            initialFallbackReason: null,
        });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'info').mockImplementation(() => undefined);

        const result = await generateSoxlAiExplanation(
            { evidence: evidence() },
            { resolveProviderRoute },
        );

        expect(result).toMatchObject({
            status: 'available',
            providerId: 'fin-fallback',
            providerRole: 'fallback',
            fallbackUsed: true,
            fallbackReason: 'primary_validation_rejected',
            issues: [],
        });
        expect(primaryCall).toHaveBeenCalledTimes(1);
        expect(fallbackCall).toHaveBeenCalledTimes(1);
    });

    it('retries with Fin-R1 when Ornith returns a JSON contract mismatch', async () => {
        const primaryCall = vi.fn<SoxlAiProviderCandidate['call']>()
            .mockResolvedValue({
                providerId: 'ornith-primary',
                text: JSON.stringify({ ...JSON.parse(validResponse()), extra: true }),
            });
        const fallbackCall = vi.fn<SoxlAiProviderCandidate['call']>()
            .mockResolvedValue({ providerId: 'fin-fallback', text: validResponse() });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'info').mockImplementation(() => undefined);

        const result = await generateSoxlAiExplanation(
            { evidence: evidence() },
            {
                resolveProviderRoute: routeResolver({
                    attempts: [
                        candidate('primary', 'ornith-primary', primaryCall),
                        candidate('fallback', 'fin-fallback', fallbackCall),
                    ],
                    initialFallbackReason: null,
                }),
            },
        );

        expect(result).toMatchObject({
            status: 'available',
            providerId: 'fin-fallback',
            fallbackUsed: true,
            fallbackReason: 'primary_validation_rejected',
        });
    });

    it('retries with Fin-R1 when the primary analysis request fails', async () => {
        const primaryCall = vi.fn<SoxlAiProviderCandidate['call']>()
            .mockRejectedValue(new AIProviderError(
                'provider_timeout',
                'ornith-primary',
                { category: 'provider_timeout' },
            ));
        const fallbackCall = vi.fn<SoxlAiProviderCandidate['call']>()
            .mockResolvedValue({ providerId: 'fin-fallback', text: validResponse() });
        const resolveProviderRoute = routeResolver({
            attempts: [
                candidate('primary', 'ornith-primary', primaryCall),
                candidate('fallback', 'fin-fallback', fallbackCall),
            ],
            initialFallbackReason: null,
        });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'info').mockImplementation(() => undefined);

        const result = await generateSoxlAiExplanation(
            { evidence: evidence() },
            { resolveProviderRoute },
        );

        expect(result).toMatchObject({
            status: 'available',
            providerId: 'fin-fallback',
            providerRole: 'fallback',
            fallbackUsed: true,
            fallbackReason: 'primary_request_timeout',
        });
    });

    it.each([
        ['a connection error', new AIProviderError(
            'provider_http_error',
            'ornith-primary',
            { category: 'connection_refused' },
        ), 'primary_request_error'],
        ['a non-2xx response', new AIProviderError(
            'provider_http_error',
            'ornith-primary',
            { category: 'provider_unavailable', httpStatus: 503 },
        ), 'primary_request_error'],
        ['an invalid transport envelope', new AIProviderError(
            'provider_invalid_response',
            'ornith-primary',
            { category: 'invalid_provider_response' },
        ), 'primary_invalid_response'],
    ] as const)('retries with Fin-R1 after %s', async (
        _label,
        primaryError,
        fallbackReason,
    ) => {
        const primaryCall = vi.fn<SoxlAiProviderCandidate['call']>()
            .mockRejectedValue(primaryError);
        const fallbackCall = vi.fn<SoxlAiProviderCandidate['call']>()
            .mockResolvedValue({ providerId: 'fin-fallback', text: validResponse() });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'info').mockImplementation(() => undefined);

        const result = await generateSoxlAiExplanation(
            { evidence: evidence() },
            {
                resolveProviderRoute: routeResolver({
                    attempts: [
                        candidate('primary', 'ornith-primary', primaryCall),
                        candidate('fallback', 'fin-fallback', fallbackCall),
                    ],
                    initialFallbackReason: null,
                }),
            },
        );

        expect(result).toMatchObject({
            status: 'available',
            providerId: 'fin-fallback',
            fallbackUsed: true,
            fallbackReason,
        });
        expect(fallbackCall).toHaveBeenCalledOnce();
    });

    it('retries with Fin-R1 after primary grounding validation fails', async () => {
        const primaryCall = vi.fn<SoxlAiProviderCandidate['call']>()
            .mockResolvedValue({
                providerId: 'ornith-primary',
                text: JSON.stringify({
                    ...JSON.parse(validResponse()),
                    summary: [{ text: 'The price is 99.99.', evidenceRefs: ['E001'] }],
                }),
            });
        const fallbackCall = vi.fn<SoxlAiProviderCandidate['call']>()
            .mockResolvedValue({ providerId: 'fin-fallback', text: validResponse() });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'info').mockImplementation(() => undefined);

        const result = await generateSoxlAiExplanation(
            { evidence: evidence() },
            {
                resolveProviderRoute: routeResolver({
                    attempts: [
                        candidate('primary', 'ornith-primary', primaryCall),
                        candidate('fallback', 'fin-fallback', fallbackCall),
                    ],
                    initialFallbackReason: null,
                }),
            },
        );

        expect(result).toMatchObject({
            status: 'available',
            providerId: 'fin-fallback',
            fallbackReason: 'primary_validation_rejected',
        });
    });

    it('goes directly to Fin-R1 when the three-second health gate skipped the primary', async () => {
        const fallbackCall = vi.fn<SoxlAiProviderCandidate['call']>()
            .mockResolvedValue({ providerId: 'fin-fallback', text: validResponse() });
        const resolveProviderRoute = routeResolver({
            attempts: [candidate('fallback', 'fin-fallback', fallbackCall)],
            initialFallbackReason: 'primary_health_timeout',
        });
        vi.spyOn(console, 'info').mockImplementation(() => undefined);

        const result = await generateSoxlAiExplanation(
            { evidence: evidence() },
            { resolveProviderRoute },
        );

        expect(result).toMatchObject({
            status: 'available',
            providerId: 'fin-fallback',
            providerRole: 'fallback',
            fallbackUsed: true,
            fallbackReason: 'primary_health_timeout',
        });
        expect(fallbackCall).toHaveBeenCalledTimes(1);
    });

    it('returns the existing safe unavailable result when both providers fail', async () => {
        const primaryCall = vi.fn<SoxlAiProviderCandidate['call']>()
            .mockRejectedValue(new AIProviderError('provider_http_error', 'ornith-primary'));
        const fallbackCall = vi.fn<SoxlAiProviderCandidate['call']>()
            .mockRejectedValue(new AIProviderError('provider_timeout', 'fin-fallback'));
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const result = await generateSoxlAiExplanation(
            { evidence: evidence() },
            {
                resolveProviderRoute: routeResolver({
                    attempts: [
                        candidate('primary', 'ornith-primary', primaryCall),
                        candidate('fallback', 'fin-fallback', fallbackCall),
                    ],
                    initialFallbackReason: null,
                }),
            },
        );

        expect(result).toMatchObject({
            status: 'unavailable',
            explanation: null,
            providerId: 'fin-fallback',
            fallbackUsed: true,
            fallbackReason: 'primary_request_error',
        });
        expect(result.issues).toContain('provider_error');
    });

    it('preserves the injected pre-local provider path while local routing is disabled', async () => {
        vi.stubEnv('SOXL_AI_LOCAL_ROUTING_ENABLED', 'false');
        const callProvider = vi.fn<SoxlAiProviderCandidate['call']>()
            .mockResolvedValue({ providerId: 'gemini', text: validResponse() });

        const result = await generateSoxlAiExplanation(
            { evidence: evidence() },
            { callProvider },
        );

        expect(result).toMatchObject({
            status: 'available',
            providerId: 'gemini',
        });
        expect(result.providerRole).toBeUndefined();
        expect(result.fallbackUsed).toBeUndefined();
        expect(callProvider).toHaveBeenCalledOnce();
    });
});
