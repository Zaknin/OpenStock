import { describe, expect, it, vi } from 'vitest';
import type {
    SoxlTradePlan,
    SoxlTradePlanAssessmentContext,
    SoxlTradeTarget,
} from '../planning/soxl-trade-plan';
import type {
    SoxlAssessmentSection,
    SoxlConditionAssessment,
    SoxlConditionState,
    SoxlMarketAssessment,
    SoxlScenarioAssessment,
    SoxlScenarioId,
} from '../strategy/soxl-market-assessment';
import type {
    IndicatorLatestFact,
    LatestCompletedFact,
    MacdLatestFact,
    MarketFiveMinuteFacts,
    PriceLevelFacts,
    RegularSessionFacts,
    SoxlDailyFacts,
    SoxlFiveMinuteFacts,
    SoxlMarketFacts,
    SwingLatestFact,
} from '../strategy/soxl-market-facts';
import {
    monitorSoxlTrade,
    type MonitorSoxlTradeInput,
} from './soxl-live-trade-monitor';

const providerId = 'manual-provider';
const baselineAsOf = 1_782_400_000;
const currentAsOf = 1_782_400_300;

function condition(
    id: SoxlConditionAssessment['id'],
    state: SoxlConditionState,
    expected: SoxlConditionAssessment['expected'],
): SoxlConditionAssessment {
    const actual = state === 'unknown'
        ? 'unavailable'
        : state === 'met'
            ? expected
            : expected === 'above'
                ? 'below'
                : expected === 'below'
                    ? 'above'
                    : expected === 'positive'
                        ? 'negative'
                        : 'positive';

    return { id, state, expected, actual };
}

function section(
    id: SoxlAssessmentSection['id'],
    conditions: readonly SoxlConditionAssessment[],
): SoxlAssessmentSection {
    const metCount = conditions.filter((item) => item.state === 'met').length;
    const notMetCount = conditions.filter((item) => item.state === 'not_met').length;
    const unknownCount = conditions.filter((item) => item.state === 'unknown').length;

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
    id: SoxlScenarioId,
    sections?: readonly SoxlAssessmentSection[],
): SoxlScenarioAssessment {
    const defaultSections = id === 'upward_alignment'
        ? [
            section('soxl_5m', [
                condition('soxl_5m_price_above_ema20', 'met', 'above'),
                condition('soxl_5m_macd_histogram_positive', 'not_met', 'positive'),
                condition('soxl_5m_ema9_above_ema20', 'unknown', 'above'),
            ]),
            section('regular_session', [
                condition('regular_session_price_above_vwap', 'met', 'above'),
            ]),
        ]
        : [
            section('soxl_5m', [
                condition('soxl_5m_price_below_ema20', 'not_met', 'below'),
                condition('soxl_5m_macd_histogram_negative', 'met', 'negative'),
            ]),
            section('regular_session', [
                condition('regular_session_price_below_vwap', 'unknown', 'below'),
            ]),
        ];
    const resolvedSections = sections ?? defaultSections;

    return {
        id,
        sections: resolvedSections,
        metCount: resolvedSections.reduce((sum, item) => sum + item.metCount, 0),
        notMetCount: resolvedSections.reduce((sum, item) => sum + item.notMetCount, 0),
        unknownCount: resolvedSections.reduce((sum, item) => sum + item.unknownCount, 0),
        knownCount: resolvedSections.reduce((sum, item) => sum + item.knownCount, 0),
        totalCount: resolvedSections.reduce((sum, item) => sum + item.totalCount, 0),
    };
}

function assessment(
    overrides: Partial<SoxlMarketAssessment> = {},
): SoxlMarketAssessment {
    return {
        status: 'available',
        providerId,
        asOf: baselineAsOf,
        factsStatus: 'available',
        coreStatus: 'available',
        sessionStatus: 'available',
        issue: null,
        upwardAlignment: scenario('upward_alignment'),
        downwardAlignment: scenario('downward_alignment'),
        openingRangeComplete: true,
        regularSessionComplete: true,
        ...overrides,
    };
}

function latestCompleted(close: number | null, time: number | null): LatestCompletedFact {
    return { close, time };
}

function indicator(value: number | null = null): IndicatorLatestFact {
    return { value, time: value === null ? null : currentAsOf };
}

