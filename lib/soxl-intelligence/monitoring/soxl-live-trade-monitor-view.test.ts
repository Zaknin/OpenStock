import { describe, expect, it } from 'vitest';
import type {
    SoxlConditionChangeState,
    SoxlConditionComparison,
    SoxlConditionComparisonCounts,
    SoxlLiveTradeMonitor,
    SoxlPriceMonitoring,
    SoxlScenarioComparison,
    SoxlSectionComparison,
    SoxlTargetMonitoring,
} from './soxl-live-trade-monitor';
import {
    buildSoxlLiveTradeMonitorView,
} from './soxl-live-trade-monitor-view';

const baselineAsOf = 1_782_400_000;
const currentAsOf = 1_782_400_300;

function counts(
    overrides: Partial<SoxlConditionComparisonCounts> = {},
): SoxlConditionComparisonCounts {
    return {
        unchangedMetCount: 1,
        unchangedNotMetCount: 1,
        unchangedUnknownCount: 1,
        becameMetCount: 1,
        becameNotMetCount: 1,
        becameUnknownCount: 1,
        changedCount: 3,
        totalCount: 6,
        ...overrides,
    };
}

function condition(
    conditionId: SoxlConditionComparison['conditionId'],
    changeState: SoxlConditionChangeState,
): SoxlConditionComparison {
    const stateByChange: Record<SoxlConditionChangeState, {
        baselineState: SoxlConditionComparison['baselineState'];
        currentState: SoxlConditionComparison['currentState'];
    }> = {
        unchanged_met: { baselineState: 'met', currentState: 'met' },
        unchanged_not_met: { baselineState: 'not_met', currentState: 'not_met' },
        unchanged_unknown: { baselineState: 'unknown', currentState: 'unknown' },
        became_met: { baselineState: 'not_met', currentState: 'met' },
        became_not_met: { baselineState: 'met', currentState: 'not_met' },
        became_unknown: { baselineState: 'met', currentState: 'unknown' },
    };
    const states = stateByChange[changeState];

    return {
        scenarioId: 'upward_alignment',
        sectionId: 'soxl_5m',
        conditionId,
        expected: 'above',
        baselineActual: states.baselineState === 'unknown' ? 'unavailable' : 'above',
        baselineState: states.baselineState,
        currentActual: states.currentState === 'unknown' ? 'unavailable' : 'below',
        currentState: states.currentState,
        changeState,
    };
}

function section(
    id: SoxlSectionComparison['id'],
    conditions: readonly SoxlConditionComparison[] = [],
): SoxlSectionComparison {
    return {
        id,
        conditions,
        ...counts({
            unchangedMetCount: conditions.filter((item) => item.changeState === 'unchanged_met').length,
            unchangedNotMetCount: conditions.filter((item) => item.changeState === 'unchanged_not_met').length,
            unchangedUnknownCount: conditions.filter((item) => item.changeState === 'unchanged_unknown').length,
            becameMetCount: conditions.filter((item) => item.changeState === 'became_met').length,
            becameNotMetCount: conditions.filter((item) => item.changeState === 'became_not_met').length,
            becameUnknownCount: conditions.filter((item) => item.changeState === 'became_unknown').length,
            changedCount: conditions.filter((item) => item.changeState.startsWith('became_')).length,
            totalCount: conditions.length,
        }),
    };
}

