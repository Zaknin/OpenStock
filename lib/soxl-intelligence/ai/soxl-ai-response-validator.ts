import type {
    SoxlAiEvidencePackage,
} from './soxl-ai-evidence';
import {
    SOXL_AI_EVIDENCE_ALIAS_PATTERN,
    SOXL_AI_MAX_EVIDENCE_REFS_PER_POINT,
    type SoxlAiEvidenceReferenceCatalog,
} from './soxl-ai-evidence-reference-catalog.server';
import type {
    SoxlAiExplanationPoint,
    SoxlAiExplanationResponse,
    SoxlAiExplanationStatus,
} from './soxl-ai-prompt';

export type SoxlAiResponseValidationIssue =
    | 'empty_response'
    | 'response_too_large'
    | 'invalid_json'
    | 'root_not_object'
    | 'unexpected_server_metadata_field'
    | 'unexpected_top_level_fields'
    | 'missing_required_top_level_field'
    | 'top_level_field_wrong_type'
    | 'section_missing'
    | 'section_not_array'
    | 'section_too_many'
    | 'section_item_not_object'
    | 'section_item_missing_required_field'
    | 'section_item_field_wrong_type'
    | 'section_item_unexpected_field'
    | 'other_section_shape_mismatch'
    | 'evidence_refs_missing'
    | 'evidence_refs_not_array'
    | 'evidence_refs_empty'
    | 'evidence_refs_too_many'
    | 'evidence_ref_not_string'
    | 'evidence_ref_blank'
    | 'evidence_ref_format_invalid'
    | 'evidence_ref_duplicate'
    | 'evidence_catalog_too_large'
    | 'response_schema_too_large'
    | 'nullable_contract_mismatch'
    | 'empty_value_not_allowed'
    | 'other_shape_mismatch'
    | 'status_mismatch'
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
    | 'snapshotToken'
    | 'provider'
    | 'providerId'
    | 'asOf'
    | 'generatedAt'
    | 'summary'
    | 'supportingEvidence'
    | 'conflictingEvidence'
    | 'missingEvidence'
    | 'riskReminders'
    | 'limitations'
    | 'text'
    | 'evidenceRefs';

export type SoxlAiResponseValidationSection =
    | 'summary'
    | 'supportingEvidence'
    | 'conflictingEvidence'
    | 'missingEvidence'
    | 'riskReminders'
    | 'limitations';

export type SoxlAiValidatedExplanation = Omit<SoxlAiExplanationResponse, 'snapshotIdentity'>;

export interface SoxlAiResponseValidationSuccess {
    readonly valid: true;
    readonly value: SoxlAiValidatedExplanation;
    readonly issues: readonly [];
}

export interface SoxlAiResponseValidationFailure {
    readonly valid: false;
    readonly value: null;
    readonly issues: readonly SoxlAiResponseValidationIssue[];
    readonly reason: SoxlAiResponseValidationIssue;
    readonly section?: SoxlAiResponseValidationSection;
    readonly field?: SoxlAiResponseValidationField;
}

export type SoxlAiResponseValidationResult =
    | SoxlAiResponseValidationSuccess
    | SoxlAiResponseValidationFailure;

interface ValidationContext {
    readonly issues: SoxlAiResponseValidationIssue[];
    diagnostic: {
        readonly reason: SoxlAiResponseValidationIssue;
        readonly section?: SoxlAiResponseValidationSection;
        readonly field?: SoxlAiResponseValidationField;
    } | null;
}

const maxRawResponseLength = 65_536;
const maxPointsPerSection = 50;
const maxPointTextLength = 2_000;
const parseFailure = Symbol('parseFailure');

export const soxlAiRequiredTopLevelFields = [
    'status',
    'summary',
    'supportingEvidence',
    'conflictingEvidence',
    'missingEvidence',
    'riskReminders',
    'limitations',
] as const satisfies readonly SoxlAiResponseValidationField[];

