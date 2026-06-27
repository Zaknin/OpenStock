import { describe, expect, it, vi } from 'vitest';
import type {
    SoxlAiEvidenceGroups,
    SoxlAiEvidenceItem,
    SoxlAiEvidencePackage,
} from './soxl-ai-evidence';
import type {
    SoxlAiExplanationResponseContract,
} from './soxl-ai-prompt';
import {
    validateSoxlAiExplanationResponse,
    type SoxlAiResponseValidationIssue,
} from './soxl-ai-response-validator';

const providerId = 'twelve-data';
const asOf = 1_787_654_321_123;
const availableId = 'current.market_facts.soxl_5m.latest_completed.close';
const missingId = 'current.assessment.upward_alignment.soxl_5m.condition.state';

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
            {
                role: 'plan_context',
                providerId: 'plan-provider',
                asOf: asOf - 1,
                factsStatus: 'available',
                assessmentStatus: 'available',
                coreStatus: 'available',
                sessionStatus: 'available',
                openingRangeComplete: true,
                regularSessionComplete: false,
            },
        ],
        items: [
            {
                id: availableId,
                source: 'market_facts',
                snapshotRole: 'current',
                sourcePath: 'facts.soxl5m.latestCompleted.close',
                label: 'Latest completed close',
                trustClass: 'deterministic_market_fact',
                availability: 'available',
                value: 27.123456789,
                unit: 'usd',
            },
            {
                id: missingId,
                source: 'market_assessment',
                snapshotRole: 'current',
                sourcePath: 'assessment.upwardAlignment.sections[id=soxl_5m].conditions[id=condition].state',
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

function response(
    overrides: Partial<SoxlAiExplanationResponseContract> = {},
): SoxlAiExplanationResponseContract {
    return {
        status: 'available',
        snapshotIdentity: {
            providerId,
            asOf: String(asOf),
        },
        summary: [point('The latest completed close is available.')],
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

function raw(value: unknown): string {
    return JSON.stringify(value);
}

type ApplicabilityGroup = keyof Pick<
    SoxlAiEvidenceGroups,
    'planAssumptions' | 'planCalculations' | 'executionAssumptions' | 'monitoringCalculations'
>;

const applicabilityItems: Record<ApplicabilityGroup, SoxlAiEvidenceItem> = {
    planAssumptions: {
        id: 'plan.assumptions.side',
        source: 'trade_plan',
        snapshotRole: 'plan_context',
        sourcePath: 'plan.input.side',
        label: 'Plan side',
        trustClass: 'user_supplied_plan_assumption',
        availability: 'available',
        value: 'long',
        unit: null,
    },
    planCalculations: {
        id: 'plan.calculations.maximum_quantity',
        source: 'trade_plan',
        snapshotRole: 'plan_context',
        sourcePath: 'plan.calculation.maximumQuantity',
        label: 'Maximum quantity',
        trustClass: 'deterministic_plan_calculation',
        availability: 'available',
        value: 10,
        unit: 'shares',
    },
    executionAssumptions: {
        id: 'monitor.assumptions.entry_price',
        source: 'live_trade_monitor',
        snapshotRole: 'monitoring_baseline',
        sourcePath: 'monitor.input.entryPrice',
        label: 'Entry price',
        trustClass: 'user_supplied_execution_assumption',
        availability: 'available',
        value: 26.5,
        unit: 'usd',
    },
    monitoringCalculations: {
        id: 'monitor.calculations.price.current_completed_5m_price',
        source: 'live_trade_monitor',
        snapshotRole: 'monitoring_current',
        sourcePath: 'monitor.priceMonitoring.currentPrice',
        label: 'Current completed five-minute price',
        trustClass: 'deterministic_monitoring_calculation',
        availability: 'available',
        value: 27,
        unit: 'usd',
    },
};

function evidenceWithApplicability(group: ApplicabilityGroup): SoxlAiEvidencePackage {
    const base = evidence();
    const item = applicabilityItems[group];

    return {
        ...base,
        items: [...base.items, item],
        groups: {
            ...base.groups,
            [group]: [item.id],
        },
    };
}

function expectIssue(
    value: unknown,
    issue: SoxlAiResponseValidationIssue,
    packageEvidence = evidence(),
): void {
    const result = validateSoxlAiExplanationResponse(
        typeof value === 'string' ? value : raw(value),
        packageEvidence,
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toContain(issue);
    expect(JSON.stringify(result)).not.toContain('raw-secret');
}

describe('validateSoxlAiExplanationResponse', () => {
    it('accepts valid available, partial, and unavailable responses', () => {
        expect(validateSoxlAiExplanationResponse(raw(response()), evidence())).toMatchObject({
            valid: true,
            issues: [],
        });

        const partialEvidence = evidence('partial', [missingId]);
        expect(validateSoxlAiExplanationResponse(raw(response({
            status: 'partial',
            missingEvidence: [point('The condition state is unavailable.', [missingId])],
        })), partialEvidence)).toMatchObject({
            valid: true,
            issues: [],
        });

        const unavailableEvidence = evidence('unavailable', [missingId], { providerId: null, asOf: null });
        expect(validateSoxlAiExplanationResponse(raw(response({
            status: 'unavailable',
            snapshotIdentity: { providerId: null, asOf: null },
            summary: [point('Current evidence is unavailable.', [missingId])],
            missingEvidence: [point('Current evidence is unavailable.', [missingId])],
            limitations: [point('Only availability information can be stated.', [missingId])],
        })), unavailableEvidence)).toMatchObject({
            valid: true,
            issues: [],
        });
    });

    it.each([
        ['empty response', '', 'empty_response'],
        ['oversized response', `{${' '.repeat(65_536)}}`, 'response_too_large'],
        ['invalid JSON', '{raw-secret', 'invalid_json'],
        ['code-fenced JSON', `\`\`\`json\n${raw(response())}\n\`\`\``, 'invalid_json'],
        ['prose before JSON', `Here: ${raw(response())}`, 'invalid_json'],
        ['prose after JSON', `${raw(response())} trailing`, 'invalid_json'],
        ['array root', [], 'invalid_response_shape'],
        ['primitive root', 'primitive', 'invalid_json'],
    ] as const)('rejects raw boundary issue: %s', (_name, value, issue) => {
        expectIssue(value, issue);
    });

    it.each([
        ['missing top-level key', () => {
            const invalid = { ...response() } as Record<string, unknown>;
            delete invalid.summary;
            return invalid;
        }, 'invalid_response_shape'],
        ['additional top-level key', () => ({ ...response(), prose: 'extra' }), 'unexpected_response_key'],
        ['invalid status value', () => ({ ...response(), status: 'done' }), 'invalid_response_shape'],
        ['status mismatch', () => ({ ...response(), status: 'partial' }), 'status_mismatch'],
        ['missing snapshot key', () => ({ ...response(), snapshotIdentity: { providerId } }), 'invalid_response_shape'],
        ['additional snapshot key', () => ({ ...response(), snapshotIdentity: { providerId, asOf: String(asOf), extra: true } }), 'invalid_response_shape'],
        ['provider mismatch', () => ({ ...response(), snapshotIdentity: { providerId: 'other', asOf: String(asOf) } }), 'snapshot_identity_mismatch'],
        ['asOf mismatch', () => ({ ...response(), snapshotIdentity: { providerId, asOf: String(asOf + 1) } }), 'snapshot_identity_mismatch'],
        ['plan identity cannot replace current identity', () => ({ ...response(), snapshotIdentity: { providerId: 'plan-provider', asOf: String(asOf - 1) } }), 'snapshot_identity_mismatch'],
    ] as const)('rejects status or snapshot issue: %s', (_name, makeValue, issue) => {
        expectIssue(makeValue(), issue);
    });

    it.each([
        ['missing section array', () => ({ ...response(), summary: undefined }), 'invalid_response_shape'],
        ['non-array section', () => ({ ...response(), summary: 'summary' }), 'invalid_response_shape'],
        ['invalid point shape', () => ({ ...response(), summary: [{ text: 'Only text' }] }), 'invalid_response_shape'],
        ['additional point key', () => ({ ...response(), summary: [{ ...point('Text'), extra: true }] }), 'invalid_response_shape'],
        ['blank point text', () => ({ ...response(), summary: [point('   ')] }), 'invalid_response_shape'],
        ['empty evidence-ID array', () => ({ ...response(), summary: [point('Text', [])] }), 'invalid_response_shape'],
        ['duplicate ID inside one point', () => ({ ...response(), summary: [point('Text', [availableId, availableId])] }), 'invalid_response_shape'],
        ['unknown evidence ID', () => ({ ...response(), summary: [point('Text', ['source.path.not.id'])] }), 'unknown_evidence_reference'],
        ['point-count limit', () => ({ ...response(), summary: Array.from({ length: 51 }, (_, index) => point(`Text ${index}`)) }), 'invalid_response_shape'],
        ['evidence-ID-count limit', () => ({ ...response(), summary: [point('Text', Array.from({ length: 21 }, (_, index) => `${availableId}.${index}`))] }), 'invalid_response_shape'],
        ['text-length limit', () => ({ ...response(), summary: [point('x'.repeat(2_001))] }), 'invalid_response_shape'],
    ] as const)('rejects point-shape issue: %s', (_name, makeValue, issue) => {
        expectIssue(makeValue(), issue);
    });

    it('validates missing-evidence references and completeness', () => {
        expectIssue(
            response({ missingEvidence: [point('Available item is not missing.', [availableId])] }),
            'invalid_missing_evidence_reference',
            evidence('partial', [missingId]),
        );
        expectIssue(response({ status: 'partial', missingEvidence: [] }), 'uncited_missing_evidence', evidence('partial', [missingId]));
        expectIssue(response({ missingEvidence: [point('No missing item exists.', [availableId])] }), 'invalid_missing_evidence_reference', evidence());
    });

    it('requires unsupported sections to stay empty for unavailable packages', () => {
        expectIssue(response({
            status: 'unavailable',
            snapshotIdentity: { providerId: null, asOf: null },
            supportingEvidence: [point('Unsupported.', [missingId])],
            missingEvidence: [point('Missing.', [missingId])],
        }), 'invalid_response_shape', evidence('unavailable', [missingId], { providerId: null, asOf: null }));
    });

    it.each([
        'you should buy',
        'you should sell',
        'you should hold',
        'you should add',
        'you should reduce',
        'you should close',
        'you should exit',
        'buy now',
        'sell now',
        'close the position',
        'exit the position',
        'move your invalidation',
        'move the invalidation',
        'move your target',
        'move the target',
        'place an order',
        'recommended action',
        'preferred scenario',
        'trade signal',
        'trade decision',
        'guaranteed outcome',
        'expected win rate',
        'confidence percentage',
        'probability percentage',
        'win-rate percentage',
        '70% confidence',
        'probability is 55%',
        'aggregate score is 8',
    ])('rejects prohibited text: %s', (text) => {
        expectIssue(response({ summary: [point(text)] }), 'prohibited_content');
    });

    it.each([
        'This response does not recommend an action.',
        'No outcome is guaranteed.',
        'The latest completed close is $27.12.',
        'The invalidation level was reached.',
        'The MACD signal line is below the MACD line.',
        'The user supplied a long side.',
        'The short side is a user-supplied field.',
    ])('allows neutral domain text: %s', (text) => {
        expect(validateSoxlAiExplanationResponse(raw(response({ summary: [point(text)] })), evidence())).toMatchObject({
            valid: true,
        });
    });

    it('rejects explicit numeric claims that are not grounded in cited evidence values', () => {
        expectIssue(
            response({ summary: [point('The latest completed close is $999.99.')] }),
            'ungrounded_numeric_claim',
        );
    });

    it('permits rounded explicit numeric claims grounded in cited evidence values', () => {
        expect(validateSoxlAiExplanationResponse(
            raw(response({ summary: [point('The latest completed close is $27.12.')] })),
            evidence(),
        )).toMatchObject({ valid: true });
    });

    it('requires empty trade-plan explanation when plan evidence groups are empty', () => {
        expectIssue(response({
            tradePlanExplanation: [point('Plan explanation is not applicable.', [availableId])],
        }), 'invalid_response_shape', evidence());
    });

    it('requires empty monitoring changes when monitoring evidence groups are empty', () => {
        expectIssue(response({
            monitoringChanges: [point('Monitoring changes are not applicable.', [availableId])],
        }), 'invalid_response_shape', evidence());
    });

    it.each([
        'planAssumptions',
        'planCalculations',
    ] as const)('permits grounded plan explanation when %s evidence exists', (group) => {
        const packageEvidence = evidenceWithApplicability(group);
        const evidenceId = applicabilityItems[group].id;
        expect(validateSoxlAiExplanationResponse(raw(response({
            tradePlanExplanation: [point('Plan evidence is grounded.', [evidenceId])],
        })), packageEvidence)).toMatchObject({ valid: true });
    });

    it.each([
        'executionAssumptions',
        'monitoringCalculations',
    ] as const)('permits grounded monitoring changes when %s evidence exists', (group) => {
        const packageEvidence = evidenceWithApplicability(group);
        const evidenceId = applicabilityItems[group].id;
        expect(validateSoxlAiExplanationResponse(raw(response({
            monitoringChanges: [point('Monitoring evidence is grounded.', [evidenceId])],
        })), packageEvidence)).toMatchObject({ valid: true });
    });

    it('does not let applicability checks affect other grounded sections', () => {
        expect(validateSoxlAiExplanationResponse(raw(response({
            summary: [point('Current market summary is grounded.', [availableId])],
            supportingEvidence: [point('Supporting evidence is grounded.', [availableId])],
            conflictingEvidence: [point('Conflicting evidence is grounded.', [availableId])],
            riskReminders: [point('Risk reminder is grounded.', [availableId])],
            limitations: [point('Limitation is grounded.', [availableId])],
        })), evidence())).toMatchObject({ valid: true });
    });

    it('does not mutate evidence and produces deterministic validation results', () => {
        const packageEvidence = evidence('partial', [missingId]);
        const before = JSON.stringify(packageEvidence);
        const value = raw(response({
            status: 'partial',
            missingEvidence: [point('Missing condition.', [missingId])],
        }));
        const first = validateSoxlAiExplanationResponse(value, packageEvidence);
        const second = validateSoxlAiExplanationResponse(value, JSON.parse(before) as SoxlAiEvidencePackage);

        expect(JSON.stringify(packageEvidence)).toBe(before);
        expect(first).toEqual(second);
    });

    it('does not use the system clock', () => {
        const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
            throw new Error('Date.now should not be called');
        });

        expect(validateSoxlAiExplanationResponse(raw(response()), evidence())).toMatchObject({ valid: true });
        expect(dateNowSpy).not.toHaveBeenCalled();
    });
});