function scenario(
    id: SoxlScenarioComparison['id'],
    sections?: readonly SoxlSectionComparison[],
): SoxlScenarioComparison {
    const conditions = id === 'upward_alignment'
        ? [
            condition('soxl_5m_price_above_ema20', 'unchanged_met'),
            condition('soxl_5m_ema9_above_ema20', 'unchanged_not_met'),
            condition('soxl_5m_ema20_above_ema50', 'unchanged_unknown'),
            condition('soxl_5m_macd_line_above_signal', 'became_met'),
            condition('soxl_5m_macd_histogram_positive', 'became_not_met'),
            condition('soxl_5m_price_above_latest_swing_high', 'became_unknown'),
        ]
        : [];
    const resolvedSections = sections ?? [
        section('soxl_5m', conditions),
        section('soxl_daily'),
        section('qqq_5m'),
        section('smh_5m'),
        section('regular_session'),
    ];

    return {
        id,
        sections: resolvedSections,
        ...counts(id === 'upward_alignment' ? {} : {
            unchangedMetCount: 0,
            unchangedNotMetCount: 0,
            unchangedUnknownCount: 0,
            becameMetCount: 0,
            becameNotMetCount: 0,
            becameUnknownCount: 0,
            changedCount: 0,
            totalCount: 0,
        }),
    };
}

function priceMonitoring(
    overrides: Partial<SoxlPriceMonitoring> = {},
): SoxlPriceMonitoring {
    return {
        status: 'available',
        source: 'completed_soxl_five_minute_candle',
        currentPrice: 108.12345,
        currentPriceTimestamp: currentAsOf - 60,
        entryNotional: 5_000,
        currentNotional: 5_406.1725,
        priceMovePerUnit: 8.12345,
        grossUnrealizedPnl: 406.1725,
        estimatedNetUnrealizedPnl: 399.1725,
        estimatedNetReturnOnEntryNotional: 0.0798345,
        initialRiskPerUnit: 5,
        priceMoveInInitialRiskUnits: 1.62469,
        invalidationPrice: 95,
        invalidationState: 'not_reached',
        remainingDistanceToInvalidationPerUnit: 13.12345,
        ...overrides,
    };
}

function target(
    overrides: Partial<SoxlTargetMonitoring> = {},
): SoxlTargetMonitoring {
    return {
        id: 'target-a',
        planStatus: 'available',
        planIssue: null,
        price: 110,
        estimatedExitFee: 2,
        rewardPerUnit: 10,
        grossProfitAtMaximumQuantity: 1_000,
        estimatedNetProfitAtMaximumQuantity: 988,
        priceRewardToRiskMultiple: 2,
        monitoringStatus: 'available',
        targetState: 'not_reached',
        remainingDistanceToTargetPerUnit: 1.87655,
        ...overrides,
    };
}

function monitor(
    overrides: Partial<SoxlLiveTradeMonitor> = {},
): SoxlLiveTradeMonitor {
    return {
        status: 'available',
        issues: [],
        providerId: 'manual-provider',
        baselineAsOf,
        currentAsOf,
        currentFactsStatus: 'available',
        currentAssessmentStatus: 'available',
        side: 'long',
        executionPrice: 100,
        executedQuantity: 50.125,
        actualEntryFee: 3,
        estimatedCurrentExitFee: 4,
        priceMonitoring: priceMonitoring(),
        quantityComparison: {
            executedQuantity: 50.125,
            calculatedMaximumQuantity: 100,
            quantityUsageState: 'below_calculated_maximum',
            quantityDifference: -49.875,
        },
        targets: [
            target({ id: 'target-z' }),
            target({ id: 'target-a', price: 115 }),
        ],
        assessmentComparison: {
            status: 'available',
            scenarios: [
                scenario('upward_alignment'),
                scenario('downward_alignment'),
            ],
        },
        ...overrides,
    };
}

function collectKeys(value: unknown): readonly string[] {
    if (Array.isArray(value)) {
        return value.flatMap(collectKeys);
    }

    if (value !== null && typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => [
            key,
            ...collectKeys(item),
        ]);
    }

    return [];
}

