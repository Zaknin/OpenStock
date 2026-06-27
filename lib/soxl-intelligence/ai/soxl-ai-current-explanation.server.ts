import { buildSoxlCoreIndicatorSnapshot } from '../analysis/soxl-core-indicators';
import { buildSoxlSessionAnalysisSnapshot } from '../analysis/soxl-session-analysis';
import { loadServerSoxlMarketContext } from '../market-data/server/soxl-market-context-service';
import {
    assessSoxlMarketFacts,
    type SoxlMarketAssessment,
} from '../strategy/soxl-market-assessment';
import {
    buildSoxlMarketFacts,
    type SoxlMarketFacts,
} from '../strategy/soxl-market-facts';
import {
    buildSoxlAiEvidencePackage,
    type SoxlAiEvidencePackage,
} from './soxl-ai-evidence';
import {
    generateSoxlAiExplanation,
    type SoxlAiExplanationServiceIssue,
    type SoxlAiExplanationServiceResult,
} from './soxl-ai-explanation-service.server';
import type {
    SoxlAiExplanationResponseContract,
} from './soxl-ai-prompt';
import {
    defaultSoxlAiInvocationGuard,
    type SoxlAiInvocationGuardIssue,
    type SoxlAiInvocationGuardResult,
} from './soxl-ai-invocation-guard.server';

export interface RequestCurrentSoxlExplanationInput {
    readonly expectedProviderId: string;
    readonly expectedAsOf: string;
}

export type SoxlAiCurrentExplanationIssue =
    | 'unauthenticated'
    | 'invalid_request'
    | 'rate_limited'
    | 'request_in_flight'
    | 'global_capacity_reached'
    | 'stale_snapshot'
    | 'current_data_unavailable'
    | SoxlAiExplanationServiceIssue;

export interface SoxlAiCurrentExplanationResult {
    readonly status: 'available' | 'unavailable';
    readonly explanation: SoxlAiExplanationResponseContract | null;
    readonly issues: readonly SoxlAiCurrentExplanationIssue[];
    readonly retryAfterSeconds: number | null;
}

export interface SoxlCurrentDeterministicSnapshot {
    readonly facts: SoxlMarketFacts;
    readonly assessment: SoxlMarketAssessment;
}

export interface SoxlAiCurrentExplanationSession {
    readonly userId: string;
}

export interface GenerateCurrentSoxlExplanationDependencies {
    readonly resolveSession: () => Promise<SoxlAiCurrentExplanationSession | null>;
    readonly acquirePermit: (userId: string) => SoxlAiInvocationGuardResult;
    readonly loadCurrentSnapshot: () => Promise<SoxlCurrentDeterministicSnapshot>;
    readonly generateExplanation: (evidence: SoxlAiEvidencePackage) => Promise<SoxlAiExplanationServiceResult>;
}

const maxIdentityLength = 128;

function unavailable(
    issue: SoxlAiCurrentExplanationIssue,
    retryAfterSeconds: number | null = null,
): SoxlAiCurrentExplanationResult {
    return {
        status: 'unavailable',
        explanation: null,
        issues: [issue],
        retryAfterSeconds,
    };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object'
        && value !== null
        && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}

function parseRequest(input: unknown): RequestCurrentSoxlExplanationInput | null {
    if (!isPlainObject(input)) {
        return null;
    }

    const keys = Object.keys(input);
    if (
        keys.length !== 2
        || !keys.includes('expectedProviderId')
        || !keys.includes('expectedAsOf')
    ) {
        return null;
    }

    if (
        typeof input.expectedProviderId !== 'string'
        || typeof input.expectedAsOf !== 'string'
        || input.expectedProviderId.trim().length === 0
        || input.expectedAsOf.trim().length === 0
        || input.expectedProviderId.length > maxIdentityLength
        || input.expectedAsOf.length > maxIdentityLength
    ) {
        return null;
    }

    return {
        expectedProviderId: input.expectedProviderId,
        expectedAsOf: input.expectedAsOf,
    };
}

function currentIdentitiesMatch(snapshot: SoxlCurrentDeterministicSnapshot): boolean {
    return snapshot.facts.providerId === snapshot.assessment.providerId
        && snapshot.facts.asOf === snapshot.assessment.asOf;
}

function requestMatchesSnapshot(
    request: RequestCurrentSoxlExplanationInput,
    snapshot: SoxlCurrentDeterministicSnapshot,
): boolean {
    return request.expectedProviderId === snapshot.facts.providerId
        && request.expectedAsOf === String(snapshot.facts.asOf);
}

function evidenceContainsOnlyCurrentContext(evidence: SoxlAiEvidencePackage): boolean {
    return evidence.groups.planAssumptions.length === 0
        && evidence.groups.planCalculations.length === 0
        && evidence.groups.executionAssumptions.length === 0
        && evidence.groups.monitoringCalculations.length === 0;
}

export async function loadCurrentSoxlDeterministicSnapshot(): Promise<SoxlCurrentDeterministicSnapshot> {
    const context = await loadServerSoxlMarketContext();
    const core = buildSoxlCoreIndicatorSnapshot(context);
    const session = buildSoxlSessionAnalysisSnapshot(context);
    const facts = buildSoxlMarketFacts({ core, session });
    const assessment = assessSoxlMarketFacts(facts);

    return { facts, assessment };
}

export async function generateCurrentSoxlExplanation(
    input: unknown,
    dependencies: GenerateCurrentSoxlExplanationDependencies,
): Promise<SoxlAiCurrentExplanationResult> {
    const request = parseRequest(input);
    if (request === null) {
        return unavailable('invalid_request');
    }

    const session = await dependencies.resolveSession();
    if (session === null) {
        return unavailable('unauthenticated');
    }

    const permit = dependencies.acquirePermit(session.userId);
    if (!permit.allowed) {
        return unavailable(permit.issue, permit.retryAfterSeconds);
    }

    try {
        const snapshot = await dependencies.loadCurrentSnapshot();
        if (!currentIdentitiesMatch(snapshot)) {
            return unavailable('current_data_unavailable');
        }

        if (!requestMatchesSnapshot(request, snapshot)) {
            return unavailable('stale_snapshot');
        }

        const evidence = buildSoxlAiEvidencePackage({
            facts: snapshot.facts,
            assessment: snapshot.assessment,
            plan: null,
            monitor: null,
        });

        if (!evidenceContainsOnlyCurrentContext(evidence)) {
            return unavailable('current_data_unavailable');
        }

        const serviceResult = await dependencies.generateExplanation(evidence);
        if (serviceResult.status === 'available') {
            return {
                status: 'available',
                explanation: serviceResult.explanation,
                issues: [],
                retryAfterSeconds: null,
            };
        }

        return {
            status: 'unavailable',
            explanation: null,
            issues: serviceResult.issues,
            retryAfterSeconds: null,
        };
    } finally {
        permit.release();
    }
}

export function acquireDefaultSoxlAiInvocationPermit(userId: string): SoxlAiInvocationGuardResult {
    return defaultSoxlAiInvocationGuard.acquire(userId);
}

export function generateCurrentSoxlExplanationWithService(
    evidence: SoxlAiEvidencePackage,
): Promise<SoxlAiExplanationServiceResult> {
    return generateSoxlAiExplanation({ evidence });
}

export type { SoxlAiInvocationGuardIssue };
