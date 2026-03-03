import { GoogleGenAI } from '@google/genai';
import { GraphAnalysisSettings } from '../types/types';
import { createKnowledgeNetworkSchema } from '../ai/schemas/knowledge-network.schema';
import { createVaultSemanticAnalysisSchema } from '../ai/schemas/vault-semantic-analysis.schema';
import { createNoteSummarySchema } from '../ai/schemas/note-summary.schema';
import { createDomainClassificationSchema, KnowledgeSubdivision } from '../ai/schemas/domain-classification.schema';
import { createKnowledgeEvolutionSchema } from '../ai/schemas/knowledge-evolution.schema';
import { createRecommendedActionsSchema } from '../ai/schemas/recommended-actions.schema';
import {
    SemanticAnalysisError,
    SemanticErrorType,
    classifyGeminiError
} from '../utils/GeminiErrorUtils';

export interface TokenUsage {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
}

export interface AIResponse<T = string> {
    result: T;
    tokenUsage: TokenUsage;
}

export type { SemanticErrorType };
export { SemanticAnalysisError };

/** Semantic models for vault analysis and AI summary (dual-model for 40 RPD on free tier) */
export const SEMANTIC_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'] as const;

export class AIModelService {
    private settings: GraphAnalysisSettings;
    // Gemini 3 Flash: RPM 5 -> 12s between requests
    private readonly ADVANCED_RATE_LIMIT_DELAY = 12000;
    private readonly MODEL_NAME = 'gemini-3-flash-preview';
    private readonly SEMANTIC_MODEL_NAME = SEMANTIC_MODELS[1]; // Default when no modelOverride
    
    public getModelName(): string {
        return this.MODEL_NAME;
    }

    public getSemanticModelName(): string {
        return this.SEMANTIC_MODEL_NAME;
    }

    private genAI: GoogleGenAI | null = null;

    constructor(settings: GraphAnalysisSettings) {
        this.settings = settings;
        this.initializeGenAI();
    }

    /**
     * Initialize the Google GenAI client
     */
    private initializeGenAI(): void {
        if (this.settings?.geminiApiKey && this.settings.geminiApiKey.trim() !== '') {
            this.genAI = new GoogleGenAI({ apiKey: this.settings.geminiApiKey });
        }
    }

