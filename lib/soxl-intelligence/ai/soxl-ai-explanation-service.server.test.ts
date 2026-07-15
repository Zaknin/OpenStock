import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIProviderError, AI_PROVIDER_MAX_TIMEOUT_MS, type AIProviderName } from '@/lib/ai-provider';
import type { SoxlAiEvidencePackage } from './soxl-ai-evidence';
import type { SoxlAiExplanationResponse, SoxlAiModelExplanation } from './soxl-ai-prompt';
import {
    classifySoxlAiValidationRejectionReason,
    generateSoxlAiExplanation,
    type SoxlAiProviderCall,
} from './soxl-ai-explanation-service.server';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const providerId = 'twelve-data';
const asOf = 1_787_654_321_123;
const availableId = 'current.market_facts.status';
const missingId = 'current.assessment.condition.state';

function evidence(
    status: SoxlAiEvidencePackage['status'] = 'available',
    missingEvidence: readonly string[] = [],
    identity: { readonly providerId: string | null; readonly asOf: number | null } = { providerId, asOf },
): SoxlAiEvidencePackage {
    return {
        status,
        issues: status === 'available' ? [] : ['no_current_market_evidence'],
        snapshotIdentities: [{
            role: 'current',
            providerId: identity.providerId,
            asOf: identity.asOf,
            factsStatus: status,
            assessmentStatus: status,
            coreStatus: status,
            sessionStatus: status,
            openingRangeComplete: null,
            regularSessionComplete: null,
        }],
        items: [
            {
                id: availableId,
                source: 'market_facts',
                snapshotRole: 'current',
                sourcePath: 'facts.status',
                label: 'Market facts status',
                trustClass: 'deterministic_market_fact',
                availability: 'available',
                value: 'available',
                unit: null,
            },
            {
                id: missingId,
                source: 'market_assessment',
                snapshotRole: 'current',
                sourcePath: 'assessment.condition.state',
                label: 'Condition state',
                trustClass: 'deterministic_assessment',
                availability: 'unknown',
                value: 'unknown',
                unit: null,
            },
        ],
        groups: {
            currentMarketFacts: [availableId],
            currentAssessment: [missingId],
            planAssumptions: [],
            planCalculations: [],
            executionAssumptions: [],
            monitoringCalculations: [],
            missingEvidence,
        },
    };
}

function largeEvidence(count: number): SoxlAiEvidencePackage {
    const ids = Array.from({ length: count }, (_, index) => `current.fact.${index}`);
    return {
        ...evidence(),
        items: ids.map((id) => ({
            id,
            source: 'market_facts' as const,
            snapshotRole: 'current' as const,
            sourcePath: 'facts.value',
            label: 'Fact',
            trustClass: 'deterministic_market_fact' as const,
            availability: 'available' as const,
            value: 1,
            unit: null,
        })),
        groups: {
            currentMarketFacts: ids,
            currentAssessment: [],
            planAssumptions: [],
            planCalculations: [],
            executionAssumptions: [],
            monitoringCalculations: [],
            missingEvidence: [],
        },
    };
}

function modelPoint(text: string, refs: readonly string[] = ['E001']) {
    return { text, evidenceRefs: refs };
}

function appPoint(text: string, ids: readonly string[] = [availableId]) {
    return { text, evidenceIds: ids };
}

function explanation(
    overrides: Partial<SoxlAiModelExplanation> = {},
): SoxlAiModelExplanation {
    return {
        status: 'available',
        summary: [modelPoint('The market facts status is available.')],
        supportingEvidence: [],
        conflictingEvidence: [],
        missingEvidence: [],
        riskReminders: [],
        limitations: [],
        ...overrides,
    };
}

function applicationExplanation(
    identity: SoxlAiExplanationResponse['snapshotIdentity'] = {
        providerId,
        asOf: String(asOf),
    },
): SoxlAiExplanationResponse {
    return {
        status: 'available',
        summary: [appPoint('The market facts status is available.')],
        supportingEvidence: [],
        conflictingEvidence: [],
        missingEvidence: [],
        riskReminders: [],
        limitations: [],
        snapshotIdentity: identity,
    };
}

