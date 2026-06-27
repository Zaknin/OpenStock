import { describe, expect, it } from 'vitest';
import type {
    SoxlTradePlan,
    SoxlTradePlanAssessmentContext,
    SoxlTradePlanCalculation,
    SoxlTradeTarget,
} from './soxl-trade-plan';
import {
    buildSoxlTradePlanView,
} from './soxl-trade-plan-view';

const asOf = 1_704_067_200;

const assessmentContext: SoxlTradePlanAssessmentContext = {
    providerId: 'provider-main',
    asOf,
    status: 'partial',
    factsStatus: 'partial',
    coreStatus: 'available',
    sessionStatus: 'partial',
    issue: 'no_known_conditions',
    openingRangeComplete: true,
    regularSessionComplete: false,
    upwardAlignment: {
        metCount: 4,
        notMetCount: 6,
        unknownCount: 12,
        knownCount: 10,
        totalCount: 22,
    },
    downwardAlignment: {
        metCount: 8,
        notMetCount: 2,
        unknownCount: 12,
        knownCount: 10,
        totalCount: 22,
    },
};

const calculation: SoxlTradePlanCalculation = {
    riskPerUnit: 5,
    estimatedInvalidationFees: 30,
    riskBudgetAfterFees: 500,
    rawRiskLimitedQuantity: 100,
    rawPositionValueLimitedQuantity: null,
    rawMaximumQuantity: 100,
    maximumQuantity: 100,
    quantityIncrement: 1,
    bindingLimit: 'risk_budget',
    entryNotional: 10_000,
    grossLossAtInvalidation: 500,
    estimatedLossAtInvalidation: 530,
    unusedLossBudget: 0,
};

const availableTarget: SoxlTradeTarget = {
    id: 'target-1',
    price: 115,
    estimatedExitFee: 5,
    status: 'available',
    issue: null,
    rewardPerUnit: 15,
    grossProfitAtMaximumQuantity: 1_500,
    estimatedNetProfitAtMaximumQuantity: 1_485,
    priceRewardToRiskMultiple: 3,
};

function plan(overrides: Partial<SoxlTradePlan> = {}): SoxlTradePlan {
    return {
        status: 'available',
        issue: null,
        assessmentContext,
        side: 'long',
        entryPrice: 100,
        invalidationPrice: 95,
        maximumLossAmount: 530,
        estimatedEntryFee: 10,
        estimatedInvalidationExitFee: 20,
        quantityIncrement: 1,
        maximumPositionValue: null,
        calculation,
        targets: [availableTarget],
        ...overrides,
    };
}

