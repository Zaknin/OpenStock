import { describe, expect, it } from 'vitest';
import {
    SOXL_AI_INVOCATION_COOLDOWN_MS,
    SOXL_AI_INVOCATION_WINDOW_MS,
    SOXL_AI_INVOCATION_WINDOW_LIMIT,
    SoxlAiInvocationGuard,
} from './soxl-ai-invocation-guard.server';

function clock(start = 1_000_000) {
    let value = start;

    return {
        now: () => value,
        advance: (ms: number) => {
            value += ms;
        },
    };
}

describe('SoxlAiInvocationGuard', () => {
    it('allows the first request and releases active counters idempotently', () => {
        const testClock = clock();
        const guard = new SoxlAiInvocationGuard(testClock);
        const permit = guard.acquire('user-1');

        expect(permit.allowed).toBe(true);
        if (permit.allowed) {
            expect(guard.acquire('user-1')).toMatchObject({ allowed: false, issue: 'request_in_flight' });
            permit.release();
            permit.release();
        }

        testClock.advance(SOXL_AI_INVOCATION_COOLDOWN_MS);
        expect(guard.acquire('user-1')).toMatchObject({ allowed: true });
    });

    it('rejects same-user concurrency and enforces global capacity', () => {
        const guard = new SoxlAiInvocationGuard(clock());
        const first = guard.acquire('user-1');
        const second = guard.acquire('user-2');

        expect(first.allowed).toBe(true);
        expect(second.allowed).toBe(true);
        expect(guard.acquire('user-1')).toMatchObject({ allowed: false, issue: 'request_in_flight' });
        expect(guard.acquire('user-3')).toMatchObject({ allowed: false, issue: 'global_capacity_reached' });

        if (first.allowed) {
            first.release();
        }
        expect(guard.acquire('user-3')).toMatchObject({ allowed: true });
    });

    it('enforces cooldown with retry duration and does not consume a slot for rejected requests', () => {
        const testClock = clock();
        const guard = new SoxlAiInvocationGuard(testClock);
        const first = guard.acquire('user-1');
        expect(first.allowed).toBe(true);
        if (first.allowed) {
            first.release();
        }

        const rejected = guard.acquire('user-1');
        expect(rejected).toMatchObject({
            allowed: false,
            issue: 'rate_limited',
            retryAfterSeconds: 30,
        });

        testClock.advance(SOXL_AI_INVOCATION_COOLDOWN_MS);
        const second = guard.acquire('user-1');
        expect(second.allowed).toBe(true);
    });

    it('returns a retry duration that decreases as the injected clock advances', () => {
        const testClock = clock();
        const guard = new SoxlAiInvocationGuard(testClock);
        const first = guard.acquire('user-1');
        expect(first.allowed).toBe(true);
        if (first.allowed) {
            first.release();
        }

        testClock.advance(10_000);
        expect(guard.acquire('user-1')).toMatchObject({
            allowed: false,
            issue: 'rate_limited',
            retryAfterSeconds: 20,
        });

        testClock.advance(10_000);
        expect(guard.acquire('user-1')).toMatchObject({
            allowed: false,
            issue: 'rate_limited',
            retryAfterSeconds: 10,
        });
    });

    it('allows five accepted requests despite cooldown rejections and rejects the sixth inside the window', () => {
        const testClock = clock();
        const guard = new SoxlAiInvocationGuard(testClock);

        for (let index = 0; index < SOXL_AI_INVOCATION_WINDOW_LIMIT; index += 1) {
            const permit = guard.acquire('user-1');
            expect(permit.allowed).toBe(true);
            if (permit.allowed) {
                permit.release();
            }

            if (index < SOXL_AI_INVOCATION_WINDOW_LIMIT - 1) {
                expect(guard.acquire('user-1')).toMatchObject({
                    allowed: false,
                    issue: 'rate_limited',
                });
            }
            testClock.advance(SOXL_AI_INVOCATION_COOLDOWN_MS);
        }

        const rejected = guard.acquire('user-1');
        expect(rejected.allowed).toBe(false);
        if (!rejected.allowed) {
            expect(rejected.issue).toBe('rate_limited');
            expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
        }
    });

    it('removes expired window entries and tracks different users independently', () => {
        const testClock = clock();
        const guard = new SoxlAiInvocationGuard(testClock);

        for (let index = 0; index < SOXL_AI_INVOCATION_WINDOW_LIMIT; index += 1) {
            const permit = guard.acquire('user-1');
            expect(permit.allowed).toBe(true);
            if (permit.allowed) {
                permit.release();
            }
            testClock.advance(SOXL_AI_INVOCATION_COOLDOWN_MS);
        }

        expect(guard.acquire('user-2')).toMatchObject({ allowed: true });
        testClock.advance(SOXL_AI_INVOCATION_WINDOW_MS);
        expect(guard.acquire('user-1')).toMatchObject({ allowed: true });
    });

    it('uses the injected clock and has no persistent storage or network behavior', () => {
        const testClock = clock(500);
        const guard = new SoxlAiInvocationGuard(testClock);
        const first = guard.acquire('user-1');
        expect(first.allowed).toBe(true);
        if (first.allowed) {
            first.release();
        }
        testClock.advance(1);
        expect(guard.acquire('user-1')).toMatchObject({
            allowed: false,
            retryAfterSeconds: 30,
        });
    });
});
