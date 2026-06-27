import { describe, expect, it } from 'vitest';
import type {
    SoxlMarketAssessment,
    SoxlScenarioAssessment,
} from '../strategy/soxl-market-assessment';
import {
    buildSoxlTradePlan,
    type BuildSoxlTradePlanInput,
    type SoxlTradePlan,
    type SoxlTradePlanIssue,
    type SoxlTradeTargetIssue,
} from './soxl-trade-plan';

const providerId = 'manual-context-provider';
const asOf = 1_782_400_000;

function scenario(
    overrides: Partial<SoxlScenarioAssessment> = {},
): SoxlScenarioAssessment {
    return {
        id: 'upward_alignment',
        sections: [],
        metCount: 6,
        notMetCount: 4,
        unknownCount: 2,
        knownCount: 10,
        totalCount: 12,
        ...overrides,
    };
}

function baseAssessment(
    overrides: Partial<SoxlMarketAssessment> = {},
): SoxlMarketAssessment {
    return {
        status: 'available',
        providerId,
        asOf,
        factsStatus: 'available',
        coreStatus: 'available',
        sessionStatus: 'available',
        issue: null,
        upwardAlignment: scenario(),
        downwardAlignment: scenario({
            id: 'downward_alignment',
            metCount: 3,
            notMetCount: 7,
            unknownCount: 1,
            knownCount: 10,
            totalCount: 11,
        }),
        openingRangeComplete: true,
        regularSessionComplete: false,
        ...overrides,
    };
}

function baseInput(
    overrides: Partial<BuildSoxlTradePlanInput> = {},
): BuildSoxlTradePlanInput {
    return {
        assessment: baseAssessment(),
        side: 'long',
        entryPrice: 100,
        invalidationPrice: 95,
        maximumLossAmount: 530,
        estimatedEntryFee: 10,
        estimatedInvalidationExitFee: 20,
        quantityIncrement: 1,
        maximumPositionValue: null,
        targets: [],
        ...overrides,
    };
}

function build(
    overrides: Partial<BuildSoxlTradePlanInput> = {},
): SoxlTradePlan {
    return buildSoxlTradePlan(baseInput(overrides));
}

function expectBaseIssue(
    overrides: Partial<BuildSoxlTradePlanInput>,
    issue: SoxlTradePlanIssue,
) {
    const result = build(overrides);

    expect(result.status).toBe('unavailable');
    expect(result.issue).toBe(issue);
    expect(result.calculation).toBeNull();
}