const serverMetadataFields = [
    'snapshotIdentity',
    'snapshotToken',
    'provider',
    'providerId',
    'asOf',
    'generatedAt',
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
    section?: SoxlAiResponseValidationSection,
): void {
    if (!context.issues.includes(issue)) {
        context.issues.push(issue);
    }

    if (context.diagnostic === null) {
        context.diagnostic = {
            reason: issue,
            ...(section === undefined ? {} : { section }),
            ...(field === undefined ? {} : { field }),
        };
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findServerMetadataField(
    value: Record<string, unknown>,
): typeof serverMetadataFields[number] | undefined {
    return serverMetadataFields.find((key) => Object.hasOwn(value, key));
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

function validateEvidenceRefs(
    evidenceRefs: unknown,
    catalog: SoxlAiEvidenceReferenceCatalog,
    validEvidenceIds: ReadonlySet<string>,
    context: ValidationContext,
    section: SoxlAiResponseValidationSection,
): readonly string[] | null {
    if (!Array.isArray(evidenceRefs)) {
        addIssue(context, 'evidence_refs_not_array', 'evidenceRefs', section);
        return null;
    }

    if (evidenceRefs.length === 0) {
        addIssue(context, 'evidence_refs_empty', 'evidenceRefs', section);
        return null;
    }

    if (evidenceRefs.length > SOXL_AI_MAX_EVIDENCE_REFS_PER_POINT) {
        addIssue(context, 'evidence_refs_too_many', 'evidenceRefs', section);
        return null;
    }

    const seen = new Set<string>();
    let valid = true;
    evidenceRefs.forEach((reference) => {
        if (typeof reference !== 'string') {
            addIssue(context, 'evidence_ref_not_string', 'evidenceRefs', section);
            valid = false;
            return;
        }

        if (reference.trim().length === 0) {
            addIssue(context, 'evidence_ref_blank', 'evidenceRefs', section);
            valid = false;
            return;
        }

        if (!SOXL_AI_EVIDENCE_ALIAS_PATTERN.test(reference)) {
            addIssue(context, 'evidence_ref_format_invalid', 'evidenceRefs', section);
            valid = false;
            return;
        }

        if (seen.has(reference)) {
            addIssue(context, 'evidence_ref_duplicate', 'evidenceRefs', section);
            valid = false;
            return;
        }

        seen.add(reference);
    });

    if (!valid) {
        return null;
    }

    const evidenceIds: string[] = [];
    evidenceRefs.forEach((reference) => {
        const evidenceId = catalog.aliasToEvidenceId.get(reference);
        if (evidenceId === undefined || !validEvidenceIds.has(evidenceId)) {
            addIssue(context, 'unknown_evidence_reference', 'evidenceRefs', section);
            valid = false;
            return;
        }
        evidenceIds.push(evidenceId);
    });

    return valid ? evidenceIds : null;
}

function validatePoint(
    value: unknown,
    catalog: SoxlAiEvidenceReferenceCatalog,
    validEvidenceIds: ReadonlySet<string>,
    context: ValidationContext,
    section: PointSectionKey | 'missingEvidence',
): SoxlAiExplanationPoint | null {
    if (value === null) {
        addIssue(context, 'section_item_not_object', undefined, section);
        return null;
    }

    if (!isRecord(value)) {
        addIssue(context, 'section_item_not_object', undefined, section);
        return null;
    }

    const serverMetadataField = findServerMetadataField(value);
    if (serverMetadataField !== undefined) {
        addIssue(context, 'unexpected_server_metadata_field', serverMetadataField);
        return null;
    }

    const expectedKeys = ['text', 'evidenceRefs'] as const;
    if (Object.keys(value).some((key) => !expectedKeys.includes(key as typeof expectedKeys[number]))) {
        addIssue(context, 'section_item_unexpected_field', undefined, section);
        return null;
    }

    if (!Object.hasOwn(value, 'evidenceRefs')) {
        addIssue(context, 'evidence_refs_missing', 'evidenceRefs', section);
        return null;
    }

    const missingKey = expectedKeys.find((key) => !Object.hasOwn(value, key));
    if (missingKey !== undefined) {
        addIssue(context, 'section_item_missing_required_field', missingKey, section);
        return null;
    }

    if (value.text === null) {
        addIssue(context, 'section_item_field_wrong_type', 'text', section);
        return null;
    }

    if (typeof value.text !== 'string') {
        addIssue(context, 'section_item_field_wrong_type', 'text', section);
        return null;
    }

    if (value.text.trim().length === 0) {
        addIssue(context, 'other_section_shape_mismatch', 'text', section);
        return null;
    }

    if (value.text.length > maxPointTextLength) {
        addIssue(context, 'other_section_shape_mismatch', 'text', section);
        return null;
    }

    const evidenceIds = validateEvidenceRefs(
        value.evidenceRefs,
        catalog,
        validEvidenceIds,
        context,
        section,
    );
    if (evidenceIds === null) {
        return null;
    }

    return {
        text: value.text,
        evidenceIds,
    };
}

function validatePointArray(
    value: unknown,
    catalog: SoxlAiEvidenceReferenceCatalog,
    validEvidenceIds: ReadonlySet<string>,
    context: ValidationContext,
    section: PointSectionKey,
): readonly SoxlAiExplanationPoint[] {
    if (!Array.isArray(value)) {
        addIssue(context, 'section_not_array', undefined, section);
        return [];
    }

    if (value.length > maxPointsPerSection) {
        addIssue(context, 'section_too_many', undefined, section);
        return [];
    }

    const points: SoxlAiExplanationPoint[] = [];
    value.forEach((item) => {
        const point = validatePoint(item, catalog, validEvidenceIds, context, section);
        if (point !== null) {
            points.push(point);
        }
    });
    return points;
}

function validateMissingEvidenceArray(
    value: unknown,
    catalog: SoxlAiEvidenceReferenceCatalog,
    validEvidenceIds: ReadonlySet<string>,
    missingEvidenceIds: ReadonlySet<string>,
    context: ValidationContext,
): readonly SoxlAiExplanationPoint[] {
    if (!Array.isArray(value)) {
        addIssue(context, 'section_not_array', undefined, 'missingEvidence');
        return [];
    }

    if (value.length > maxPointsPerSection) {
        addIssue(context, 'section_too_many', undefined, 'missingEvidence');
        return [];
    }

    const points: SoxlAiExplanationPoint[] = [];
    const citedMissing = new Set<string>();
    value.forEach((item) => {
        const point = validatePoint(item, catalog, validEvidenceIds, context, 'missingEvidence');
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

function validateStatus(
    response: SoxlAiValidatedExplanation,
    evidence: SoxlAiEvidencePackage,
    context: ValidationContext,
): void {
    if (response.status !== evidence.status) {
        addIssue(context, 'status_mismatch', 'status');
    }
}

function validateUnavailableSections(
    response: SoxlAiValidatedExplanation,
    evidence: SoxlAiEvidencePackage,
    context: ValidationContext,
): void {
    if (evidence.status !== 'unavailable') {
        return;
    }

    if (response.supportingEvidence.length > 0) {
        addIssue(context, 'other_section_shape_mismatch', undefined, 'supportingEvidence');
    }
    if (response.conflictingEvidence.length > 0) {
        addIssue(context, 'other_section_shape_mismatch', undefined, 'conflictingEvidence');
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
    response: SoxlAiValidatedExplanation,
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
    response: SoxlAiValidatedExplanation,
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
    response: SoxlAiValidatedExplanation,
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
    catalog: SoxlAiEvidenceReferenceCatalog,
    context: ValidationContext,
    validEvidenceIds: ReadonlySet<string>,
    missingEvidenceIds: ReadonlySet<string>,
): SoxlAiValidatedExplanation | null {
    const serverMetadataField = findServerMetadataField(root);
    if (serverMetadataField !== undefined) {
        addIssue(context, 'unexpected_server_metadata_field', serverMetadataField);
        return null;
    }

    if (Object.keys(root).some((key) => !soxlAiRequiredTopLevelFields.includes(key as typeof soxlAiRequiredTopLevelFields[number]))) {
        addIssue(context, 'unexpected_top_level_fields');
        return null;
    }

    if (!Object.hasOwn(root, 'status')) {
        addIssue(context, 'missing_required_top_level_field', 'status');
        return null;
    }

    const missingSection = pointSectionKeys.find((key) => !Object.hasOwn(root, key));
    if (missingSection !== undefined) {
        addIssue(context, 'section_missing', undefined, missingSection);
        return null;
    }

    if (!Object.hasOwn(root, 'missingEvidence')) {
        addIssue(context, 'section_missing', undefined, 'missingEvidence');
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

    const sections: Record<PointSectionKey, readonly SoxlAiExplanationPoint[]> = {
        summary: [],
        supportingEvidence: [],
        conflictingEvidence: [],
        riskReminders: [],
        limitations: [],
    };

    pointSectionKeys.forEach((key) => {
        sections[key] = validatePointArray(root[key], catalog, validEvidenceIds, context, key);
    });
    const missingEvidence = validateMissingEvidenceArray(
        root.missingEvidence,
        catalog,
        validEvidenceIds,
        missingEvidenceIds,
        context,
    );

    return {
        status: root.status,
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
    return {
        valid: false,
        value: null,
        issues: context.issues,
        reason: diagnostic.reason,
        ...(diagnostic.section === undefined ? {} : { section: diagnostic.section }),
        ...(diagnostic.field === undefined ? {} : { field: diagnostic.field }),
    };
}

export function validateSoxlAiModelExplanation(
    rawResponse: string,
    evidence: SoxlAiEvidencePackage,
    catalog: SoxlAiEvidenceReferenceCatalog,
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

    const validEvidenceIds = new Set(catalog.entries.map(({ evidenceId }) => evidenceId));
    const missingEvidenceIds = new Set(
        evidence.groups.missingEvidence.filter((id) => catalog.evidenceIdToAlias.has(id)),
    );
    const response = buildResponse(
        parsed,
        catalog,
        context,
        validEvidenceIds,
        missingEvidenceIds,
    );

    if (response !== null) {
        validateStatus(response, evidence, context);
        validateUnavailableSections(response, evidence, context);
        validateProhibitedContent(response, context);
        validateNumericGrounding(response, evidence, context);
    }

    if (context.issues.length > 0 || response === null) {
        return failure(context);
    }

    return { valid: true, value: response, issues: [] };
}
