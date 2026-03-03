/**
 * Shared utilities for Gemini API error classification and user-facing messages.
 * Used by semantic analysis, structured analysis, and all callers for consistency.
 */

export type SemanticErrorType = 'rate_limit' | 'quota_exhausted' | 'json_parse' | 'other';

export class SemanticAnalysisError extends Error {
    constructor(
        message: string,
        public readonly errorType: SemanticErrorType,
        public readonly model: string
    ) {
        super(message);
        this.name = 'SemanticAnalysisError';
    }
}

/**
 * Classify a Gemini API error message into quota_exhausted (RPD), rate_limit (RPM), or other.
 * Quota exhaustion should not be retried; rate limit can be retried after a delay.
 * RPD is identified by GenerateRequestsPerDayPerProjectPerModel-FreeTier, free_tier_requests, etc.
 */
export function classifyGeminiError(message: string): SemanticErrorType {
    const lower = message.toLowerCase();
    const is429 =
        message.includes('429') ||
        lower.includes('rate limit') ||
        lower.includes('resource exhausted');
    const isQuota =
        lower.includes('per day') ||
        lower.includes('perday') ||
        lower.includes('rpd') ||
        lower.includes('daily') ||
        lower.includes('quota') ||
        lower.includes('generate_content_free_tier_requests') ||
        lower.includes('requestsperday');
    if (is429 && isQuota) return 'quota_exhausted';
    if (is429) return 'rate_limit';
    return 'other';
}

/**
 * Return a user-friendly error message for display in notices and UI.
 */
export function getUserFriendlyMessage(error: Error): string {
    if (error instanceof SemanticAnalysisError) {
        switch (error.errorType) {
            case 'quota_exhausted':
                return 'Free-tier daily limit reached. Retry tomorrow.';
            case 'rate_limit':
                return 'API rate limit exceeded. Please try again later.';
            default:
                return error.message;
        }
    }
    return error.message;
}
