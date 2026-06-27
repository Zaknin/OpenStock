import type {
    SoxlAiEvidencePackage,
    SoxlAiSnapshotIdentity,
} from './soxl-ai-evidence';
import type {
    SoxlAiExplanationPoint,
    SoxlAiExplanationResponseContract,
    SoxlAiExplanationStatus,
    SoxlAiMissingEvidencePoint,
} from './soxl-ai-prompt';

export type SoxlAiResponseValidationIssue =
    | 'empty_response'
    | 'response_too_large'
    | 'invalid_json'
    | 'invalid_response_shape'
    | 'unexpected_response_key'
    | 'status_mismatch'
    | 'snapshot_identity_mismatch'
    | 'unknown_evidence_reference'
    | 'ungrounded_numeric_claim'
    | 'invalid_missing_evidence_reference'
    | 'uncited_missing_evidence'
    | 'prohibited_content';

export interface SoxlAiResponseValidationSuccess {
    readonly valid: true;
    readonly value: SoxlAiExplanationResponseContract;
    readonly issues: readonly [];
}

export interface SoxlAiResponseValidationFailure {
    readonly valid: false;
    readonly value: null;
    readonly issues: readonly SoxlAiResponseValidationIssue[];
}

export type SoxlAiResponseValidationResult =
    | SoxlAiResponseValidationSuccess
    | SoxlAiResponseValidationFailure;

const maxRawResponseLength = 65_536;
const maxPointsPerSection = 50;
const maxEvidenceIdsPerPoint = 20;
const maxPointTextLength = 2_000;

const topLevelKeys = [
    'status',
    'snapshotIdentity',
    'summary',
    'supportingEvidence',
    'conflictingEvidence',
    'missingEvidence',
    'tradePlanExplanation',
    'monitoringChanges',
    'riskReminders',
    'limitations',
] as const;

const pointSectionKeys = [
    'summary',
    'supportingEvidence',
    'conflictingEvidence',
    'tradePlanExplanation',
    'monitoringChanges',
    'riskReminders',
    'limitations',
] as const;

type PointSectionKey = typeof pointSectionKeys[number];