function macd(): MacdLatestFact {
    return { line: null, signal: null, histogram: null, time: null };
}

function swing(): SwingLatestFact {
    return { price: null, pivotTime: null, confirmedAtTime: null };
}

function soxlFiveMinuteFacts(close: number | null = 108): SoxlFiveMinuteFacts {
    return {
        status: 'available',
        latestCompleted: latestCompleted(close, currentAsOf - 60),
        ema9: indicator(),
        ema20: indicator(),
        ema50: indicator(),
        rsi14: indicator(),
        atr14: indicator(),
        macd12269: macd(),
        latestConfirmedSwingHigh: swing(),
        latestConfirmedSwingLow: swing(),
        closeVsEma9: 'above',
        closeVsEma20: 'above',
        closeVsEma50: 'above',
        ema9VsEma20: 'above',
        ema20VsEma50: 'above',
        macdLineVsSignal: 'above',
        macdHistogramSign: 'positive',
        closeVsLatestConfirmedSwingHigh: 'below',
        closeVsLatestConfirmedSwingLow: 'above',
    };
}

function soxlDailyFacts(): SoxlDailyFacts {
    return {
        status: 'available',
        latestCompleted: latestCompleted(101, currentAsOf - 86_400),
        ema20: indicator(),
        ema50: indicator(),
        ema200: indicator(),
        rsi14: indicator(),
        atr14: indicator(),
        macd12269: macd(),
        latestConfirmedSwingHigh: swing(),
        latestConfirmedSwingLow: swing(),
        closeVsEma20: 'above',
        closeVsEma50: 'above',
        closeVsEma200: 'above',
        ema20VsEma50: 'above',
        ema50VsEma200: 'above',
        macdLineVsSignal: 'above',
        macdHistogramSign: 'positive',
        closeVsLatestConfirmedSwingHigh: 'below',
        closeVsLatestConfirmedSwingLow: 'above',
    };
}

function marketFiveMinuteFacts(symbol: 'QQQ' | 'SMH'): MarketFiveMinuteFacts {
    return {
        status: 'available',
        symbol,
        latestCompleted: latestCompleted(500, currentAsOf - 60),
        ema20: indicator(),
        ema50: indicator(),
        rsi14: indicator(),
        macd12269: macd(),
        closeVsEma20: 'above',
        closeVsEma50: 'above',
        ema20VsEma50: 'above',
        macdLineVsSignal: 'above',
        macdHistogramSign: 'positive',
    };
}

function priceLevels(): PriceLevelFacts {
    return {
        high: 110,
        highTime: currentAsOf - 120,
        low: 90,
        lowTime: currentAsOf - 180,
        status: 'available',
        usedBars: 78,
    };
}

function regularSessionFacts(): RegularSessionFacts {
    return {
        status: 'available',
        latestCompleted: latestCompleted(999, currentAsOf - 60),
        vwap: indicator(104),
        rollingRelativeVolume: indicator(1.2),
        previousRepresentedSession: priceLevels(),
        openingRange30m: priceLevels(),
        latestTradingDate: '2026-06-27',
        previousTradingDate: '2026-06-26',
        latestDateRelation: 'same_exchange_date',
        latestRegularSessionCompleted: true,
        openingRange30mCompleted: true,
        closeVsVwap: 'above',
        closeVsPreviousSessionHigh: 'below',
        closeVsPreviousSessionLow: 'above',
        closeVsOpeningRangeHigh: 'below',
        closeVsOpeningRangeLow: 'above',
    };
}

function facts(overrides: Partial<SoxlMarketFacts> = {}): SoxlMarketFacts {
    return {
        status: 'available',
        issue: null,
        providerId,
        asOf: currentAsOf,
        coreStatus: 'available',
        sessionStatus: 'available',
        soxl5m: soxlFiveMinuteFacts(),
        soxlDaily: soxlDailyFacts(),
        qqq5m: marketFiveMinuteFacts('QQQ'),
        smh5m: marketFiveMinuteFacts('SMH'),
        regularSession: regularSessionFacts(),
        ...overrides,
    };
}

