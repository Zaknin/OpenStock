import { describe, expect, it, vi } from 'vitest';
import type {
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
        riskReminders: [],
        limitations: [],
        ...overrides,
    };
}

function raw(value: unknown): string {
    return JSON.stringify(value);
}

function expectIssue(
    value: unknown,
    issue: SoxlAiResponseValidationIssue,
    packageEvidence = evidence(),
    field?: string,
): void {
    const result = validateSoxlAiExplanationResponse(
        typeof value === 'string' ? value : raw(value),
        packageEvidence,
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toContain(issue);
    expect(result).toMatchObject({ reason: issue });
    if (field !== undefined) {
        expect(result).toMatchObject({ field });
    }
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
        ['array root', [], 'root_not_object'],
        ['string root', raw('primitive'), 'root_not_object'],
        ['null root', 'null', 'root_not_object'],
        ['multiple objects', `${raw(response())}${raw(response())}`, 'invalid_json'],
    ] as const)('rejects raw boundary issue: %s', (_name, value, issue) => {
        expectIssue(value, issue);
    });

    it.each([
        ['missing top-level key', () => {
            const invalid = { ...response() } as Record<string, unknown>;
            delete invalid.summary;
            return invalid;
        }, 'missing_required_top_level_field', 'summary'],
        ['additional top-level key', () => ({ ...response(), modelGeneratedSecretName: 'extra' }), 'unexpected_top_level_fields', undefined],
        ['invalid status value', () => ({ ...response(), status: 'done' }), 'top_level_field_wrong_type', 'status'],
        ['null status', () => ({ ...response(), status: null }), 'nullable_contract_mismatch', 'status'],
        ['status mismatch', () => ({ ...response(), status: 'partial' }), 'status_mismatch', undefined],
        ['missing snapshot key', () => ({ ...response(), snapshotIdentity: { providerId } }), 'missing_required_item_field', 'asOf'],
        ['additional snapshot key', () => ({ ...response(), snapshotIdentity: { providerId, asOf: String(asOf), modelProperty: true } }), 'other_shape_mismatch', undefined],
        ['snapshot wrong type', () => ({ ...response(), snapshotIdentity: [] }), 'top_level_field_wrong_type', 'snapshotIdentity'],
        ['snapshot null', () => ({ ...response(), snapshotIdentity: null }), 'nullable_contract_mismatch', 'snapshotIdentity'],
        ['snapshot item wrong type', () => ({ ...response(), snapshotIdentity: { providerId: 4, asOf: String(asOf) } }), 'item_field_wrong_type', 'providerId'],
        ['provider mismatch', () => ({ ...response(), snapshotIdentity: { providerId: 'other', asOf: String(asOf) } }), 'snapshot_identity_mismatch', undefined],
        ['asOf mismatch', () => ({ ...response(), snapshotIdentity: { providerId, asOf: String(asOf + 1) } }), 'snapshot_identity_mismatch', undefined],
        ['plan identity cannot replace current identity', () => ({ ...response(), snapshotIdentity: { providerId: 'plan-provider', asOf: String(asOf - 1) } }), 'snapshot_identity_mismatch', undefined],
    ] as const)('rejects status or snapshot issue: %s', (_name, makeValue, issue, field) => {
        expectIssue(makeValue(), issue, evidence(), field);
    });

    it.each([
        ['missing section array', () => ({ ...response(), summary: undefined }), 'missing_required_top_level_field', 'summary'],
        ['section object', () => ({ ...response(), summary: {} }), 'section_not_array', 'summary'],
        ['null section', () => ({ ...response(), summary: null }), 'nullable_contract_mismatch', 'summary'],
        ['primitive section item', () => ({ ...response(), summary: ['text'] }), 'section_item_not_object', 'summary'],
        ['null section item', () => ({ ...response(), summary: [null] }), 'nullable_contract_mismatch', 'summary'],
        ['missing evidence IDs', () => ({ ...response(), summary: [{ text: 'Only text' }] }), 'missing_required_item_field', 'evidenceIds'],
        ['additional point key', () => ({ ...response(), summary: [{ ...point('Text'), modelProperty: true }] }), 'other_shape_mismatch', undefined],
        ['wrong text type', () => ({ ...response(), summary: [{ text: 4, evidenceIds: [availableId] }] }), 'item_field_wrong_type', 'text'],
        ['null text', () => ({ ...response(), summary: [{ text: null, evidenceIds: [availableId] }] }), 'nullable_contract_mismatch', 'text'],
        ['blank point text', () => ({ ...response(), summary: [point('   ')] }), 'empty_value_not_allowed', 'text'],
        ['non-array evidence IDs', () => ({ ...response(), summary: [{ text: 'Text', evidenceIds: availableId }] }), 'evidence_references_not_array', 'evidenceIds'],
        ['non-string evidence ID', () => ({ ...response(), summary: [{ text: 'Text', evidenceIds: [4] }] }), 'evidence_reference_not_string', 'evidenceIds'],
        ['null evidence IDs', () => ({ ...response(), summary: [{ text: 'Text', evidenceIds: null }] }), 'nullable_contract_mismatch', 'evidenceIds'],
        ['empty evidence-ID array', () => ({ ...response(), summary: [point('Text', [])] }), 'empty_value_not_allowed', 'evidenceIds'],
        ['duplicate ID inside one point', () => ({ ...response(), summary: [point('Text', [availableId, availableId])] }), 'other_shape_mismatch', 'evidenceIds'],
        ['unknown evidence ID', () => ({ ...response(), summary: [point('Text', ['source.path.not.id'])] }), 'unknown_evidence_reference', 'evidenceIds'],
        ['point-count limit', () => ({ ...response(), summary: Array.from({ length: 51 }, (_, index) => point(`Text ${index}`)) }), 'other_shape_mismatch', 'summary'],
        ['evidence-ID-count limit', () => ({ ...response(), summary: [point('Text', Array.from({ length: 21 }, (_, index) => `${availableId}.${index}`))] }), 'other_shape_mismatch', 'evidenceIds'],
        ['text-length limit', () => ({ ...response(), summary: [point('x'.repeat(2_001))] }), 'other_shape_mismatch', 'text'],
    ] as const)('rejects point-shape issue: %s', (_name, makeValue, issue, field) => {
        expectIssue(makeValue(), issue, evidence(), field);
    });

    it('validates missing-evidence references and completeness', () => {
        expectIssue(
            response({
                status: 'partial',
                missingEvidence: [point('Available item is not missing.', [availableId])],
            }),
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
        }), 'other_shape_mismatch', evidence('unavailable', [missingId], { providerId: null, asOf: null }));
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
        'trade signal',
        'trade decision',
    ])('rejects recommendation text: %s', (text) => {
        expectIssue(response({ summary: [point(text)] }), 'forbidden_recommendation');
    });

    it('rejects preferred-scenario selection separately', () => {
        expectIssue(response({ summary: [point('preferred scenario')] }), 'forbidden_scenario_selection');
    });

    it.each([
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

    it.each([
        ['tradePlanExplanation', [point('Plan content.')]],
        ['monitoringChanges', [point('Monitor content.')]],
    ] as const)('rejects removed current-only field %s without retaining its name', (field, value) => {
        const result = validateSoxlAiExplanationResponse(raw({
            ...response(),
            [field]: value,
        }), evidence());

        expect(result).toMatchObject({
            valid: false,
            reason: 'unexpected_top_level_fields',
        });
        expect(JSON.stringify(result)).not.toContain(field);
    });

    it('keeps all current grounded sections available', () => {
        expect(validateSoxlAiExplanationResponse(raw(response({
            summary: [point('Current market summary is grounded.', [availableId])],
            supportingEvidence: [point('Supporting evidence is grounded.', [availableId])],
            conflictingEvidence: [point('Conflicting evidence is grounded.', [availableId])],
            riskReminders: [point('Risk reminder is grounded.', [availableId])],
            limitations: [point('Limitation is grounded.', [availableId])],
        })), evidence())).toMatchObject({ valid: true });
    });

    it('stores only fixed diagnostics and no raw response content', () => {
        const secretProperty = 'modelSuppliedCredentialBearingProperty';
        const result = validateSoxlAiExplanationResponse(raw({
            ...response(),
            [secretProperty]: 'raw-secret generated prose evidence snapshot-token credential',
        }), evidence());
        const serialized = JSON.stringify(result);

        expect(result).toEqual({
            valid: false,
            value: null,
            issues: ['unexpected_top_level_fields'],
            reason: 'unexpected_top_level_fields',
        });
        expect(serialized).not.toContain(secretProperty);
        expect(serialized).not.toContain('raw-secret');
        expect(serialized).not.toContain(availableId);
        expect(serialized).not.toContain('snapshot-token');
        expect(serialized).not.toContain('credential');
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
