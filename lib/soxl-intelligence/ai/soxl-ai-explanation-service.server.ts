import {
    AIProviderError,
    AI_PROVIDER_MAX_TIMEOUT_MS,
    callAIProviderDetailed,
    type AIProviderFailureCategory,
} from '@/lib/ai-provider';
import type {
    SoxlAiEvidencePackage,
} from './soxl-ai-evidence';
import {
    buildSoxlAiEvidenceReferenceCatalog,
} from './soxl-ai-evidence-reference-catalog.server';
import {
    fallbackReasonForPrimaryError,
    isSoxlAiLocalRoutingEnabled,
    noteSoxlAiPrimaryFailure,
    noteSoxlAiPrimarySuccess,
    resolveSoxlAiLocalProviderRoute,
    type SoxlAiLocalProviderRequest,
    type SoxlAiPrimaryFallbackReason,
    type SoxlAiProviderCandidate,
    type SoxlAiProviderRoutePlan,
    type SoxlAiProviderRouteResolver,
    type SoxlAiProviderRole,
} from './soxl-ai-local-provider-router.server';
import {
    buildSoxlAiModelExplanationResponseFormat,
    buildSoxlAiPrompt,
    type SoxlAiExplanationResponse,
} from './soxl-ai-prompt';
import {
    validateSoxlAiModelExplanation,
    type SoxlAiResponseValidationFailure,
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
    readonly explanation: SoxlAiExplanationResponse | null;
    readonly issues: readonly SoxlAiExplanationServiceIssue[];
    readonly providerId: string | null;
    readonly providerRole?: SoxlAiProviderRole | 'default' | null;
    readonly fallbackUsed?: boolean;
    readonly fallbackReason?: SoxlAiPrimaryFallbackReason | null;
}

export interface SoxlAiProviderCallResult {
    readonly providerId: string;
    readonly text: string;
}

export type SoxlAiProviderCall = (
    request: SoxlAiLocalProviderRequest,
) => Promise<string | SoxlAiProviderCallResult>;

export interface GenerateSoxlAiExplanationInput {
    readonly evidence: SoxlAiEvidencePackage;
}