function assessmentContext(
    source: SoxlMarketAssessment,
): SoxlTradePlanAssessmentContext {
    const counts = (sourceScenario: SoxlScenarioAssessment) => ({
        metCount: sourceScenario.metCount,
        notMetCount: sourceScenario.notMetCount,
        unknownCount: sourceScenario.unknownCount,
        knownCount: sourceScenario.knownCount,
        totalCount: sourceScenario.totalCount,
    });

    return {
        providerId: source.providerId,
        asOf: source.asOf,
        status: source.status,
        factsStatus: source.factsStatus,
        coreStatus: source.coreStatus,
        sessionStatus: source.sessionStatus,
        issue: source.issue,
        openingRangeComplete: source.openingRangeComplete,
        regularSessionComplete: source.regularSessionComplete,
        upwardAlignment: counts(source.upwardAlignment),
        downwardAlignment: counts(source.downwardAlignment),
    };
}

function target(overrides: Partial<SoxlTradeTarget> = {}): SoxlTradeTarget {
    return {
        id: 'target-a',
        price: 110,
        estimatedExitFee: 2,
        status: 'available',
        issue: null,
        rewardPerUnit: 10,
        grossProfitAtMaximumQuantity: 1_000,
        estimatedNetProfitAtMaximumQuantity: 988,
        priceRewardToRiskMultiple: 2,
        ...overrides,
    };
}

function plan(
    baseline: SoxlMarketAssessment,
    overrides: Partial<SoxlTradePlan> = {},
): SoxlTradePlan {
    return {
        status: 'available',
        issue: null,
        assessmentContext: assessmentContext(baseline),
        side: 'long',
        entryPrice: 100,
        invalidationPrice: 95,
        maximumLossAmount: 510,
        estimatedEntryFee: 5,
        estimatedInvalidationExitFee: 5,
        quantityIncrement: 1,
        maximumPositionValue: null,
        calculation: {
            riskPerUnit: 5,
            estimatedInvalidationFees: 10,
            riskBudgetAfterFees: 500,
            rawRiskLimitedQuantity: 100,
            rawPositionValueLimitedQuantity: null,
            rawMaximumQuantity: 100,
            maximumQuantity: 100,
            quantityIncrement: 1,
            bindingLimit: 'risk_budget',
            entryNotional: 10_000,
            grossLossAtInvalidation: 500,
            estimatedLossAtInvalidation: 510,
            unusedLossBudget: 0,
        },
        targets: [target()],
        ...overrides,
    };
}

function input(overrides: Partial<MonitorSoxlTradeInput> = {}): MonitorSoxlTradeInput {
    const baselineAssessment = assessment();
    const currentAssessment = assessment({ asOf: currentAsOf });

    return {
        plan: plan(baselineAssessment),
        baselineAssessment,
        currentAssessment,
        currentFacts: facts(),
        executionPrice: 100,
        executedQuantity: 50,
        actualEntryFee: 3,
        estimatedCurrentExitFee: 4,
        ...overrides,
    };
}

function withConditionState(
    source: SoxlMarketAssessment,
    scenarioId: SoxlScenarioId,
    conditionIndex: number,
    state: SoxlConditionState,
): SoxlMarketAssessment {
    const key = scenarioId === 'upward_alignment'
        ? 'upwardAlignment'
        : 'downwardAlignment';
    const sourceScenario = source[key];
    const sourceSection = sourceScenario.sections[0];
    const sourceCondition = sourceSection.conditions[conditionIndex];
    const nextCondition = condition(sourceCondition.id, state, sourceCondition.expected);
    const nextSection = section(sourceSection.id, sourceSection.conditions.map((item, index) => (
        index === conditionIndex ? nextCondition : item
    )));
    const nextScenario = scenario(sourceScenario.id, sourceScenario.sections.map((item, index) => (
        index === 0 ? nextSection : item
    )));

    return { ...source, [key]: nextScenario };
}

function collectKeys(value: unknown): readonly string[] {
    if (Array.isArray(value)) {
        return value.flatMap((item) => collectKeys(item));
    }

    if (value !== null && typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => [
            key,
            ...collectKeys(item),
        ]);
    }

    return [];
}

