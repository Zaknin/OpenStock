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
import {
    buildSoxlAiCurrentSnapshotToken,
    type SoxlAiCurrentSnapshotToken,
} from './soxl-ai-current-snapshot-token.server';

export interface RequestCurrentSoxlExplanationInput {
    readonly expectedSnapshotToken: string;
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
    readonly snapshotToken: string | null;
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
    readonly buildEvidence?: typeof buildSoxlAiEvidencePackage;
    readonly buildSnapshotToken?: typeof buildSoxlAiCurrentSnapshotToken;
}

const snapshotTokenPattern = /^soxl-current-v1:[a-f0-9]{64}$/;

function unavailable(
    issue: SoxlAiCurrentExplanationIssue,
    retryAfterSeconds: number | null = null,
): SoxlAiCurrentExplanationResult {
    return {
        status: 'unavailable',
        explanation: null,
        issues: [issue],
        retryAfterSeconds,
        snapshotToken: null,
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
        keys.length !== 1
        || keys[0] !== 'expectedSnapshotToken'
    ) {
        return null;
    }

    if (
        typeof input.expectedSnapshotToken !== 'string'
        || !snapshotTokenPattern.test(input.expectedSnapshotToken)
    ) {
        return null;
    }

    return {
        expectedSnapshotToken: input.expectedSnapshotToken,
    };
}

function currentIdentitiesMatch(snapshot: SoxlCurrentDeterministicSnapshot): boolean {
    return snapshot.facts.providerId === snapshot.assessment.providerId
        && snapshot.facts.asOf === snapshot.assessment.asOf;
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

        const buildEvidence = dependencies.buildEvidence ?? buildSoxlAiEvidencePackage;
        const evidence = buildEvidence({
            facts: snapshot.facts,
            assessment: snapshot.assessment,
            plan: null,
            monitor: null,
        });

        if (!evidenceContainsOnlyCurrentContext(evidence)) {
            return unavailable('current_data_unavailable');
        }

        const buildSnapshotToken = dependencies.buildSnapshotToken
            ?? buildSoxlAiCurrentSnapshotToken;
        const snapshotToken: SoxlAiCurrentSnapshotToken = buildSnapshotToken(evidence);
        if (request.expectedSnapshotToken !== snapshotToken) {
            return unavailable('stale_snapshot');
        }

        const serviceResult = await dependencies.generateExplanation(evidence);
        if (serviceResult.status === 'available') {
            return {
                status: 'available',
                explanation: serviceResult.explanation,
                issues: [],
                retryAfterSeconds: null,
                snapshotToken,
            };
        }

        return {
            status: 'unavailable',
            explanation: null,
            issues: serviceResult.issues,
            retryAfterSeconds: null,
            snapshotToken: null,
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