export interface GenerateSoxlAiExplanationDependencies {
    readonly callProvider?: SoxlAiProviderCall;
    readonly resolveProviderRoute?: SoxlAiProviderRouteResolver;
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

function logProviderRoute(
    providerId: string,
    role: SoxlAiProviderRole | 'default',
    fallbackUsed: boolean,
    fallbackReason: SoxlAiPrimaryFallbackReason | null,
): void {
    console.info(
        `SOXL_AI_ROUTE provider=${providerId} role=${role} fallbackUsed=${String(fallbackUsed)} reason=${fallbackReason ?? 'none'}`,
    );
}

export function classifySoxlAiValidationRejectionReason(
    validation: SoxlAiResponseValidationFailure,
): Pick<
    SoxlAiResponseValidationFailure,
    | 'reason'
    | 'section'
    | 'field'
    | 'observedCount'
    | 'uniqueCount'
    | 'allowedPromptMaximum'
    | 'validatorMaximum'
> {
    return {
        reason: validation.reason,
        ...(validation.section === undefined ? {} : { section: validation.section }),
        ...(validation.field === undefined ? {} : { field: validation.field }),
        ...(validation.observedCount === undefined ? {} : {
            observedCount: validation.observedCount,
            uniqueCount: validation.uniqueCount,
            allowedPromptMaximum: validation.allowedPromptMaximum,
            validatorMaximum: validation.validatorMaximum,
        }),
    };
}

function normalizeProviderResult(
    result: string | SoxlAiProviderCallResult,
): SoxlAiProviderCallResult | { readonly providerId: null; readonly text: string } {
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
    rejection: ReturnType<typeof classifySoxlAiValidationRejectionReason>,
): void {
    const sectionSuffix = rejection.section === undefined ? '' : ` section=${rejection.section}`;
    const fieldSuffix = rejection.field === undefined ? '' : ` field=${rejection.field}`;
    const countSuffix = rejection.observedCount === undefined
        ? ''
        : ` observedCount=${rejection.observedCount} uniqueCount=${rejection.uniqueCount} allowedPromptMaximum=${rejection.allowedPromptMaximum} validatorMaximum=${rejection.validatorMaximum}`;
    console.warn(`SOXL_AI_RESPONSE_REJECTED provider=${providerId ?? 'unknown'} reason=${rejection.reason}${sectionSuffix}${fieldSuffix}${countSuffix}`);
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

interface ProviderAttempt {
    readonly providerId: string | null;
    readonly role: SoxlAiProviderRole | 'default';
    readonly strictStructuredOutput: boolean;
    readonly call: SoxlAiProviderCall;
}

interface ProviderAttemptPlan {
    readonly attempts: readonly ProviderAttempt[];
    readonly initialFallbackReason: SoxlAiPrimaryFallbackReason | null;
    readonly routed: boolean;
}

function routedAttempt(candidate: SoxlAiProviderCandidate): ProviderAttempt {
    return {
        providerId: candidate.providerId,
        role: candidate.role,
        strictStructuredOutput: candidate.strictStructuredOutput,
        call: candidate.call,
    };
}

function routedPlan(plan: SoxlAiProviderRoutePlan): ProviderAttemptPlan {
    return {
        attempts: plan.attempts.map(routedAttempt),
        initialFallbackReason: plan.initialFallbackReason,
        routed: true,
    };
}

async function providerAttemptPlan(
    dependencies: GenerateSoxlAiExplanationDependencies,
): Promise<ProviderAttemptPlan> {
    if (dependencies.callProvider !== undefined) {
        return {
            attempts: [{
                providerId: null,
                role: 'default',
                strictStructuredOutput: false,
                call: dependencies.callProvider,
            }],
            initialFallbackReason: null,
            routed: false,
        };
    }

    if (dependencies.resolveProviderRoute !== undefined) {
        return routedPlan(await dependencies.resolveProviderRoute());
    }

    if (isSoxlAiLocalRoutingEnabled()) {
        return routedPlan(await resolveSoxlAiLocalProviderRoute());
    }

    return {
        attempts: [{
            providerId: null,
            role: 'default',
            strictStructuredOutput: false,
            call: defaultProviderCall,
        }],
        initialFallbackReason: null,
        routed: false,
    };
}

function providerRequest(
    prompt: ReturnType<typeof buildSoxlAiPrompt>,
    aliases: readonly string[],
    strictStructuredOutput: boolean,
): SoxlAiLocalProviderRequest {
    const base: SoxlAiLocalProviderRequest = {
        systemInstruction: prompt.systemInstruction,
        userInstruction: prompt.userInstruction,
        responseMimeType: 'application/json',
        timeoutMs: SOXL_AI_PROVIDER_TIMEOUT_MS,
    };

    if (!strictStructuredOutput) {
        return base;
    }

    return {
        ...base,
        responseFormat: buildSoxlAiModelExplanationResponseFormat(),
        allowedEvidenceRefs: aliases,
    };
}

function hasFallbackAfter(
    attempts: readonly ProviderAttempt[],
    index: number,
): boolean {
    return attempts.slice(index + 1).some(({ role }) => role === 'fallback');
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
    const aliases = catalogResult.catalog.entries.map(({ alias }) => alias);
    let plan: ProviderAttemptPlan;
    try {
        plan = await providerAttemptPlan(dependencies);
    } catch (error) {
        logProviderFailure(error);
        return {
            status: 'unavailable',
            explanation: null,
            issues: [providerIssue(error)],
            providerId: error instanceof AIProviderError ? error.providerId : null,
        };
    }

    const issues: SoxlAiExplanationServiceIssue[] = [];
    let fallbackReason = plan.initialFallbackReason;
    let lastProviderId: string | null = null;
    let lastProviderRole: SoxlAiProviderRole | 'default' | null = null;

    for (let index = 0; index < plan.attempts.length; index += 1) {
        const attempt = plan.attempts[index];
        const request = providerRequest(
            prompt,
            aliases,
            attempt.strictStructuredOutput,
        );
        let providerResult: SoxlAiProviderCallResult | {
            readonly providerId: null;
            readonly text: string;
        };

        try {
            providerResult = normalizeProviderResult(await attempt.call(request));
        } catch (error) {
            logProviderFailure(error);
            addIssue(issues, providerIssue(error));
            lastProviderId = error instanceof AIProviderError
                ? error.providerId
                : attempt.providerId;
            lastProviderRole = attempt.role;

            if (attempt.role === 'primary' && hasFallbackAfter(plan.attempts, index)) {
                fallbackReason = fallbackReasonForPrimaryError(error);
                noteSoxlAiPrimaryFailure(fallbackReason);
                continue;
            }

            break;
        }

        lastProviderId = providerResult.providerId ?? attempt.providerId;
        lastProviderRole = attempt.role;
        const validation = validateSoxlAiModelExplanation(
            providerResult.text,
            input.evidence,
            catalogResult.catalog,
        );
        if (!validation.valid) {
            validation.issues.forEach((issue) => addIssue(issues, issue));
            const rejection = classifySoxlAiValidationRejectionReason(validation);
            logValidationRejection(lastProviderId, rejection);

            if (attempt.role === 'primary' && hasFallbackAfter(plan.attempts, index)) {
                fallbackReason = 'primary_validation_rejected';
                noteSoxlAiPrimaryFailure(fallbackReason);
                continue;
            }

            break;
        }

        if (attempt.role === 'primary') {
            noteSoxlAiPrimarySuccess();
        }

        const fallbackUsed = attempt.role === 'fallback';
        if (plan.routed) {
            logProviderRoute(
                lastProviderId ?? attempt.providerId ?? 'unknown',
                attempt.role,
                fallbackUsed,
                fallbackUsed ? fallbackReason : null,
            );
        }

        return {
            status: 'available',
            explanation: {
                ...validation.value,
                snapshotIdentity: trustedSnapshotIdentity(input.evidence),
            },
            issues: [],
            providerId: lastProviderId,
            ...(plan.routed ? {
                providerRole: attempt.role,
                fallbackUsed,
                fallbackReason: fallbackUsed ? fallbackReason : null,
            } : {}),
        };
    }

    return {
        status: 'unavailable',
        explanation: null,
        issues: issues.length === 0 ? ['provider_error'] : issues,
        providerId: lastProviderId,
        ...(plan.routed ? {
            providerRole: lastProviderRole,
            fallbackUsed: lastProviderRole === 'fallback',
            fallbackReason,
        } : {}),
    };
}