describe('monitorSoxlTrade base and validation', () => {
    it('returns an available long monitoring result', () => {
        const result = monitorSoxlTrade(input());

        expect(result.status).toBe('available');
        expect(result.side).toBe('long');
    });

    it('returns an available short monitoring result', () => {
        const baseline = assessment();
        const shortPlan = plan(baseline, {
            side: 'short',
            invalidationPrice: 105,
            targets: [target({ price: 90, rewardPerUnit: 10 })],
        });
        const result = monitorSoxlTrade(input({
            plan: shortPlan,
            baselineAssessment: baseline,
            currentFacts: facts({ soxl5m: soxlFiveMinuteFacts(92) }),
        }));

        expect(result.status).toBe('available');
        expect(result.priceMonitoring.priceMovePerUnit).toBe(8);
    });

    it('monitors a partial plan when its base calculation exists', () => {
        const baseline = assessment();
        const partialPlan = plan(baseline, {
            status: 'partial',
            targets: [target({ status: 'unavailable', issue: 'target_wrong_side' })],
        });

        expect(monitorSoxlTrade(input({
            plan: partialPlan,
            baselineAssessment: baseline,
        })).status).toBe('partial');
    });

    it('rejects an unavailable plan', () => {
        const baseline = assessment();
        const unavailablePlan = plan(baseline, {
            status: 'unavailable',
            issue: 'invalid_entry_price',
            calculation: null,
        });

        expect(monitorSoxlTrade(input({
            plan: unavailablePlan,
            baselineAssessment: baseline,
        })).issues).toEqual(['plan_unavailable']);
    });

    it.each([
        ['execution price', { executionPrice: 0 }, 'invalid_execution_price'],
        ['executed quantity', { executedQuantity: Number.NaN }, 'invalid_executed_quantity'],
        ['actual entry fee', { actualEntryFee: -1 }, 'invalid_actual_entry_fee'],
        ['estimated current exit fee', { estimatedCurrentExitFee: Number.POSITIVE_INFINITY }, 'invalid_estimated_current_exit_fee'],
    ] as const)('rejects an invalid %s', (_label, overrides, issue) => {
        const result = monitorSoxlTrade(input(overrides));

        expect(result.status).toBe('unavailable');
        expect(result.issues).toContain(issue);
    });

    it('rejects a long execution on the wrong side of invalidation', () => {
        expect(monitorSoxlTrade(input({ executionPrice: 94 })).issues).toEqual([
            'execution_invalidation_wrong_side',
        ]);
    });

    it('rejects a short execution on the wrong side of invalidation', () => {
        const baseline = assessment();
        const shortPlan = plan(baseline, { side: 'short', invalidationPrice: 105 });

        expect(monitorSoxlTrade(input({
            plan: shortPlan,
            baselineAssessment: baseline,
            executionPrice: 106,
        })).issues).toEqual(['execution_invalidation_wrong_side']);
    });

    it('rejects execution equality with invalidation', () => {
        expect(monitorSoxlTrade(input({ executionPrice: 95 })).issues).toEqual([
            'execution_invalidation_wrong_side',
        ]);
    });
});

describe('monitorSoxlTrade identity gates', () => {
    it('rejects a plan and baseline provider mismatch', () => {
        const mismatched = assessment({ providerId: 'other-provider' });

        expect(monitorSoxlTrade(input({ baselineAssessment: mismatched })).issues).toEqual([
            'plan_baseline_identity_mismatch',
        ]);
    });

    it('rejects a plan and baseline as-of mismatch', () => {
        const mismatched = assessment({ asOf: baselineAsOf + 1 });

        expect(monitorSoxlTrade(input({ baselineAssessment: mismatched })).issues).toEqual([
            'plan_baseline_identity_mismatch',
        ]);
    });

    it('rejects a current facts and assessment provider mismatch', () => {
        expect(monitorSoxlTrade(input({
            currentFacts: facts({ providerId: 'other-provider' }),
        })).issues).toEqual(['current_snapshot_identity_mismatch']);
    });

    it('rejects a current facts and assessment as-of mismatch', () => {
        expect(monitorSoxlTrade(input({
            currentFacts: facts({ asOf: currentAsOf + 1 }),
        })).issues).toEqual(['current_snapshot_identity_mismatch']);
    });

    it('rejects a baseline and current provider mismatch', () => {
        const currentAssessment = assessment({
            providerId: 'other-provider',
            asOf: currentAsOf,
        });

        expect(monitorSoxlTrade(input({
            currentAssessment,
            currentFacts: facts({ providerId: 'other-provider' }),
        })).issues).toEqual(['provider_mismatch']);
    });

    it.each(['status', 'factsStatus', 'coreStatus', 'sessionStatus'] as const)(
        'includes plan context %s in the baseline identity gate',
        (field) => {
            const baseline = assessment({ [field]: 'partial' });

            expect(monitorSoxlTrade(input({ baselineAssessment: baseline })).issues).toEqual([
                'plan_baseline_identity_mismatch',
            ]);
        },
    );
});

