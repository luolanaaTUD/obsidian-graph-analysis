import { requestUrl } from 'obsidian';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiContentPart {
    text?: string;
    thought?: boolean;
}

export interface GeminiGenerateContentResponse {
    candidates?: Array<{
        content?: { parts?: GeminiContentPart[] };
    }>;
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
    };
}

export interface GeminiGenerateContentParams {
    apiKey: string;
    model: string;
    prompt: string;
    generationConfig: Record<string, unknown>;
}

function responseTextFromParts(response: GeminiGenerateContentResponse): string {
    const parts = response.candidates?.[0]?.content?.parts;
    if (parts && parts.length > 0) {
        const textParts = parts
            .filter((p): p is { text: string } => !!p.text && p.thought !== true)
            .map(p => p.text);
        if (textParts.length > 0) {
            return textParts.join('').trim();
        }
    }
    return '';
}

function parseErrorBody(status: number, body: string, json: unknown): string {
    const err = json as { error?: { message?: string; status?: string } } | undefined;
    const msg = err?.error?.message ?? body?.slice(0, 500) ?? 'Unknown error';
    return `${status} ${err?.error?.status ?? ''} ${msg}`.trim();
}

/**
 * Gemini generateContent via Obsidian requestUrl only (no global fetch, no @google/genai).
 */
export async function geminiGenerateContent(
    params: GeminiGenerateContentParams
): Promise<GeminiGenerateContentResponse & { text: string }> {
    const url =
        `${GEMINI_API_BASE}/models/${encodeURIComponent(params.model)}:generateContent` +
        `?key=${encodeURIComponent(params.apiKey)}`;

    const body = {
        contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
        generationConfig: params.generationConfig
    };

    const result = await requestUrl({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        throw: false
    });

    let json: unknown;
    try {
        json = result.json;
    } catch {
        json = undefined;
    }

    if (result.status < 200 || result.status >= 300) {
        throw new Error(parseErrorBody(result.status, result.text, json));
    }

    const response = (json ?? {}) as GeminiGenerateContentResponse;
    return Object.assign(response, { text: responseTextFromParts(response) });
}
