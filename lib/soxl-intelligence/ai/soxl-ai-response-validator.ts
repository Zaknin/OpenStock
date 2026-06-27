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
    | 'root_not_object'
    | 'unexpected_top_level_fields'
    | 'missing_required_top_level_field'
    | 'top_level_field_wrong_type'
    | 'section_not_array'
    | 'section_item_not_object'
    | 'missing_required_item_field'
    | 'item_field_wrong_type'
    | 'evidence_references_not_array'
    | 'evidence_reference_not_string'
    | 'nullable_contract_mismatch'
    | 'empty_value_not_allowed'
    | 'other_shape_mismatch'
    | 'status_mismatch'
    | 'snapshot_identity_mismatch'
    | 'unknown_evidence_reference'
    | 'ungrounded_numeric_claim'
    | 'invalid_missing_evidence_reference'
    | 'uncited_missing_evidence'
    | 'forbidden_recommendation'
    | 'forbidden_scenario_selection'
    | 'prohibited_content';

export type SoxlAiResponseValidationField =
    | 'status'
    | 'snapshotIdentity'
    | 'providerId'
    | 'asOf'
    | 'summary'
    | 'supportingEvidence'
    | 'conflictingEvidence'
    | 'missingEvidence'
    | 'riskReminders'
    | 'limitations'
    | 'text'
    | 'evidenceIds';

export interface SoxlAiResponseValidationSuccess {
    readonly valid: true;
    readonly value: SoxlAiExplanationResponseContract;
    readonly issues: readonly [];
}

export interface SoxlAiResponseValidationFailure {
    readonly valid: false;
    readonly value: null;
    readonly issues: readonly SoxlAiResponseValidationIssue[];
    readonly reason: SoxlAiResponseValidationIssue;
    readonly field?: SoxlAiResponseValidationField;
}

export type SoxlAiResponseValidationResult =
    | SoxlAiResponseValidationSuccess
    | SoxlAiResponseValidationFailure;

interface ValidationContext {
    readonly issues: SoxlAiResponseValidationIssue[];
    diagnostic: {
        readonly reason: SoxlAiResponseValidationIssue;
        readonly field?: SoxlAiResponseValidationField;
    } | null;
}

const maxRawResponseLength = 65_536;
const maxPointsPerSection = 50;
const maxEvidenceIdsPerPoint = 20;
const maxPointTextLength = 2_000;
const parseFailure = Symbol('parseFailure');

export const soxlAiRequiredTopLevelFields = [
    'status',
    'snapshotIdentity',
    'summary',
    'supportingEvidence',
    'conflictingEvidence',
    'missingEvidence',
    'riskReminders',
    'limitations',
] as const satisfies readonly SoxlAiResponseValidationField[];

const pointSectionKeys = [
    'summary',
    'supportingEvidence',
    'conflictingEvidence',
    'riskReminders',
    'limitations',
] as const;

type PointSectionKey = typeof pointSectionKeys[number];