describe('monitorSoxlTrade price calculations', () => {
    it('uses the completed SOXL five-minute price and timestamp', () => {
        const result = monitorSoxlTrade(input({
            currentFacts: facts({ soxl5m: soxlFiveMinuteFacts(107) }),
        }));

        expect(result.priceMonitoring).toMatchObject({
            source: 'completed_soxl_five_minute_candle',
            currentPrice: 107,
            currentPriceTimestamp: currentAsOf - 60,
        });
        expect(result.priceMonitoring.currentPrice).not.toBe(999);
    });

    it('returns partial monitoring when current price is missing but comparison is available', () => {
        const result = monitorSoxlTrade(input({
            currentFacts: facts({ soxl5m: soxlFiveMinuteFacts(null) }),
        }));

        expect(result.status).toBe('partial');
        expect(result.assessmentComparison.status).toBe('available');
    });

    it('does not convert a missing current price to zero', () => {
        const result = monitorSoxlTrade(input({
            currentFacts: facts({ soxl5m: soxlFiveMinuteFacts(null) }),
        }));

        expect(result.priceMonitoring.currentPrice).toBeNull();
        expect(result.priceMonitoring.currentPriceTimestamp).toBe(currentAsOf - 60);
        expect(result.priceMonitoring.currentNotional).toBeNull();
    });

    it.each([
        ['positive', 108, 8],
        ['negative', 92, -8],
    ] as const)('calculates a long %s price move', (_label, close, expected) => {
        const result = monitorSoxlTrade(input({
            currentFacts: facts({ soxl5m: soxlFiveMinuteFacts(close) }),
        }));

        expect(result.priceMonitoring.priceMovePerUnit).toBe(expected);
    });

    it.each([
        ['positive', 92, 8],
        ['negative', 108, -8],
    ] as const)('calculates a short %s price move', (_label, close, expected) => {
        const baseline = assessment();
        const result = monitorSoxlTrade(input({
            baselineAssessment: baseline,
            plan: plan(baseline, { side: 'short', invalidationPrice: 105 }),
            currentFacts: facts({ soxl5m: soxlFiveMinuteFacts(close) }),
        }));

        expect(result.priceMonitoring.priceMovePerUnit).toBe(expected);
    });

    it('calculates gross unrealized P&L', () => {
        expect(monitorSoxlTrade(input()).priceMonitoring.grossUnrealizedPnl).toBe(400);
    });

    it('calculates estimated net unrealized P&L after fees', () => {
        expect(monitorSoxlTrade(input()).priceMonitoring.estimatedNetUnrealizedPnl).toBe(393);
    });

    it('calculates entry and current notional', () => {
        expect(monitorSoxlTrade(input()).priceMonitoring).toMatchObject({
            entryNotional: 5_000,
            currentNotional: 5_400,
        });
    });

    it('calculates net return on entry notional', () => {
        expect(monitorSoxlTrade(input()).priceMonitoring.estimatedNetReturnOnEntryNotional).toBe(
            393 / 5_000,
        );
    });

    it('calculates initial risk per unit', () => {
        expect(monitorSoxlTrade(input()).priceMonitoring.initialRiskPerUnit).toBe(5);
    });

    it('calculates price movement in initial-risk units', () => {
        expect(monitorSoxlTrade(input()).priceMonitoring.priceMoveInInitialRiskUnits).toBe(1.6);
    });
});

