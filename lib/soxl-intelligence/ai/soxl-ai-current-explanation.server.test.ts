import { describe, expect, it, vi } from 'vitest';
import type {
    SoxlMarketAssessment,
} from '../strategy/soxl-market-assessment';
import type {
    SoxlMarketFacts,
} from '../strategy/soxl-market-facts';
import {
    buildSoxlAiEvidencePackage,
    type SoxlAiEvidencePackage,
} from './soxl-ai-evidence';
import {
    buildSoxlAiCurrentSnapshotToken,
} from './soxl-ai-current-snapshot-token.server';
import type {
    SoxlAiExplanationResponseContract,
} from './soxl-ai-prompt';
import {
    generateCurrentSoxlExplanation,
    type GenerateCurrentSoxlExplanationDependencies,
    type SoxlCurrentDeterministicSnapshot,
} from './soxl-ai-current-explanation.server';

const providerId = 'twelve-data';
const asOf = 1_787_654_321;

function facts(overrides: Partial<SoxlMarketFacts> = {}): SoxlMarketFacts {
    const base: SoxlMarketFacts = {
        status: 'available',
        issue: null,
        providerId,
        asOf,
        coreStatus: 'available',
        sessionStatus: 'available',
        soxl5m: {
            status: 'available',
            latestCompleted: { close: 27, time: asOf - 60 },
            ema9: { value: 26.9, time: asOf - 60 },
            ema20: { value: 26.8, time: asOf - 60 },
            ema50: { value: 26.5, time: asOf - 60 },
            rsi14: { value: 55, time: asOf - 60 },
            atr14: { value: 0.8, time: asOf - 60 },
            macd12269: { line: 0.1, signal: 0.05, histogram: 0.05, time: asOf - 60 },
            latestConfirmedSwingHigh: { price: 28, pivotTime: asOf - 600, confirmedAtTime: asOf - 300 },
            latestConfirmedSwingLow: { price: 26, pivotTime: asOf - 500, confirmedAtTime: asOf - 200 },
            closeVsEma9: 'above',
            closeVsEma20: 'above',
            closeVsEma50: 'above',
            ema9VsEma20: 'above',
            ema20VsEma50: 'above',
            macdLineVsSignal: 'above',
            macdHistogramSign: 'positive',
            closeVsLatestConfirmedSwingHigh: 'below',
            closeVsLatestConfirmedSwingLow: 'above',
        },
        soxlDaily: {
            status: 'available',
            latestCompleted: { close: 27, time: asOf - 86_400 },
            ema20: { value: 25, time: asOf - 86_400 },
            ema50: { value: 24, time: asOf - 86_400 },
            ema200: { value: 22, time: asOf - 86_400 },
            rsi14: { value: 54, time: asOf - 86_400 },
            atr14: { value: 1.5, time: asOf - 86_400 },
            macd12269: { line: 0.8, signal: 0.7, histogram: 0.1, time: asOf - 86_400 },
            latestConfirmedSwingHigh: { price: 30, pivotTime: asOf - 172_800, confirmedAtTime: asOf - 86_400 },
            latestConfirmedSwingLow: { price: 20, pivotTime: asOf - 259_200, confirmedAtTime: asOf - 172_800 },
            closeVsEma20: 'above',
            closeVsEma50: 'above',
            closeVsEma200: 'above',
            ema20VsEma50: 'above',
            ema50VsEma200: 'above',
            macdLineVsSignal: 'above',
            macdHistogramSign: 'positive',
            closeVsLatestConfirmedSwingHigh: 'below',
            closeVsLatestConfirmedSwingLow: 'above',
        },
        qqq5m: {
            status: 'available',
            symbol: 'QQQ',
            latestCompleted: { close: 500, time: asOf - 60 },
            ema20: { value: 499, time: asOf - 60 },
            ema50: { value: 498, time: asOf - 60 },
            rsi14: { value: 52, time: asOf - 60 },
            macd12269: { line: 0.4, signal: 0.3, histogram: 0.1, time: asOf - 60 },
            closeVsEma20: 'above',
            closeVsEma50: 'above',
            ema20VsEma50: 'above',
            macdLineVsSignal: 'above',
            macdHistogramSign: 'positive',
        },
        smh5m: {
            status: 'available',
            symbol: 'SMH',
            latestCompleted: { close: 260, time: asOf - 60 },
            ema20: { value: 259, time: asOf - 60 },
            ema50: { value: 258, time: asOf - 60 },
            rsi14: { value: 51, time: asOf - 60 },
            macd12269: { line: 0.3, signal: 0.2, histogram: 0.1, time: asOf - 60 },
            closeVsEma20: 'above',
            closeVsEma50: 'above',
            ema20VsEma50: 'above',
            macdLineVsSignal: 'above',
            macdHistogramSign: 'positive',
        },
        regularSession: {
            status: 'available',
            latestCompleted: { close: 27, time: asOf - 60 },
            vwap: { value: 26.8, time: asOf - 60 },
            rollingRelativeVolume: { value: 1.1, time: asOf - 60 },
            previousRepresentedSession: {
                high: 28,
                highTime: asOf - 7_200,
                low: 25,
                lowTime: asOf - 6_600,
                usedBars: 78,
                status: 'available',
            },
            openingRange30m: {
                high: 27.5,
                highTime: asOf - 3_000,
                low: 26,
                lowTime: asOf - 2_700,
                usedBars: 6,
                status: 'available',
            },
            latestTradingDate: '2026-06-27',
            previousTradingDate: '2026-06-26',
            latestDateRelation: 'same_exchange_date',
            latestRegularSessionCompleted: false,
            openingRange30mCompleted: true,
            closeVsVwap: 'above',
            closeVsPreviousSessionHigh: 'below',
            closeVsPreviousSessionLow: 'above',
            closeVsOpeningRangeHigh: 'below',
            closeVsOpeningRangeLow: 'above',
        },
    };

    return { ...base, ...overrides };
}