describe('buildSoxlLiveTradeMonitorView', () => {
    it('maps an available monitor', () => {
        expect(buildSoxlLiveTradeMonitorView(monitor())).toMatchObject({
            status: 'available',
            statusLabel: 'Available',
        });
    });

    it('maps a partial monitor', () => {
        expect(buildSoxlLiveTradeMonitorView(monitor({ status: 'partial' })).statusLabel).toBe(
            'Partially available',
        );
    });

    it('maps an unavailable monitor', () => {
        expect(buildSoxlLiveTradeMonitorView(monitor({ status: 'unavailable' })).statusLabel).toBe(
            'Unavailable',
        );
    });

    it('preserves structured issues and adds plain-language explanations', () => {
        const view = buildSoxlLiveTradeMonitorView(monitor({
            issues: ['invalid_execution_price', 'current_price_unavailable'],
        }));

        expect(view.issues).toEqual([
            {
                code: 'invalid_execution_price',
                explanation: 'Enter a positive actual execution price.',
            },
            {
                code: 'current_price_unavailable',
                explanation: 'The latest completed five-minute SOXL price is unavailable.',
            },
        ]);
    });

    it('preserves side and execution inputs', () => {
        const view = buildSoxlLiveTradeMonitorView(monitor({ side: 'short' }));

        expect(view.side).toBe('short');
        expect(view.sideLabel).toBe('Short');
        expect(view.execution.executedQuantity.rawValue).toBe(50.125);
        expect(view.execution.actualEntryFee.rawValue).toBe(3);
    });

    it('preserves baseline and current metadata', () => {
        const view = buildSoxlLiveTradeMonitorView(monitor());

        expect(view.summary).toMatchObject({
            providerId: 'manual-provider',
            baselineAsOf,
            currentAsOf,
            currentFactsStatus: 'available',
            currentAssessmentStatus: 'available',
        });
    });

    it('formats actual timestamps in GMT+4', () => {
        const view = buildSoxlLiveTradeMonitorView(monitor());

        expect(view.summary.baselineAsOfLabel).toContain('GMT+4');
        expect(view.summary.currentAsOfLabel).toContain('GMT+4');
        expect(view.price.currentPriceTimestampLabel).toContain('GMT+4');
    });

    it('labels the completed-candle source without live-price wording', () => {
        const view = buildSoxlLiveTradeMonitorView(monitor());

        expect(view.price.sourceLabel).toBe('Latest completed five-minute candle');
        expect(view.price.sourceLabel).not.toMatch(/live price|real-time price|current quote/i);
    });

    it('preserves price, notional, and P&L fields', () => {
        const view = buildSoxlLiveTradeMonitorView(monitor());

        expect(view.price.currentPrice.rawValue).toBe(108.12345);
        expect(view.price.entryNotional.rawValue).toBe(5_000);
        expect(view.price.currentNotional.rawValue).toBe(5_406.1725);
        expect(view.price.grossUnrealizedPnl.rawValue).toBe(406.1725);
        expect(view.price.estimatedNetUnrealizedPnl.rawValue).toBe(399.1725);
    });

    it('preserves and displays negative P&L', () => {
        const view = buildSoxlLiveTradeMonitorView(monitor({
            priceMonitoring: priceMonitoring({
                grossUnrealizedPnl: -125.5,
                estimatedNetUnrealizedPnl: -132.5,
            }),
        }));

        expect(view.price.grossUnrealizedPnl).toEqual({ rawValue: -125.5, value: '-$125.50' });
        expect(view.price.estimatedNetUnrealizedPnl.value).toBe('-$132.50');
    });

    it('preserves initial-risk fields', () => {
        const view = buildSoxlLiveTradeMonitorView(monitor());

        expect(view.price.initialRiskPerUnit.rawValue).toBe(5);
        expect(view.price.priceMoveInInitialRiskUnits).toEqual({
            rawValue: 1.62469,
            value: '1.625x',
        });
    });

    it('maps invalidation reached', () => {
        const view = buildSoxlLiveTradeMonitorView(monitor({
            priceMonitoring: priceMonitoring({ invalidationState: 'reached' }),
        }));

        expect(view.invalidation.stateLabel).toBe('Level reached');
    });

    it('maps invalidation not reached', () => {
        expect(buildSoxlLiveTradeMonitorView(monitor()).invalidation.stateLabel).toBe(
            'Level not reached',
        );
    });

    it.each([
        ['below_calculated_maximum', 'Below calculated maximum'],
        ['at_calculated_maximum', 'At calculated maximum'],
        ['above_calculated_maximum', 'Above calculated maximum'],
        ['unavailable', 'Unavailable'],
    ] as const)('maps %s quantity usage', (state, label) => {
        const source = monitor();
        const view = buildSoxlLiveTradeMonitorView({
            ...source,
            quantityComparison: { ...source.quantityComparison, quantityUsageState: state },
        });

        expect(view.quantity.stateLabel).toBe(label);
    });

    it('preserves signed quantity difference', () => {
        expect(buildSoxlLiveTradeMonitorView(monitor()).quantity.quantityDifference).toEqual({
            rawValue: -49.875,
            value: '-49.875',
        });
    });

    it('preserves target order', () => {
        expect(buildSoxlLiveTradeMonitorView(monitor()).targets.map((item) => item.id)).toEqual([
            'target-z',
            'target-a',
        ]);
    });

    it('maps an available target and its hypothetical calculations', () => {
        const targetView = buildSoxlLiveTradeMonitorView(monitor()).targets[0];

        expect(targetView).toMatchObject({
            planStatusLabel: 'Available',
            monitoringStatusLabel: 'Available',
            planIssueLabel: 'None',
        });
        expect(targetView.grossProfitAtMaximumQuantity.rawValue).toBe(1_000);
    });

    it('maps an unavailable target without converting missing values to zero', () => {
        const unavailableTarget = target();
        const source = monitor({
            targets: [{
                ...unavailableTarget,
                planStatus: 'unavailable',
                planIssue: 'invalid_target_price',
                monitoringStatus: 'unavailable',
                targetState: 'unavailable',
                rewardPerUnit: null,
                grossProfitAtMaximumQuantity: null,
                estimatedNetProfitAtMaximumQuantity: null,
                priceRewardToRiskMultiple: null,
                remainingDistanceToTargetPerUnit: null,
            }],
        });
        const targetView = buildSoxlLiveTradeMonitorView(source).targets[0];

        expect(targetView.planStatusLabel).toBe('Unavailable');
        expect(targetView.rewardPerUnit).toEqual({ rawValue: null, value: 'Unavailable' });
    });

    it.each([
        ['reached', 'Level reached'],
        ['not_reached', 'Level not reached'],
    ] as const)('maps target state %s', (state, label) => {
        const view = buildSoxlLiveTradeMonitorView(monitor({
            targets: [target({ targetState: state })],
        }));

        expect(view.targets[0].targetStateLabel).toBe(label);
    });

    it('preserves scenario order with equal presentation structure', () => {
        const scenarios = buildSoxlLiveTradeMonitorView(monitor()).assessmentComparison.scenarios;

        expect(scenarios.map((item) => item.id)).toEqual([
            'upward_alignment',
            'downward_alignment',
        ]);
        expect(scenarios.map((item) => item.title)).toEqual([
            'Upward alignment changes',
            'Downward alignment changes',
        ]);
    });

    it('preserves section order', () => {
        expect(
            buildSoxlLiveTradeMonitorView(monitor())
                .assessmentComparison.scenarios[0].sections.map((item) => item.id),
        ).toEqual(['soxl_5m', 'soxl_daily', 'qqq_5m', 'smh_5m', 'regular_session']);
    });

    it('preserves condition order', () => {
        const source = monitor();
        const expected = source.assessmentComparison.scenarios[0].sections[0].conditions.map(
            (item) => item.conditionId,
        );
        const actual = buildSoxlLiveTradeMonitorView(source)
            .assessmentComparison.scenarios[0].sections[0].conditions.map(
                (item) => item.conditionId,
            );

        expect(actual).toEqual(expected);
    });

    it.each([
        ['unchanged_met', 'Still matches'],
        ['unchanged_not_met', 'Still does not match'],
        ['unchanged_unknown', 'Still unknown'],
        ['became_met', 'Now matches'],
        ['became_not_met', 'Now does not match'],
        ['became_unknown', 'Now unknown'],
    ] as const)('maps %s to %s', (changeState, label) => {
        const source = monitor({
            assessmentComparison: {
                status: 'available',
                scenarios: [scenario('upward_alignment', [section('soxl_5m', [
                    condition('soxl_5m_price_above_ema20', changeState),
                ])])],
            },
        });

        expect(
            buildSoxlLiveTradeMonitorView(source)
                .assessmentComparison.scenarios[0].sections[0].conditions[0].changeLabel,
        ).toBe(label);
    });

    it('preserves section and scenario counts', () => {
        const view = buildSoxlLiveTradeMonitorView(monitor());

        expect(view.assessmentComparison.scenarios[0]).toMatchObject(counts());
        expect(view.assessmentComparison.scenarios[0].sections[0]).toMatchObject(counts());
    });

    it('keeps missing price unavailable instead of displaying zero', () => {
        const view = buildSoxlLiveTradeMonitorView(monitor({
            priceMonitoring: priceMonitoring({
                status: 'unavailable',
                currentPrice: null,
                currentNotional: null,
            }),
        }));

        expect(view.price.currentPrice).toEqual({ rawValue: null, value: 'Unavailable' });
        expect(view.price.currentNotional.value).toBe('Unavailable');
    });

    it('preserves available price output when assessment comparison is unavailable', () => {
        const view = buildSoxlLiveTradeMonitorView(monitor({
            status: 'partial',
            assessmentComparison: { status: 'unavailable', scenarios: [] },
        }));

        expect(view.price.status).toBe('available');
        expect(view.price.currentPrice.rawValue).toBe(108.12345);
        expect(view.assessmentComparison.status).toBe('unavailable');
    });

    it('preserves available assessment comparison when price monitoring is unavailable', () => {
        const view = buildSoxlLiveTradeMonitorView(monitor({
            status: 'partial',
            priceMonitoring: priceMonitoring({ status: 'unavailable', currentPrice: null }),
        }));

        expect(view.price.status).toBe('unavailable');
        expect(view.assessmentComparison.status).toBe('available');
        expect(view.assessmentComparison.scenarios).toHaveLength(2);
    });

    it('does not mutate the source monitor object', () => {
        const source = monitor();
        const snapshot = structuredClone(source);

        buildSoxlLiveTradeMonitorView(source);

        expect(source).toEqual(snapshot);
    });

    it('does not recalculate arithmetic domain values', () => {
        const source = monitor({
            priceMonitoring: priceMonitoring({
                entryNotional: 12.345,
                currentNotional: 67.89,
                grossUnrealizedPnl: -4.321,
                estimatedNetUnrealizedPnl: -9.876,
            }),
        });
        const view = buildSoxlLiveTradeMonitorView(source);

        expect(view.price.entryNotional.rawValue).toBe(12.345);
        expect(view.price.currentNotional.rawValue).toBe(67.89);
        expect(view.price.grossUnrealizedPnl.rawValue).toBe(-4.321);
        expect(view.price.estimatedNetUnrealizedPnl.rawValue).toBe(-9.876);
    });

    it('creates no action, recommendation, scenario preference, probability, confidence, score, alert, or notification field', () => {
        const prohibited = [
            'action',
            'recommendation',
            'preferredScenario',
            'probability',
            'confidence',
            'score',
            'alert',
            'notification',
        ];

        expect(collectKeys(buildSoxlLiveTradeMonitorView(monitor()))).not.toEqual(
            expect.arrayContaining(prohibited),
        );
    });
});
