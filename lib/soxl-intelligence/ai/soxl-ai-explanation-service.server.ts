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
    type SoxlAiResponseValidationFailure,
    type SoxlAiResponseValidationField,
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

export type SoxlAiValidationRejectionReason = SoxlAiResponseValidationIssue;

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
    validation: SoxlAiResponseValidationFailure,
): Pick<SoxlAiResponseValidationFailure, 'reason' | 'field'> {
    return validation.field === undefined
        ? { reason: validation.reason }
        : { reason: validation.reason, field: validation.field };
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
    field?: SoxlAiResponseValidationField,
): void {
    const fieldSuffix = field === undefined ? '' : ` field=${field}`;
    console.warn(`SOXL_AI_RESPONSE_REJECTED provider=${providerId ?? 'unknown'} reason=${reason}${fieldSuffix}`);
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
        const rejection = classifySoxlAiValidationRejectionReason(validation);
        logValidationRejection(providerResult.providerId, rejection.reason, rejection.field);
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
