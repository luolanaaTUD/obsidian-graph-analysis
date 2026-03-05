import { Type } from '@google/genai';

/**
 * Interface for a single knowledge domain subdivision classification
 */
export interface KnowledgeSubdivision {
    id: string;          // "1-1" (domain-subdivision)
    name: string;       // "Software Development"
}

/**
 * Interface for domain classification result 
 * Stores subdivision-level codes and names for hierarchy building
 */
export interface DomainClassificationResult {
    primaryDomain: KnowledgeSubdivision;
    secondaryDomains: KnowledgeSubdivision[];
}

/**
 * Enhanced interface for notes with structured domain classification
 * Replaces the current string-based knowledgeDomain approach
 */
export interface ClassifiedNote {
    summary: string;
    keywords: string;
    domains: DomainClassificationResult;
}

// Legacy alias for backward compatibility
export type DDCSection = KnowledgeSubdivision;

/**
 * Schema for domain classification using Google Gemini structured output
 * This constrains AI responses to valid knowledge domain subdivision codes from the template
 * 
 * @param availableSubdivisions - Array of valid knowledge domain subdivisions from the loaded template
 * @returns Schema that ensures only valid subdivision codes are returned
 */
export function createDomainClassificationSchema(availableSubdivisions: KnowledgeSubdivision[]): unknown {
    // Extract valid subdivision IDs for enum constraint
    const validSubdivisionIds = availableSubdivisions.map(subdivision => subdivision.id);
    
    return {
        type: Type.OBJECT,
        properties: {
            primaryDomain: {
                type: Type.OBJECT,
                properties: {
                    id: {
                        type: Type.STRING,
                        enum: validSubdivisionIds,
                        description: "Primary knowledge domain subdivision code (e.g., '1-1')"
                    },
                    name: {
                        type: Type.STRING,
                        description: "Knowledge domain subdivision name (e.g., 'Software Development')"
                    }
                },
                required: ["id", "name"],
                propertyOrdering: ["id", "name"]
            },
            secondaryDomains: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        id: {
                            type: Type.STRING,
                            enum: validSubdivisionIds,
                            description: "Secondary knowledge domain subdivision code"
                        },
                        name: {
                            type: Type.STRING,
                            description: "Knowledge domain subdivision name"
                        }
                    },
                    required: ["id", "name"],
                    propertyOrdering: ["id", "name"]
                },
                maxItems: 2,
                description: "Up to 2 secondary domain classifications"
            }
        },
        required: ["primaryDomain", "secondaryDomains"],
        propertyOrdering: ["primaryDomain", "secondaryDomains"]
    };
}

 