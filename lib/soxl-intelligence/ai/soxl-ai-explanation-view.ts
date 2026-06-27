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
    readonly providerId: string | null;
    readonly providerLabel: string | null;
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
const snapshotTokenPattern = /^soxl-current-v1:[a-f0-9]{64}$/;

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
    root_not_object: 'The AI response did not pass the grounding and safety checks.',
    unexpected_top_level_fields: 'The AI response did not pass the grounding and safety checks.',
    missing_required_top_level_field: 'The AI response did not pass the grounding and safety checks.',
    top_level_field_wrong_type: 'The AI response did not pass the grounding and safety checks.',
    section_not_array: 'The AI response did not pass the grounding and safety checks.',
    section_item_not_object: 'The AI response did not pass the grounding and safety checks.',
    missing_required_item_field: 'The AI response did not pass the grounding and safety checks.',
    item_field_wrong_type: 'The AI response did not pass the grounding and safety checks.',
    evidence_references_not_array: 'The AI response did not pass the grounding and safety checks.',
    evidence_reference_not_string: 'The AI response did not pass the grounding and safety checks.',
    nullable_contract_mismatch: 'The AI response did not pass the grounding and safety checks.',
    empty_value_not_allowed: 'The AI response did not pass the grounding and safety checks.',
    other_shape_mismatch: 'The AI response did not pass the grounding and safety checks.',
    status_mismatch: 'The AI response did not pass the grounding and safety checks.',
    snapshot_identity_mismatch: 'The AI response did not pass the grounding and safety checks.',
    unknown_evidence_reference: 'The AI response did not pass the grounding and safety checks.',
    ungrounded_numeric_claim: 'The AI response did not pass the grounding and safety checks.',
    invalid_missing_evidence_reference: 'The AI response did not pass the grounding and safety checks.',
    uncited_missing_evidence: 'The AI response did not pass the grounding and safety checks.',
    forbidden_recommendation: 'The AI response did not pass the grounding and safety checks.',
    forbidden_scenario_selection: 'The AI response did not pass the grounding and safety checks.',
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
    resultStatus: SoxlAiCurrentExplanationResult['status'],
    snapshotToken: string | null,
    currentSnapshot: SoxlAiExplanationCurrentSnapshotInput | null,
): boolean {
    if (
        resultStatus !== 'available'
        || snapshotToken === null
        || currentSnapshot === null
        || !snapshotTokenPattern.test(currentSnapshot.snapshotToken)
    ) {
        return true;
    }

    return snapshotToken === currentSnapshot.snapshotToken;
}

function formatProviderLabel(providerId: string | null): string | null {
    if (providerId === null || providerId.trim().length === 0) {
        return null;
    }

    if (providerId === 'gemini') {
        return 'Gemini';
    }

    if (providerId === 'minimax') {
        return 'MiniMax';
    }

    if (providerId === 'siray') {
        return 'Siray';
    }

    return providerId;
}

export function buildSoxlAiExplanationView(
    result: SoxlAiCurrentExplanationResult,
    currentSnapshot: SoxlAiExplanationCurrentSnapshotInput | null = null,
): SoxlAiExplanationView {
    const asOf = result.explanation?.snapshotIdentity.asOf ?? null;
    const providerId = result.providerId;

    return {
        status: result.status,
        statusLabel: result.status === 'available' ? 'Available' : 'Unavailable',
        explanationStatus: result.explanation?.status ?? null,
        explanationStatusLabel: formatStatusLabel(result.explanation?.status ?? null),
        providerId,
        providerLabel: formatProviderLabel(providerId),
        asOf,
        asOfLabel: formatAsOf(asOf),
        snapshotToken: result.snapshotToken,
        describesCurrentSnapshot: identityMatches(
            result.status,
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