function addIssue(
    issues: SoxlAiResponseValidationIssue[],
    issue: SoxlAiResponseValidationIssue,
): void {
    if (!issues.includes(issue)) {
        issues.push(issue);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
    value: Record<string, unknown>,
    expectedKeys: readonly string[],
): boolean {
    const keys = Object.keys(value);
    return keys.length === expectedKeys.length
        && keys.every((key) => expectedKeys.includes(key));
}

function parseRawResponse(
    rawResponse: string,
    issues: SoxlAiResponseValidationIssue[],
): unknown | null {
    if (rawResponse.trim().length === 0) {
        addIssue(issues, 'empty_response');
        return null;
    }

    if (rawResponse.length > maxRawResponseLength) {
        addIssue(issues, 'response_too_large');
        return null;
    }

    try {
        return JSON.parse(rawResponse.trim()) as unknown;
    } catch {
        addIssue(issues, 'invalid_json');
        return null;
    }
}

function isStatus(value: unknown): value is SoxlAiExplanationStatus {
    return value === 'available' || value === 'partial' || value === 'unavailable';
}

function validateSnapshotShape(
    value: unknown,
    issues: SoxlAiResponseValidationIssue[],
): value is SoxlAiExplanationResponseContract['snapshotIdentity'] {
    if (!isRecord(value) || !hasExactKeys(value, ['providerId', 'asOf'])) {
        addIssue(issues, 'invalid_response_shape');
        return false;
    }

    if (
        !(typeof value.providerId === 'string' || value.providerId === null)
        || !(typeof value.asOf === 'string' || value.asOf === null)
    ) {
        addIssue(issues, 'invalid_response_shape');
        return false;
    }

    return true;
}

function validateEvidenceIds(
    evidenceIds: unknown,
    validEvidenceIds: ReadonlySet<string>,
    issues: SoxlAiResponseValidationIssue[],
): evidenceIds is readonly string[] {
    if (!Array.isArray(evidenceIds) || evidenceIds.length === 0 || evidenceIds.length > maxEvidenceIdsPerPoint) {
        addIssue(issues, 'invalid_response_shape');
        return false;
    }

    const seen = new Set<string>();
    let valid = true;
    evidenceIds.forEach((id) => {
        if (typeof id !== 'string' || id.trim().length === 0 || seen.has(id)) {
            addIssue(issues, 'invalid_response_shape');
            valid = false;
            return;
        }

        seen.add(id);
        if (!validEvidenceIds.has(id)) {
            addIssue(issues, 'unknown_evidence_reference');
            valid = false;
        }
    });

    return valid;
}

function validatePoint(
    value: unknown,
    validEvidenceIds: ReadonlySet<string>,
    issues: SoxlAiResponseValidationIssue[],
): SoxlAiExplanationPoint | null {
    if (!isRecord(value) || !hasExactKeys(value, ['text', 'evidenceIds'])) {
        addIssue(issues, 'invalid_response_shape');
        return null;
    }

    if (
        typeof value.text !== 'string'
        || value.text.trim().length === 0
        || value.text.length > maxPointTextLength
    ) {
        addIssue(issues, 'invalid_response_shape');
        return null;
    }

    if (!validateEvidenceIds(value.evidenceIds, validEvidenceIds, issues)) {
        return null;
    }

    return {
        text: value.text,
        evidenceIds: value.evidenceIds,
    };
}

function validatePointArray(
    value: unknown,
    validEvidenceIds: ReadonlySet<string>,
    issues: SoxlAiResponseValidationIssue[],
): readonly SoxlAiExplanationPoint[] {
    if (!Array.isArray(value) || value.length > maxPointsPerSection) {
        addIssue(issues, 'invalid_response_shape');
        return [];
    }

    const points: SoxlAiExplanationPoint[] = [];
    value.forEach((item) => {
        const point = validatePoint(item, validEvidenceIds, issues);
        if (point !== null) {
            points.push(point);
        }
    });
    return points;
}

function validateMissingEvidenceArray(
    value: unknown,
    validEvidenceIds: ReadonlySet<string>,
    missingEvidenceIds: ReadonlySet<string>,
    issues: SoxlAiResponseValidationIssue[],
): readonly SoxlAiMissingEvidencePoint[] {
    if (!Array.isArray(value) || value.length > maxPointsPerSection) {
        addIssue(issues, 'invalid_response_shape');
        return [];
    }

    const points: SoxlAiMissingEvidencePoint[] = [];
    const citedMissing = new Set<string>();
    value.forEach((item) => {
        const point = validatePoint(item, validEvidenceIds, issues);
        if (point === null) {
            return;
        }

        point.evidenceIds.forEach((id) => {
            if (!missingEvidenceIds.has(id)) {
                addIssue(issues, 'invalid_missing_evidence_reference');
            } else {
                citedMissing.add(id);
            }
        });
        points.push(point);
    });

    missingEvidenceIds.forEach((id) => {
        if (!citedMissing.has(id)) {
            addIssue(issues, 'uncited_missing_evidence');
        }
    });

    return points;
}

function currentIdentity(evidence: SoxlAiEvidencePackage): SoxlAiSnapshotIdentity | null {
    return evidence.snapshotIdentities.find((identity) => identity.role === 'current') ?? null;
}

function validateStatusAndSnapshot(
    response: SoxlAiExplanationResponseContract,
    evidence: SoxlAiEvidencePackage,
    issues: SoxlAiResponseValidationIssue[],
): void {
    if (response.status !== evidence.status) {
        addIssue(issues, 'status_mismatch');
    }

    const identity = currentIdentity(evidence);
    const expectedProviderId = identity?.providerId ?? null;
    const expectedAsOf = identity?.asOf === null || identity === null
        ? null
        : String(identity.asOf);

    if (
        response.snapshotIdentity.providerId !== expectedProviderId
        || response.snapshotIdentity.asOf !== expectedAsOf
    ) {
        addIssue(issues, 'snapshot_identity_mismatch');
    }
}

function validateUnavailableSections(
    response: SoxlAiExplanationResponseContract,
    evidence: SoxlAiEvidencePackage,
    issues: SoxlAiResponseValidationIssue[],
): void {
    if (evidence.status !== 'unavailable') {
        return;
    }

    if (
        response.supportingEvidence.length > 0
        || response.conflictingEvidence.length > 0
        || response.tradePlanExplanation.length > 0
        || response.monitoringChanges.length > 0
    ) {
        addIssue(issues, 'invalid_response_shape');
    }
}

function validateApplicabilitySections(
    response: SoxlAiExplanationResponseContract,
    evidence: SoxlAiEvidencePackage,
    issues: SoxlAiResponseValidationIssue[],
): void {
    const hasPlanEvidence = evidence.groups.planAssumptions.length > 0
        || evidence.groups.planCalculations.length > 0;
    const hasMonitoringEvidence = evidence.groups.executionAssumptions.length > 0
        || evidence.groups.monitoringCalculations.length > 0;

    if (!hasPlanEvidence && response.tradePlanExplanation.length > 0) {
        addIssue(issues, 'invalid_response_shape');
    }

    if (!hasMonitoringEvidence && response.monitoringChanges.length > 0) {
        addIssue(issues, 'invalid_response_shape');
    }
}

const prohibitedPatterns: readonly RegExp[] = [
    /\byou\s+should\s+(buy|sell|hold|add|reduce|close|exit)\b/iu,
    /\b(buy|sell)\s+now\b/iu,
    /\b(close|exit)\s+the\s+position\b/iu,
    /\bmove\s+((your|the)\s+)?invalidation\b/iu,
    /\bmove\s+((your|the)\s+)?target\b/iu,
    /\bplace\s+an\s+order\b/iu,
    /\brecommended\s+action\b/iu,
    /\bpreferred\s+scenario\b/iu,
    /\btrade\s+signal\b/iu,
    /\btrade\s+decision\b/iu,
    /\bguaranteed\s+outcome\b/iu,
    /\bexpected\s+win\s+rate\b/iu,
    /\bconfidence\s+percentage\b/iu,
    /\bprobability\s+percentage\b/iu,
    /\bwin-rate\s+percentage\b/iu,
    /\b\d+(?:\.\d+)?\s*%\s+(confidence|probability|win\s*rate|win-rate)\b/iu,
    /\b(confidence|probability|win\s*rate|win-rate)\s+(?:is|of|at)\s+\d+(?:\.\d+)?\s*%/iu,
    /\b(hidden|aggregate)\s+score\b/iu,
    /\bscore\s+(?:is|of|at)\s+\d+(?:\.\d+)?\b/iu,
];

function validateProhibitedContent(
    response: SoxlAiExplanationResponseContract,
    issues: SoxlAiResponseValidationIssue[],
): void {
    const allPoints = allResponsePoints(response);

    if (allPoints.some((point) => prohibitedPatterns.some((pattern) => pattern.test(point.text)))) {
        addIssue(issues, 'prohibited_content');
    }
}

function allResponsePoints(
    response: SoxlAiExplanationResponseContract,
): readonly SoxlAiExplanationPoint[] {
    return [
        ...response.summary,
        ...response.supportingEvidence,
        ...response.conflictingEvidence,
        ...response.missingEvidence,
        ...response.tradePlanExplanation,
        ...response.monitoringChanges,
        ...response.riskReminders,
        ...response.limitations,
    ];
}

function explicitNumericClaims(text: string): readonly number[] {
    const claims: number[] = [];
    const numericPattern = /(?:\$\s*)?-?\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:%|×|x)?/giu;
    let match: RegExpExecArray | null;

    while ((match = numericPattern.exec(text)) !== null) {
        const raw = match[0].trim();
        const hasExplicitNumericSignal = raw.includes('$')
            || raw.includes('.')
            || /[%×x]$/iu.test(raw);
        if (!hasExplicitNumericSignal) {
            continue;
        }

        const numeric = Number(raw.replace(/[$,%×x\s]/giu, ''));
        if (Number.isFinite(numeric)) {
            claims.push(numeric);
        }
    }

    return claims;
}