function assessment(overrides: Partial<SoxlMarketAssessment> = {}): SoxlMarketAssessment {
    const base: SoxlMarketAssessment = {
        status: 'available',
        issue: null,
        providerId,
        asOf,
        factsStatus: 'available',
        coreStatus: 'available',
        sessionStatus: 'available',
        openingRangeComplete: true,
        regularSessionComplete: false,
        upwardAlignment: {
            id: 'upward_alignment',
            metCount: 1,
            notMetCount: 0,
            unknownCount: 0,
            knownCount: 1,
            totalCount: 1,
            sections: [{
                id: 'soxl_5m',
                metCount: 1,
                notMetCount: 0,
                unknownCount: 0,
                knownCount: 1,
                totalCount: 1,
                conditions: [{
                    id: 'soxl_5m_price_above_ema20',
                    expected: 'above',
                    actual: 'above',
                    state: 'met',
                }],
            }],
        },
        downwardAlignment: {
            id: 'downward_alignment',
            metCount: 0,
            notMetCount: 1,
            unknownCount: 0,
            knownCount: 1,
            totalCount: 1,
            sections: [{
                id: 'soxl_5m',
                metCount: 0,
                notMetCount: 1,
                unknownCount: 0,
                knownCount: 1,
                totalCount: 1,
                conditions: [{
                    id: 'soxl_5m_price_below_ema20',
                    expected: 'below',
                    actual: 'above',
                    state: 'not_met',
                }],
            }],
        },
    };

    return { ...base, ...overrides };
}

function snapshot(overrides: Partial<SoxlCurrentDeterministicSnapshot> = {}): SoxlCurrentDeterministicSnapshot {
    return {
        facts: facts(),
        assessment: assessment(),
        ...overrides,
    };
}

function explanation(): SoxlAiExplanationResponseContract {
    return {
        status: 'available',
        snapshotIdentity: { providerId, asOf: String(asOf) },
        summary: [{ text: 'Current deterministic evidence is available.', evidenceIds: ['current.market_facts.status'] }],
        supportingEvidence: [],
        conflictingEvidence: [],
        missingEvidence: [],
        riskReminders: [],
        limitations: [],
    };
}

