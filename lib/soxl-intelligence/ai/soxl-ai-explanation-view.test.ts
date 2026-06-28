import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
    SoxlAiCurrentExplanationIssue,
    SoxlAiCurrentExplanationResult,
} from './soxl-ai-current-explanation.server';
import {
    buildSoxlAiExplanationView,
} from './soxl-ai-explanation-view';
import {
    formatSoxlDisplayTimestamp,
} from '../presentation/time-format';

const providerId = 'twelve-data';
const aiProviderId = 'gemini';
const asOf = '1787654321';
const snapshotToken = `soxl-current-v1:${'a'.repeat(64)}`;

function point(text: string, evidenceIds: readonly string[] = ['current.market_facts.status']) {
    return { text, evidenceIds };
}

function availableResult(): SoxlAiCurrentExplanationResult {
    return {
        status: 'available',
        retryAfterSeconds: null,
        issues: [],
        snapshotToken,
        providerId: aiProviderId,
        explanation: {
            status: 'available',
            snapshotIdentity: { providerId, asOf },
            summary: [point('Plain summary with **markdown** and <b>html</b>.')],
            supportingEvidence: [point('Supporting text.', ['a', 'b'])],
            conflictingEvidence: [point('Conflicting text.')],
            missingEvidence: [point('Missing text.')],
            riskReminders: [point('Risk reminder text.')],
            limitations: [point('Limitation text.')],
        },
    };
}

