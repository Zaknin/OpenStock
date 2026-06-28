import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    AIProviderError,
    type AIProviderName,
} from '@/lib/ai-provider';
import type {
    SoxlAiEvidencePackage,
} from './soxl-ai-evidence';
import type {
    SoxlAiExplanationResponse,
    SoxlAiModelExplanation,
} from './soxl-ai-prompt';
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
        snapshotIdentities: [
            {
                role: 'current',
                providerId: identity.providerId,
                asOf: identity.asOf,
                factsStatus: status,
                assessmentStatus: status,
                coreStatus: status,
                sessionStatus: status,
                openingRangeComplete: null,
                regularSessionComplete: null,
            },
        ],
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

function point(text: string, ids: readonly string[] = [availableId]) {
    return { text, evidenceIds: ids };
}

function explanation(
    overrides: Partial<SoxlAiModelExplanation> = {},
): SoxlAiModelExplanation {
    return {
        status: 'available',
        summary: [point('The market facts status is available.')],
        supportingEvidence: [],
        conflictingEvidence: [],
        missingEvidence: [],
        riskReminders: [],
        limitations: [],
        ...overrides,
    };
}

function applicationExplanation(
    content: SoxlAiModelExplanation = explanation(),
    identity: SoxlAiExplanationResponse['snapshotIdentity'] = {
        providerId,
        asOf: String(asOf),
    },
): SoxlAiExplanationResponse {
    return {
        ...content,
        snapshotIdentity: identity,
    };
}

function providerReturning(
    value: string,
    provider: AIProviderName = 'gemini',
): ReturnType<typeof vi.fn<SoxlAiProviderCall>> {
    return vi.fn<SoxlAiProviderCall>().mockResolvedValue({
        providerId: provider,
        text: value,
    });
}

