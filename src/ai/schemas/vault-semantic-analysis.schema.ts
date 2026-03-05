import { Type } from '@google/genai';

/**
 * Interface for individual note analysis result from batch processing
 */
export interface VaultSemanticAnalysisItem {
    summary: string;
    keywords: string;
    knowledgeDomain: string;
}

/**
 * Interface for batch analysis response from VaultSemanticAnalysisManager
 */
export interface VaultSemanticAnalysisBatch {
    results: VaultSemanticAnalysisItem[];
}

/**
 * Schema for vault semantic analysis batch processing using Google Gemini structured output
 * This schema is used by VaultSemanticAnalysisManager.generateBatchAnalysis()
 */
export function createVaultSemanticAnalysisSchema(expectedResultCount: number): unknown {
    return {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                summary: { 
                    type: Type.STRING,
                    description: "Two to three sentence summary of the main concept or purpose (be detailed)"
                },
                keywords: { 
                    type: Type.STRING,
                    description: "3-6 key terms or phrases (comma-separated)"
                },
                knowledgeDomain: { 
                    type: Type.STRING,
                    description: "DDC classification codes that best match the content (comma-separated, e.g., '0-0-4,1-5-1')"
                }
            },
            required: ["summary", "keywords", "knowledgeDomain"],
            propertyOrdering: ["summary", "keywords", "knowledgeDomain"]
        },
        minItems: expectedResultCount,
        maxItems: expectedResultCount
    };
} 