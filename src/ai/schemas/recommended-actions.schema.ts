import { Type } from '@google/genai';

/**
 * Schema for recommended actions analysis using Google Gemini structured output
 */
export function createRecommendedActionsSchema(): any {
    return {
        type: Type.OBJECT,
        properties: {
            maintenance: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        noteId: { type: Type.STRING },
                        title: { type: Type.STRING },
                        reason: { type: Type.STRING },
                        priority: {
                            type: Type.STRING,
                            enum: ['high', 'medium', 'low']
                        },
                        action: { type: Type.STRING }
                    },
                    propertyOrdering: ['noteId', 'title', 'reason', 'priority', 'action']
                }
            },
            connections: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        sourceId: { type: Type.STRING },
                        targetId: { type: Type.STRING },
                        reason: { type: Type.STRING },
                        confidence: { type: Type.NUMBER }
                    },
                    propertyOrdering: ['sourceId', 'targetId', 'reason', 'confidence']
                }
            },
            learningPaths: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        noteIds: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        },
                        rationale: { type: Type.STRING }
                    },
                    propertyOrdering: ['title', 'description', 'noteIds', 'rationale']
                }
            },
            organization: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        type: {
                            type: Type.STRING,
                            enum: ['tag', 'folder', 'structure']
                        },
                        suggestion: { type: Type.STRING },
                        affectedNotes: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        }
                    },
                    propertyOrdering: ['type', 'suggestion', 'affectedNotes']
                }
            }
        },
        propertyOrdering: ['maintenance', 'connections', 'learningPaths', 'organization']
    };
}