function providerReturning(
    value: string,
    provider: AIProviderName = 'gemini',
): ReturnType<typeof vi.fn<SoxlAiProviderCall>> {
    return vi.fn<SoxlAiProviderCall>().mockResolvedValue({ providerId: provider, text: value });
}

describe('generateSoxlAiExplanation', () => {
    it('calls the provider once with request-scoped aliases and returns canonical IDs', async () => {
        const callProvider = providerReturning(JSON.stringify(explanation()));
        const result = await generateSoxlAiExplanation({ evidence: evidence() }, { callProvider });

        expect(result).toEqual({
            status: 'available',
            explanation: applicationExplanation(),
            issues: [],
            providerId: 'gemini',
        });
        expect(callProvider).toHaveBeenCalledTimes(1);
        const request = callProvider.mock.calls[0][0];
        expect(request.timeoutMs).toBe(AI_PROVIDER_MAX_TIMEOUT_MS);
        expect(request.responseMimeType).toBe('application/json');
        expect(request.responseFormat).toBeUndefined();
        expect(JSON.stringify(request)).not.toMatch(/responseSchema|responseJsonSchema/u);
        expect(request.userInstruction).toContain('"ref": "E001"');
        expect(request.userInstruction).not.toContain(availableId);
        const assembledPrompt = `${request.systemInstruction}\n${request.userInstruction}`;
        expect(assembledPrompt).not.toMatch(/(?:evidenceRefs[^\n]*20|20[^\n]*evidenceRefs)/u);
        expect(request.userInstruction.indexOf('Final evidence-reference self-check:'))
            .toBeLessThan(request.userInstruction.indexOf('Now return exactly one valid JSON object'));
        expect(JSON.stringify(result)).not.toMatch(/E001|evidenceRefs/u);
    });

    it('does not mutate evidence and produces deterministic results', async () => {
        const input = evidence();
        const before = JSON.stringify(input);
        const first = await generateSoxlAiExplanation({ evidence: input }, {
            callProvider: providerReturning(JSON.stringify(explanation())),
        });
        const second = await generateSoxlAiExplanation({ evidence: JSON.parse(before) as SoxlAiEvidencePackage }, {
            callProvider: providerReturning(JSON.stringify(explanation())),
        });

        expect(first).toEqual(second);
        expect(JSON.stringify(input)).toBe(before);
    });

    it.each([
        [new AIProviderError('provider_not_configured', 'gemini'), 'provider_not_configured', 'unknown_provider_error', 'none'],
        [new AIProviderError('provider_timeout', 'gemini'), 'provider_timeout', 'provider_timeout', 'none'],
        [new AIProviderError('provider_http_error', 'gemini', {
            category: 'structured_output_rejected',
            httpStatus: 400,
        }), 'provider_error', 'structured_output_rejected', '400'],
        [new AIProviderError('provider_invalid_response', 'gemini'), 'provider_error', 'invalid_provider_response', 'none'],
        [new Error('raw provider secret'), 'provider_error', 'unknown_provider_error', 'none'],
    ] as const)('maps provider failures safely: %s', async (thrown, issue, category, status) => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const callProvider = vi.fn<SoxlAiProviderCall>().mockRejectedValue(thrown);
        const result = await generateSoxlAiExplanation({ evidence: evidence() }, { callProvider });

        expect(result).toEqual({
            status: 'unavailable',
            explanation: null,
            issues: [issue],
            providerId: thrown instanceof AIProviderError ? thrown.providerId : null,
        });
        expect(warnSpy).toHaveBeenCalledWith(
            `SOXL_AI_PROVIDER_FAILED provider=${thrown instanceof AIProviderError ? thrown.providerId : 'unknown'} category=${category} httpStatus=${status}`,
        );
        expect(JSON.stringify(result)).not.toContain('raw provider secret');
        expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('raw provider secret');
    });

    it.each([
        ['', 'empty_response'],
        ['{bad json', 'invalid_json'],
        [JSON.stringify({ ...explanation(), modelSuppliedProperty: true }), 'unexpected_top_level_fields'],
        [JSON.stringify({ ...explanation(), summary: [modelPoint('Text', ['E999'])] }), 'unknown_evidence_reference'],
        [JSON.stringify({ ...explanation(), summary: [modelPoint('you should buy')] }), 'forbidden_recommendation'],
    ] as const)('maps validation failure without returning raw output: %s', async (rawResponse, issue) => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const result = await generateSoxlAiExplanation({ evidence: evidence() }, {
            callProvider: providerReturning(rawResponse),
        });

        expect(result).toMatchObject({
            status: 'unavailable',
            explanation: null,
            issues: expect.arrayContaining([issue]),
            providerId: 'gemini',
        });
        expect(warnSpy).toHaveBeenCalledTimes(1);
        if (rawResponse.length > 0) {
            expect(JSON.stringify(result)).not.toContain(rawResponse);
            expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(rawResponse);
        }
    });

    it.each([
        ['snapshotIdentity', { providerId: 'model-provider', asOf: 'model-time' }],
        ['snapshotToken', 'model-token'],
        ['provider', 'model-provider'],
        ['providerId', 'model-provider'],
        ['asOf', 'model-time'],
        ['generatedAt', 'model-time'],
    ] as const)('rejects model attempts to author trusted metadata through %s', async (field, value) => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const result = await generateSoxlAiExplanation({ evidence: evidence() }, {
            callProvider: providerReturning(JSON.stringify({
                ...explanation(),
                [field]: value,
            })),
        });

        expect(result).toEqual({
            status: 'unavailable',
            explanation: null,
            issues: ['unexpected_server_metadata_field'],
            providerId: 'gemini',
        });
        expect(warnSpy).toHaveBeenCalledWith(
            `SOXL_AI_RESPONSE_REJECTED provider=gemini reason=unexpected_server_metadata_field field=${field}`,
        );
        expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(String(value));
    });

    it('retains multiple validation issues in deterministic de-duplicated order', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const result = await generateSoxlAiExplanation({ evidence: evidence() }, {
            callProvider: providerReturning(JSON.stringify({
                ...explanation(),
                status: 'partial',
                summary: [
                    modelPoint('Text', ['E999']),
                    modelPoint('More text', ['E998']),
                ],
            })),
        });

        expect(result.issues).toEqual(['unknown_evidence_reference', 'status_mismatch']);
    });

    it('fails before provider invocation when the catalog ceiling is exceeded', async () => {
        const callProvider = providerReturning(JSON.stringify(explanation()));
        const result = await generateSoxlAiExplanation({ evidence: largeEvidence(1_000) }, { callProvider });

        expect(result).toEqual({
            status: 'unavailable',
            explanation: null,
            issues: ['evidence_catalog_too_large'],
            providerId: null,
        });
        expect(callProvider).not.toHaveBeenCalled();
    });

    it('returns validated partial and unavailable explanations with trusted identity', async () => {
        const partialEvidence = evidence('partial', [missingId]);
        const partial = await generateSoxlAiExplanation({ evidence: partialEvidence }, {
            callProvider: providerReturning(JSON.stringify(explanation({
                status: 'partial',
                missingEvidence: [modelPoint('The condition is missing.', ['E002'])],
            }))),
        });
        expect(partial).toMatchObject({ status: 'available', issues: [] });
        expect(partial.explanation?.missingEvidence[0].evidenceIds).toEqual([missingId]);

        const unavailableEvidence = evidence('unavailable', [missingId], { providerId: null, asOf: null });
        const unavailable = await generateSoxlAiExplanation({ evidence: unavailableEvidence }, {
            callProvider: providerReturning(JSON.stringify(explanation({
                status: 'unavailable',
                summary: [modelPoint('Current evidence is unavailable.', ['E002'])],
                missingEvidence: [modelPoint('The current condition is unavailable.', ['E002'])],
                limitations: [modelPoint('Only availability can be explained.', ['E002'])],
            }))),
        });
        expect(unavailable).toMatchObject({ status: 'available', issues: [] });
        expect(unavailable.explanation?.snapshotIdentity).toEqual({ providerId: null, asOf: null });
    });

    it('logs only fixed provider, reason, section, and field diagnostics', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const invalidAlias = 'E999';
        await generateSoxlAiExplanation({ evidence: evidence() }, {
            callProvider: providerReturning(JSON.stringify(explanation({
                supportingEvidence: [{ text: 'generated prose secret', evidenceRefs: [invalidAlias] }],
            }))),
        });

        expect(warnSpy).toHaveBeenCalledWith(
            'SOXL_AI_RESPONSE_REJECTED provider=gemini reason=unknown_evidence_reference section=supportingEvidence field=evidenceRefs',
        );
        const diagnostic = JSON.stringify(warnSpy.mock.calls);
        expect(diagnostic).not.toContain(invalidAlias);
        expect(diagnostic).not.toContain('generated prose secret');
        expect(diagnostic).not.toContain(availableId);
    });

    it('logs the section and field for forbidden scenario selection without model text', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await generateSoxlAiExplanation({ evidence: evidence() }, {
            callProvider: providerReturning(JSON.stringify(explanation({
                limitations: [modelPoint('The preferred scenario is upward.')],
            }))),
        });

        expect(warnSpy).toHaveBeenCalledWith(
            'SOXL_AI_RESPONSE_REJECTED provider=gemini reason=forbidden_scenario_selection section=limitations field=text',
        );
        expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('preferred scenario');
    });

    it('uses the precise section limit diagnostic instead of other_shape_mismatch', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await generateSoxlAiExplanation({ evidence: evidence() }, {
            callProvider: providerReturning(JSON.stringify(explanation({
                supportingEvidence: Array.from(
                    { length: 51 },
                    (_, index) => modelPoint(`Point ${index}`),
                ),
            }))),
        });

        expect(warnSpy).toHaveBeenCalledWith(
            'SOXL_AI_RESPONSE_REJECTED provider=gemini reason=section_too_many section=supportingEvidence',
        );
    });

    it('logs only fixed identifiers and integer counts for evidence-reference count failures', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const input = largeEvidence(21);
        const refs = Array.from({ length: 21 }, (_, index) => `E${String(index + 1).padStart(3, '0')}`);
        await generateSoxlAiExplanation({ evidence: input }, {
            callProvider: providerReturning(JSON.stringify(explanation({
                summary: [{ text: 'generated prose secret', evidenceRefs: refs }],
            }))),
        });

        expect(warnSpy).toHaveBeenCalledWith(
            'SOXL_AI_RESPONSE_REJECTED provider=gemini reason=evidence_refs_too_many section=summary field=evidenceRefs observedCount=21 uniqueCount=21 allowedPromptMaximum=1 validatorMaximum=20',
        );
        const diagnostic = JSON.stringify(warnSpy.mock.calls);
        expect(diagnostic).not.toMatch(/E001|generated prose secret|current\.fact\./u);
    });

    it('rejects model metadata and never authors trusted identity from model output', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const result = await generateSoxlAiExplanation({ evidence: evidence() }, {
            callProvider: providerReturning(JSON.stringify({
                ...explanation(),
                snapshotToken: 'raw-secret',
            })),
        });

        expect(result.issues).toEqual(['unexpected_server_metadata_field']);
        expect(warnSpy).toHaveBeenCalledWith(
            'SOXL_AI_RESPONSE_REJECTED provider=gemini reason=unexpected_server_metadata_field field=snapshotToken',
        );
        expect(JSON.stringify(result)).not.toContain('raw-secret');
    });

    it('classifies fixed allowlisted diagnostics including section', () => {
        expect(classifySoxlAiValidationRejectionReason({
            valid: false,
            value: null,
            issues: ['evidence_refs_missing'],
            reason: 'evidence_refs_missing',
            section: 'summary',
            field: 'evidenceRefs',
        })).toEqual({
            reason: 'evidence_refs_missing',
            section: 'summary',
            field: 'evidenceRefs',
        });
    });

    it('does not call network, clock, or logs when an injected provider succeeds', async () => {
        const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
            throw new Error('Clock use is forbidden');
        });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network use is forbidden')));

        await expect(generateSoxlAiExplanation({ evidence: evidence() }, {
            callProvider: providerReturning(JSON.stringify(explanation())),
        })).resolves.toMatchObject({ status: 'available' });

        expect(dateSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(logSpy).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