describe('monitorSoxlTrade invalidation monitoring', () => {
    it.each([
        ['not reached', 96, 'not_reached'],
        ['reached below', 94, 'reached'],
        ['reached at equality', 95, 'reached'],
    ] as const)('marks a long invalidation %s', (_label, close, expected) => {
        const result = monitorSoxlTrade(input({
            currentFacts: facts({ soxl5m: soxlFiveMinuteFacts(close) }),
        }));

        expect(result.priceMonitoring.invalidationState).toBe(expected);
    });

    it.each([
        ['not reached', 104, 'not_reached'],
        ['reached above', 106, 'reached'],
        ['reached at equality', 105, 'reached'],
    ] as const)('marks a short invalidation %s', (_label, close, expected) => {
        const baseline = assessment();
        const result = monitorSoxlTrade(input({
            baselineAssessment: baseline,
            plan: plan(baseline, { side: 'short', invalidationPrice: 105 }),
            currentFacts: facts({ soxl5m: soxlFiveMinuteFacts(close) }),
        }));

        expect(result.priceMonitoring.invalidationState).toBe(expected);
    });

    it('calculates signed remaining invalidation distance', () => {
        const result = monitorSoxlTrade(input({
            currentFacts: facts({ soxl5m: soxlFiveMinuteFacts(94) }),
        }));

        expect(result.priceMonitoring.remainingDistanceToInvalidationPerUnit).toBe(-1);
    });
});

describe('monitorSoxlTrade quantity comparison', () => {
    it.each([
        [99, 'below_calculated_maximum'],
        [100, 'at_calculated_maximum'],
        [101, 'above_calculated_maximum'],
    ] as const)('classifies executed quantity %s exactly', (quantity, expected) => {
        expect(monitorSoxlTrade(input({
            executedQuantity: quantity,
        })).quantityComparison.quantityUsageState).toBe(expected);
    });

    it('calculates signed quantity difference', () => {
        expect(monitorSoxlTrade(input({
            executedQuantity: 40,
        })).quantityComparison.quantityDifference).toBe(-60);
    });
});

describe('monitorSoxlTrade target monitoring', () => {
    it.each([
        ['long target not reached', 'long', 108, 110, 'not_reached'],
        ['long target reached', 'long', 112, 110, 'reached'],
        ['short target not reached', 'short', 92, 90, 'not_reached'],
        ['short target reached', 'short', 88, 90, 'reached'],
    ] as const)('%s', (_label, side, close, targetPrice, expected) => {
        const baseline = assessment();
        const configuredPlan = plan(baseline, {
            side,
            invalidationPrice: side === 'long' ? 95 : 105,
            targets: [target({ price: targetPrice })],
        });
        const result = monitorSoxlTrade(input({
            baselineAssessment: baseline,
            plan: configuredPlan,
            currentFacts: facts({ soxl5m: soxlFiveMinuteFacts(close) }),
        }));

        expect(result.targets[0].targetState).toBe(expected);
    });

    it.each([
        ['long', 110, 110],
        ['short', 90, 90],
    ] as const)('counts %s target equality as reached', (side, close, targetPrice) => {
        const baseline = assessment();
        const result = monitorSoxlTrade(input({
            baselineAssessment: baseline,
            plan: plan(baseline, {
                side,
                invalidationPrice: side === 'long' ? 95 : 105,
                targets: [target({ price: targetPrice })],
            }),
            currentFacts: facts({ soxl5m: soxlFiveMinuteFacts(close) }),
        }));

        expect(result.targets[0].targetState).toBe('reached');
    });

    it('calculates signed target distance', () => {
        expect(monitorSoxlTrade(input()).targets[0].remainingDistanceToTargetPerUnit).toBe(2);
    });

    it('keeps an unavailable plan target unavailable', () => {
        const baseline = assessment();
        const unavailableTarget = target({
            status: 'unavailable',
            issue: 'invalid_target_price',
            rewardPerUnit: null,
            grossProfitAtMaximumQuantity: null,
            estimatedNetProfitAtMaximumQuantity: null,
            priceRewardToRiskMultiple: null,
        });
        const result = monitorSoxlTrade(input({
            baselineAssessment: baseline,
            plan: plan(baseline, { status: 'partial', targets: [unavailableTarget] }),
        }));

        expect(result.targets[0]).toMatchObject({
            planStatus: 'unavailable',
            planIssue: 'invalid_target_price',
            monitoringStatus: 'unavailable',
            targetState: 'unavailable',
        });
    });

    it('preserves target order and hypothetical calculations', () => {
        const baseline = assessment();
        const targets = [
            target({ id: 'z-target', price: 120, rewardPerUnit: 20 }),
            target({ id: 'a-target', price: 115, rewardPerUnit: 15 }),
        ];
        const result = monitorSoxlTrade(input({
            baselineAssessment: baseline,
            plan: plan(baseline, { targets }),
        }));

        expect(result.targets.map((item) => item.id)).toEqual(['z-target', 'a-target']);
        expect(result.targets.map((item) => item.rewardPerUnit)).toEqual([20, 15]);
    });
});