function addIssue(
    context: ValidationContext,
    issue: SoxlAiResponseValidationIssue,
    field?: SoxlAiResponseValidationField,
): void {
    if (!context.issues.includes(issue)) {
        context.issues.push(issue);
    }

    if (context.diagnostic === null) {
        context.diagnostic = field === undefined ? { reason: issue } : { reason: issue, field };
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRawResponse(
    rawResponse: string,
    context: ValidationContext,
): unknown | typeof parseFailure {
    if (rawResponse.trim().length === 0) {
        addIssue(context, 'empty_response');
        return parseFailure;
    }

    if (rawResponse.length > maxRawResponseLength) {
        addIssue(context, 'response_too_large');
        return parseFailure;
    }

    try {
        return JSON.parse(rawResponse.trim()) as unknown;
    } catch {
        addIssue(context, 'invalid_json');
        return parseFailure;
    }
}

function isStatus(value: unknown): value is SoxlAiExplanationStatus {
    return value === 'available' || value === 'partial' || value === 'unavailable';
}

function validateSnapshotShape(
    value: unknown,
    context: ValidationContext,
): value is SoxlAiExplanationResponseContract['snapshotIdentity'] {
    if (value === null) {
        addIssue(context, 'nullable_contract_mismatch', 'snapshotIdentity');
        return false;
    }

    if (!isRecord(value)) {
        addIssue(context, 'top_level_field_wrong_type', 'snapshotIdentity');
        return false;
    }

    const expectedKeys = ['providerId', 'asOf'] as const;
    if (Object.keys(value).some((key) => !expectedKeys.includes(key as typeof expectedKeys[number]))) {
        addIssue(context, 'other_shape_mismatch');
        return false;
    }

    const missingKey = expectedKeys.find((key) => !Object.hasOwn(value, key));
    if (missingKey !== undefined) {
        addIssue(context, 'missing_required_item_field', missingKey);
        return false;
    }

    if (!(typeof value.providerId === 'string' || value.providerId === null)) {
        addIssue(context, 'item_field_wrong_type', 'providerId');
        return false;
    }

    if (!(typeof value.asOf === 'string' || value.asOf === null)) {
        addIssue(context, 'item_field_wrong_type', 'asOf');
        return false;
    }

    return true;
}

function validateEvidenceIds(
    evidenceIds: unknown,
    validEvidenceIds: ReadonlySet<string>,
    context: ValidationContext,
): evidenceIds is readonly string[] {
    if (evidenceIds === null) {
        addIssue(context, 'nullable_contract_mismatch', 'evidenceIds');
        return false;
    }

    if (!Array.isArray(evidenceIds)) {
        addIssue(context, 'evidence_references_not_array', 'evidenceIds');
        return false;
    }

    if (evidenceIds.length === 0) {
        addIssue(context, 'empty_value_not_allowed', 'evidenceIds');
        return false;
    }

    if (evidenceIds.length > maxEvidenceIdsPerPoint) {
        addIssue(context, 'other_shape_mismatch', 'evidenceIds');
        return false;
    }

    const seen = new Set<string>();
    let valid = true;
    evidenceIds.forEach((id) => {
        if (id === null) {
            addIssue(context, 'nullable_contract_mismatch', 'evidenceIds');
            valid = false;
            return;
        }

        if (typeof id !== 'string') {
            addIssue(context, 'evidence_reference_not_string', 'evidenceIds');
            valid = false;
            return;
        }

        if (id.trim().length === 0) {
            addIssue(context, 'empty_value_not_allowed', 'evidenceIds');
            valid = false;
            return;
        }

        if (seen.has(id)) {
            addIssue(context, 'other_shape_mismatch', 'evidenceIds');
            valid = false;
            return;
        }

        seen.add(id);
        if (!validEvidenceIds.has(id)) {
            addIssue(context, 'unknown_evidence_reference', 'evidenceIds');
            valid = false;
        }
    });

    return valid;
}

function validatePoint(
    value: unknown,
    validEvidenceIds: ReadonlySet<string>,
    context: ValidationContext,
    section: PointSectionKey | 'missingEvidence',
): SoxlAiExplanationPoint | null {
    if (value === null) {
        addIssue(context, 'nullable_contract_mismatch', section);
        return null;
    }

    if (!isRecord(value)) {
        addIssue(context, 'section_item_not_object', section);
        return null;
    }

    const expectedKeys = ['text', 'evidenceIds'] as const;
    if (Object.keys(value).some((key) => !expectedKeys.includes(key as typeof expectedKeys[number]))) {
        addIssue(context, 'other_shape_mismatch');
        return null;
    }

    const missingKey = expectedKeys.find((key) => !Object.hasOwn(value, key));
    if (missingKey !== undefined) {
        addIssue(context, 'missing_required_item_field', missingKey);
        return null;
    }

    if (value.text === null) {
        addIssue(context, 'nullable_contract_mismatch', 'text');
        return null;
    }

    if (typeof value.text !== 'string') {
        addIssue(context, 'item_field_wrong_type', 'text');
        return null;
    }

    if (value.text.trim().length === 0) {
        addIssue(context, 'empty_value_not_allowed', 'text');
        return null;
    }

    if (value.text.length > maxPointTextLength) {
        addIssue(context, 'other_shape_mismatch', 'text');
        return null;
    }

    if (!validateEvidenceIds(value.evidenceIds, validEvidenceIds, context)) {
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
    context: ValidationContext,
    section: PointSectionKey,
): readonly SoxlAiExplanationPoint[] {
    if (value === null) {
        addIssue(context, 'nullable_contract_mismatch', section);
        return [];
    }

    if (!Array.isArray(value)) {
        addIssue(context, 'section_not_array', section);
        return [];
    }

    if (value.length > maxPointsPerSection) {
        addIssue(context, 'other_shape_mismatch', section);
        return [];
    }

    const points: SoxlAiExplanationPoint[] = [];
    value.forEach((item) => {
        const point = validatePoint(item, validEvidenceIds, context, section);
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
    context: ValidationContext,
): readonly SoxlAiMissingEvidencePoint[] {
    if (value === null) {
        addIssue(context, 'nullable_contract_mismatch', 'missingEvidence');
        return [];
    }

    if (!Array.isArray(value)) {
        addIssue(context, 'section_not_array', 'missingEvidence');
        return [];
    }

    if (value.length > maxPointsPerSection) {
        addIssue(context, 'other_shape_mismatch', 'missingEvidence');
        return [];
    }

    const points: SoxlAiMissingEvidencePoint[] = [];
    const citedMissing = new Set<string>();
    value.forEach((item) => {
        const point = validatePoint(item, validEvidenceIds, context, 'missingEvidence');
        if (point === null) {
            return;
        }

        point.evidenceIds.forEach((id) => {
            if (!missingEvidenceIds.has(id)) {
                addIssue(context, 'invalid_missing_evidence_reference', 'missingEvidence');
            } else {
                citedMissing.add(id);
            }
        });
        points.push(point);
    });

    missingEvidenceIds.forEach((id) => {
        if (!citedMissing.has(id)) {
            addIssue(context, 'uncited_missing_evidence', 'missingEvidence');
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
    context: ValidationContext,
): void {
    if (response.status !== evidence.status) {
        addIssue(context, 'status_mismatch', 'status');
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
        addIssue(context, 'snapshot_identity_mismatch', 'snapshotIdentity');
    }
}

function validateUnavailableSections(
    response: SoxlAiExplanationResponseContract,
    evidence: SoxlAiEvidencePackage,
    context: ValidationContext,
): void {
    if (evidence.status !== 'unavailable') {
        return;
    }

    if (response.supportingEvidence.length > 0) {
        addIssue(context, 'other_shape_mismatch', 'supportingEvidence');
    }
    if (response.conflictingEvidence.length > 0) {
        addIssue(context, 'other_shape_mismatch', 'conflictingEvidence');
    }
}

const recommendationPatterns: readonly RegExp[] = [
    /\byou\s+should\s+(buy|sell|hold|add|reduce|close|exit)\b/iu,
    /\b(buy|sell)\s+now\b/iu,
    /\b(close|exit)\s+the\s+position\b/iu,
    /\bmove\s+((your|the)\s+)?invalidation\b/iu,
    /\bmove\s+((your|the)\s+)?target\b/iu,
    /\bplace\s+an\s+order\b/iu,
    /\brecommended\s+action\b/iu,
    /\btrade\s+signal\b/iu,
    /\btrade\s+decision\b/iu,
];

const scenarioSelectionPatterns: readonly RegExp[] = [
    /\bpreferred\s+scenario\b/iu,
];

const prohibitedPatterns: readonly RegExp[] = [
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
    context: ValidationContext,
): void {
    const allPoints = allResponsePoints(response);

    if (allPoints.some((point) => recommendationPatterns.some((pattern) => pattern.test(point.text)))) {
        addIssue(context, 'forbidden_recommendation');
    }
    if (allPoints.some((point) => scenarioSelectionPatterns.some((pattern) => pattern.test(point.text)))) {
        addIssue(context, 'forbidden_scenario_selection');
    }
    if (allPoints.some((point) => prohibitedPatterns.some((pattern) => pattern.test(point.text)))) {
        addIssue(context, 'prohibited_content');
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
        ...response.riskReminders,
        ...response.limitations,
    ];
}

function explicitNumericClaims(text: string): readonly number[] {
    const claims: number[] = [];
    const numericPattern = /(?:\$\s*)?-?\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:%|\u00d7|x)?/giu;
    let match: RegExpExecArray | null;

    while ((match = numericPattern.exec(text)) !== null) {
        const raw = match[0].trim();
        const hasExplicitNumericSignal = raw.includes('$')
            || raw.includes('.')
            || /[%\u00d7x]$/iu.test(raw);
        if (!hasExplicitNumericSignal) {
            continue;
        }

        const numeric = Number(raw.replace(/[$,%\u00d7x\s]/giu, ''));
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
    context: ValidationContext,
): void {
    const evidenceItemsById = new Map(evidence.items.map((item) => [item.id, item]));

    allResponsePoints(response).forEach((point) => {
        const claims = explicitNumericClaims(point.text);
        if (claims.length === 0) {
            return;
        }

        const evidenceValues = citedNumericValues(point.evidenceIds, evidenceItemsById);
        if (claims.some((claim) => !numericClaimIsGrounded(claim, evidenceValues))) {
            addIssue(context, 'ungrounded_numeric_claim');
        }
    });
}

function buildResponse(
    root: Record<string, unknown>,
    context: ValidationContext,
    validEvidenceIds: ReadonlySet<string>,
    missingEvidenceIds: ReadonlySet<string>,
): SoxlAiExplanationResponseContract | null {
    if (Object.keys(root).some((key) => !soxlAiRequiredTopLevelFields.includes(key as typeof soxlAiRequiredTopLevelFields[number]))) {
        addIssue(context, 'unexpected_top_level_fields');
        return null;
    }

    const missingRootField = soxlAiRequiredTopLevelFields.find((key) => !Object.hasOwn(root, key));
    if (missingRootField !== undefined) {
        addIssue(context, 'missing_required_top_level_field', missingRootField);
        return null;
    }

    if (root.status === null) {
        addIssue(context, 'nullable_contract_mismatch', 'status');
        return null;
    }

    if (!isStatus(root.status)) {
        addIssue(context, 'top_level_field_wrong_type', 'status');
        return null;
    }

    if (!validateSnapshotShape(root.snapshotIdentity, context)) {
        return null;
    }

    const sections: Record<PointSectionKey, readonly SoxlAiExplanationPoint[]> = {
        summary: [],
        supportingEvidence: [],
        conflictingEvidence: [],
        riskReminders: [],
        limitations: [],
    };

    pointSectionKeys.forEach((key) => {
        sections[key] = validatePointArray(root[key], validEvidenceIds, context, key);
    });
    const missingEvidence = validateMissingEvidenceArray(
        root.missingEvidence,
        validEvidenceIds,
        missingEvidenceIds,
        context,
    );

    return {
        status: root.status,
        snapshotIdentity: root.snapshotIdentity,
        summary: sections.summary,
        supportingEvidence: sections.supportingEvidence,
        conflictingEvidence: sections.conflictingEvidence,
        missingEvidence,
        riskReminders: sections.riskReminders,
        limitations: sections.limitations,
    };
}

function failure(context: ValidationContext): SoxlAiResponseValidationFailure {
    const diagnostic = context.diagnostic ?? { reason: 'other_shape_mismatch' as const };
    return diagnostic.field === undefined
        ? { valid: false, value: null, issues: context.issues, reason: diagnostic.reason }
        : {
            valid: false,
            value: null,
            issues: context.issues,
            reason: diagnostic.reason,
            field: diagnostic.field,
        };
}

export function validateSoxlAiExplanationResponse(
    rawResponse: string,
    evidence: SoxlAiEvidencePackage,
): SoxlAiResponseValidationResult {
    const context: ValidationContext = { issues: [], diagnostic: null };
    const parsed = parseRawResponse(rawResponse, context);

    if (parsed === parseFailure) {
        return failure(context);
    }

    if (!isRecord(parsed)) {
        addIssue(context, 'root_not_object');
        return failure(context);
    }

    const validEvidenceIds = new Set(evidence.items.map((item) => item.id));
    const missingEvidenceIds = new Set(evidence.groups.missingEvidence);
    const response = buildResponse(parsed, context, validEvidenceIds, missingEvidenceIds);

    if (response !== null) {
        validateStatusAndSnapshot(response, evidence, context);
        validateUnavailableSections(response, evidence, context);
        validateProhibitedContent(response, context);
        validateNumericGrounding(response, evidence, context);
    }

    if (context.issues.length > 0 || response === null) {
        return failure(context);
    }

    return { valid: true, value: response, issues: [] };
}