function citedNumericValues(
    evidenceIds: readonly string[],
    evidenceItemsById: ReadonlyMap<string, { readonly value: unknown }>,
): readonly number[] {
    return evidenceIds.flatMap((id) => {
        const value = evidenceItemsById.get(id)?.value;
        return typeof value === 'number' && Number.isFinite(value) ? [value] : [];
    });
}

function numericClaimIsGrounded(claim: number, evidenceValues: readonly number[]): boolean {
    return evidenceValues.some((value) => {
        const tolerance = Math.max(0.01, Math.abs(value) * 0.0001);
        return Math.abs(value - claim) <= tolerance
            || [0, 1, 2, 3, 4].some((digits) => Number(value.toFixed(digits)) === claim);
    });
}

function validateNumericGrounding(
    response: SoxlAiExplanationResponseContract,
    evidence: SoxlAiEvidencePackage,
    issues: SoxlAiResponseValidationIssue[],
): void {
    const evidenceItemsById = new Map(evidence.items.map((item) => [item.id, item]));

    allResponsePoints(response).forEach((point) => {
        const claims = explicitNumericClaims(point.text);
        if (claims.length === 0) {
            return;
        }

        const evidenceValues = citedNumericValues(point.evidenceIds, evidenceItemsById);
        if (claims.some((claim) => !numericClaimIsGrounded(claim, evidenceValues))) {
            addIssue(issues, 'ungrounded_numeric_claim');
        }
    });
}

