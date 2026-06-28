import {
    AIProviderError,
    AI_PROVIDER_MAX_TIMEOUT_MS,
    callAIProviderDetailed,
    type AIProviderFailureCategory,
    type AIProviderCallResult,
    type AIProviderStructuredRequest,
} from '@/lib/ai-provider';
import type {
    SoxlAiEvidencePackage,
} from './soxl-ai-evidence';
import {
    buildSoxlAiEvidenceReferenceCatalog,
} from './soxl-ai-evidence-reference-catalog.server';
import {
    buildSoxlAiPrompt,
    type SoxlAiExplanationResponse,
} from './soxl-ai-prompt';
import {
    validateSoxlAiModelExplanation,
    type SoxlAiResponseValidationFailure,
    type SoxlAiResponseValidationField,
    type SoxlAiResponseValidationIssue,
    type SoxlAiResponseValidationSection,
} from './soxl-ai-response-validator';

export type SoxlAiExplanationServiceStatus =
    | 'available'
    | 'unavailable';

export type SoxlAiExplanationServiceIssue =
    | 'provider_not_configured'
    | 'provider_timeout'
    | 'provider_error'
    | SoxlAiResponseValidationIssue;

export type SoxlAiValidationRejectionReason = SoxlAiResponseValidationIssue;

export interface SoxlAiExplanationServiceResult {
    readonly status: SoxlAiExplanationServiceStatus;
    readonly explanation: SoxlAiExplanationResponse | null;
    readonly issues: readonly SoxlAiExplanationServiceIssue[];
    readonly providerId: string | null;
}

export type SoxlAiProviderCall = (
    request: AIProviderStructuredRequest,
) => Promise<string | AIProviderCallResult>;

export interface GenerateSoxlAiExplanationInput {
    readonly evidence: SoxlAiEvidencePackage;
}

export interface GenerateSoxlAiExplanationDependencies {
    readonly callProvider?: SoxlAiProviderCall;
}

const defaultProviderCall: SoxlAiProviderCall = (request) => callAIProviderDetailed(request);
const SOXL_AI_PROVIDER_TIMEOUT_MS = AI_PROVIDER_MAX_TIMEOUT_MS;

function addIssue(
    issues: SoxlAiExplanationServiceIssue[],
    issue: SoxlAiExplanationServiceIssue,
): void {
    if (!issues.includes(issue)) {
        issues.push(issue);
    }
}

function providerIssue(error: unknown): SoxlAiExplanationServiceIssue {
    if (error instanceof AIProviderError) {
        if (error.code === 'provider_not_configured') {
            return 'provider_not_configured';
        }

        if (error.code === 'provider_timeout') {
            return 'provider_timeout';
        }
    }

    return 'provider_error';
}

function logProviderFailure(error: unknown): void {
    const providerId = error instanceof AIProviderError
        ? error.providerId ?? 'unknown'
        : 'unknown';
    const category: AIProviderFailureCategory = error instanceof AIProviderError
        ? error.category
        : 'unknown_provider_error';
    const httpStatus = error instanceof AIProviderError && error.httpStatus !== null
        ? String(error.httpStatus)
        : 'none';

    console.warn(
        `SOXL_AI_PROVIDER_FAILED provider=${providerId} category=${category} httpStatus=${httpStatus}`,
    );
}

export function classifySoxlAiValidationRejectionReason(
    validation: SoxlAiResponseValidationFailure,
): Pick<SoxlAiResponseValidationFailure, 'reason' | 'section' | 'field'> {
    return {
        reason: validation.reason,
        ...(validation.section === undefined ? {} : { section: validation.section }),
        ...(validation.field === undefined ? {} : { field: validation.field }),
    };
}

function normalizeProviderResult(
    result: string | AIProviderCallResult,
): AIProviderCallResult | { readonly providerId: null; readonly text: string } {
    if (typeof result === 'string') {
        return {
            providerId: null,
            text: result,
        };
    }

    return result;
}

function logValidationRejection(
    providerId: string | null,
    reason: SoxlAiValidationRejectionReason,
    section?: SoxlAiResponseValidationSection,
    field?: SoxlAiResponseValidationField,
): void {
    const sectionSuffix = section === undefined ? '' : ` section=${section}`;
    const fieldSuffix = field === undefined ? '' : ` field=${field}`;
    console.warn(`SOXL_AI_RESPONSE_REJECTED provider=${providerId ?? 'unknown'} reason=${reason}${sectionSuffix}${fieldSuffix}`);
}

function trustedSnapshotIdentity(
    evidence: SoxlAiEvidencePackage,
): SoxlAiExplanationResponse['snapshotIdentity'] {
    const identity = evidence.snapshotIdentities.find(({ role }) => role === 'current') ?? null;
    return {
        providerId: identity?.providerId ?? null,
        asOf: identity?.asOf === null || identity === null
            ? null
            : String(identity.asOf),
    };
}

export async function generateSoxlAiExplanation(
    input: GenerateSoxlAiExplanationInput,
    dependencies: GenerateSoxlAiExplanationDependencies = {},
): Promise<SoxlAiExplanationServiceResult> {
    const catalogResult = buildSoxlAiEvidenceReferenceCatalog(input.evidence);
    if (!catalogResult.ok) {
        return {
            status: 'unavailable',
            explanation: null,
            issues: [catalogResult.issue],
            providerId: null,
        };
    }

    const prompt = buildSoxlAiPrompt(input.evidence, catalogResult.catalog);
    const callProvider = dependencies.callProvider ?? defaultProviderCall;

    let providerResult: AIProviderCallResult | { readonly providerId: null; readonly text: string };
    try {
        providerResult = normalizeProviderResult(await callProvider({
            systemInstruction: prompt.systemInstruction,
            userInstruction: prompt.userInstruction,
            responseMimeType: 'application/json',
            timeoutMs: SOXL_AI_PROVIDER_TIMEOUT_MS,
        }));
    } catch (error) {
        logProviderFailure(error);
        return {
            status: 'unavailable',
            explanation: null,
            issues: [providerIssue(error)],
            providerId: error instanceof AIProviderError ? error.providerId : null,
        };
    }

    const validation = validateSoxlAiModelExplanation(
        providerResult.text,
        input.evidence,
        catalogResult.catalog,
    );
    if (!validation.valid) {
        const issues: SoxlAiExplanationServiceIssue[] = [];
        validation.issues.forEach((issue) => addIssue(issues, issue));
        const rejection = classifySoxlAiValidationRejectionReason(validation);
        logValidationRejection(
            providerResult.providerId,
            rejection.reason,
            rejection.section,
            rejection.field,
        );
        return {
            status: 'unavailable',
            explanation: null,
            issues,
            providerId: providerResult.providerId,
        };
    }

    return {
        status: 'available',
        explanation: {
            ...validation.value,
            snapshotIdentity: trustedSnapshotIdentity(input.evidence),
        },
        issues: [],
        providerId: providerResult.providerId,
    };
}