function rowValue(rows: readonly { key: string; value: string }[], key: string): string {
    const found = rows.find((row) => row.key === key);

    if (!found) {
        throw new Error(`Missing row ${key}`);
    }

    return found.value;
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

describe('buildSoxlTradePlanView', () => {
    it('maps an available plan', () => {
        const view = buildSoxlTradePlanView(plan());

        expect(view.status).toBe('available');
        expect(view.statusLabel).toBe('Available');
        expect(view.calculationRows.length).toBeGreaterThan(0);
    });

    it('maps a partial plan', () => {
        const view = buildSoxlTradePlanView(plan({
            status: 'partial',
            targets: [
                availableTarget,
                {
                    id: 'target-2',
                    price: 99,
                    estimatedExitFee: 5,
                    status: 'unavailable',
                    issue: 'target_wrong_side',
                    rewardPerUnit: null,
                    grossProfitAtMaximumQuantity: null,
                    estimatedNetProfitAtMaximumQuantity: null,
                    priceRewardToRiskMultiple: null,
                },
            ],
        }));

        expect(view.statusLabel).toBe('Partially available');
        expect(view.targets[1].issueExplanation).toBe('For a long plan, target price must be above entry. For a short plan, target price must be below entry.');
    });

    it('maps an unavailable plan', () => {
        const view = buildSoxlTradePlanView(plan({
            status: 'unavailable',
            issue: 'invalid_entry_price',
            calculation: null,
            targets: [],
        }));

        expect(view.statusLabel).toBe('Unavailable');
        expect(view.issueExplanation).toBe('Enter a positive proposed entry price.');
        expect(view.calculationRows).toEqual([]);
    });

    it('preserves plan status and structured issue', () => {
        const view = buildSoxlTradePlanView(plan({
            status: 'unavailable',
            issue: 'no_affordable_quantity',
            calculation: null,
        }));

        expect(view.status).toBe('unavailable');
        expect(view.issue).toBe('no_affordable_quantity');
        expect(view.issueLabel).toBe('no_affordable_quantity');
    });

    it('preserves user-supplied inputs', () => {
        const view = buildSoxlTradePlanView(plan({
            side: 'short',
            entryPrice: 123.45678,
            invalidationPrice: 130.55555,
            maximumLossAmount: 777.7,
            estimatedEntryFee: 1.25,
            estimatedInvalidationExitFee: 2.5,
            quantityIncrement: 0.001,
            maximumPositionValue: 2_000,
        }));

        expect(view.sideLabel).toBe('Short');
        expect(rowValue(view.inputRows, 'entryPrice')).toBe('123.4568');
        expect(rowValue(view.inputRows, 'maximumLossAmount')).toBe('$777.70');
        expect(rowValue(view.inputRows, 'maximumPositionValue')).toBe('$2,000.00');
    });

    it('preserves assessment context', () => {
        const view = buildSoxlTradePlanView(plan());

        expect(view.assessmentContext).toMatchObject({
            providerId: 'provider-main',
            status: 'partial',
            factsStatus: 'partial',
            coreStatus: 'available',
            sessionStatus: 'partial',
            issue: 'no_known_conditions',
            issueLabel: 'no_known_conditions',
            openingRangeCompleteLabel: 'Yes',
            regularSessionCompleteLabel: 'No',
            upwardAlignment: assessmentContext.upwardAlignment,
            downwardAlignment: assessmentContext.downwardAlignment,
        });
    });

    it('formats assessment as-of in GMT+4', () => {
        expect(buildSoxlTradePlanView(plan()).assessmentContext.asOfLabel).toContain('GMT+4');
    });

    it('maps base risk-calculation fields', () => {
        const rows = buildSoxlTradePlanView(plan()).calculationRows;

        expect(rowValue(rows, 'riskPerUnit')).toBe('5');
        expect(rowValue(rows, 'riskBudgetAfterFees')).toBe('$500.00');
        expect(rowValue(rows, 'estimatedLossAtInvalidation')).toBe('$530.00');
    });

    it('maps position-value-limited fields', () => {
        const view = buildSoxlTradePlanView(plan({
            calculation: {
                ...calculation,
                rawPositionValueLimitedQuantity: 25.4321,
                rawMaximumQuantity: 25.4321,
                maximumQuantity: 25.4,
                quantityIncrement: 0.1,
                bindingLimit: 'position_value',
            },
        }));

        expect(rowValue(view.calculationRows, 'rawPositionValueLimitedQuantity')).toBe('25.4321');
        expect(rowValue(view.calculationRows, 'bindingLimit')).toBe('Maximum-position-value limit');
    });

    it('maps binding-limit labels', () => {
        expect(rowValue(buildSoxlTradePlanView(plan()).calculationRows, 'bindingLimit')).toBe('Maximum-loss limit');
        expect(rowValue(buildSoxlTradePlanView(plan({
            calculation: {
                ...calculation,
                bindingLimit: 'equal',
            },
        })).calculationRows, 'bindingLimit')).toBe('Both limits are equal');
    });

    it('formats whole-share quantities', () => {
        expect(rowValue(buildSoxlTradePlanView(plan()).calculationRows, 'maximumQuantity')).toBe('100');
    });

    it('formats fractional quantities', () => {
        const view = buildSoxlTradePlanView(plan({
            quantityIncrement: 0.001,
            calculation: {
                ...calculation,
                rawMaximumQuantity: 2.5678,
                maximumQuantity: 2.567,
                quantityIncrement: 0.001,
            },
        }));

        expect(rowValue(view.calculationRows, 'maximumQuantity')).toBe('2.567');
    });

    it('displays missing values as unavailable', () => {
        const view = buildSoxlTradePlanView(plan({ maximumPositionValue: null }));

        expect(rowValue(view.inputRows, 'maximumPositionValue')).toBe('Unavailable');
        expect(rowValue(view.calculationRows, 'rawPositionValueLimitedQuantity')).toBe('Unavailable');
    });

    it('preserves target order', () => {
        const view = buildSoxlTradePlanView(plan({
            targets: [
                { ...availableTarget, id: 'target-3', price: 130 },
                { ...availableTarget, id: 'target-1', price: 110 },
                { ...availableTarget, id: 'target-2', price: 120 },
            ],
        }));

        expect(view.targets.map((target) => target.id)).toEqual(['target-3', 'target-1', 'target-2']);
    });

    it('maps an available target', () => {
        const target = buildSoxlTradePlanView(plan()).targets[0];

        expect(target.statusLabel).toBe('Available');
        expect(rowValue(target.outcomeRows, 'rewardPerUnit')).toBe('15');
        expect(rowValue(target.outcomeRows, 'priceRewardToRiskMultiple')).toBe('3x');
    });

    it('maps an unavailable target', () => {
        const view = buildSoxlTradePlanView(plan({
            targets: [{
                id: 'target-1',
                price: 99,
                estimatedExitFee: 5,
                status: 'unavailable',
                issue: 'target_wrong_side',
                rewardPerUnit: null,
                grossProfitAtMaximumQuantity: null,
                estimatedNetProfitAtMaximumQuantity: null,
                priceRewardToRiskMultiple: null,
            }],
        }));

        expect(view.targets[0].statusLabel).toBe('Unavailable');
        expect(view.targets[0].issueLabel).toBe('target_wrong_side');
        expect(view.targets[0].outcomeRows).toEqual([]);
    });

    it('preserves a negative hypothetical net target result', () => {
        const view = buildSoxlTradePlanView(plan({
            targets: [{
                ...availableTarget,
                estimatedNetProfitAtMaximumQuantity: -12.34,
            }],
        }));

        expect(rowValue(view.targets[0].outcomeRows, 'estimatedNetProfitAtMaximumQuantity')).toBe('-$12.34');
    });

    it('maps structured issue explanations', () => {
        const view = buildSoxlTradePlanView(plan({
            status: 'unavailable',
            issue: 'non_positive_risk_budget_after_fees',
            calculation: null,
            targets: [{
                id: 'target-1',
                price: 110,
                estimatedExitFee: 5,
                status: 'unavailable',
                issue: 'base_plan_unavailable',
                rewardPerUnit: null,
                grossProfitAtMaximumQuantity: null,
                estimatedNetProfitAtMaximumQuantity: null,
                priceRewardToRiskMultiple: null,
            }],
        }));

        expect(view.issueExplanation).toBe('Estimated fees use all or more of the maximum acceptable loss.');
        expect(view.targets[0].issueExplanation).toBe('Target outcomes are unavailable because the base plan calculation is unavailable.');
    });

    it('does not recalculate risk arithmetic', () => {
        const view = buildSoxlTradePlanView(plan({
            entryPrice: 100,
            invalidationPrice: 90,
            calculation: {
                ...calculation,
                riskPerUnit: 123.456,
                rawRiskLimitedQuantity: 7.89,
            },
        }));

        expect(rowValue(view.calculationRows, 'riskPerUnit')).toBe('123.456');
        expect(rowValue(view.calculationRows, 'rawRiskLimitedQuantity')).toBe('7.89');
    });

    it('does not mutate the input plan', () => {
        const source = plan();
        const before = JSON.stringify(source);

        buildSoxlTradePlanView(source);

        expect(JSON.stringify(source)).toBe(before);
    });

    it('does not create recommendation, preferred-side, probability, confidence, or win-rate fields or values', () => {
        const view = buildSoxlTradePlanView(plan());
        const text = JSON.stringify(view).toLowerCase();

        expect(collectKeys(view)).not.toEqual(expect.arrayContaining([
            'recommendedEntry',
            'recommendedInvalidation',
            'recommendedTarget',
            'recommendedQuantity',
            'preferredSide',
            'preferredScenario',
            'tradeSignal',
            'tradeDecision',
            'probability',
            'confidence',
            'expectedWinRate',
        ]));
        expect(text).not.toContain('recommended');
        expect(text).not.toContain('preferred');
        expect(text).not.toContain('probability');
        expect(text).not.toContain('confidence');
        expect(text).not.toContain('expected win rate');
    });
});
