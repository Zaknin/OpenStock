import {
    AIProviderError,
    callAIProviderWithFallbackDetailed,
    type AIProviderCallResult,
    type AIProviderStructuredRequest,
} from '@/lib/ai-provider';
import type {
    SoxlAiEvidencePackage,
} from './soxl-ai-evidence';
import {
    buildSoxlAiPrompt,
    soxlAiExplanationResponseFormat,
    type SoxlAiExplanationResponseContract,
} from './soxl-ai-prompt';
import {
    validateSoxlAiExplanationResponse,
    type SoxlAiResponseValidationIssue,
} from './soxl-ai-response-validator';

export type SoxlAiExplanationServiceStatus =
    | 'available'
    | 'unavailable';

export type SoxlAiExplanationServiceIssue =
    | 'provider_not_configured'
    | 'provider_timeout'
    | 'provider_error'
    | SoxlAiResponseValidationIssue;

export type SoxlAiValidationRejectionReason =
    | 'invalid_json'
    | 'response_shape_mismatch'
    | 'unknown_evidence_reference'
    | 'ungrounded_numeric_claim'
    | 'other_validation_failure';

export interface SoxlAiExplanationServiceResult {
    readonly status: SoxlAiExplanationServiceStatus;
    readonly explanation: SoxlAiExplanationResponseContract | null;
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

const defaultProviderCall: SoxlAiProviderCall = (request) => callAIProviderWithFallbackDetailed(request);

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

export function classifySoxlAiValidationRejectionReason(
    issues: readonly SoxlAiResponseValidationIssue[],
): SoxlAiValidationRejectionReason {
    if (issues.includes('invalid_json')) {
        return 'invalid_json';
    }

    if (issues.includes('unknown_evidence_reference')) {
        return 'unknown_evidence_reference';
    }

    if (issues.includes('ungrounded_numeric_claim')) {
        return 'ungrounded_numeric_claim';
    }

    if (issues.some((issue) => (
        issue === 'invalid_response_shape'
        || issue === 'unexpected_response_key'
        || issue === 'status_mismatch'
        || issue === 'snapshot_identity_mismatch'
        || issue === 'invalid_missing_evidence_reference'
        || issue === 'uncited_missing_evidence'
        || issue === 'empty_response'
        || issue === 'response_too_large'
    ))) {
        return 'response_shape_mismatch';
    }

    return 'other_validation_failure';
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
): void {
    console.warn(`SOXL_AI_RESPONSE_REJECTED provider=${providerId ?? 'unknown'} reason=${reason}`);
}

export async function generateSoxlAiExplanation(
    input: GenerateSoxlAiExplanationInput,
    dependencies: GenerateSoxlAiExplanationDependencies = {},
): Promise<SoxlAiExplanationServiceResult> {
    const prompt = buildSoxlAiPrompt(input.evidence);
    const callProvider = dependencies.callProvider ?? defaultProviderCall;

    let providerResult: AIProviderCallResult | { readonly providerId: null; readonly text: string };
    try {
        providerResult = normalizeProviderResult(await callProvider({
            systemInstruction: prompt.systemInstruction,
            userInstruction: prompt.userInstruction,
            responseFormat: soxlAiExplanationResponseFormat,
        }));
    } catch (error) {
        return {
            status: 'unavailable',
            explanation: null,
            issues: [providerIssue(error)],
            providerId: error instanceof AIProviderError ? error.providerId : null,
        };
    }

    const validation = validateSoxlAiExplanationResponse(providerResult.text, input.evidence);
    if (!validation.valid) {
        const issues: SoxlAiExplanationServiceIssue[] = [];
        validation.issues.forEach((issue) => addIssue(issues, issue));
        logValidationRejection(
            providerResult.providerId,
            classifySoxlAiValidationRejectionReason(validation.issues),
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
        explanation: validation.value,
        issues: [],
        providerId: providerResult.providerId,
    };
}
