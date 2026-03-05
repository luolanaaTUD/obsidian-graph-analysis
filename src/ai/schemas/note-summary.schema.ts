import { Type } from '@google/genai';

/**
 * Interface for individual note summary analysis result
 */
export interface NoteSummaryAnalysis {
    keyWords: string;
    keyPoints: string;
}

/**
 * Schema for individual note summary analysis using Google Gemini structured output
 * This schema is used by AISummaryManager for single note analysis
 * 
 * Format expected by AISummaryManager:
 * **Key Words:** [List 3-6 most relevant keywords or key phrases, separated by commas]
 * **Key Points:** [One concise sentence that captures the main idea and key points of the note]
 */
export function createNoteSummarySchema(): unknown {
    return {
        type: Type.OBJECT,
        properties: {
            keyWords: { 
                type: Type.STRING,
                description: "List 3-6 most relevant keywords or key phrases, separated by commas"
            },
            keyPoints: { 
                type: Type.STRING,
                description: "One concise sentence that captures the main idea and key points of the note"
            }
        },
        required: ["keyWords", "keyPoints"],
        propertyOrdering: ["keyWords", "keyPoints"]
    };
} 