describe('monitorSoxlTrade assessment comparison', () => {
    it('compares matching assessment condition sets', () => {
        const result = monitorSoxlTrade(input());

        expect(result.assessmentComparison.status).toBe('available');
        expect(result.assessmentComparison.scenarios).toHaveLength(2);
    });

    it('rejects a condition-set mismatch', () => {
        const current = assessment({ asOf: currentAsOf });
        const mismatched = {
            ...current,
            upwardAlignment: scenario('upward_alignment', [
                section('soxl_5m', []),
            ]),
        };

        expect(monitorSoxlTrade(input({
            currentAssessment: mismatched,
        })).issues).toContain('condition_set_mismatch');
    });

    it.each([
        ['met', 'met', 'unchanged_met'],
        ['not_met', 'not_met', 'unchanged_not_met'],
        ['unknown', 'unknown', 'unchanged_unknown'],
        ['not_met', 'met', 'became_met'],
        ['met', 'not_met', 'became_not_met'],
        ['met', 'unknown', 'became_unknown'],
    ] as const)('maps %s to %s as %s', (baselineState, currentState, expected) => {
        const baseline = withConditionState(
            assessment(),
            'upward_alignment',
            0,
            baselineState,
        );
        const current = withConditionState(
            assessment({ asOf: currentAsOf }),
            'upward_alignment',
            0,
            currentState,
        );
        const result = monitorSoxlTrade(input({
            baselineAssessment: baseline,
            plan: plan(baseline),
            currentAssessment: current,
        }));

        expect(
            result.assessmentComparison.scenarios[0].sections[0].conditions[0].changeState,
        ).toBe(expected);
    });

    it('calculates section comparison counts', () => {
        const current = withConditionState(
            assessment({ asOf: currentAsOf }),
            'upward_alignment',
            1,
            'met',
        );
        const result = monitorSoxlTrade(input({ currentAssessment: current }));
        const counts = result.assessmentComparison.scenarios[0].sections[0];

        expect(counts).toMatchObject({
            unchangedMetCount: 1,
            unchangedUnknownCount: 1,
            becameMetCount: 1,
            changedCount: 1,
            totalCount: 3,
        });
    });

    it('calculates scenario comparison counts from its sections', () => {
        const result = monitorSoxlTrade(input());
        const scenarioResult = result.assessmentComparison.scenarios[0];

        expect(scenarioResult.totalCount).toBe(4);
        expect(scenarioResult.unchangedMetCount).toBe(2);
        expect(scenarioResult.changedCount).toBe(0);
    });

    it('preserves upward and downward scenario order', () => {
        expect(monitorSoxlTrade(input()).assessmentComparison.scenarios.map(
            (item) => item.id,
        )).toEqual(['upward_alignment', 'downward_alignment']);
    });

    it('does not sort assessment conditions', () => {
        const baseline = assessment();
        const current = assessment({ asOf: currentAsOf });
        const expectedIds = baseline.upwardAlignment.sections[0].conditions.map((item) => item.id);
        const result = monitorSoxlTrade(input({
            baselineAssessment: baseline,
            plan: plan(baseline),
            currentAssessment: current,
        }));

        expect(result.assessmentComparison.scenarios[0].sections[0].conditions.map(
            (item) => item.conditionId,
        )).toEqual(expectedIds);
    });

    it('preserves baseline and current actual values without interpreting them', () => {
        const current = withConditionState(
            assessment({ asOf: currentAsOf }),
            'upward_alignment',
            0,
            'not_met',
        );
        const comparison = monitorSoxlTrade(input({
            currentAssessment: current,
        })).assessmentComparison.scenarios[0].sections[0].conditions[0];

        expect(comparison).toMatchObject({
            baselineActual: 'above',
            currentActual: 'below',
        });
    });
});