describe('buildSoxlAiExplanationView', () => {
    it('maps an available explanation with sections and evidence IDs in order', () => {
        const view = buildSoxlAiExplanationView(availableResult(), { snapshotToken });

        expect(view.status).toBe('available');
        expect(view.statusLabel).toBe('Available');
        expect(view.explanationStatus).toBe('available');
        expect(view.explanationStatusLabel).toBe('Available');
        expect(view.providerId).toBe(aiProviderId);
        expect(view.providerLabel).toBe('Gemini');
        expect(view.asOf).toBe(asOf);
        expect(view.asOfLabel).toBe(formatSoxlDisplayTimestamp(Number(asOf)));
        expect(view.asOfLabel).toContain('GMT+4');
        expect(view.summary[0].text).toBe('Plain summary with **markdown** and <b>html</b>.');
        expect(view.supportingEvidence[0].evidenceIds).toEqual(['a', 'b']);
        expect(view.conflictingEvidence[0].text).toBe('Conflicting text.');
        expect(view.missingEvidence[0].text).toBe('Missing text.');
        expect(view.riskReminders[0].text).toBe('Risk reminder text.');
        expect(view.limitations[0].text).toBe('Limitation text.');
        expect(view.snapshotToken).toBe(snapshotToken);
        expect(view.describesCurrentSnapshot).toBe(true);
    });

    it('preserves partial explanation status inside an available action result', () => {
        const result = availableResult();
        const view = buildSoxlAiExplanationView({
            ...result,
            explanation: {
                ...result.explanation!,
                status: 'partial',
            },
        });

        expect(view.status).toBe('available');
        expect(view.statusLabel).toBe('Available');
        expect(view.explanationStatus).toBe('partial');
        expect(view.explanationStatusLabel).toBe('Partial');
    });

    it('maps unavailable results, structured issue explanations, and retry duration', () => {
        const view = buildSoxlAiExplanationView({
            status: 'unavailable',
            explanation: null,
            issues: ['rate_limited', 'provider_error', 'section_item_missing_required_field'],
            retryAfterSeconds: 30,
            snapshotToken: null,
            providerId: null,
        });

        expect(view.status).toBe('unavailable');
        expect(view.statusLabel).toBe('Unavailable');
        expect(view.explanationStatus).toBeNull();
        expect(view.explanationStatusLabel).toBe('Unavailable');
        expect(view.providerId).toBeNull();
        expect(view.providerLabel).toBeNull();
        expect(view.asOfLabel).toBe('Unavailable');
        expect(view.describesCurrentSnapshot).toBe(true);
        expect(view.retryAfterSeconds).toBe(30);
        expect(view.issues.map((issue) => issue.code)).toEqual(['rate_limited', 'provider_error', 'section_item_missing_required_field']);
        expect(view.issues.map((issue) => issue.message)).toEqual([
            'Please wait before requesting another explanation.',
            'The AI explanation provider could not complete the request.',
            'The AI response did not pass the grounding and safety checks.',
        ]);
    });

    it('maps every action issue to its intended beginner-friendly message', () => {
        const cases = [
            ['unauthenticated', 'Your authenticated session is required to request an explanation.'],
            ['invalid_request', 'The explanation request was not valid.'],
            ['rate_limited', 'Please wait before requesting another explanation.'],
            ['request_in_flight', 'An explanation request is already running for this account.'],
            ['global_capacity_reached', 'The explanation service is temporarily busy.'],
            ['stale_snapshot', 'The page data changed before the explanation request. Refresh page data and try again.'],
            ['current_data_unavailable', 'The current deterministic market snapshot is not available for explanation.'],
            ['provider_not_configured', 'The AI explanation provider is not configured.'],
            ['provider_timeout', 'The AI explanation provider did not respond in time.'],
            ['provider_error', 'The AI explanation provider could not complete the request.'],
        ] as const satisfies readonly (readonly [SoxlAiCurrentExplanationIssue, string])[];
        const view = buildSoxlAiExplanationView({
            status: 'unavailable',
            explanation: null,
            issues: cases.map(([issue]) => issue),
            retryAfterSeconds: null,
            snapshotToken: null,
            providerId: null,
        });

        expect(view.issues).toEqual(cases.map(([code, message]) => ({ code, message })));
    });

    it('maps every validator issue to the generic grounding and safety message', () => {
        const validatorIssues = [
            'empty_response',
            'response_too_large',
            'invalid_json',
            'root_not_object',
            'unexpected_server_metadata_field',
            'unexpected_top_level_fields',
            'missing_required_top_level_field',
            'top_level_field_wrong_type',
            'section_missing',
            'section_not_array',
            'section_too_many',
            'section_item_not_object',
            'section_item_missing_required_field',
            'section_item_field_wrong_type',
            'section_item_unexpected_field',
            'other_section_shape_mismatch',
            'evidence_refs_missing',
            'evidence_refs_not_array',
            'evidence_refs_empty',
            'evidence_refs_too_many',
            'evidence_ref_not_string',
            'evidence_ref_blank',
            'evidence_ref_format_invalid',
            'evidence_ref_duplicate',
            'evidence_catalog_too_large',
            'nullable_contract_mismatch',
            'empty_value_not_allowed',
            'other_shape_mismatch',
            'status_mismatch',
            'unknown_evidence_reference',
            'ungrounded_numeric_claim',
            'invalid_missing_evidence_reference',
            'uncited_missing_evidence',
            'forbidden_recommendation',
            'forbidden_scenario_selection',
            'prohibited_content',
        ] as const satisfies readonly SoxlAiCurrentExplanationIssue[];
        const view = buildSoxlAiExplanationView({
            status: 'unavailable',
            explanation: null,
            issues: validatorIssues,
            retryAfterSeconds: null,
            snapshotToken: null,
            providerId: 'gemini',
        });

        expect(view.issues.map(({ code }) => code)).toEqual(validatorIssues);
        expect(view.issues.every(({ message }) => (
            message === 'The AI response did not pass the grounding and safety checks.'
        ))).toBe(true);
        expect(view.providerLabel).toBe('Gemini');
        expect(view.describesCurrentSnapshot).toBe(true);
    });

    it('preserves point order and each point evidence-ID order', () => {
        const result = availableResult();
        const view = buildSoxlAiExplanationView({
            ...result,
            explanation: {
                ...result.explanation!,
                summary: [
                    point('First point.', ['first-a', 'first-b']),
                    point('Second point.', ['second-a', 'second-b']),
                ],
            },
        });

        expect(view.summary.map(({ text }) => text)).toEqual(['First point.', 'Second point.']);
        expect(view.summary.map(({ evidenceIds }) => evidenceIds)).toEqual([
            ['first-a', 'first-b'],
            ['second-a', 'second-b'],
        ]);
    });

    it('leaves empty sections empty and does not invent plan or monitoring content', () => {
        const view = buildSoxlAiExplanationView({
            ...availableResult(),
            explanation: {
                ...availableResult().explanation!,
                supportingEvidence: [],
                conflictingEvidence: [],
                missingEvidence: [],
                riskReminders: [],
                limitations: [],
            },
        });

        expect(view.supportingEvidence).toEqual([]);
        expect(view.conflictingEvidence).toEqual([]);
        expect(view.missingEvidence).toEqual([]);
        expect(view.riskReminders).toEqual([]);
        expect(view.limitations).toEqual([]);
        expect(Object.keys(view)).not.toContain('tradePlanExplanation');
        expect(Object.keys(view)).not.toContain('monitoringChanges');
        expect(Object.keys(view)).not.toContain('recommendation');
        expect(Object.keys(view)).not.toContain('action');
        expect(Object.keys(view)).not.toContain('preferredScenario');
        expect(Object.keys(view)).not.toContain('score');
        expect(Object.keys(view)).not.toContain('probability');
        expect(Object.keys(view)).not.toContain('confidence');
    });

    it('marks different tokens as earlier without mutating input', () => {
        const input = availableResult();
        const before = JSON.stringify(input);

        const view = buildSoxlAiExplanationView(input, {
            snapshotToken: `soxl-current-v1:${'b'.repeat(64)}`,
        });

        expect(view.describesCurrentSnapshot).toBe(false);
        expect(JSON.stringify(input)).toBe(before);
    });

    it.each([
        'invalid_request',
        'rate_limited',
        'stale_snapshot',
        'provider_error',
        'section_item_missing_required_field',
    ] as const)('does not mark null-token unavailable %s result as earlier', (issue) => {
        const view = buildSoxlAiExplanationView({
            status: 'unavailable',
            explanation: null,
            issues: [issue],
            retryAfterSeconds: issue === 'rate_limited' ? 30 : null,
            snapshotToken: null,
            providerId: issue === 'section_item_missing_required_field' ? 'gemini' : null,
        }, { snapshotToken });

        expect(view.describesCurrentSnapshot).toBe(true);
        expect(view.snapshotToken).toBeNull();
    });

    it('does not mark an available result with null token as earlier', () => {
        const view = buildSoxlAiExplanationView({
            ...availableResult(),
            snapshotToken: null,
        }, { snapshotToken });

        expect(view.describesCurrentSnapshot).toBe(true);
    });

    it('does not mark different response asOf as earlier when tokens match', () => {
        const result = availableResult();
        const view = buildSoxlAiExplanationView({
            ...result,
            explanation: {
                ...result.explanation!,
                snapshotIdentity: {
                    providerId,
                    asOf: String(Number(asOf) + 60),
                },
            },
        }, { snapshotToken });

        expect(view.asOf).toBe(String(Number(asOf) + 60));
        expect(view.describesCurrentSnapshot).toBe(true);
        expect(view.snapshotToken).toBe(snapshotToken);
    });

    it('keeps the component request token-only and manually invoked', () => {
        const source = readFileSync(new URL(
            '../../../components/soxl-intelligence/grounded-ai-explanation-card.tsx',
            import.meta.url,
        ), 'utf8');

        expect(source).toContain('expectedSnapshotToken: snapshotToken');
        expect(source).not.toContain('expectedProviderId');
        expect(source).not.toContain('expectedAsOf');
        expect(source).not.toContain('useEffect');
        expect(source).not.toMatch(/setInterval|setTimeout|localStorage|sessionStorage/);
        expect(source.match(/requestCurrentSoxlExplanation\(/g)).toHaveLength(1);
        expect(source).toContain('onClick={handleGenerate}');
        expect(source).toContain('onClick={handleRefresh}');
        expect(source).not.toContain('<Detail label="Snapshot token"');
        expect(source).not.toContain('{snapshotToken}</');
    });

    it('keeps page token construction current-only with one context load', () => {
        const source = readFileSync(new URL(
            '../../../app/(root)/soxl-intelligence/page.tsx',
            import.meta.url,
        ), 'utf8');

        expect(source.match(/loadServerSoxlMarketContext\(/g)).toHaveLength(1);
        expect(source).toContain('const currentAiEvidence = buildSoxlAiEvidencePackage({');
        expect(source).toContain('plan: null');
        expect(source).toContain('monitor: null');
        expect(source).toContain('buildSoxlAiCurrentSnapshotToken(currentAiEvidence)');
        expect(source).toContain('snapshotToken={currentSnapshotToken}');
        expect(source).not.toContain('providerId={marketFacts.providerId}');
        expect(source).not.toContain('asOf={String(marketFacts.asOf)}');
    });
});