function dependencies(
    overrides: Partial<GenerateCurrentSoxlExplanationDependencies> = {},
): GenerateCurrentSoxlExplanationDependencies & {
    readonly release: ReturnType<typeof vi.fn>;
    readonly service: ReturnType<typeof vi.fn>;
    readonly loader: ReturnType<typeof vi.fn>;
    readonly evidenceBuilder: ReturnType<typeof vi.fn>;
    readonly tokenBuilder: ReturnType<typeof vi.fn>;
} {
    const release = vi.fn();
    const service = vi.fn().mockResolvedValue({
        status: 'available',
        explanation: explanation(),
        issues: [],
        providerId: 'gemini',
    });
    const loader = vi.fn().mockResolvedValue(snapshot());
    const evidenceBuilder = vi.fn(buildSoxlAiEvidencePackage);
    const tokenBuilder = vi.fn(buildSoxlAiCurrentSnapshotToken);

    return {
        release,
        service,
        loader,
        resolveSession: vi.fn().mockResolvedValue({ userId: 'internal-user-id' }),
        acquirePermit: vi.fn().mockReturnValue({ allowed: true, release }),
        loadCurrentSnapshot: loader,
        generateExplanation: service,
        buildEvidence: evidenceBuilder,
        buildSnapshotToken: tokenBuilder,
        evidenceBuilder,
        tokenBuilder,
        ...overrides,
    };
}

function tokenFor(currentSnapshot: SoxlCurrentDeterministicSnapshot = snapshot()): string {
    return buildSoxlAiCurrentSnapshotToken(buildSoxlAiEvidencePackage({
        facts: currentSnapshot.facts,
        assessment: currentSnapshot.assessment,
        plan: null,
        monitor: null,
    }));
}

const validInput = {
    expectedSnapshotToken: tokenFor(),
};

