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
const asOf = '1787654321';

function point(text: string, evidenceIds: readonly string[] = ['current.market_facts.status']) {
    return { text, evidenceIds };
}

function availableResult(): SoxlAiCurrentExplanationResult {
    return {
        status: 'available',
        retryAfterSeconds: null,
        issues: [],
        explanation: {
            status: 'available',
            snapshotIdentity: { providerId, asOf },
            summary: [point('Plain summary with **markdown** and <b>html</b>.')],
            supportingEvidence: [point('Supporting text.', ['a', 'b'])],
            conflictingEvidence: [point('Conflicting text.')],
            missingEvidence: [point('Missing text.')],
            tradePlanExplanation: [],
            monitoringChanges: [],
            riskReminders: [point('Risk reminder text.')],
            limitations: [point('Limitation text.')],
        },
    };
}

describe('buildSoxlAiExplanationView', () => {
    it('maps an available explanation with sections and evidence IDs in order', () => {
        const view = buildSoxlAiExplanationView(availableResult(), { providerId, asOf });

        expect(view.status).toBe('available');
        expect(view.statusLabel).toBe('Available');
        expect(view.explanationStatus).toBe('available');
        expect(view.explanationStatusLabel).toBe('Available');
        expect(view.providerId).toBe(providerId);
        expect(view.asOf).toBe(asOf);
        expect(view.asOfLabel).toBe(formatSoxlDisplayTimestamp(Number(asOf)));
        expect(view.asOfLabel).toContain('GMT+4');
        expect(view.summary[0].text).toBe('Plain summary with **markdown** and <b>html</b>.');
        expect(view.supportingEvidence[0].evidenceIds).toEqual(['a', 'b']);
        expect(view.conflictingEvidence[0].text).toBe('Conflicting text.');
        expect(view.missingEvidence[0].text).toBe('Missing text.');
        expect(view.riskReminders[0].text).toBe('Risk reminder text.');
        expect(view.limitations[0].text).toBe('Limitation text.');
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
            issues: ['rate_limited', 'provider_error', 'invalid_response_shape'],
            retryAfterSeconds: 30,
        });

        expect(view.status).toBe('unavailable');
        expect(view.statusLabel).toBe('Unavailable');
        expect(view.explanationStatus).toBeNull();
        expect(view.explanationStatusLabel).toBe('Unavailable');
        expect(view.providerId).toBe('Unavailable');
        expect(view.asOfLabel).toBe('Unavailable');
        expect(view.retryAfterSeconds).toBe(30);
        expect(view.issues.map((issue) => issue.code)).toEqual(['rate_limited', 'provider_error', 'invalid_response_shape']);
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
        });

        expect(view.issues).toEqual(cases.map(([code, message]) => ({ code, message })));
    });

    it('maps every validator issue to the generic grounding and safety message', () => {
        const validatorIssues = [
            'empty_response',
            'response_too_large',
            'invalid_json',
            'invalid_response_shape',
            'unexpected_response_key',
            'status_mismatch',
            'snapshot_identity_mismatch',
            'unknown_evidence_reference',
            'invalid_missing_evidence_reference',
            'uncited_missing_evidence',
            'prohibited_content',
        ] as const satisfies readonly SoxlAiCurrentExplanationIssue[];
        const view = buildSoxlAiExplanationView({
            status: 'unavailable',
            explanation: null,
            issues: validatorIssues,
            retryAfterSeconds: null,
        });

        expect(view.issues.map(({ code }) => code)).toEqual(validatorIssues);
        expect(view.issues.every(({ message }) => (
            message === 'The AI response did not pass the grounding and safety checks.'
        ))).toBe(true);
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

    it('supports earlier-snapshot detection without mutating input', () => {
        const input = availableResult();
        const before = JSON.stringify(input);

        const view = buildSoxlAiExplanationView(input, {
            providerId,
            asOf: String(Number(asOf) + 1),
        });

        expect(view.describesCurrentSnapshot).toBe(false);
        expect(JSON.stringify(input)).toBe(before);
    });
});
