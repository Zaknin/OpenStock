import { formatSoxlDisplayTimestamp } from '../presentation/time-format';
import type {
    SoxlAiCurrentExplanationIssue,
    SoxlAiCurrentExplanationResult,
} from './soxl-ai-current-explanation.server';
import type {
    SoxlAiExplanationPoint,
    SoxlAiExplanationStatus,
} from './soxl-ai-prompt';

export interface SoxlAiExplanationCurrentSnapshotInput {
    readonly snapshotToken: string;
}

export interface SoxlAiExplanationPointView {
    readonly text: string;
    readonly evidenceIds: readonly string[];
}

export interface SoxlAiExplanationIssueView {
    readonly code: SoxlAiCurrentExplanationIssue;
    readonly message: string;
}

export interface SoxlAiExplanationView {
    readonly status: 'available' | 'unavailable';
    readonly statusLabel: string;
    readonly explanationStatus: SoxlAiExplanationStatus | null;
    readonly explanationStatusLabel: string;
    readonly providerId: string;
    readonly asOf: string | null;
    readonly asOfLabel: string;
    readonly snapshotToken: string | null;
    readonly describesCurrentSnapshot: boolean;
    readonly issues: readonly SoxlAiExplanationIssueView[];
    readonly retryAfterSeconds: number | null;
    readonly summary: readonly SoxlAiExplanationPointView[];
    readonly supportingEvidence: readonly SoxlAiExplanationPointView[];
    readonly conflictingEvidence: readonly SoxlAiExplanationPointView[];
    readonly missingEvidence: readonly SoxlAiExplanationPointView[];
    readonly riskReminders: readonly SoxlAiExplanationPointView[];
    readonly limitations: readonly SoxlAiExplanationPointView[];
}

const unavailableLabel = 'Unavailable';

function formatStatusLabel(status: SoxlAiExplanationStatus | null): string {
    if (status === 'available') {
        return 'Available';
    }
    if (status === 'partial') {
        return 'Partial';
    }

    return unavailableLabel;
}

const issueMessages: Record<SoxlAiCurrentExplanationIssue, string> = {
    unauthenticated: 'Your authenticated session is required to request an explanation.',
    invalid_request: 'The explanation request was not valid.',
    rate_limited: 'Please wait before requesting another explanation.',
    request_in_flight: 'An explanation request is already running for this account.',
    global_capacity_reached: 'The explanation service is temporarily busy.',
    stale_snapshot: 'The page data changed before the explanation request. Refresh page data and try again.',
    current_data_unavailable: 'The current deterministic market snapshot is not available for explanation.',
    provider_not_configured: 'The AI explanation provider is not configured.',
    provider_timeout: 'The AI explanation provider did not respond in time.',
    provider_error: 'The AI explanation provider could not complete the request.',
    empty_response: 'The AI response did not pass the grounding and safety checks.',
    response_too_large: 'The AI response did not pass the grounding and safety checks.',
    invalid_json: 'The AI response did not pass the grounding and safety checks.',
    invalid_response_shape: 'The AI response did not pass the grounding and safety checks.',
    unexpected_response_key: 'The AI response did not pass the grounding and safety checks.',
    status_mismatch: 'The AI response did not pass the grounding and safety checks.',
    snapshot_identity_mismatch: 'The AI response did not pass the grounding and safety checks.',
    unknown_evidence_reference: 'The AI response did not pass the grounding and safety checks.',
    invalid_missing_evidence_reference: 'The AI response did not pass the grounding and safety checks.',
    uncited_missing_evidence: 'The AI response did not pass the grounding and safety checks.',
    prohibited_content: 'The AI response did not pass the grounding and safety checks.',
};

function mapPoints(points: readonly SoxlAiExplanationPoint[]): readonly SoxlAiExplanationPointView[] {
    return points.map((point) => ({
        text: point.text,
        evidenceIds: [...point.evidenceIds],
    }));
}

function formatAsOf(value: string | null): string {
    if (value === null) {
        return unavailableLabel;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return unavailableLabel;
    }

    return formatSoxlDisplayTimestamp(numeric);
}

function identityMatches(
    snapshotToken: string | null,
    currentSnapshot: SoxlAiExplanationCurrentSnapshotInput | null,
): boolean {
    if (currentSnapshot === null) {
        return true;
    }

    return snapshotToken !== null
        && snapshotToken === currentSnapshot.snapshotToken;
}

export function buildSoxlAiExplanationView(
    result: SoxlAiCurrentExplanationResult,
    currentSnapshot: SoxlAiExplanationCurrentSnapshotInput | null = null,
): SoxlAiExplanationView {
    const explanationIdentity = {
        providerId: result.explanation?.snapshotIdentity.providerId ?? unavailableLabel,
        asOf: result.explanation?.snapshotIdentity.asOf ?? null,
    };

    return {
        status: result.status,
        statusLabel: result.status === 'available' ? 'Available' : 'Unavailable',
        explanationStatus: result.explanation?.status ?? null,
        explanationStatusLabel: formatStatusLabel(result.explanation?.status ?? null),
        providerId: explanationIdentity.providerId,
        asOf: explanationIdentity.asOf,
        asOfLabel: formatAsOf(explanationIdentity.asOf),
        snapshotToken: result.snapshotToken,
        describesCurrentSnapshot: identityMatches(
            result.snapshotToken,
            currentSnapshot,
        ),
        issues: result.issues.map((issue) => ({
            code: issue,
            message: issueMessages[issue],
        })),
        retryAfterSeconds: result.retryAfterSeconds,
        summary: mapPoints(result.explanation?.summary ?? []),
        supportingEvidence: mapPoints(result.explanation?.supportingEvidence ?? []),
        conflictingEvidence: mapPoints(result.explanation?.conflictingEvidence ?? []),
        missingEvidence: mapPoints(result.explanation?.missingEvidence ?? []),
        riskReminders: mapPoints(result.explanation?.riskReminders ?? []),
        limitations: mapPoints(result.explanation?.limitations ?? []),
    };
}
