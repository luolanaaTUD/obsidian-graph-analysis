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
                description: "Notes needing maintenance or updates",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        noteId: { type: Type.STRING, description: "Note identifier" },
                        title: { type: Type.STRING, description: "Note title" },
                        reason: { type: Type.STRING, description: "Why maintenance is needed" },
                        priority: {
                            type: Type.STRING,
                            enum: ['high', 'medium', 'low'],
                            description: "Priority level"
                        },
                        action: { type: Type.STRING, description: "Recommended action" }
                    },
                    propertyOrdering: ['noteId', 'title', 'reason', 'priority', 'action']
                }
            },
            connections: {
                type: Type.ARRAY,
                description: "Suggested connections between notes",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        sourceId: { type: Type.STRING, description: "Source note ID" },
                        targetId: { type: Type.STRING, description: "Target note ID" },
                        reason: { type: Type.STRING, description: "Why these notes should be connected" },
                        confidence: { type: Type.NUMBER, description: "Confidence score 0-1" }
                    },
                    propertyOrdering: ['sourceId', 'targetId', 'reason', 'confidence']
                }
            },
            learningPaths: {
                type: Type.ARRAY,
                description: "Suggested learning paths through notes",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: "Path title" },
                        description: { type: Type.STRING, description: "Path description" },
                        noteIds: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "Ordered note IDs in the path"
                        },
                        rationale: { type: Type.STRING, description: "Why this path is recommended" }
                    },
                    propertyOrdering: ['title', 'description', 'noteIds', 'rationale']
                }
            },
            organization: {
                type: Type.ARRAY,
                description: "Organization suggestions",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        type: {
                            type: Type.STRING,
                            enum: ['tag', 'folder', 'structure'],
                            description: "Type of organization"
                        },
                        suggestion: { type: Type.STRING, description: "Organization suggestion" },
                        affectedNotes: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "Note IDs affected"
                        }
                    },
                    propertyOrdering: ['type', 'suggestion', 'affectedNotes']
                }
            }
        },
        propertyOrdering: ['maintenance', 'connections', 'learningPaths', 'organization']
    };
}