describe('monitorSoxlTrade status, purity, and restrictions', () => {
    it('returns partial when the current assessment is partial', () => {
        expect(monitorSoxlTrade(input({
            currentAssessment: assessment({ asOf: currentAsOf, status: 'partial' }),
        })).status).toBe('partial');
    });

    it('keeps price monitoring available when the current assessment is unavailable', () => {
        const result = monitorSoxlTrade(input({
            currentAssessment: assessment({ asOf: currentAsOf, status: 'unavailable' }),
        }));

        expect(result.status).toBe('partial');
        expect(result.priceMonitoring.status).toBe('available');
    });

    it('adds no-monitoring-data when both monitoring areas are unavailable', () => {
        const current = assessment({
            asOf: currentAsOf,
            upwardAlignment: scenario('upward_alignment', []),
        });
        const result = monitorSoxlTrade(input({
            currentAssessment: current,
            currentFacts: facts({ soxl5m: soxlFiveMinuteFacts(null) }),
        }));

        expect(result.status).toBe('unavailable');
        expect(result.issues).toEqual([
            'current_price_unavailable',
            'condition_set_mismatch',
            'no_monitoring_data',
        ]);
    });

    it('keeps issues ordered and de-duplicated', () => {
        const current = assessment({
            asOf: currentAsOf,
            downwardAlignment: scenario('downward_alignment', []),
        });
        const result = monitorSoxlTrade(input({
            currentAssessment: current,
            currentFacts: facts({ soxl5m: soxlFiveMinuteFacts(Number.NaN) }),
        }));

        expect(result.issues).toEqual([
            'current_price_unavailable',
            'condition_set_mismatch',
            'no_monitoring_data',
        ]);
        expect(new Set(result.issues).size).toBe(result.issues.length);
    });

    it('does not compare scenario counts to select a scenario', () => {
        const result = monitorSoxlTrade(input());
        const keys = collectKeys(result);

        expect(keys).not.toContain('selectedScenario');
        expect(keys).not.toContain('preferredScenario');
        expect(result.assessmentComparison.scenarios).toHaveLength(2);
    });

    it('produces equivalent results for repeated equivalent inputs', () => {
        const firstInput = input();
        const secondInput = input();

        expect(monitorSoxlTrade(firstInput)).toEqual(monitorSoxlTrade(secondInput));
    });

    it('does not mutate inputs or nested arrays', () => {
        const source = input();
        const snapshot = structuredClone(source);

        monitorSoxlTrade(source);

        expect(source).toEqual(snapshot);
    });

    it('does not use the system clock', () => {
        const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
            throw new Error('system clock used');
        });

        expect(() => monitorSoxlTrade(input())).not.toThrow();
        expect(clock).not.toHaveBeenCalled();
        clock.mockRestore();
    });

    it('does not copy raw provider messages, URLs, exceptions, or stacks', () => {
        const baseline = Object.assign(assessment(), {
            providerMessage: 'sensitive-provider-message',
            providerUrl: 'https://secret.invalid/value',
            stack: 'sensitive-stack',
        });
        const result = monitorSoxlTrade(input({
            baselineAssessment: baseline,
            plan: plan(baseline),
        }));
        const serialized = JSON.stringify(result);

        expect(serialized).not.toContain('sensitive-provider-message');
        expect(serialized).not.toContain('secret.invalid');
        expect(serialized).not.toContain('sensitive-stack');
    });

    it('contains no recommendation, action, probability, confidence, score, alert, or notification field', () => {
        const prohibited = [
            'recommendedAction',
            'action',
            'hold',
            'add',
            'reduce',
            'close',
            'exitNow',
            'moveInvalidation',
            'moveTarget',
            'preferredScenario',
            'tradeDecision',
            'probability',
            'confidence',
            'expectedWinRate',
            'score',
            'alert',
            'notification',
        ];

        expect(collectKeys(monitorSoxlTrade(input()))).not.toEqual(
            expect.arrayContaining(prohibited),
        );
    });

    it('preserves supplied side, execution values, invalidation, and quantity', () => {
        const result = monitorSoxlTrade(input({
            executionPrice: 101,
            executedQuantity: 37,
            actualEntryFee: 1.25,
            estimatedCurrentExitFee: 1.5,
        }));

        expect(result).toMatchObject({
            side: 'long',
            executionPrice: 101,
            executedQuantity: 37,
            actualEntryFee: 1.25,
            estimatedCurrentExitFee: 1.5,
        });
        expect(result.priceMonitoring.invalidationPrice).toBe(95);
    });
});
