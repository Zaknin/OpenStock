import { describe, expect, it, vi } from 'vitest';
import {
    buildSoxlAiEvidencePackage,
    type SoxlAiEvidenceItem,
} from './soxl-ai-evidence';
import {
    buildSoxlAiEvidenceReferenceCatalog,
    buildSoxlAiFormatterEvidencePackage,
    buildSoxlAiModelEvidencePackage,
} from './soxl-ai-evidence-reference-catalog.server';
import { buildSoxlAiModelExplanationResponseFormat, buildSoxlAiPrompt } from './soxl-ai-prompt';
import { validateSoxlAiModelExplanation } from './soxl-ai-response-validator';
import {
    createSoxlAiLocalProviderRouteResolver,
    type SoxlAiHttpRequest,
} from './soxl-ai-local-provider-router.server';
import type {
    SoxlAssessmentSection,
    SoxlConditionAssessment,
    SoxlMarketAssessment,
    SoxlScenarioAssessment,
} from '../strategy/soxl-market-assessment';
import type {
    NumericRelation,
    NumericSign,
    SoxlMarketFacts,
} from '../strategy/soxl-market-facts';
import type {
    SoxlTradePlan,
} from '../planning/soxl-trade-plan';
import type {
    SoxlLiveTradeMonitor,
} from '../monitoring/soxl-live-trade-monitor';

const asOf = 1_787_654_321_123;
const laterAsOf = asOf + 300_000;

function relationCondition(
    id: SoxlConditionAssessment['id'],
    actual: NumericRelation,
    expected: 'above' | 'below',
    state: SoxlConditionAssessment['state'] = actual === 'unavailable' ? 'unknown' : 'met',
): SoxlConditionAssessment {
    return {
        id,
        actual,
        expected,
        state,
    };
}

function signCondition(
    id: SoxlConditionAssessment['id'],
    actual: NumericSign,
    expected: 'positive' | 'negative',
    state: SoxlConditionAssessment['state'] = actual === 'unavailable' ? 'unknown' : 'met',
): SoxlConditionAssessment {
    return {
        id,
        actual,
        expected,
        state,
    };
}

function section(
    id: SoxlAssessmentSection['id'],
    conditions: readonly SoxlConditionAssessment[],
): SoxlAssessmentSection {
    const unknownCount = conditions.filter((condition) => condition.state === 'unknown').length;
    const metCount = conditions.filter((condition) => condition.state === 'met').length;
    const notMetCount = conditions.filter((condition) => condition.state === 'not_met').length;

    return {
        id,
        conditions,
        metCount,
        notMetCount,
        unknownCount,
        knownCount: conditions.length - unknownCount,
        totalCount: conditions.length,
    };
}

function scenario(
    id: SoxlScenarioAssessment['id'],
    sections: readonly SoxlAssessmentSection[],
): SoxlScenarioAssessment {
    return {
        id,
        sections,
        metCount: sections.reduce((sum, item) => sum + item.metCount, 0),
        notMetCount: sections.reduce((sum, item) => sum + item.notMetCount, 0),
        unknownCount: sections.reduce((sum, item) => sum + item.unknownCount, 0),
        knownCount: sections.reduce((sum, item) => sum + item.knownCount, 0),
        totalCount: sections.reduce((sum, item) => sum + item.totalCount, 0),
    };
}

function upwardScenario(
    conditions: readonly SoxlConditionAssessment[] = [
        relationCondition('soxl_5m_price_above_ema20', 'above', 'above'),
        signCondition('soxl_5m_macd_histogram_positive', 'positive', 'positive'),
    ],
): SoxlScenarioAssessment {
    return scenario('upward_alignment', [
        section('soxl_5m', conditions),
        section('regular_session', [
            relationCondition('regular_session_price_above_vwap', 'above', 'above'),
        ]),
    ]);
}

function downwardScenario(): SoxlScenarioAssessment {
    return scenario('downward_alignment', [
        section('soxl_5m', [
            relationCondition('soxl_5m_price_below_ema20', 'above', 'below', 'not_met'),
            signCondition('soxl_5m_macd_histogram_negative', 'positive', 'negative', 'not_met'),
        ]),
        section('regular_session', [
            relationCondition('regular_session_price_below_vwap', 'above', 'below', 'not_met'),
        ]),
    ]);
}