function expectTargetIssue(
    targetOverride: Partial<BuildSoxlTradePlanInput['targets'][number]>,
    issue: SoxlTradeTargetIssue,
) {
    const target = {
        id: 'target-a',
        price: 110,
        estimatedExitFee: 5,
        ...targetOverride,
    };
    const result = build({ targets: [target] });

    expect(result.status).toBe('partial');
    expect(result.targets[0]).toMatchObject({
        id: target.id,
        price: target.price,
        estimatedExitFee: target.estimatedExitFee,
        status: 'unavailable',
        issue,
    });
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

describe('buildSoxlTradePlan base calculation', () => {
    it('builds an available long plan', () => {
        const result = build({
            targets: [{ id: 'target-a', price: 115, estimatedExitFee: 5 }],
        });

        expect(result.status).toBe('available');
        expect(result.issue).toBeNull();
        expect(result.side).toBe('long');
        expect(result.calculation?.maximumQuantity).toBe(100);
    });

    it('builds an available short plan', () => {
        const result = build({
            side: 'short',
            entryPrice: 100,
            invalidationPrice: 105,
            targets: [{ id: 'target-a', price: 90, estimatedExitFee: 5 }],
        });

        expect(result.status).toBe('available');
        expect(result.issue).toBeNull();
        expect(result.targets[0].status).toBe('available');
    });

    it('rejects an invalid entry price', () => {
        expectBaseIssue({ entryPrice: 0 }, 'invalid_entry_price');
    });

    it('rejects an invalid invalidation price', () => {
        expectBaseIssue({ invalidationPrice: Number.POSITIVE_INFINITY }, 'invalid_invalidation_price');
    });

    it('rejects an invalid maximum loss', () => {
        expectBaseIssue({ maximumLossAmount: -1 }, 'invalid_maximum_loss');
    });

    it('rejects an invalid entry fee', () => {
        expectBaseIssue({ estimatedEntryFee: -0.01 }, 'invalid_entry_fee');
    });

    it('rejects an invalid invalidation-exit fee', () => {
        expectBaseIssue({ estimatedInvalidationExitFee: Number.NaN }, 'invalid_invalidation_exit_fee');
    });

    it('rejects an invalid quantity increment', () => {
        expectBaseIssue({ quantityIncrement: 0 }, 'invalid_quantity_increment');
    });

    it('rejects an invalid maximum position value', () => {
        expectBaseIssue({ maximumPositionValue: 0 }, 'invalid_maximum_position_value');
    });

    it('rejects a long invalidation on the wrong side', () => {
        expectBaseIssue({ invalidationPrice: 100 }, 'invalidation_wrong_side');
    });

    it('rejects a short invalidation on the wrong side', () => {
        expectBaseIssue({
            side: 'short',
            entryPrice: 100,
            invalidationPrice: 95,
        }, 'invalidation_wrong_side');
    });

    it('rejects equal entry and invalidation', () => {
        expectBaseIssue({ entryPrice: 100, invalidationPrice: 100 }, 'invalidation_wrong_side');
    });

    it('rejects a non-positive risk budget after fees', () => {
        expectBaseIssue({
            maximumLossAmount: 30,
            estimatedEntryFee: 10,
            estimatedInvalidationExitFee: 20,
        }, 'non_positive_risk_budget_after_fees');
    });

    it('calculates raw risk-limited quantity', () => {
        expect(build().calculation?.rawRiskLimitedQuantity).toBe(100);
    });

    it('calculates raw position-value-limited quantity', () => {
        expect(build({ maximumPositionValue: 1_000 }).calculation?.rawPositionValueLimitedQuantity).toBe(10);
    });

    it('marks the risk budget as binding when it is the lower limit', () => {
        expect(build({ maximumPositionValue: 20_000 }).calculation?.bindingLimit).toBe('risk_budget');
    });

    it('marks the position value as binding when it is the lower limit', () => {
        const result = build({ maximumPositionValue: 1_000 });

        expect(result.calculation?.bindingLimit).toBe('position_value');
        expect(result.calculation?.rawMaximumQuantity).toBe(10);
    });

    it('marks exactly equal raw limits as equal', () => {
        expect(build({ maximumPositionValue: 10_000 }).calculation?.bindingLimit).toBe('equal');
    });

    it('rounds whole-share increments down', () => {
        const result = build({
            maximumLossAmount: 79.35,
            estimatedEntryFee: 10,
            estimatedInvalidationExitFee: 20,
            quantityIncrement: 1,
        });

        expect(result.calculation?.rawMaximumQuantity).toBeCloseTo(9.87);
        expect(result.calculation?.maximumQuantity).toBe(9);
    });

    it('rounds fractional increments down', () => {
        const result = build({
            maximumLossAmount: 79.35,
            estimatedEntryFee: 10,
            estimatedInvalidationExitFee: 20,
            quantityIncrement: 0.1,
        });

        expect(result.calculation?.maximumQuantity).toBe(9.8);
    });

    it('rounds small fractional increments down', () => {
        const result = build({
            maximumLossAmount: 42.839,
            estimatedEntryFee: 10,
            estimatedInvalidationExitFee: 20,
            quantityIncrement: 0.001,
        });

        expect(result.calculation?.rawMaximumQuantity).toBeCloseTo(2.5678);
        expect(result.calculation?.maximumQuantity).toBe(2.567);
    });

    it('rejects when no affordable quantity remains after increment rounding', () => {
        expectBaseIssue({
            maximumLossAmount: 30.5,
            estimatedEntryFee: 10,
            estimatedInvalidationExitFee: 20,
            quantityIncrement: 1,
        }, 'no_affordable_quantity');
    });

    it('does not intentionally exceed the supplied maximum loss', () => {
        const result = build({
            maximumLossAmount: 79.35,
            estimatedEntryFee: 10,
            estimatedInvalidationExitFee: 20,
            quantityIncrement: 0.1,
        });

        expect(result.calculation?.estimatedLossAtInvalidation).toBeLessThanOrEqual(79.35);
    });

    it('calculates unused loss budget', () => {
        expect(build().calculation?.unusedLossBudget).toBe(0);
    });

    it('preserves risk-budget calculation fields', () => {
        expect(build().calculation).toMatchObject({
            riskPerUnit: 5,
            estimatedInvalidationFees: 30,
            riskBudgetAfterFees: 500,
            entryNotional: 10_000,
            grossLossAtInvalidation: 500,
            estimatedLossAtInvalidation: 530,
        });
    });
});

describe('buildSoxlTradePlan target scenarios', () => {
    it('calculates an available long target', () => {
        const result = build({ targets: [{ id: 'target-a', price: 115, estimatedExitFee: 5 }] });

        expect(result.targets[0]).toMatchObject({
            status: 'available',
            issue: null,
            rewardPerUnit: 15,
        });
    });

    it('calculates an available short target', () => {
        const result = build({
            side: 'short',
            entryPrice: 100,
            invalidationPrice: 105,
            targets: [{ id: 'target-a', price: 90, estimatedExitFee: 5 }],
        });

        expect(result.targets[0]).toMatchObject({
            status: 'available',
            rewardPerUnit: 10,
        });
    });

    it('rejects a target equal to entry', () => {
        expectTargetIssue({ price: 100 }, 'target_wrong_side');
    });

    it('rejects a long target on the wrong side', () => {
        expectTargetIssue({ price: 99 }, 'target_wrong_side');
    });

    it('rejects a short target on the wrong side', () => {
        const result = build({
            side: 'short',
            entryPrice: 100,
            invalidationPrice: 105,
            targets: [{ id: 'target-a', price: 101, estimatedExitFee: 5 }],
        });

        expect(result.status).toBe('partial');
        expect(result.targets[0].issue).toBe('target_wrong_side');
    });

    it('rejects an invalid target ID', () => {
        expectTargetIssue({ id: '   ' }, 'invalid_target_id');
    });

    it('rejects a duplicate target ID', () => {
        const result = build({
            targets: [
                { id: 'target-a', price: 110, estimatedExitFee: 5 },
                { id: 'target-a', price: 112, estimatedExitFee: 5 },
            ],
        });

        expect(result.status).toBe('partial');
        expect(result.targets[0].status).toBe('available');
        expect(result.targets[1].issue).toBe('duplicate_target_id');
    });

    it('rejects an invalid target price', () => {
        expectTargetIssue({ price: Number.NEGATIVE_INFINITY }, 'invalid_target_price');
    });

    it('rejects an invalid target exit fee', () => {
        expectTargetIssue({ estimatedExitFee: -1 }, 'invalid_target_exit_fee');
    });

    it('preserves multiple target input order', () => {
        const result = build({
            targets: [
                { id: 'third', price: 130, estimatedExitFee: 3 },
                { id: 'first', price: 110, estimatedExitFee: 1 },
                { id: 'second', price: 120, estimatedExitFee: 2 },
            ],
        });

        expect(result.targets.map((target) => target.id)).toEqual(['third', 'first', 'second']);
    });

    it('calculates target reward per unit', () => {
        expect(build({ targets: [{ id: 'target-a', price: 115, estimatedExitFee: 5 }] }).targets[0].rewardPerUnit).toBe(15);
    });

    it('calculates gross target profit', () => {
        expect(build({ targets: [{ id: 'target-a', price: 115, estimatedExitFee: 5 }] }).targets[0].grossProfitAtMaximumQuantity).toBe(1_500);
    });

    it('calculates net target profit after fees', () => {
        expect(build({ targets: [{ id: 'target-a', price: 115, estimatedExitFee: 5 }] }).targets[0].estimatedNetProfitAtMaximumQuantity).toBe(1_485);
    });

    it('calculates price reward-to-risk multiple', () => {
        expect(build({ targets: [{ id: 'target-a', price: 115, estimatedExitFee: 5 }] }).targets[0].priceRewardToRiskMultiple).toBe(3);
    });

    it('preserves negative net target profit after fees without interpretation', () => {
        const result = build({
            maximumLossAmount: 35,
            quantityIncrement: 1,
            targets: [{ id: 'target-a', price: 101, estimatedExitFee: 100 }],
        });

        expect(result.targets[0]).toMatchObject({
            status: 'available',
            estimatedNetProfitAtMaximumQuantity: -109,
        });
    });

    it('returns partial status when one target is invalid', () => {
        const result = build({
            targets: [
                { id: 'target-a', price: 110, estimatedExitFee: 5 },
                { id: 'target-b', price: 99, estimatedExitFee: 5 },
            ],
        });

        expect(result.status).toBe('partial');
        expect(result.targets.map((target) => target.status)).toEqual(['available', 'unavailable']);
    });

    it('returns available status when there are no targets', () => {
        expect(build().status).toBe('available');
    });

    it('marks every target unavailable when the base plan is unavailable', () => {
        const result = build({
            entryPrice: 0,
            targets: [
                { id: 'target-a', price: 110, estimatedExitFee: 5 },
                { id: '', price: -1, estimatedExitFee: -1 },
            ],
        });

        expect(result.status).toBe('unavailable');
        expect(result.targets.map((target) => target.issue)).toEqual([
            'base_plan_unavailable',
            'base_plan_unavailable',
        ]);
    });
});

describe('buildSoxlTradePlan assessment context and purity', () => {
    it('preserves assessment metadata and raw counts only', () => {
        const assessment = baseAssessment({
            status: 'partial',
            factsStatus: 'partial',
            issue: 'no_known_conditions',
            upwardAlignment: scenario({
                metCount: 1,
                notMetCount: 2,
                unknownCount: 3,
                knownCount: 3,
                totalCount: 6,
            }),
            downwardAlignment: scenario({
                id: 'downward_alignment',
                metCount: 4,
                notMetCount: 5,
                unknownCount: 6,
                knownCount: 9,
                totalCount: 15,
            }),
        });

        expect(build({ assessment }).assessmentContext).toEqual({
            providerId,
            asOf,
            status: 'partial',
            factsStatus: 'partial',
            coreStatus: 'available',
            sessionStatus: 'available',
            issue: 'no_known_conditions',
            openingRangeComplete: true,
            regularSessionComplete: false,
            upwardAlignment: {
                metCount: 1,
                notMetCount: 2,
                unknownCount: 3,
                knownCount: 3,
                totalCount: 6,
            },
            downwardAlignment: {
                metCount: 4,
                notMetCount: 5,
                unknownCount: 6,
                knownCount: 9,
                totalCount: 15,
            },
        });
    });

    it('does not let partial assessment status block valid risk math', () => {
        const result = build({
            assessment: baseAssessment({
                status: 'partial',
                factsStatus: 'partial',
            }),
        });

        expect(result.status).toBe('available');
        expect(result.calculation?.maximumQuantity).toBe(100);
    });

    it('does not let unavailable assessment status block valid risk math', () => {
        const result = build({
            assessment: baseAssessment({
                status: 'unavailable',
                factsStatus: 'unavailable',
                issue: 'no_known_conditions',
            }),
        });

        expect(result.status).toBe('available');
        expect(result.calculation?.maximumQuantity).toBe(100);
    });

    it('does not use assessment counts for quantity or target calculations', () => {
        const lowCounts = build({
            assessment: baseAssessment({
                upwardAlignment: scenario({ metCount: 0, notMetCount: 0, unknownCount: 22, knownCount: 0, totalCount: 22 }),
                downwardAlignment: scenario({ id: 'downward_alignment', metCount: 0, notMetCount: 0, unknownCount: 22, knownCount: 0, totalCount: 22 }),
            }),
            targets: [{ id: 'target-a', price: 115, estimatedExitFee: 5 }],
        });
        const highCounts = build({
            assessment: baseAssessment({
                upwardAlignment: scenario({ metCount: 22, notMetCount: 0, unknownCount: 0, knownCount: 22, totalCount: 22 }),
                downwardAlignment: scenario({ id: 'downward_alignment', metCount: 0, notMetCount: 22, unknownCount: 0, knownCount: 22, totalCount: 22 }),
            }),
            targets: [{ id: 'target-a', price: 115, estimatedExitFee: 5 }],
        });

        expect(lowCounts.calculation).toEqual(highCounts.calculation);
        expect(lowCounts.targets).toEqual(highCounts.targets);
    });

    it('produces equivalent results for repeated equivalent inputs', () => {
        const input = baseInput({
            targets: [{ id: 'target-a', price: 115, estimatedExitFee: 5 }],
        });

        expect(buildSoxlTradePlan(input)).toEqual(buildSoxlTradePlan(JSON.parse(JSON.stringify(input)) as BuildSoxlTradePlanInput));
    });

    it('does not mutate inputs, assessment, or targets', () => {
        const input = baseInput({
            targets: [{ id: 'target-a', price: 115, estimatedExitFee: 5 }],
        });
        const before = JSON.stringify(input);

        buildSoxlTradePlan(input);

        expect(JSON.stringify(input)).toBe(before);
    });

    it('does not sort target arrays', () => {
        const targets = [
            { id: 'z-target', price: 130, estimatedExitFee: 3 },
            { id: 'a-target', price: 110, estimatedExitFee: 1 },
            { id: 'm-target', price: 120, estimatedExitFee: 2 },
        ];

        expect(build({ targets }).targets.map((target) => target.id)).toEqual([
            'z-target',
            'a-target',
            'm-target',
        ]);
    });

    it('does not use the system clock', () => {
        expect(buildSoxlTradePlan.toString()).not.toContain('Date');
    });

    it('does not produce recommendation, preference, probability, confidence, score, or win-rate fields', () => {
        const keys = collectKeys(build({ targets: [{ id: 'target-a', price: 115, estimatedExitFee: 5 }] }));

        expect(keys).not.toEqual(expect.arrayContaining([
            'recommendedEntry',
            'recommendedInvalidation',
            'recommendedTarget',
            'recommendedQuantity',
            'preferredSide',
            'preferredScenario',
            'tradeDecision',
            'tradeAction',
            'probability',
            'confidence',
            'score',
            'expectedWinRate',
        ]));
    });

    it('does not copy provider messages, URLs, exceptions, stacks, or condition arrays into context', () => {
        const assessment = {
            ...baseAssessment(),
            providerMessage: 'provider said secret',
            url: 'https://example.invalid/secret',
            exception: 'exception text',
            stack: 'stack text',
        };
        const resultText = JSON.stringify(build({ assessment }));

        expect(resultText).not.toContain('provider said secret');
        expect(resultText).not.toContain('https://example.invalid/secret');
        expect(resultText).not.toContain('exception text');
        expect(resultText).not.toContain('stack text');
        expect(collectKeys(build({ assessment }).assessmentContext)).not.toContain('sections');
    });

    it('preserves manual side and prices without inventing or altering them', () => {
        const result = build({
            side: 'short',
            entryPrice: 123.45,
            invalidationPrice: 130.55,
            maximumLossAmount: 740,
            targets: [{ id: 'target-a', price: 100.25, estimatedExitFee: 5 }],
        });

        expect(result.side).toBe('short');
        expect(result.entryPrice).toBe(123.45);
        expect(result.invalidationPrice).toBe(130.55);
        expect(result.targets[0].price).toBe(100.25);
    });
});
