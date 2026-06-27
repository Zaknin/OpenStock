'use server';

import { headers } from 'next/headers';
import { auth } from '@/lib/better-auth/auth';
import {
    acquireDefaultSoxlAiInvocationPermit,
    generateCurrentSoxlExplanation,
    generateCurrentSoxlExplanationWithService,
    loadCurrentSoxlDeterministicSnapshot,
    type SoxlAiCurrentExplanationResult,
} from '@/lib/soxl-intelligence/ai/soxl-ai-current-explanation.server';

export async function requestCurrentSoxlExplanation(
    input: unknown,
): Promise<SoxlAiCurrentExplanationResult> {
    return generateCurrentSoxlExplanation(input, {
        resolveSession: async () => {
            const session = await auth.api.getSession({ headers: await headers() });

            return session?.user?.id
                ? { userId: session.user.id }
                : null;
        },
        acquirePermit: acquireDefaultSoxlAiInvocationPermit,
        loadCurrentSnapshot: loadCurrentSoxlDeterministicSnapshot,
        generateExplanation: generateCurrentSoxlExplanationWithService,
    });
}