describe('generateSoxlAiExplanation', () => {
    it('returns a validated explanation and calls the injected provider once with distinct instructions', async () => {
        const callProvider = providerReturning(JSON.stringify(explanation()));
        const result = await generateSoxlAiExplanation({ evidence: evidence() }, { callProvider });

        expect(result).toEqual({
            status: 'available',
            explanation: applicationExplanation(),
            issues: [],
            providerId: 'gemini',
        });
        expect(callProvider).toHaveBeenCalledTimes(1);
        expect(callProvider.mock.calls[0][0].systemInstruction).toContain('Use only the supplied evidence package');
        expect(callProvider.mock.calls[0][0].userInstruction).toContain('BEGIN_SOXL_EVIDENCE_JSON');
        expect(callProvider.mock.calls[0][0].systemInstruction).not.toBe(callProvider.mock.calls[0][0].userInstruction);
        expect(callProvider.mock.calls[0][0].responseFormat).toMatchObject({
            mimeType: 'application/json',
            schema: {
                type: 'OBJECT',
                required: expect.arrayContaining([
                    'status',
                    'summary',
                    'supportingEvidence',
                    'conflictingEvidence',
                    'missingEvidence',
                    'riskReminders',
                    'limitations',
                ]),
                properties: expect.not.objectContaining({
                    snapshotIdentity: expect.anything(),
                    snapshotToken: expect.anything(),
                    providerId: expect.anything(),
                    asOf: expect.anything(),
                }),
            },
        });
        expect(result.explanation?.snapshotIdentity).toEqual({
            providerId,
            asOf: String(asOf),
        });
    });

    it('does not mutate evidence and gives deterministic results for equivalent inputs', async () => {
        const packageEvidence = evidence();
        const before = JSON.stringify(packageEvidence);
        const first = await generateSoxlAiExplanation({ evidence: packageEvidence }, {
            callProvider: providerReturning(JSON.stringify(explanation())),
        });
        const second = await generateSoxlAiExplanation({ evidence: JSON.parse(before) as SoxlAiEvidencePackage }, {
            callProvider: providerReturning(JSON.stringify(explanation())),
        });

        expect(JSON.stringify(packageEvidence)).toBe(before);
        expect(first).toEqual(second);
    });

    it.each([
        [new AIProviderError('provider_not_configured', 'gemini'), 'provider_not_configured'],
        [new AIProviderError('provider_timeout', 'gemini'), 'provider_timeout'],
        [new AIProviderError('provider_http_error', 'gemini'), 'provider_error'],
        [new Error('raw provider secret'), 'provider_error'],
        ['raw thrown secret', 'provider_error'],
    ] as const)('maps provider failure safely: %s', async (thrown, issue) => {
        const callProvider = vi.fn<SoxlAiProviderCall>().mockRejectedValue(thrown);
        const result = await generateSoxlAiExplanation({ evidence: evidence() }, { callProvider });

        expect(result).toEqual({
            status: 'unavailable',
            explanation: null,
            issues: [issue],
            providerId: thrown instanceof AIProviderError ? thrown.providerId : null,
        });
        expect(JSON.stringify(result)).not.toContain('raw provider secret');
        expect(JSON.stringify(result)).not.toContain('raw thrown secret');
    });

    it.each([
        ['', 'empty_response'],
        ['{bad json', 'invalid_json'],
        [JSON.stringify({ ...explanation(), modelSuppliedProperty: true }), 'unexpected_top_level_fields'],
        [JSON.stringify({ ...explanation(), summary: [point('Text', ['unknown.id'])] }), 'unknown_evidence_reference'],
        [JSON.stringify({ ...explanation(), summary: [point('you should buy')] }), 'forbidden_recommendation'],
    ] as const)('maps validation failure: %s', async (rawResponse, issue) => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const result = await generateSoxlAiExplanation({ evidence: evidence() }, {
            callProvider: providerReturning(rawResponse),
        });

        expect(result.status).toBe('unavailable');
        expect(result.explanation).toBeNull();
        expect(result.issues).toContain(issue);
        expect(result.providerId).toBe('gemini');
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0]).toEqual([
            expect.stringMatching(/^SOXL_AI_RESPONSE_REJECTED provider=gemini reason=/u),
        ]);
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

    it('composes market identity from evidence and AI provider identity from invocation', async () => {
        const packageEvidence = evidence('available', [], {
            providerId: 'trusted-market-provider',
            asOf: 1_700_000_000_000,
        });
        const result = await generateSoxlAiExplanation({ evidence: packageEvidence }, {
            callProvider: providerReturning(JSON.stringify(explanation()), 'gemini'),
        });

        expect(result.providerId).toBe('gemini');
        expect(result.explanation?.snapshotIdentity).toEqual({
            providerId: 'trusted-market-provider',
            asOf: '1700000000000',
        });
        expect(JSON.stringify(result.explanation)).not.toContain('model-provider');
        expect(JSON.stringify(result.explanation)).not.toContain('model-time');
    });

    it('retains multiple validation issues in deterministic de-duplicated order', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const result = await generateSoxlAiExplanation({ evidence: evidence() }, {
            callProvider: providerReturning(JSON.stringify({
                ...explanation(),
                status: 'partial',
                summary: [
                    point('Text', ['missing.one']),
                    point('More text', ['missing.two']),
                ],
            })),
        });

        expect(result.issues).toEqual([
            'unknown_evidence_reference',
            'status_mismatch',
        ]);
        expect(result.providerId).toBe('gemini');
    });

    it('returns validated partial and unavailable explanations', async () => {
        const partialEvidence = evidence('partial', [missingId]);
        const partial = await generateSoxlAiExplanation({ evidence: partialEvidence }, {
            callProvider: providerReturning(JSON.stringify(explanation({
                status: 'partial',
                missingEvidence: [point('The condition state is missing.', [missingId])],
            }))),
        });
        expect(partial).toMatchObject({ status: 'available', issues: [] });
        expect(partial.explanation?.status).toBe('partial');

        const unavailableEvidence = evidence('unavailable', [missingId], { providerId: null, asOf: null });
        const unavailable = await generateSoxlAiExplanation({ evidence: unavailableEvidence }, {
            callProvider: providerReturning(JSON.stringify(explanation({
                status: 'unavailable',
                summary: [point('Current evidence is unavailable.', [missingId])],
                missingEvidence: [point('The current condition is unavailable.', [missingId])],
                limitations: [point('Only availability can be explained.', [missingId])],
            }))),
        });
        expect(unavailable).toMatchObject({ status: 'available', issues: [] });
        expect(unavailable.explanation?.status).toBe('unavailable');
        expect(unavailable.explanation?.snapshotIdentity).toEqual({
            providerId: null,
            asOf: null,
        });
    });

    it('does not log, use the system clock, persist, or call network when a dependency is injected', async () => {
        const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
            throw new Error('Date.now should not be called');
        });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network should not be called')));

        await expect(generateSoxlAiExplanation({ evidence: evidence() }, {
            callProvider: providerReturning(JSON.stringify(explanation())),
        })).resolves.toMatchObject({ status: 'available' });

        expect(dateNowSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(logSpy).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('classifies validation rejection with fixed non-sensitive reason codes', () => {
        expect(classifySoxlAiValidationRejectionReason({
            valid: false,
            value: null,
            issues: ['missing_required_item_field'],
            reason: 'missing_required_item_field',
            field: 'evidenceIds',
        })).toEqual({
            reason: 'missing_required_item_field',
            field: 'evidenceIds',
        });
    });

    it('logs only the fixed reason and allowlisted field for structural rejection', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const unknownProperty = 'modelGeneratedUnknownProperty';
        await generateSoxlAiExplanation({ evidence: evidence() }, {
            callProvider: providerReturning(JSON.stringify({
                ...explanation(),
                summary: [{ text: 'Generated prose.', evidenceIds: [availableId], [unknownProperty]: true }],
            })),
        });

        expect(warnSpy).toHaveBeenCalledWith(
            'SOXL_AI_RESPONSE_REJECTED provider=gemini reason=other_shape_mismatch',
        );
        expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(unknownProperty);
        expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('Generated prose');
    });

    it('logs an allowlisted field when a required nested field is missing', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await generateSoxlAiExplanation({ evidence: evidence() }, {
            callProvider: providerReturning(JSON.stringify({
                ...explanation(),
                summary: [{ text: 'Generated prose.' }],
            })),
        });

        expect(warnSpy).toHaveBeenCalledWith(
            'SOXL_AI_RESPONSE_REJECTED provider=gemini reason=missing_required_item_field field=evidenceIds',
        );
        expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('Generated prose');
    });

    it('does not include prompt, evidence, output, token, user, or credential data in validation diagnostics', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const rawResponse = JSON.stringify({
            ...explanation(),
            modelSuppliedCredentialProperty: 'bad',
            summary: [point('raw-model-output-secret with token soxl-current-v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')],
        });

        await generateSoxlAiExplanation({ evidence: evidence() }, {
            callProvider: providerReturning(rawResponse),
        });

        const diagnostic = JSON.stringify(warnSpy.mock.calls);
        expect(diagnostic).toContain('SOXL_AI_RESPONSE_REJECTED provider=gemini reason=');
        expect(diagnostic).not.toContain('raw-model-output-secret');
        expect(diagnostic).not.toContain('BEGIN_SOXL_EVIDENCE_JSON');
        expect(diagnostic).not.toContain('current.market_facts.status');
        expect(diagnostic).not.toContain('soxl-current-v1:');
        expect(diagnostic).not.toContain('user');
        expect(diagnostic).not.toContain('credential');
        expect(diagnostic).not.toContain('modelSuppliedCredentialProperty');
    });
});
