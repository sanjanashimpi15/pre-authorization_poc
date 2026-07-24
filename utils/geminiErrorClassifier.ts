/**
 * utils/geminiErrorClassifier.ts
 *
 * Single source of truth for turning a Gemini call failure — however it reaches
 * us (raw SDK error in Node, or a proxied fetch Error in the browser) — into a
 * user-facing category. Used by the Vercel serverless proxy, the local Vite dev
 * proxy, the client-side Gemini client wrapper, and the document pipeline
 * services so all four layers agree on what counts as "quota exceeded" vs
 * "temporarily unavailable".
 */

export type GeminiErrorKind = 'quota_exceeded' | 'service_unavailable' | 'access_denied' | 'unknown';

export function classifyGeminiError(error: any): GeminiErrorKind {
    const status = Number(error?.status ?? error?.code ?? error?.httpStatus ?? 0);
    const msg = String(error?.message ?? '').toLowerCase();

    // Checked first and independently of the "quota" bucket below: a 403 PERMISSION_DENIED
    // ("Your project has been denied access") means the API key/Cloud project itself is
    // blocked from this model — a hard, permanent failure, not a rate limit. Retrying or
    // waiting never resolves it; only a different key or fixing project billing/access does.
    if (status === 403 || msg.includes('403') || msg.includes('permission_denied') || msg.includes('denied access')) {
        return 'access_denied';
    }
    if (status === 429 || msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota')) {
        return 'quota_exceeded';
    }
    if (status === 503 || msg.includes('503') || msg.includes('unavailable') || msg.includes('overloaded')) {
        return 'service_unavailable';
    }
    return 'unknown';
}

/** Maps a classified error back to the HTTP status our own proxies should report. */
export function statusForGeminiError(error: any): number {
    const kind = classifyGeminiError(error);
    if (kind === 'access_denied') return 403;
    if (kind === 'quota_exceeded') return 429;
    if (kind === 'service_unavailable') return 503;
    return 500;
}

/** Short, user-facing explanation for the given error kind. */
export function geminiErrorUserMessage(kind: GeminiErrorKind): string {
    switch (kind) {
        case 'access_denied':
            return 'AI extraction is unavailable because the configured Gemini API key/project has been denied access to this model (HTTP 403). This will not resolve by retrying — the API key or its Google Cloud project billing/access needs to be fixed.';
        case 'quota_exceeded':
            return 'AI extraction is temporarily unavailable because the Gemini quota has been exceeded.';
        case 'service_unavailable':
            return 'AI extraction is temporarily unavailable because the Gemini service is not responding (retried automatically, still unavailable).';
        default:
            return 'AI extraction failed due to an unexpected error.';
    }
}