function buildResponse(
    root: Record<string, unknown>,
    issues: SoxlAiResponseValidationIssue[],
    validEvidenceIds: ReadonlySet<string>,
    missingEvidenceIds: ReadonlySet<string>,
): SoxlAiExplanationResponseContract | null {
    if (!hasExactKeys(root, topLevelKeys)) {
        if (Object.keys(root).some((key) => !topLevelKeys.includes(key as typeof topLevelKeys[number]))) {
            addIssue(issues, 'unexpected_response_key');
        } else {
            addIssue(issues, 'invalid_response_shape');
        }
        return null;
    }

    if (!isStatus(root.status)) {
        addIssue(issues, 'invalid_response_shape');
        return null;
    }

    if (!validateSnapshotShape(root.snapshotIdentity, issues)) {
        return null;
    }

    const sections: Record<PointSectionKey, readonly SoxlAiExplanationPoint[]> = {
        summary: [],
        supportingEvidence: [],
        conflictingEvidence: [],
        tradePlanExplanation: [],
        monitoringChanges: [],
        riskReminders: [],
        limitations: [],
    };

    pointSectionKeys.forEach((key) => {
        sections[key] = validatePointArray(root[key], validEvidenceIds, issues);
    });
    const missingEvidence = validateMissingEvidenceArray(
        root.missingEvidence,
        validEvidenceIds,
        missingEvidenceIds,
        issues,
    );

    return {
        status: root.status,
        snapshotIdentity: root.snapshotIdentity,
        summary: sections.summary,
        supportingEvidence: sections.supportingEvidence,
        conflictingEvidence: sections.conflictingEvidence,
        missingEvidence,
        tradePlanExplanation: sections.tradePlanExplanation,
        monitoringChanges: sections.monitoringChanges,
        riskReminders: sections.riskReminders,
        limitations: sections.limitations,
    };
}

export function validateSoxlAiExplanationResponse(
    rawResponse: string,
    evidence: SoxlAiEvidencePackage,
): SoxlAiResponseValidationResult {
    const issues: SoxlAiResponseValidationIssue[] = [];
    const parsed = parseRawResponse(rawResponse, issues);

    if (parsed === null) {
        return { valid: false, value: null, issues };
    }

    if (!isRecord(parsed)) {
        addIssue(issues, 'invalid_response_shape');
        return { valid: false, value: null, issues };
    }

    const validEvidenceIds = new Set(evidence.items.map((item) => item.id));
    const missingEvidenceIds = new Set(evidence.groups.missingEvidence);
    const response = buildResponse(parsed, issues, validEvidenceIds, missingEvidenceIds);

    if (response !== null) {
        validateStatusAndSnapshot(response, evidence, issues);
        validateUnavailableSections(response, evidence, issues);
        validateApplicabilitySections(response, evidence, issues);
        validateNumericGrounding(response, evidence, issues);
        validateProhibitedContent(response, issues);
    }

    if (issues.length > 0 || response === null) {
        return { valid: false, value: null, issues };
    }

    return { valid: true, value: response, issues: [] };
}