function facts(overrides: Partial<SoxlMarketFacts> = {}): SoxlMarketFacts {
    const base: SoxlMarketFacts = {
        status: 'available',
        issue: null,
        providerId: 'twelve-data',
        asOf,
        coreStatus: 'available',
        sessionStatus: 'available',
        soxl5m: {
            status: 'available',
            latestCompleted: { close: 27.123456789, time: asOf - 60_000 },
            ema9: { value: 26.9, time: asOf - 60_000 },
            ema20: { value: 26.75, time: asOf - 60_000 },
            ema50: { value: 26.1, time: asOf - 60_000 },
            rsi14: { value: 61.23456789, time: asOf - 60_000 },
            atr14: { value: 0.87654321, time: asOf - 60_000 },
            macd12269: { line: 0.12, signal: 0.08, histogram: 0.04, time: asOf - 60_000 },
            latestConfirmedSwingHigh: { price: 28.2, pivotTime: asOf - 900_000, confirmedAtTime: asOf - 600_000 },
            latestConfirmedSwingLow: { price: 25.4, pivotTime: asOf - 800_000, confirmedAtTime: asOf - 500_000 },
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
            latestCompleted: { close: 27.01, time: asOf - 86_400_000 },
            ema20: { value: 25.5, time: asOf - 86_400_000 },
            ema50: { value: 24.9, time: asOf - 86_400_000 },
            ema200: { value: 22.4, time: asOf - 86_400_000 },
            rsi14: { value: 57.2, time: asOf - 86_400_000 },
            atr14: { value: 1.92, time: asOf - 86_400_000 },
            macd12269: { line: 0.8, signal: 0.7, histogram: 0.1, time: asOf - 86_400_000 },
            latestConfirmedSwingHigh: { price: 30.3, pivotTime: asOf - 172_800_000, confirmedAtTime: asOf - 86_400_000 },
            latestConfirmedSwingLow: { price: 21.1, pivotTime: asOf - 259_200_000, confirmedAtTime: asOf - 172_800_000 },
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
            latestCompleted: { close: 501.25, time: asOf - 60_000 },
            ema20: { value: 500.5, time: asOf - 60_000 },
            ema50: { value: 499.3, time: asOf - 60_000 },
            rsi14: { value: 55.5, time: asOf - 60_000 },
            macd12269: { line: 1.2, signal: 1.1, histogram: 0.1, time: asOf - 60_000 },
            closeVsEma20: 'above',
            closeVsEma50: 'above',
            ema20VsEma50: 'above',
            macdLineVsSignal: 'above',
            macdHistogramSign: 'positive',
        },
        smh5m: {
            status: 'available',
            symbol: 'SMH',
            latestCompleted: { close: 260.25, time: asOf - 60_000 },
            ema20: { value: 260, time: asOf - 60_000 },
            ema50: { value: 259, time: asOf - 60_000 },
            rsi14: { value: 53.5, time: asOf - 60_000 },
            macd12269: { line: 0.5, signal: 0.45, histogram: 0.05, time: asOf - 60_000 },
            closeVsEma20: 'above',
            closeVsEma50: 'above',
            ema20VsEma50: 'above',
            macdLineVsSignal: 'above',
            macdHistogramSign: 'positive',
        },
        regularSession: {
            status: 'available',
            latestCompleted: { close: 27.123456789, time: asOf - 60_000 },
            vwap: { value: 26.88, time: asOf - 60_000 },
            rollingRelativeVolume: { value: 1.23456789, time: asOf - 60_000 },
            previousRepresentedSession: {
                high: 28.5,
                highTime: asOf - 7_200_000,
                low: 25.8,
                lowTime: asOf - 6_600_000,
                status: 'available',
                usedBars: 78,
            },
            openingRange30m: {
                high: 27.5,
                highTime: asOf - 3_000_000,
                low: 26.2,
                lowTime: asOf - 2_700_000,
                status: 'available',
                usedBars: 6,
            },
            latestTradingDate: '2026-06-26',
            previousTradingDate: '2026-06-25',
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
    const up = upwardScenario();
    const down = downwardScenario();

    return {
        status: 'available',
        providerId: 'twelve-data',
        asOf,
        factsStatus: 'available',
        coreStatus: 'available',
        sessionStatus: 'available',
        issue: null,
        upwardAlignment: up,
        downwardAlignment: down,
        openingRangeComplete: true,
        regularSessionComplete: false,
        ...overrides,
    };
}

function plan(overrides: Partial<SoxlTradePlan> = {}): SoxlTradePlan {
    const base: SoxlTradePlan = {
        status: 'available',
        issue: null,
        assessmentContext: {
            providerId: 'twelve-data',
            asOf: asOf - 300_000,
            status: 'available',
            factsStatus: 'available',
            coreStatus: 'available',
            sessionStatus: 'available',
            issue: null,
            openingRangeComplete: true,
            regularSessionComplete: false,
            upwardAlignment: { metCount: 3, notMetCount: 0, unknownCount: 0, knownCount: 3, totalCount: 3 },
            downwardAlignment: { metCount: 0, notMetCount: 3, unknownCount: 0, knownCount: 3, totalCount: 3 },
        },
        side: 'long',
        entryPrice: 27.12,
        invalidationPrice: 25.9,
        maximumLossAmount: 500,
        estimatedEntryFee: 1.25,
        estimatedInvalidationExitFee: 1.25,
        quantityIncrement: 0.001,
        maximumPositionValue: 2_500,
        calculation: {
            riskPerUnit: 1.22,
            estimatedInvalidationFees: 2.5,
            riskBudgetAfterFees: 497.5,
            rawRiskLimitedQuantity: 407.78688524590166,
            rawPositionValueLimitedQuantity: 92.18289085545723,
            rawMaximumQuantity: 92.18289085545723,
            maximumQuantity: 92.182,
            quantityIncrement: 0.001,
            bindingLimit: 'position_value',
            entryNotional: 2499.97584,
            grossLossAtInvalidation: 112.46204,
            estimatedLossAtInvalidation: 114.96204,
            unusedLossBudget: 385.03796,
        },
        targets: [
            {
                id: 'target-1',
                price: 29.5,
                estimatedExitFee: 1.5,
                status: 'available',
                issue: null,
                rewardPerUnit: 2.38,
                grossProfitAtMaximumQuantity: 219.39316,
                estimatedNetProfitAtMaximumQuantity: 216.64316,
                priceRewardToRiskMultiple: 1.9508196721311475,
            },
            {
                id: 'target-2',
                price: 31,
                estimatedExitFee: 1.5,
                status: 'available',
                issue: null,
                rewardPerUnit: 3.88,
                grossProfitAtMaximumQuantity: 357.26616,
                estimatedNetProfitAtMaximumQuantity: 354.51616,
                priceRewardToRiskMultiple: 3.180327868852459,
            },
        ],
    };

    return { ...base, ...overrides };
}

function monitor(overrides: Partial<SoxlLiveTradeMonitor> = {}): SoxlLiveTradeMonitor {
    const base: SoxlLiveTradeMonitor = {
        status: 'available',
        issues: [],
        providerId: 'twelve-data',
        baselineAsOf: asOf - 300_000,
        currentAsOf: asOf,
        currentFactsStatus: 'available',
        currentAssessmentStatus: 'available',
        side: 'long',
        executionPrice: 27.2,
        executedQuantity: 90,
        actualEntryFee: 1.25,
        estimatedCurrentExitFee: 1.5,
        priceMonitoring: {
            status: 'available',
            source: 'completed_soxl_five_minute_candle',
            currentPrice: 28.1,
            currentPriceTimestamp: asOf - 60_000,
            entryNotional: 2448,
            currentNotional: 2529,
            priceMovePerUnit: 0.9,
            grossUnrealizedPnl: 81,
            estimatedNetUnrealizedPnl: 78.25,
            estimatedNetReturnOnEntryNotional: 0.0319640522875817,
            initialRiskPerUnit: 1.3,
            priceMoveInInitialRiskUnits: 0.6923076923076923,
            invalidationPrice: 25.9,
            invalidationState: 'not_reached',
            remainingDistanceToInvalidationPerUnit: 2.2,
        },
        quantityComparison: {
            executedQuantity: 90,
            calculatedMaximumQuantity: 92.182,
            quantityUsageState: 'below_calculated_maximum',
            quantityDifference: -2.182,
        },
        targets: [
            {
                id: 'target-1',
                planStatus: 'available',
                planIssue: null,
                price: 29.5,
                estimatedExitFee: 1.5,
                rewardPerUnit: 2.38,
                grossProfitAtMaximumQuantity: 219.39316,
                estimatedNetProfitAtMaximumQuantity: 216.64316,
                priceRewardToRiskMultiple: 1.9508196721311475,
                monitoringStatus: 'available',
                targetState: 'not_reached',
                remainingDistanceToTargetPerUnit: 1.4,
            },
            {
                id: 'target-2',
                planStatus: 'available',
                planIssue: null,
                price: 31,
                estimatedExitFee: 1.5,
                rewardPerUnit: 3.88,
                grossProfitAtMaximumQuantity: 357.26616,
                estimatedNetProfitAtMaximumQuantity: 354.51616,
                priceRewardToRiskMultiple: 3.180327868852459,
                monitoringStatus: 'available',
                targetState: 'not_reached',
                remainingDistanceToTargetPerUnit: 2.9,
            },
        ],
        assessmentComparison: {
            status: 'available',
            scenarios: [
                {
                    id: 'upward_alignment',
                    unchangedMetCount: 2,
                    unchangedNotMetCount: 0,
                    unchangedUnknownCount: 0,
                    becameMetCount: 1,
                    becameNotMetCount: 0,
                    becameUnknownCount: 0,
                    changedCount: 1,
                    totalCount: 3,
                    sections: [
                        {
                            id: 'soxl_5m',
                            unchangedMetCount: 1,
                            unchangedNotMetCount: 0,
                            unchangedUnknownCount: 0,
                            becameMetCount: 1,
                            becameNotMetCount: 0,
                            becameUnknownCount: 0,
                            changedCount: 1,
                            totalCount: 2,
                            conditions: [
                                {
                                    scenarioId: 'upward_alignment',
                                    sectionId: 'soxl_5m',
                                    conditionId: 'soxl_5m_price_above_ema20',
                                    expected: 'above',
                                    baselineActual: 'below',
                                    baselineState: 'not_met',
                                    currentActual: 'above',
                                    currentState: 'met',
                                    changeState: 'became_met',
                                },
                                {
                                    scenarioId: 'upward_alignment',
                                    sectionId: 'soxl_5m',
                                    conditionId: 'soxl_5m_macd_histogram_positive',
                                    expected: 'positive',
                                    baselineActual: 'positive',
                                    baselineState: 'met',
                                    currentActual: 'positive',
                                    currentState: 'met',
                                    changeState: 'unchanged_met',
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    };

    return { ...base, ...overrides };
}

function itemById(items: readonly SoxlAiEvidenceItem[], id: string): SoxlAiEvidenceItem {
    const item = items.find((candidate) => candidate.id === id);
    expect(item, id).toBeDefined();

    return item as SoxlAiEvidenceItem;
}

function allKeys(value: unknown): readonly string[] {
    if (value === null || typeof value !== 'object') {
        return [];
    }

    if (Array.isArray(value)) {
        return value.flatMap(allKeys);
    }

    return Object.entries(value).flatMap(([key, nested]) => [key, ...allKeys(nested)]);
}

describe('buildSoxlAiEvidencePackage', () => {
    it('keeps a production-shaped formatter request compact and validator-safe', async () => {
        const result = buildSoxlAiEvidencePackage({
            facts: facts(),
            assessment: assessment(),
            plan: null,
            monitor: null,
        });
        const catalogResult = buildSoxlAiEvidenceReferenceCatalog(result);
        if (!catalogResult.ok) {
            throw new Error(catalogResult.issue);
        }
        const catalog = catalogResult.catalog;
        const prompt = buildSoxlAiPrompt(result, catalog);
        const formatterEvidence = buildSoxlAiFormatterEvidencePackage(result, catalog);
        const fullEvidence = buildSoxlAiModelEvidencePackage(result, catalog);
        const policy = {
            allowedRefs: formatterEvidence.sectionEvidenceRefs,
            maxRefs: formatterEvidence.sectionEvidenceRefMaximums,
        };
        const firstRef = formatterEvidence.items[0]?.ref;
        if (firstRef === undefined) {
            throw new Error('Expected compact formatter evidence');
        }
        const modelResponse = JSON.stringify({
            status: 'available',
            summary: [{
                text: 'The supplied current evidence state is available.',
                evidenceRefs: [firstRef],
            }],
            supportingEvidence: [],
            conflictingEvidence: [],
            missingEvidence: [],
            riskReminders: [],
            limitations: [],
        });
        let requestBody = '';
        const request: SoxlAiHttpRequest = async (input) => {
            requestBody = input.body ?? '';
            return {
                status: 200,
                body: JSON.stringify({
                    choices: [{ finish_reason: 'stop', message: { content: modelResponse } }],
                }),
            };
        };
        vi.stubEnv('SOXL_AI_FALLBACK_MAX_REQUEST_BYTES', '96000');
        vi.stubEnv('SOXL_AI_FALLBACK_MAX_TOKENS', '1024');
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const route = await createSoxlAiLocalProviderRouteResolver({ request })();
        const response = await route.attempts[0].call({
            systemInstruction: prompt.systemInstruction,
            userInstruction: prompt.userInstruction,
            responseMimeType: 'application/json',
            responseFormat: buildSoxlAiModelExplanationResponseFormat(),
            requestMetadata: {
                systemInstructionChars: prompt.systemInstruction.length,
                userInstructionChars: prompt.userInstruction.length,
                evidenceItemCount: formatterEvidence.items.length,
            },
        });
        const compactSerializedEvidence = JSON.stringify(formatterEvidence, null, 2);
        const fullUserInstruction = prompt.userInstruction.replace(
            compactSerializedEvidence,
            JSON.stringify(fullEvidence, null, 2),
        );
        const fullRequest = JSON.parse(requestBody) as { messages: { content: string }[] };
        fullRequest.messages[1].content = fullUserInstruction;

        expect(response.text).toBe(modelResponse);
        expect(validateSoxlAiModelExplanation(modelResponse, result, catalog, policy)).toMatchObject({ valid: true });
        const oversizedSupportingRefs = [
            ...formatterEvidence.sectionEvidenceRefs.supportingEvidence,
            ...formatterEvidence.sectionEvidenceRefs.summary,
        ].filter((ref, index, refs) => refs.indexOf(ref) === index).slice(0, 5);
        expect(oversizedSupportingRefs).toHaveLength(5);
        expect(validateSoxlAiModelExplanation(JSON.stringify({
            ...JSON.parse(modelResponse) as Record<string, unknown>,
            supportingEvidence: [{
                text: 'The supplied state has too many references.',
                evidenceRefs: oversizedSupportingRefs,
            }],
        }), result, catalog, policy)).toMatchObject({
            valid: false,
            reason: 'evidence_refs_too_many',
            section: 'supportingEvidence',
            field: 'evidenceRefs',
            observedCount: 5,
            uniqueCount: 5,
            allowedPromptMaximum: 4,
            validatorMaximum: 20,
        });
        expect(prompt.systemInstruction).not.toMatch(/scenario/iu);
        expect(prompt.userInstruction).not.toMatch(/upward_alignment|downward_alignment|preferred scenario/iu);
        expect(formatterEvidence.items.length).toBeLessThan(fullEvidence.items.length);
        expect(Buffer.byteLength(requestBody)).toBeLessThanOrEqual(96_000);
        expect(Buffer.byteLength(JSON.stringify(fullRequest))).toBeGreaterThan(Buffer.byteLength(requestBody));
        expect(JSON.parse(requestBody)).toMatchObject({ max_tokens: 1_024 });
        expect(JSON.stringify(infoSpy.mock.calls)).not.toMatch(/twelve-data|upward_alignment|current\.market_facts/u);
        vi.unstubAllEnvs();
        infoSpy.mockRestore();
    });

    it('builds available current evidence with stable IDs, exact source paths, raw precision, and ordered groups', () => {
        const result = buildSoxlAiEvidencePackage({
            facts: facts(),
            assessment: assessment(),
            plan: null,
            monitor: null,
        });

        expect(result.status).toBe('available');
        expect(result.issues).toEqual([]);
        expect(result.snapshotIdentities).toEqual([
            {
                role: 'current',
                providerId: 'twelve-data',
                asOf,
                factsStatus: 'available',
                assessmentStatus: 'available',
                coreStatus: 'available',
                sessionStatus: 'available',
                openingRangeComplete: true,
                regularSessionComplete: false,
            },
        ]);
        expect(itemById(result.items, 'current.market_facts.soxl_5m.latest_completed.close')).toMatchObject({
            sourcePath: 'facts.soxl5m.latestCompleted.close',
            value: 27.123456789,
            unit: 'usd',
            trustClass: 'deterministic_market_fact',
        });
        expect(itemById(result.items, 'current.market_facts.soxl_5m.rsi14.value')).toMatchObject({
            value: 61.23456789,
            label: 'soxl_5m RSI 14 value',
        });
        expect(itemById(result.items, 'current.market_facts.soxl_5m.atr14.value')).toMatchObject({
            value: 0.87654321,
            label: 'soxl_5m ATR 14 value',
        });
        expect(itemById(result.items, 'current.market_facts.regular_session.rolling_relative_volume.value')).toMatchObject({
            value: 1.23456789,
            unit: 'ratio',
        });
        expect(result.groups.currentMarketFacts.slice(0, 6)).toEqual([
            'current.market_facts.status',
            'current.market_facts.issue',
            'current.market_facts.provider_id',
            'current.market_facts.as_of',
            'current.market_facts.core_status',
            'current.market_facts.session_status',
        ]);
        expect(result.groups.missingEvidence).toEqual([]);
    });

    it('preserves assessment scenario, section, condition order, states, and counts without choosing a winner', () => {
        const result = buildSoxlAiEvidencePackage({
            facts: facts(),
            assessment: assessment(),
            plan: null,
            monitor: null,
        });
        const assessmentIds = result.groups.currentAssessment;

        expect(assessmentIds.indexOf('current.assessment.upward_alignment.soxl_5m.soxl_5m_price_above_ema20.condition_id')).toBeLessThan(
            assessmentIds.indexOf('current.assessment.upward_alignment.soxl_5m.soxl_5m_macd_histogram_positive.condition_id'),
        );
        expect(assessmentIds.indexOf('current.assessment.upward_alignment.soxl_5m.total_count')).toBeLessThan(
            assessmentIds.indexOf('current.assessment.upward_alignment.soxl_5m.soxl_5m_price_above_ema20.condition_id'),
        );
        expect(assessmentIds.indexOf('current.assessment.upward_alignment.regular_session.regular_session_price_above_vwap.condition_id')).toBeLessThan(
            assessmentIds.indexOf('current.assessment.downward_alignment.soxl_5m.soxl_5m_price_below_ema20.condition_id'),
        );
        expect(itemById(result.items, 'current.assessment.upward_alignment.soxl_5m.soxl_5m_price_above_ema20.state')).toMatchObject({
            value: 'met',
            sourcePath: 'assessment.upwardAlignment.sections[id=soxl_5m].conditions[id=soxl_5m_price_above_ema20].state',
        });
        expect(itemById(result.items, 'current.assessment.downward_alignment.soxl_5m.not_met_count').value).toBe(2);
        const serializedKeys = allKeys(result);
        expect(serializedKeys).not.toEqual(expect.arrayContaining([
            'recommended',
            'preferredScenario',
            'score',
            'probability',
            'confidence',
            'action',
        ]));
    });

    it('marks partial current evidence and unknown/unavailable values as missing without converting nulls to zero', () => {
        const partialFacts = facts({
            status: 'partial',
            soxl5m: {
                ...facts().soxl5m,
                status: 'partial',
                latestCompleted: { close: null, time: asOf },
                closeVsEma20: 'unavailable',
            },
            regularSession: {
                ...facts().regularSession,
                rollingRelativeVolume: { value: null, time: null },
            },
        });
        const partialAssessment = assessment({
            status: 'partial',
            factsStatus: 'partial',
            upwardAlignment: upwardScenario([
                relationCondition('soxl_5m_price_above_ema20', 'unavailable', 'above', 'unknown'),
            ]),
        });
        const result = buildSoxlAiEvidencePackage({
            facts: partialFacts,
            assessment: partialAssessment,
            plan: null,
            monitor: null,
        });

        expect(result.status).toBe('partial');
        expect(itemById(result.items, 'current.market_facts.soxl_5m.latest_completed.close')).toMatchObject({
            value: null,
            availability: 'unavailable',
        });
        expect(itemById(result.items, 'current.market_facts.regular_session.rolling_relative_volume.value')).toMatchObject({
            value: null,
            availability: 'unavailable',
        });
        expect(itemById(result.items, 'current.assessment.upward_alignment.soxl_5m.soxl_5m_price_above_ema20.state')).toMatchObject({
            value: 'unknown',
            availability: 'unknown',
        });
        expect(result.groups.missingEvidence).toEqual(expect.arrayContaining([
            'current.market_facts.soxl_5m.latest_completed.close',
            'current.market_facts.regular_session.rolling_relative_volume.value',
            'current.assessment.upward_alignment.soxl_5m.soxl_5m_price_above_ema20.state',
        ]));
        expect(result.items.filter((item) => item.value === 0 && result.groups.missingEvidence.includes(item.id))).toEqual([]);
    });

    it('returns unavailable for facts and assessment provider or asOf mismatch and preserves only safe identity evidence', () => {
        const providerMismatch = buildSoxlAiEvidencePackage({
            facts: facts(),
            assessment: assessment({ providerId: 'other-provider' }),
            plan: null,
            monitor: null,
        });
        const asOfMismatch = buildSoxlAiEvidencePackage({
            facts: facts(),
            assessment: assessment({ asOf: laterAsOf }),
            plan: null,
            monitor: null,
        });

        expect(providerMismatch.status).toBe('unavailable');
        expect(providerMismatch.issues).toEqual(['current_snapshot_identity_mismatch']);
        expect(providerMismatch.groups.currentMarketFacts).toEqual([
            'current.market_facts.status',
            'current.market_facts.provider_id',
            'current.market_facts.as_of',
        ]);
        expect(providerMismatch.groups.currentAssessment).toEqual([
            'current.assessment.status',
            'current.assessment.provider_id',
            'current.assessment.as_of',
        ]);
        expect(asOfMismatch.status).toBe('unavailable');
        expect(asOfMismatch.issues).toEqual(['current_snapshot_identity_mismatch']);
    });

    it('returns unavailable for no usable current market evidence', () => {
        const result = buildSoxlAiEvidencePackage({
            facts: facts({ status: 'unavailable', issue: 'no_comparable_data', coreStatus: 'unavailable', sessionStatus: 'unavailable' }),
            assessment: assessment({ status: 'unavailable', factsStatus: 'unavailable', coreStatus: 'unavailable', sessionStatus: 'unavailable', issue: 'no_known_conditions' }),
            plan: null,
            monitor: null,
        });

        expect(result.status).toBe('unavailable');
        expect(result.issues).toEqual(['no_current_market_evidence']);
        expect(result.groups.missingEvidence).toEqual(expect.arrayContaining([
            'current.market_facts.status',
            'current.assessment.status',
        ]));
    });

    it('keeps optional plan absence from causing partial status and separates available plan assumptions from calculations', () => {
        const withoutPlan = buildSoxlAiEvidencePackage({
            facts: facts(),
            assessment: assessment(),
            plan: null,
            monitor: null,
        });
        const withPlan = buildSoxlAiEvidencePackage({
            facts: facts(),
            assessment: assessment(),
            plan: plan(),
            monitor: null,
        });

        expect(withoutPlan.status).toBe('available');
        expect(withPlan.status).toBe('available');
        expect(withPlan.snapshotIdentities.map((identity) => identity.role)).toEqual(['current', 'plan_context']);
        expect(withPlan.snapshotIdentities[1].asOf).toBe(asOf - 300_000);
        expect(itemById(withPlan.items, 'plan.assumptions.proposed_entry_price')).toMatchObject({
            trustClass: 'user_supplied_plan_assumption',
            value: 27.12,
            sourcePath: 'plan.entryPrice',
        });
        expect(itemById(withPlan.items, 'plan.calculations.maximum_quantity')).toMatchObject({
            trustClass: 'deterministic_plan_calculation',
            value: 92.182,
        });
        expect(withPlan.groups.planAssumptions.filter((id) => id.includes('targets.')).map((id) => id.split('.')[3])).toEqual([
            'target-1',
            'target-1',
            'target-1',
            'target-2',
            'target-2',
            'target-2',
        ]);
    });

    it('marks partial and unavailable plan evidence without inventing missing calculations', () => {
        const partialPlan = plan({
            status: 'partial',
            targets: [
                plan().targets[0],
                {
                    ...plan().targets[1],
                    status: 'unavailable',
                    issue: 'target_wrong_side',
                    rewardPerUnit: null,
                    grossProfitAtMaximumQuantity: null,
                    estimatedNetProfitAtMaximumQuantity: null,
                    priceRewardToRiskMultiple: null,
                },
            ],
        });
        const unavailablePlan = plan({
            status: 'unavailable',
            issue: 'invalid_entry_price',
            calculation: null,
        });
        const partialResult = buildSoxlAiEvidencePackage({
            facts: facts(),
            assessment: assessment(),
            plan: partialPlan,
            monitor: null,
        });
        const unavailableResult = buildSoxlAiEvidencePackage({
            facts: facts(),
            assessment: assessment(),
            plan: unavailablePlan,
            monitor: null,
        });

        expect(partialResult.status).toBe('partial');
        expect(itemById(partialResult.items, 'plan.calculations.targets.target-2.status')).toMatchObject({
            value: 'unavailable',
            availability: 'unavailable',
        });
        expect(unavailableResult.status).toBe('partial');
        expect(unavailableResult.issues).toEqual(['plan_context_unavailable']);
        expect(itemById(unavailableResult.items, 'plan.calculations.risk_per_unit')).toMatchObject({
            value: null,
            availability: 'unavailable',
        });
        expect(itemById(unavailableResult.items, 'plan.calculations.issue').value).toBe('invalid_entry_price');
    });

    it('keeps optional monitor absence from causing partial status and separates execution assumptions from monitor calculations', () => {
        const withoutMonitor = buildSoxlAiEvidencePackage({
            facts: facts(),
            assessment: assessment(),
            plan: plan(),
            monitor: null,
        });
        const withMonitor = buildSoxlAiEvidencePackage({
            facts: facts(),
            assessment: assessment(),
            plan: plan(),
            monitor: monitor(),
        });

        expect(withoutMonitor.status).toBe('available');
        expect(withMonitor.status).toBe('available');
        expect(withMonitor.snapshotIdentities.map((identity) => identity.role)).toEqual([
            'current',
            'plan_context',
            'monitoring_baseline',
            'monitoring_current',
        ]);
        expect(itemById(withMonitor.items, 'monitor.execution.executed_quantity')).toMatchObject({
            trustClass: 'user_supplied_execution_assumption',
            value: 90,
        });
        expect(itemById(withMonitor.items, 'monitor.calculations.price.estimated_net_unrealized_pnl')).toMatchObject({
            trustClass: 'deterministic_monitoring_calculation',
            value: 78.25,
        });
        expect(withMonitor.groups.monitoringCalculations.filter((id) => id.includes('targets.')).map((id) => id.split('.')[3]).slice(0, 22)).toEqual([
            'target-1',
            'target-1',
            'target-1',
            'target-1',
            'target-1',
            'target-1',
            'target-1',
            'target-1',
            'target-1',
            'target-1',
            'target-1',
            'target-2',
            'target-2',
            'target-2',
            'target-2',
            'target-2',
            'target-2',
            'target-2',
            'target-2',
            'target-2',
            'target-2',
            'target-2',
        ]);
    });

    it('marks partial and unavailable monitor evidence, preserves reached levels without actions, and separates baseline/current roles', () => {
        const reachedMonitor = monitor({
            status: 'partial',
            issues: ['current_price_unavailable'],
            priceMonitoring: {
                ...monitor().priceMonitoring,
                status: 'unavailable',
                currentPrice: null,
                invalidationState: 'reached',
            },
            targets: [
                {
                    ...monitor().targets[0],
                    targetState: 'reached',
                    monitoringStatus: 'available',
                },
            ],
        });
        const unavailableMonitor = monitor({
            status: 'unavailable',
            issues: ['plan_unavailable'],
            assessmentComparison: { status: 'unavailable', scenarios: [] },
        });
        const partialResult = buildSoxlAiEvidencePackage({
            facts: facts(),
            assessment: assessment(),
            plan: plan(),
            monitor: reachedMonitor,
        });
        const unavailableResult = buildSoxlAiEvidencePackage({
            facts: facts(),
            assessment: assessment(),
            plan: plan(),
            monitor: unavailableMonitor,
        });

        expect(partialResult.status).toBe('partial');
        expect(itemById(partialResult.items, 'monitor.calculations.price.invalidation_state')).toMatchObject({
            value: 'reached',
            availability: 'available',
        });
        expect(itemById(partialResult.items, 'monitor.calculations.targets.target-1.target_state')).toMatchObject({
            value: 'reached',
        });
        expect(itemById(partialResult.items, 'monitor.calculations.assessment.upward_alignment.soxl_5m.soxl_5m_price_above_ema20.baseline_state')).toMatchObject({
            snapshotRole: 'monitoring_baseline',
        });
        expect(itemById(partialResult.items, 'monitor.calculations.assessment.upward_alignment.soxl_5m.soxl_5m_price_above_ema20.current_state')).toMatchObject({
            snapshotRole: 'monitoring_current',
        });
        expect(JSON.stringify(partialResult).toLowerCase()).not.toMatch(/\b(exit now|hold|add|reduce|close position)\b/u);
        expect(unavailableResult.status).toBe('partial');
        expect(unavailableResult.issues).toEqual(['monitor_context_unavailable']);
    });

    it('detects monitor/current identity mismatch without merging current and monitor snapshots', () => {
        const result = buildSoxlAiEvidencePackage({
            facts: facts(),
            assessment: assessment(),
            plan: plan(),
            monitor: monitor({ currentAsOf: laterAsOf }),
        });

        expect(result.status).toBe('partial');
        expect(result.issues).toEqual(['monitor_current_snapshot_mismatch']);
        expect(result.snapshotIdentities.find((identity) => identity.role === 'current')?.asOf).toBe(asOf);
        expect(result.snapshotIdentities.find((identity) => identity.role === 'monitoring_current')?.asOf).toBe(laterAsOf);
    });

    it('keeps every evidence ID unique, every group reference resolved, deterministic order stable, and inputs unmutated', () => {
        const source = {
            facts: facts(),
            assessment: assessment(),
            plan: plan(),
            monitor: monitor(),
        };
        const before = JSON.stringify(source);
        const first = buildSoxlAiEvidencePackage(source);
        const second = buildSoxlAiEvidencePackage(JSON.parse(JSON.stringify(source)) as typeof source);
        const ids = first.items.map((item) => item.id);
        const references = Object.values(first.groups).flat();

        expect(new Set(ids).size).toBe(ids.length);
        expect(references.every((id) => ids.includes(id))).toBe(true);
        expect(first).toEqual(second);
        expect(JSON.stringify(source)).toBe(before);
        expect(first.groups.currentAssessment).toEqual(second.groups.currentAssessment);
    });

    it('does not use the system clock or copy excluded data, source-object arrays, provider messages, URLs, exceptions, stacks, user/session/auth fields, or strategy fields', () => {
        const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
            throw new Error('Date.now should not be called');
        });
        const result = buildSoxlAiEvidencePackage({
            facts: facts(),
            assessment: assessment(),
            plan: plan(),
            monitor: monitor(),
        });
        const text = JSON.stringify(result).toLowerCase();

        expect(dateNowSpy).not.toHaveBeenCalled();
        expect(text).not.toContain('candles');
        expect(text).not.toContain('provider body');
        expect(text).not.toContain('http://');
        expect(text).not.toContain('https://');
        expect(text).not.toContain('exception');
        expect(text).not.toContain('stack');
        expect(text).not.toContain('sessionid');
        expect(text).not.toContain('authorization');
        expect(text).not.toContain('api_key');
        expect(text).not.toContain('mongodb://');
        expect(allKeys(result)).not.toEqual(expect.arrayContaining([
            'recommendation',
            'preferredScenario',
            'score',
            'probability',
            'confidence',
            'expectedWinRate',
            'tradeDecision',
            'tradeSignal',
        ]));
        dateNowSpy.mockRestore();
    });
});
