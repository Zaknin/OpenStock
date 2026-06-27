import { describe, expect, it, vi } from 'vitest';
import { AIProviderError } from '@/lib/ai-provider';
import type {
    SoxlAiEvidencePackage,
} from './soxl-ai-evidence';
import type {
    SoxlAiExplanationResponseContract,
} from './soxl-ai-prompt';
import {
    generateSoxlAiExplanation,
    type SoxlAiProviderCall,
} from './soxl-ai-explanation-service.server';

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
    overrides: Partial<SoxlAiExplanationResponseContract> = {},
): SoxlAiExplanationResponseContract {
    return {
        status: 'available',
        snapshotIdentity: {
            providerId,
            asOf: String(asOf),
        },
        summary: [point('The market facts status is available.')],
        supportingEvidence: [],
        conflictingEvidence: [],
        missingEvidence: [],
        tradePlanExplanation: [],
        monitoringChanges: [],
        riskReminders: [],
        limitations: [],
        ...overrides,
    };
}

function providerReturning(value: string): ReturnType<typeof vi.fn<SoxlAiProviderCall>> {
    return vi.fn<SoxlAiProviderCall>().mockResolvedValue(value);
}

describe('generateSoxlAiExplanation', () => {
    it('returns a validated explanation and calls the injected provider once with distinct instructions', async () => {
        const callProvider = providerReturning(JSON.stringify(explanation()));
        const result = await generateSoxlAiExplanation({ evidence: evidence() }, { callProvider });

        expect(result).toEqual({
            status: 'available',
            explanation: explanation(),
            issues: [],
        });
        expect(callProvider).toHaveBeenCalledTimes(1);
        expect(callProvider.mock.calls[0][0].systemInstruction).toContain('Use only the supplied evidence package');
        expect(callProvider.mock.calls[0][0].userInstruction).toContain('BEGIN_SOXL_EVIDENCE_JSON');
        expect(callProvider.mock.calls[0][0].systemInstruction).not.toBe(callProvider.mock.calls[0][0].userInstruction);
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
        });
        expect(JSON.stringify(result)).not.toContain('raw provider secret');
        expect(JSON.stringify(result)).not.toContain('raw thrown secret');
    });

    it.each([
        ['', 'empty_response'],
        ['{bad json', 'invalid_json'],
        [JSON.stringify({ ...explanation(), extra: true }), 'unexpected_response_key'],
        [JSON.stringify({ ...explanation(), summary: [point('Text', ['unknown.id'])] }), 'unknown_evidence_reference'],
        [JSON.stringify({ ...explanation(), summary: [point('you should buy')] }), 'prohibited_content'],
    ] as const)('maps validation failure: %s', async (rawResponse, issue) => {
        const result = await generateSoxlAiExplanation({ evidence: evidence() }, {
            callProvider: providerReturning(rawResponse),
        });

        expect(result.status).toBe('unavailable');
        expect(result.explanation).toBeNull();
        expect(result.issues).toContain(issue);
        if (rawResponse.length > 0) {
            expect(JSON.stringify(result)).not.toContain(rawResponse);
        }
    });

    it('retains multiple validation issues in deterministic de-duplicated order', async () => {
        const result = await generateSoxlAiExplanation({ evidence: evidence() }, {
            callProvider: providerReturning(JSON.stringify({
                ...explanation(),
                status: 'partial',
                snapshotIdentity: { providerId: 'other', asOf: '1' },
                summary: [
                    point('Text', ['missing.one']),
                    point('More text', ['missing.two']),
                ],
            })),
        });

        expect(result.issues).toEqual([
            'unknown_evidence_reference',
            'status_mismatch',
            'snapshot_identity_mismatch',
        ]);
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
                snapshotIdentity: { providerId: null, asOf: null },
                summary: [point('Current evidence is unavailable.', [missingId])],
                missingEvidence: [point('The current condition is unavailable.', [missingId])],
                limitations: [point('Only availability can be explained.', [missingId])],
            }))),
        });
        expect(unavailable).toMatchObject({ status: 'available', issues: [] });
        expect(unavailable.explanation?.status).toBe('unavailable');
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
});
