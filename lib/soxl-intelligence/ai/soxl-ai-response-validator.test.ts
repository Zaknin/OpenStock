import { describe, expect, it, vi } from 'vitest';
import type { SoxlAiEvidencePackage } from './soxl-ai-evidence';
import {
    buildSoxlAiEvidenceReferenceCatalog,
    type SoxlAiEvidenceReferenceCatalog,
} from './soxl-ai-evidence-reference-catalog.server';
import type { SoxlAiModelExplanation } from './soxl-ai-prompt';
import {
    validateSoxlAiModelExplanation,
    type SoxlAiResponseValidationIssue,
    type SoxlAiResponseValidationSection,
} from './soxl-ai-response-validator';

const availableId = 'current.market_facts.soxl_5m.latest_completed.close';
const missingId = 'current.assessment.upward_alignment.condition.state';

function evidence(
    status: SoxlAiEvidencePackage['status'] = 'available',
    missingEvidence: readonly string[] = [],
): SoxlAiEvidencePackage {
    return {
        status,
        issues: status === 'available' ? [] : ['no_current_market_evidence'],
        snapshotIdentities: [{
            role: 'current',
            providerId: status === 'unavailable' ? null : 'twelve-data',
            asOf: status === 'unavailable' ? null : 1_787_654_321_123,
            factsStatus: status,
            assessmentStatus: status,
            coreStatus: status,
            sessionStatus: status,
            openingRangeComplete: null,
            regularSessionComplete: null,
        }],
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
                sourcePath: 'assessment.upwardAlignment.condition.state',
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

function catalogFor(input: SoxlAiEvidencePackage): SoxlAiEvidenceReferenceCatalog {
    const result = buildSoxlAiEvidenceReferenceCatalog(input);
    if (!result.ok) {
        throw new Error('Expected evidence catalog');
    }
    return result.catalog;
}

function aliasFor(id: string, catalog: SoxlAiEvidenceReferenceCatalog): string {
    const alias = catalog.evidenceIdToAlias.get(id);
    if (alias === undefined) {
        throw new Error('Expected alias');
    }
    return alias;
}

function point(
    text: string,
    ids: readonly string[],
    catalog: SoxlAiEvidenceReferenceCatalog,
) {
    return { text, evidenceRefs: ids.map((id) => aliasFor(id, catalog)) };
}

function response(
    catalog: SoxlAiEvidenceReferenceCatalog,
    overrides: Partial<SoxlAiModelExplanation> = {},
): SoxlAiModelExplanation {
    return {
        status: 'available',
        summary: [point('The latest completed close is available.', [availableId], catalog)],
        supportingEvidence: [],
        conflictingEvidence: [],
        missingEvidence: [],
        riskReminders: [],
        limitations: [],
        ...overrides,
    };
}

function validate(value: unknown, input = evidence()) {
    const catalog = catalogFor(input);
    return validateSoxlAiModelExplanation(
        typeof value === 'string' ? value : JSON.stringify(value),
        input,
        catalog,
    );
}

function expectIssue(
    value: unknown,
    issue: SoxlAiResponseValidationIssue,
    input = evidence(),
    section?: SoxlAiResponseValidationSection,
    field?: string,
): void {
    const result = validate(value, input);
    expect(result).toMatchObject({ valid: false, reason: issue });
    expect(result.issues).toContain(issue);
    if (section !== undefined) {
        expect(result).toMatchObject({ section });
    }
    if (field !== undefined) {
        expect(result).toMatchObject({ field });
    }
    expect(JSON.stringify(result)).not.toContain('raw-secret');
}

describe('validateSoxlAiModelExplanation', () => {
    it('maps valid model aliases to canonical application evidence IDs', () => {
        const input = evidence();
        const catalog = catalogFor(input);
        const result = validateSoxlAiModelExplanation(
            JSON.stringify(response(catalog, {
                supportingEvidence: [point('The completed close is 27.12.', [availableId], catalog)],
            })),
            input,
            catalog,
        );

        expect(result).toEqual({
            valid: true,
            issues: [],
            value: {
                status: 'available',
                summary: [{
                    text: 'The latest completed close is available.',
                    evidenceIds: [availableId],
                }],
                supportingEvidence: [{
                    text: 'The completed close is 27.12.',
                    evidenceIds: [availableId],
                }],
                conflictingEvidence: [],
                missingEvidence: [],
                riskReminders: [],
                limitations: [],
            },
        });
        expect(JSON.stringify(result)).not.toMatch(/E001|evidenceRefs/u);
    });

    it('permits empty supporting and sibling sections consistently', () => {
        const input = evidence();
        const catalog = catalogFor(input);

        expect(validateSoxlAiModelExplanation(
            JSON.stringify(response(catalog, { summary: [] })),
            input,
            catalog,
        )).toMatchObject({ valid: true });
    });

    it.each([
        ['empty response', '', 'empty_response'],
        ['oversized response', `{${' '.repeat(65_536)}}`, 'response_too_large'],
        ['invalid JSON', '{raw-secret', 'invalid_json'],
        ['Markdown fence', '```json\n{}\n```', 'invalid_json'],
        ['surrounding prose', 'Here: {}', 'invalid_json'],
        ['array root', [], 'root_not_object'],
        ['null root', 'null', 'root_not_object'],
    ] as const)('rejects raw boundary issue: %s', (_name, value, issue) => {
        expectIssue(value, issue);
    });

    it.each([
        'summary',
        'supportingEvidence',
        'conflictingEvidence',
        'missingEvidence',
        'riskReminders',
        'limitations',
    ] as const)('uses precise structural diagnostics for %s', (section) => {
        const input = evidence();
        const catalog = catalogFor(input);
        const missing = { ...response(catalog) } as Record<string, unknown>;
        delete missing[section];
        expectIssue(missing, 'section_missing', input, section);

        expectIssue({ ...response(catalog), [section]: {} }, 'section_not_array', input, section);
        expectIssue({ ...response(catalog), [section]: ['text'] }, 'section_item_not_object', input, section);
        expectIssue({
            ...response(catalog),
            [section]: Array.from(
                { length: 51 },
                (_, index) => point(`Text ${index}`, [availableId], catalog),
            ),
        }, 'section_too_many', input, section);
    });

    it('uses precise supportingEvidence item diagnostics and never the generic section code', () => {
        const input = evidence();
        const catalog = catalogFor(input);
        const cases = [
            [{ evidenceRefs: ['E001'] }, 'section_item_missing_required_field', 'text'],
            [{ text: 4, evidenceRefs: ['E001'] }, 'section_item_field_wrong_type', 'text'],
            [{ text: 'Text', evidenceRefs: ['E001'], extra: true }, 'section_item_unexpected_field', undefined],
        ] as const;

        cases.forEach(([item, reason, field]) => {
            expectIssue(
                { ...response(catalog), supportingEvidence: [item] },
                reason,
                input,
                'supportingEvidence',
                field,
            );
            expect(validate({ ...response(catalog), supportingEvidence: [item] }, input))
                .not.toMatchObject({ reason: 'other_shape_mismatch' });
        });
    });

    it.each([
        ['missing', { text: 'Text' }, 'evidence_refs_missing'],
        ['not array', { text: 'Text', evidenceRefs: 'E001' }, 'evidence_refs_not_array'],
        ['empty', { text: 'Text', evidenceRefs: [] }, 'evidence_refs_empty'],
        ['too many', { text: 'Text', evidenceRefs: Array.from({ length: 21 }, () => 'E001') }, 'evidence_refs_too_many'],
        ['not string', { text: 'Text', evidenceRefs: [4] }, 'evidence_ref_not_string'],
        ['blank', { text: 'Text', evidenceRefs: [' '] }, 'evidence_ref_blank'],
        ['malformed', { text: 'Text', evidenceRefs: ['X001'] }, 'evidence_ref_format_invalid'],
        ['duplicate', { text: 'Text', evidenceRefs: ['E001', 'E001'] }, 'evidence_ref_duplicate'],
        ['unknown', { text: 'Text', evidenceRefs: ['E999'] }, 'unknown_evidence_reference'],
    ] as const)('rejects alias issue: %s', (_name, item, issue) => {
        const input = evidence();
        const catalog = catalogFor(input);
        expectIssue(
            { ...response(catalog), summary: [item] },
            issue,
            input,
            'summary',
            'evidenceRefs',
        );
    });

    it('rejects model-supplied canonical evidenceIds instead of normalizing it', () => {
        const input = evidence();
        const catalog = catalogFor(input);
        expectIssue({
            ...response(catalog),
            summary: [{ text: 'Text', evidenceIds: [availableId] }],
        }, 'section_item_unexpected_field', input, 'summary');
    });

    it('does not expose invalid aliases or canonical IDs in diagnostics or logs', () => {
        const input = evidence();
        const catalog = catalogFor(input);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const invalidAlias = 'E999';
        const result = validate({
            ...response(catalog),
            summary: [{ text: 'Text', evidenceRefs: [invalidAlias] }],
        }, input);

        expect(JSON.stringify(result)).not.toContain(invalidAlias);
        expect(JSON.stringify(result)).not.toContain(availableId);
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('validates missing-evidence aliases against current canonical missing IDs', () => {
        const input = evidence('partial', [missingId]);
        const catalog = catalogFor(input);
        const valid = response(catalog, {
            status: 'partial',
            missingEvidence: [point('The condition is unavailable.', [missingId], catalog)],
        });

        expect(validate(valid, input)).toMatchObject({ valid: true });
        expectIssue(
            response(catalog, { status: 'partial', missingEvidence: [] }),
            'uncited_missing_evidence',
            input,
        );
        expectIssue(response(catalog, {
            status: 'partial',
            missingEvidence: [point('Not missing.', [availableId], catalog)],
        }), 'invalid_missing_evidence_reference', input);
    });

    it('keeps unsupported sections empty for unavailable evidence', () => {
        const input = evidence('unavailable', [missingId]);
        const catalog = catalogFor(input);
        expectIssue(response(catalog, {
            status: 'unavailable',
            summary: [point('Evidence is unavailable.', [missingId], catalog)],
            supportingEvidence: [point('Unsupported.', [missingId], catalog)],
            missingEvidence: [point('Evidence is unavailable.', [missingId], catalog)],
        }), 'other_section_shape_mismatch', input, 'supportingEvidence');
    });

    it.each([
        ['you should buy now', 'forbidden_recommendation'],
        ['The preferred scenario is upward.', 'forbidden_scenario_selection'],
        ['The confidence percentage is 90%.', 'prohibited_content'],
        ['The expected win rate is 80%.', 'prohibited_content'],
        ['The aggregate score is 4.', 'prohibited_content'],
    ] as const)('rejects prohibited content: %s', (text, issue) => {
        const input = evidence();
        const catalog = catalogFor(input);
        expectIssue(response(catalog, {
            summary: [point(text, [availableId], catalog)],
        }), issue, input);
    });

    it('preserves strict numeric grounding after alias mapping', () => {
        const input = evidence();
        const catalog = catalogFor(input);

        expect(validate(response(catalog, {
            summary: [point('The completed close is 27.12.', [availableId], catalog)],
        }), input)).toMatchObject({ valid: true });
        expectIssue(response(catalog, {
            summary: [point('The completed close is 99.99.', [availableId], catalog)],
        }), 'ungrounded_numeric_claim', input);
    });

    it('rejects server metadata at root and inside section items', () => {
        const input = evidence();
        const catalog = catalogFor(input);
        expectIssue({
            ...response(catalog),
            snapshotToken: 'raw-secret',
        }, 'unexpected_server_metadata_field', input, undefined, 'snapshotToken');
        expectIssue({
            ...response(catalog),
            summary: [{ ...point('Text', [availableId], catalog), providerId: 'raw-secret' }],
        }, 'unexpected_server_metadata_field', input, undefined, 'providerId');
    });

    it('rejects status and top-level contract failures', () => {
        const input = evidence();
        const catalog = catalogFor(input);
        expectIssue({ ...response(catalog), status: 'done' }, 'top_level_field_wrong_type', input, undefined, 'status');
        expectIssue({ ...response(catalog), status: 'partial' }, 'status_mismatch', input);
        expectIssue({ ...response(catalog), extra: true }, 'unexpected_top_level_fields', input);
    });

    it('is deterministic and does not mutate evidence or the catalog', () => {
        const input = evidence('partial', [missingId]);
        const catalog = catalogFor(input);
        const beforeEvidence = JSON.stringify(input);
        const beforeEntries = JSON.stringify(catalog.entries);
        const value = JSON.stringify(response(catalog, {
            status: 'partial',
            missingEvidence: [point('Missing.', [missingId], catalog)],
        }));

        expect(validateSoxlAiModelExplanation(value, input, catalog)).toEqual(
            validateSoxlAiModelExplanation(value, input, catalog),
        );
        expect(JSON.stringify(input)).toBe(beforeEvidence);
        expect(JSON.stringify(catalog.entries)).toBe(beforeEntries);
    });
});
