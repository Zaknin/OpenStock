import {
    AIProviderError,
    callAIProviderWithFallback,
    type AIProviderStructuredRequest,
} from '@/lib/ai-provider';
import type {
    SoxlAiEvidencePackage,
} from './soxl-ai-evidence';
import {
    buildSoxlAiPrompt,
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

export interface SoxlAiExplanationServiceResult {
    readonly status: SoxlAiExplanationServiceStatus;
    readonly explanation: SoxlAiExplanationResponseContract | null;
    readonly issues: readonly SoxlAiExplanationServiceIssue[];
}

export type SoxlAiProviderCall = (
    request: AIProviderStructuredRequest,
) => Promise<string>;

export interface GenerateSoxlAiExplanationInput {
    readonly evidence: SoxlAiEvidencePackage;
}

export interface GenerateSoxlAiExplanationDependencies {
    readonly callProvider?: SoxlAiProviderCall;
}

const defaultProviderCall: SoxlAiProviderCall = (request) => callAIProviderWithFallback(request);

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

export async function generateSoxlAiExplanation(
    input: GenerateSoxlAiExplanationInput,
    dependencies: GenerateSoxlAiExplanationDependencies = {},
): Promise<SoxlAiExplanationServiceResult> {
    const prompt = buildSoxlAiPrompt(input.evidence);
    const callProvider = dependencies.callProvider ?? defaultProviderCall;

    let rawResponse: string;
    try {
        rawResponse = await callProvider({
            systemInstruction: prompt.systemInstruction,
            userInstruction: prompt.userInstruction,
        });
    } catch (error) {
        return {
            status: 'unavailable',
            explanation: null,
            issues: [providerIssue(error)],
        };
    }

    const validation = validateSoxlAiExplanationResponse(rawResponse, input.evidence);
    if (!validation.valid) {
        const issues: SoxlAiExplanationServiceIssue[] = [];
        validation.issues.forEach((issue) => addIssue(issues, issue));
        return {
            status: 'unavailable',
            explanation: null,
            issues,
        };
    }

    return {
        status: 'available',
        explanation: validation.value,
        issues: [],
    };
}
