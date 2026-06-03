import { getObsidianLocale } from '../i18n';
import type { GraphAnalysisSettings } from '../types/types';

/** Vault analysis row shape used for language detection (avoids circular imports). */
export interface VaultLanguageSampleRow {
    summary?: string;
    keywords?: string;
}

export interface NoteContentSampleRow {
    content: string;
}

export function buildContextSampleFromVaultRows(rows: VaultLanguageSampleRow[], maxRows = 80): string {
    return rows
        .slice(0, maxRows)
        .map(r => `${r.summary ?? ''} ${r.keywords ?? ''}`)
        .join(' ');
}

/** Sample note bodies for auto-detect before summaries exist (semantic batch). */
export function buildContextSampleFromNoteContents(
    rows: NoteContentSampleRow[],
    maxChars = 12_000
): string {
    let sample = '';
    for (const row of rows) {
        if (sample.length >= maxChars) break;
        sample += `${row.content} `;
    }
    return sample.slice(0, maxChars);
}

const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;

/** Ratio of CJK characters in sample text (0–1). */
export function cjkRatio(text: string): number {
    if (!text.length) return 0;
    const matches = text.match(CJK_REGEX);
    return (matches?.length ?? 0) / text.length;
}

/** Resolved output language sent to the model (auto is never passed through). */
export type ResolvedAiLanguage = 'en' | 'zh-Hans';

/**
 * Maps plugin setting (auto | en | zh-Hans) to a single output language for prompts.
 * - en / zh-Hans: fixed
 * - auto: detect from contextSample, then Obsidian UI language, else English
 */
export function resolveAiOutputLanguage(
    settings: GraphAnalysisSettings,
    contextSample: string
): ResolvedAiLanguage {
    const preference = settings.aiResponseLanguage;
    if (preference === 'en') return 'en';
    if (preference === 'zh-Hans') return 'zh-Hans';

    const sample = contextSample.trim();
    if (sample.length > 0) {
        return cjkRatio(sample) >= 0.15 ? 'zh-Hans' : 'en';
    }

    const obsidianLocale = getObsidianLocale();
    return obsidianLocale === 'zh-Hans' ? 'zh-Hans' : 'en';
}

/**
 * One language block for every AI prompt. Auto is resolved before this runs;
 * the model only sees English or Simplified Chinese.
 */
export function buildLanguagePromptSection(
    settings: GraphAnalysisSettings,
    contextSample: string
): string {
    const lang = resolveAiOutputLanguage(settings, contextSample);

    if (lang === 'zh-Hans') {
        return `## Output language
Write every user-visible string in the JSON response in Simplified Chinese (简体中文), including summaries, keywords, titles, descriptions, keyPoints, and recommendations. Use the same language for all notes in the batch. Keep JSON property names and schema enum tokens in English.`;
    }

    return `## Output language
Write every user-visible string in the JSON response in English, including summaries, keywords, titles, descriptions, keyPoints, and recommendations. Use the same language for all notes in the batch. Keep JSON property names and schema enum tokens in English.`;
}