describe('generateCurrentSoxlExplanation', () => {
    it('succeeds for a valid current-only request and returns only the sanitized service result', async () => {
        const deps = dependencies();
        const result = await generateCurrentSoxlExplanation(validInput, deps);

        expect(result).toEqual({
            status: 'available',
            explanation: explanation(),
            issues: [],
            retryAfterSeconds: null,
            snapshotToken: validInput.expectedSnapshotToken,
            providerId: 'gemini',
        });
        expect(deps.loader).toHaveBeenCalledTimes(1);
        expect(deps.service).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(result)).not.toContain('items');
        expect(JSON.stringify(result)).not.toContain('systemInstruction');
        expect(JSON.stringify(result)).not.toContain('internal-user-id');
    });

    it.each([
        { name: 'null input', input: null },
        { name: 'array input', input: [] },
        { name: 'primitive input', input: 'bad' },
        { name: 'empty object', input: {} },
        { name: 'old provider and asOf shape', input: { expectedProviderId: providerId, expectedAsOf: String(asOf) } },
        { name: 'missing snapshot token', input: { expectedSnapshotToken: undefined } },
        { name: 'additional request key', input: { ...validInput, extra: 'bad' } },
        { name: 'blank token', input: { expectedSnapshotToken: '' } },
        { name: 'uppercase token', input: { expectedSnapshotToken: `soxl-current-v1:${'A'.repeat(64)}` } },
        { name: 'missing token prefix', input: { expectedSnapshotToken: 'a'.repeat(64) } },
        { name: 'short token digest', input: { expectedSnapshotToken: `soxl-current-v1:${'a'.repeat(63)}` } },
        { name: 'long token digest', input: { expectedSnapshotToken: `soxl-current-v1:${'a'.repeat(65)}` } },
    ])('rejects $name', async ({ input }) => {
        const deps = dependencies();

        await expect(generateCurrentSoxlExplanation(input, deps)).resolves.toEqual({
            status: 'unavailable',
            explanation: null,
            issues: ['invalid_request'],
            retryAfterSeconds: null,
            snapshotToken: null,
            providerId: null,
        });
        expect(deps.loader).not.toHaveBeenCalled();
        expect(deps.service).not.toHaveBeenCalled();
    });

    it('rejects objects with a non-plain prototype', async () => {
        const deps = dependencies();
        const input = Object.create(null) as Record<string, unknown>;
        input.expectedSnapshotToken = validInput.expectedSnapshotToken;

        await expect(generateCurrentSoxlExplanation(input, deps)).resolves.toMatchObject({
            status: 'unavailable',
            issues: ['invalid_request'],
        });
        expect(deps.loader).not.toHaveBeenCalled();
        expect(deps.service).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated requests without acquiring a guard permit', async () => {
        const deps = dependencies({ resolveSession: vi.fn().mockResolvedValue(null) });

        await expect(generateCurrentSoxlExplanation(validInput, deps)).resolves.toMatchObject({
            status: 'unavailable',
            issues: ['unauthenticated'],
        });
        expect(deps.acquirePermit).not.toHaveBeenCalled();
    });

    it.each([
        ['rate_limited', 30],
        ['request_in_flight', null],
        ['global_capacity_reached', null],
    ] as const)('returns guard rejection %s', async (issue, retryAfterSeconds) => {
        const deps = dependencies({
            acquirePermit: vi.fn().mockReturnValue({ allowed: false, issue, retryAfterSeconds }),
        });

        await expect(generateCurrentSoxlExplanation(validInput, deps)).resolves.toEqual({
            status: 'unavailable',
            explanation: null,
            issues: [issue],
            retryAfterSeconds,
            snapshotToken: null,
            providerId: null,
        });
        expect(deps.loader).not.toHaveBeenCalled();
    });

    it('releases the guard permit after success and after service failure', async () => {
        const successDeps = dependencies();
        await generateCurrentSoxlExplanation(validInput, successDeps);
        expect(successDeps.release).toHaveBeenCalledTimes(1);

        const failureDeps = dependencies({
            generateExplanation: vi.fn().mockResolvedValue({
                status: 'unavailable',
                explanation: null,
                issues: ['provider_error'],
                providerId: 'gemini',
            }),
        });
        await generateCurrentSoxlExplanation(validInput, failureDeps);
        expect(failureDeps.release).toHaveBeenCalledTimes(1);
    });

    it('releases the guard permit after a dependency throws', async () => {
        const thrownLoader = vi.fn().mockRejectedValue(new Error('dependency failure'));
        const deps = dependencies({ loadCurrentSnapshot: thrownLoader });

        await expect(generateCurrentSoxlExplanation(validInput, deps)).rejects.toThrow('dependency failure');
        expect(thrownLoader).toHaveBeenCalledTimes(1);
        expect(deps.release).toHaveBeenCalledTimes(1);
        expect(deps.service).not.toHaveBeenCalled();
    });

    it('rejects facts and assessment provider mismatch as current data unavailable', async () => {
        const deps = dependencies({
            loadCurrentSnapshot: vi.fn().mockResolvedValue(snapshot({
                assessment: assessment({ providerId: 'different-provider' }),
            })),
        });

        await expect(generateCurrentSoxlExplanation(validInput, deps)).resolves.toMatchObject({
            status: 'unavailable',
            issues: ['current_data_unavailable'],
        });
        expect(deps.service).not.toHaveBeenCalled();
    });

    it('rejects facts and assessment asOf mismatch as current data unavailable', async () => {
        const deps = dependencies({
            loadCurrentSnapshot: vi.fn().mockResolvedValue(snapshot({
                assessment: assessment({ asOf: asOf + 1 }),
            })),
        });

        await expect(generateCurrentSoxlExplanation(validInput, deps)).resolves.toMatchObject({
            status: 'unavailable',
            issues: ['current_data_unavailable'],
        });
        expect(deps.service).not.toHaveBeenCalled();
    });

    it('rejects changed deterministic evidence without calling the service', async () => {
        const baseFacts = facts();
        const changedSnapshot = snapshot({
            facts: facts({
                soxl5m: {
                    ...baseFacts.soxl5m,
                    latestCompleted: {
                        ...baseFacts.soxl5m.latestCompleted,
                        close: 28,
                    },
                },
            }),
        });
        const deps = dependencies({
            loadCurrentSnapshot: vi.fn().mockResolvedValue(changedSnapshot),
        });

        await expect(generateCurrentSoxlExplanation(validInput, deps)).resolves.toMatchObject({
            status: 'unavailable',
            issues: ['stale_snapshot'],
            snapshotToken: null,
        });
        expect(deps.service).not.toHaveBeenCalled();
    });

    it('accepts the same deterministic evidence when request-time asOf changes', async () => {
        const shiftedSnapshot = snapshot({
            facts: facts({ asOf: asOf + 60 }),
            assessment: assessment({ asOf: asOf + 60 }),
        });
        const deps = dependencies({
            loadCurrentSnapshot: vi.fn().mockResolvedValue(shiftedSnapshot),
        });

        await expect(generateCurrentSoxlExplanation(validInput, deps)).resolves.toMatchObject({
            status: 'available',
            snapshotToken: validInput.expectedSnapshotToken,
        });
        expect(deps.service).toHaveBeenCalledTimes(1);
    });

    it('passes current server-built evidence with null plan and monitor scope to the service', async () => {
        const deps = dependencies();
        await generateCurrentSoxlExplanation(validInput, deps);

        const evidence = deps.service.mock.calls[0][0] as SoxlAiEvidencePackage;
        expect(evidence.groups.planAssumptions).toEqual([]);
        expect(evidence.groups.planCalculations).toEqual([]);
        expect(evidence.groups.executionAssumptions).toEqual([]);
        expect(evidence.groups.monitoringCalculations).toEqual([]);
        expect(evidence.snapshotIdentities.map((identity) => identity.role)).toEqual(['current']);
        expect(evidence.items.some((item) => item.id.startsWith('plan.'))).toBe(false);
        expect(evidence.items.some((item) => item.id.startsWith('monitor.'))).toBe(false);
        expect(deps.evidenceBuilder).toHaveBeenCalledTimes(1);
        expect(deps.tokenBuilder).toHaveBeenCalledTimes(1);
        expect(deps.tokenBuilder.mock.calls[0][0]).toBe(evidence);
        expect(deps.service.mock.calls[0][0]).toBe(evidence);
    });

    it('returns sanitized service failures without raw provider details', async () => {
        const deps = dependencies({
            generateExplanation: vi.fn().mockResolvedValue({
                status: 'unavailable',
                explanation: null,
                issues: ['provider_error', 'root_not_object'],
                providerId: 'gemini',
                raw: 'secret',
            }),
        });

        const result = await generateCurrentSoxlExplanation(validInput, deps);

        expect(result).toEqual({
            status: 'unavailable',
            explanation: null,
            issues: ['provider_error', 'root_not_object'],
            retryAfterSeconds: null,
            snapshotToken: null,
            providerId: 'gemini',
        });
        expect(JSON.stringify(result)).not.toContain('secret');
    });

    it('is deterministic for equivalent inputs and does not log', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            const first = await generateCurrentSoxlExplanation(validInput, dependencies());
            const second = await generateCurrentSoxlExplanation({ ...validInput }, dependencies());

            expect(first).toEqual(second);
            expect(logSpy).not.toHaveBeenCalled();
            expect(warnSpy).not.toHaveBeenCalled();
            expect(errorSpy).not.toHaveBeenCalled();
        } finally {
            logSpy.mockRestore();
            warnSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it('does not mutate the current deterministic snapshot', async () => {
        const currentSnapshot = snapshot();
        const before = JSON.stringify(currentSnapshot);
        const loader = vi.fn().mockResolvedValue(currentSnapshot);
        const deps = dependencies({ loadCurrentSnapshot: loader });

        await generateCurrentSoxlExplanation(validInput, deps);

        expect(loader).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(currentSnapshot)).toBe(before);
    });
});
