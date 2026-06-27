export type SoxlAiInvocationGuardIssue =
    | 'rate_limited'
    | 'request_in_flight'
    | 'global_capacity_reached';

export interface SoxlAiInvocationPermit {
    readonly allowed: true;
    release(): void;
}

export interface SoxlAiInvocationRejection {
    readonly allowed: false;
    readonly issue: SoxlAiInvocationGuardIssue;
    readonly retryAfterSeconds: number | null;
}

export type SoxlAiInvocationGuardResult =
    | SoxlAiInvocationPermit
    | SoxlAiInvocationRejection;

export interface SoxlAiInvocationGuardClock {
    now(): number;
}

export const SOXL_AI_INVOCATION_COOLDOWN_MS = 30_000;
export const SOXL_AI_INVOCATION_WINDOW_MS = 15 * 60_000;
export const SOXL_AI_INVOCATION_WINDOW_LIMIT = 5;
export const SOXL_AI_USER_CONCURRENCY_LIMIT = 1;
export const SOXL_AI_GLOBAL_CONCURRENCY_LIMIT = 2;

interface UserGuardState {
    readonly acceptedAt: number[];
    activeCount: number;
}

function retrySeconds(remainingMs: number): number {
    return Math.max(1, Math.ceil(remainingMs / 1000));
}

export class SoxlAiInvocationGuard {
    private readonly users = new Map<string, UserGuardState>();
    private globalActiveCount = 0;

    constructor(
        private readonly clock: SoxlAiInvocationGuardClock = { now: () => Date.now() },
    ) {}

    acquire(userId: string): SoxlAiInvocationGuardResult {
        const now = this.clock.now();
        const state = this.stateFor(userId);
        this.pruneExpired(state, now);

        if (state.activeCount >= SOXL_AI_USER_CONCURRENCY_LIMIT) {
            return {
                allowed: false,
                issue: 'request_in_flight',
                retryAfterSeconds: null,
            };
        }

        if (this.globalActiveCount >= SOXL_AI_GLOBAL_CONCURRENCY_LIMIT) {
            return {
                allowed: false,
                issue: 'global_capacity_reached',
                retryAfterSeconds: null,
            };
        }

        const latestAcceptedAt = state.acceptedAt[state.acceptedAt.length - 1] ?? null;
        if (latestAcceptedAt !== null && now - latestAcceptedAt < SOXL_AI_INVOCATION_COOLDOWN_MS) {
            return {
                allowed: false,
                issue: 'rate_limited',
                retryAfterSeconds: retrySeconds(SOXL_AI_INVOCATION_COOLDOWN_MS - (now - latestAcceptedAt)),
            };
        }

        if (state.acceptedAt.length >= SOXL_AI_INVOCATION_WINDOW_LIMIT) {
            return {
                allowed: false,
                issue: 'rate_limited',
                retryAfterSeconds: retrySeconds(SOXL_AI_INVOCATION_WINDOW_MS - (now - state.acceptedAt[0])),
            };
        }

        state.acceptedAt.push(now);
        state.activeCount += 1;
        this.globalActiveCount += 1;

        let released = false;
        return {
            allowed: true,
            release: () => {
                if (released) {
                    return;
                }

                released = true;
                state.activeCount = Math.max(0, state.activeCount - 1);
                this.globalActiveCount = Math.max(0, this.globalActiveCount - 1);
            },
        };
    }

    private stateFor(userId: string): UserGuardState {
        const existing = this.users.get(userId);
        if (existing) {
            return existing;
        }

        const state: UserGuardState = {
            acceptedAt: [],
            activeCount: 0,
        };
        this.users.set(userId, state);
        return state;
    }

    private pruneExpired(state: UserGuardState, now: number): void {
        while (
            state.acceptedAt.length > 0
            && now - state.acceptedAt[0] >= SOXL_AI_INVOCATION_WINDOW_MS
        ) {
            state.acceptedAt.shift();
        }
    }
}

// Process-local first-version guard for the current single OpenStock application instance.
export const defaultSoxlAiInvocationGuard = new SoxlAiInvocationGuard();