    /**
     * Update settings (useful when settings change)
     */
    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
        this.initializeGenAI();
    }

    /**
     * Extract text from response for structured output.
     * Gemini 3 with thinking returns thoughtSignature parts; response.text logs a warning.
     * Manually extract only non-thought text parts to get clean JSON.
     */
    private extractStructuredText(response: { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> }): string {
        const parts = response.candidates?.[0]?.content?.parts;
        if (parts && parts.length > 0) {
            const textParts = parts
                .filter((p): p is { text: string } => !!p.text && p.thought !== true)
                .map(p => p.text);
            if (textParts.length > 0) {
                return textParts.join('').trim();
            }
        }
        return (response as { text?: string }).text?.trim() ?? '';
    }

    /**
     * Structured output analysis using the configured model with response schema
     * This method ensures reliable JSON responses by using the structured output feature
     */
    public async generateStructuredAnalysis<T>(
        prompt: string,
        responseSchema: any,
        maxOutputTokens: number = 8192*2,
        temperature: number = 0.3, // more accurate results with lower temperature
        topP: number = 0.72
    ): Promise<AIResponse<T>> {
        if (!this.genAI) {
            throw new Error('Gemini API key not configured. Please configure your API key in settings.');
        }

        // console.log(`Sending structured analysis request to ${this.MODEL_NAME} (max tokens: ${maxOutputTokens})...`);
        // console.log(`STRUCTURED PROMPT (${prompt.length} chars):`);
        // console.log(prompt);

        try {
            const response = await this.genAI.models.generateContent({
                model: this.MODEL_NAME,
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema,
                    temperature,
                    topP,
                    maxOutputTokens,
                    thinkingConfig: {
                        thinkingBudget: -1, // Dynamic thinking for complex reasoning (structure, evolution, actions)
                    }
                }
            });

            // Extract token usage from the response
            const tokenUsage: TokenUsage = {
                promptTokens: response.usageMetadata?.promptTokenCount || 0,
                candidatesTokens: response.usageMetadata?.candidatesTokenCount || 0,
                totalTokens: response.usageMetadata?.totalTokenCount || 0
            };

            // Extract text: Gemini 3 with thinking returns thoughtSignature parts; response.text
            // logs a warning. Manually extract only non-thought text parts for clean JSON.
            const result = this.extractStructuredText(response) || '';
            
            if (!result) {
                // console.error('Empty response details:', {
                //     responseDefined: !!response,
                //     textProperty: response.text,
                //     candidates: response.candidates?.length || 0,
                //     tokenUsage: tokenUsage
                // });
                throw new Error('Empty response from Gemini API - check API key, request format, or content policy restrictions');
            }
            
            // Parse the JSON response since it's guaranteed to be valid JSON
            let parsedResult: T;
            try {
                parsedResult = JSON.parse(result) as T;
            } catch (parseError) {
                // console.error('Failed to parse structured response as JSON:', parseError);
                throw new Error(`Failed to parse structured response: ${(parseError as Error).message}`);
            }

            // console.log(`STRUCTURED RESPONSE SUCCESS (${result.length} chars, tokens: ${tokenUsage.totalTokens})`);
            // console.log('Parsed result:', parsedResult);

            return {
                result: parsedResult,
                tokenUsage
            };

        } catch (error) {
            // console.error(`${this.MODEL_NAME} structured API error:`, error);

            const errorMessage = (error as Error).message;
            const errorType = classifyGeminiError(errorMessage);

            if (errorType === 'quota_exhausted') {
                throw new SemanticAnalysisError(errorMessage, 'quota_exhausted', this.MODEL_NAME);
            }
            if (errorType === 'rate_limit') {
                // console.log(`Structured analysis rate limited (${this.MODEL_NAME}). Retrying in ${this.ADVANCED_RATE_LIMIT_DELAY / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, this.ADVANCED_RATE_LIMIT_DELAY));
                return this.generateStructuredAnalysis(prompt, responseSchema, maxOutputTokens, temperature, topP);
            }

            // Log additional context for debugging
            // console.error('Structured analysis error context:', {
            //     promptLength: prompt.length,
            //     maxOutputTokens,
            //     temperature,
            //     topP,
            //     hasSchema: !!responseSchema
            // });

            throw error;
        }
    }

    /**
     * Semantic analysis using Gemini 2.5 Flash Lite for vault batch and AI summary.
     * Uses native structured output (responseMimeType + responseSchema).
     * @param modelOverride When set, use this model instead of SEMANTIC_MODEL_NAME (for dual-model rate limit)
     */
    public async generateSemanticAnalysis<T>(
        prompt: string,
        responseSchema: any,
        maxOutputTokens: number = 8192,
        temperature: number = 0.3,
        topP: number = 0.72,
        modelOverride?: string
    ): Promise<AIResponse<T>> {
        if (!this.genAI) {
            throw new Error('Gemini API key not configured. Please configure your API key in settings.');
        }

        const model = modelOverride ?? this.SEMANTIC_MODEL_NAME;
        const languageInstruction = '\n\nIMPORTANT: Your output language MUST match the language of each input note. If a note is written in Chinese, respond in Chinese; if in English, respond in English; and so on for any other language.';
        const fullPrompt = prompt + languageInstruction;

        // console.log(`Sending semantic analysis request to ${model} (max tokens: ${maxOutputTokens})...`);
        // console.log(`SEMANTIC PROMPT (${fullPrompt.length} chars):`);
        // console.log(fullPrompt);

        try {
            const response = await this.genAI.models.generateContent({
                model,
                contents: fullPrompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema,
                    temperature,
                    topP,
                    maxOutputTokens,
                    thinkingConfig: {
                        thinkingBudget: 0, // Disable thinking for simple extraction (keywords, summary, domains)
                    }
                }
            });

            const tokenUsage: TokenUsage = {
                promptTokens: response.usageMetadata?.promptTokenCount || 0,
                candidatesTokens: response.usageMetadata?.candidatesTokenCount || 0,
                totalTokens: response.usageMetadata?.totalTokenCount || 0
            };

            const result = response.text?.trim() || '';

            if (!result) {
                // console.error('Empty semantic response details:', {
                //     responseDefined: !!response,
                //     textProperty: response.text,
                //     candidates: response.candidates?.length || 0,
                //     tokenUsage: tokenUsage
                // });
                throw new Error('Empty response from Gemini API - check API key, request format, or content policy restrictions');
            }

            let parsedResult: T;
            try {
                parsedResult = JSON.parse(result) as T;
            } catch (parseError) {
                const msg = `Failed to parse semantic response: ${(parseError as Error).message}`;
                // console.error('Failed to parse semantic response as JSON:', parseError);
                // console.error('Raw response text:', result.substring(0, 500));
                throw new SemanticAnalysisError(msg, 'json_parse', model);
            }

            // console.log(`SEMANTIC RESPONSE SUCCESS (${result.length} chars, tokens: ${tokenUsage.totalTokens})`);
            // console.log('Parsed result:', parsedResult);

            return {
                result: parsedResult,
                tokenUsage
            };

        } catch (error) {
            if (error instanceof SemanticAnalysisError) throw error;

            const errorMessage = (error as Error).message;
            const errorType = classifyGeminiError(errorMessage);
            if (errorType === 'quota_exhausted') {
                // console.warn(`Semantic analysis quota exhausted (${model}):`, errorMessage.substring(0, 200));
            } else {
                // console.error(`${model} semantic API error:`, error);
            }
            throw new SemanticAnalysisError(errorMessage, errorType, model);
        }
    }

    // ==========================================
    // SCHEMA FACTORY METHODS
    // ==========================================

    /**
     * Create response schema for knowledge network analysis
     */
    public createKnowledgeNetworkSchema(): any {
        return createKnowledgeNetworkSchema();
    }

    /**
     * Create response schema for vault semantic analysis batch processing
     */
    public createVaultSemanticAnalysisSchema(expectedResultCount: number): any {
        return createVaultSemanticAnalysisSchema(expectedResultCount);
    }

    /**
     * Create response schema for individual note summary analysis
     */
    public createNoteSummarySchema(): any {
        return createNoteSummarySchema();
    }

    /**
     * Create response schema for knowledge evolution analysis
     */
    public createKnowledgeEvolutionSchema(): any {
        return createKnowledgeEvolutionSchema();
    }

    /**
     * Create response schema for recommended actions analysis
     */
    public createRecommendedActionsSchema(): any {
        return createRecommendedActionsSchema();
    }

    /**
     * Create response schema for domain classification with knowledge domain validation
     */
    public createDomainClassificationSchema(availableSubdivisions: KnowledgeSubdivision[]): any {
        return createDomainClassificationSchema(availableSubdivisions);
    }





    /**
     * Rate limiting helper - wait between requests (uses Gemini 3 Flash rate: 12s)
     */
    public async waitForRateLimit(): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, this.ADVANCED_RATE_LIMIT_DELAY));
    }

    /**
     * Calculate recommended delay based on request count (Gemini 3 Flash: RPM 5)
     */
    public calculateDelay(requestCount: number): number {
        return this.ADVANCED_RATE_LIMIT_DELAY;
    }
} 