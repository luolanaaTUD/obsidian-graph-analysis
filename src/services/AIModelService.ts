import { requestUrl } from 'obsidian';
import { GraphAnalysisSettings } from '../types/types';

export interface TokenUsage {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
}

export interface AIResponse<T = string> {
    result: T;
    tokenUsage: TokenUsage;
}

export interface AIBatchResponse<T = any> {
    results: T[];
    tokenUsage: TokenUsage;
}

export class AIModelService {
    private settings: GraphAnalysisSettings;
    private readonly RATE_LIMIT_DELAY = 2500; // 2.5 seconds between requests for 30 RPM
    private readonly MAX_RETRIES = 3;

    constructor(settings: GraphAnalysisSettings) {
        this.settings = settings;
    }

    /**
     * Update settings (useful when settings change)
     */
    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
    }

    /**
     * Single analysis request to Gemini 2.0 Flash-Lite
     */
    public async generateAnalysis(
        prompt: string, 
        maxOutputTokens: number = 8000,
        temperature: number = 0.3
    ): Promise<AIResponse> {
        return this.callGeminiFlashLite(prompt, maxOutputTokens, temperature);
    }

    /**
     * Data chunk storage request (for chunked analysis)
     */
    public async storeDataChunk(
        prompt: string,
        chunkIndex: number,
        totalChunks: number
    ): Promise<string> {
        const response = await this.callGeminiFlashLite(
            prompt, 
            50, // Brief acknowledgment only
            0.1  // Low temperature for consistent responses
        );
        console.log(`Chunk ${chunkIndex}/${totalChunks} processed successfully`);
        return response.result;
    }

    /**
     * Complete analysis request (optimal for single requests)
     */
    public async generateCompleteAnalysis(
        prompt: string,
        maxOutputTokens: number = 8000
    ): Promise<AIResponse> {
        console.log('Sending complete analysis request to Gemini 2.0 Flash-Lite...');
        return this.callGeminiFlashLite(prompt, maxOutputTokens, 0.3);
    }

    /**
     * Batch analysis request for multiple items
     */
    public async generateBatchAnalysis<T>(
        prompt: string,
        expectedResultCount: number,
        maxOutputTokens?: number
    ): Promise<AIBatchResponse<T>> {
        const calculatedTokens = maxOutputTokens || (expectedResultCount * 150 + 300);
        
        console.log(`Sending batch analysis request for ${expectedResultCount} items to Gemini 2.0 Flash-Lite...`);
        
        const response = await this.callGeminiFlashLite(prompt, calculatedTokens, 0.2);
        
        // Try to parse as JSON array
        try {
            const results = this.parseJSONResponse<T[]>(response.result, expectedResultCount);
            console.log(`Successfully parsed ${results.length} analysis results`);
            
            return {
                results,
                tokenUsage: response.tokenUsage
            };
        } catch (parseError) {
            console.error('Failed to parse batch response as JSON:', parseError);
            throw new Error(`Failed to parse batch analysis response: ${(parseError as Error).message}`);
        }
    }

    /**
     * Core API call method for Gemini 2.0 Flash-Lite
     */
    private async callGeminiFlashLite(
        prompt: string, 
        maxOutputTokens: number = 8000,
        temperature: number = 0.3,
        retryCount: number = 0
    ): Promise<AIResponse> {
        if (!this.settings?.geminiApiKey || this.settings.geminiApiKey.trim() === '') {
            throw new Error('Gemini API key not configured. Please configure your API key in settings.');
        }

        const apiKey = this.settings.geminiApiKey;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;

        const requestBody = { 
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature,
                topK: 20,
                topP: 0.8,
                maxOutputTokens,
            }
        };

        try {
            const response = await requestUrl({
                url: url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (response.status !== 200) {
                return this.handleAPIError(response, prompt, maxOutputTokens, temperature, retryCount);
            }

            const data = response.json;
            
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Invalid response format from Gemini API');
            }

            // Extract token usage from the response
            const tokenUsage: TokenUsage = {
                promptTokens: data.usageMetadata?.promptTokenCount || 0,
                candidatesTokens: data.usageMetadata?.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata?.totalTokenCount || 0
            };

            const result = data.candidates[0].content.parts[0].text.trim();

            return {
                result,
                tokenUsage
            };

        } catch (error) {
            console.error('Gemini 2.0 Flash-Lite API error:', error);
            
            const errorMessage = (error as Error).message;
            if (errorMessage.includes('status 429') && retryCount < this.MAX_RETRIES) {
                return this.handleRateLimit(prompt, maxOutputTokens, temperature, retryCount);
            }
            
            // Network error retry
            if (retryCount < 2 && !this.isAPIError(errorMessage)) {
                return this.handleNetworkRetry(prompt, maxOutputTokens, temperature, retryCount);
            }
            
            throw error;
        }
    }

    /**
     * Handle API error responses
     */
    private async handleAPIError(
        response: any,
        prompt: string,
        maxOutputTokens: number,
        temperature: number,
        retryCount: number
    ): Promise<AIResponse> {
        // Handle rate limiting for 30 RPM limit
        if (response.status === 429 && retryCount < this.MAX_RETRIES) {
            return this.handleRateLimit(prompt, maxOutputTokens, temperature, retryCount);
        }
        
        // Provide user-friendly error messages
        if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait a few minutes before trying again.');
        } else if (response.status === 400) {
            throw new Error('Invalid request. Please check your API key or try again.');
        } else if (response.status === 403) {
            throw new Error('API access forbidden. Please check your Gemini API key permissions.');
        } else {
            throw new Error(`Gemini API returned status ${response.status}: ${response.text}`);
        }
    }

    /**
     * Handle rate limiting with exponential backoff
     */
    private async handleRateLimit(
        prompt: string,
        maxOutputTokens: number,
        temperature: number,
        retryCount: number
    ): Promise<AIResponse> {
        const waitTime = Math.max(this.RATE_LIMIT_DELAY, Math.pow(2, retryCount) * 3000);
        console.log(`Rate limited (429). Retrying in ${waitTime/1000} seconds... (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return await this.callGeminiFlashLite(prompt, maxOutputTokens, temperature, retryCount + 1);
    }

    /**
     * Handle network retry
     */
    private async handleNetworkRetry(
        prompt: string,
        maxOutputTokens: number,
        temperature: number,
        retryCount: number
    ): Promise<AIResponse> {
        const waitTime = (retryCount + 1) * 3000;
        console.log(`Network error. Retrying in ${waitTime/1000} seconds... (attempt ${retryCount + 1}/2)`);
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return await this.callGeminiFlashLite(prompt, maxOutputTokens, temperature, retryCount + 1);
    }

    /**
     * Check if error is an API-specific error (not network error)
     */
    private isAPIError(errorMessage: string): boolean {
        return errorMessage.includes('Rate limit') || 
               errorMessage.includes('status 429') || 
               errorMessage.includes('API') ||
               errorMessage.includes('Invalid response format');
    }

    /**
     * Parse JSON response with fallback handling
     */
    private parseJSONResponse<T>(responseText: string, expectedLength?: number): T {
        // Clean the response text by removing markdown code blocks
        let cleanedResponse = responseText.trim();
        
        // Remove markdown code block markers if present
        if (cleanedResponse.startsWith('```json')) {
            cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanedResponse.startsWith('```')) {
            cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        const parsed = JSON.parse(cleanedResponse);
        
        // Validate array length if expected
        if (expectedLength !== undefined && Array.isArray(parsed)) {
            if (parsed.length !== expectedLength) {
                console.warn(`Response array length mismatch. Expected: ${expectedLength}, Got: ${parsed.length}`);
                // Pad or truncate as needed
                const adjustedResults = [];
                for (let i = 0; i < expectedLength; i++) {
                    if (i < parsed.length && parsed[i]) {
                        adjustedResults.push(parsed[i]);
                    } else {
                        adjustedResults.push(this.createFallbackResult());
                    }
                }
                return adjustedResults as unknown as T;
            }
        }
        
        return parsed;
    }

    /**
     * Create fallback result for failed parsing
     */
    private createFallbackResult(): any {
        return {
            summary: 'Analysis incomplete',
            keywords: '',
            knowledgeDomain: ''
        };
    }

    /**
     * Rate limiting helper - wait between requests
     */
    public async waitForRateLimit(): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY));
    }

    /**
     * Calculate recommended delay based on request count
     */
    public calculateDelay(requestCount: number): number {
        // For 30 RPM limit, ensure we don't exceed the rate
        return Math.max(this.RATE_LIMIT_DELAY, (60 * 1000) / 25); // 25 requests per minute to be safe
    }
} 