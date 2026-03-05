import { Type } from '@google/genai';

export interface KnowledgeNetworkNode {
    title: string;
    path: string;
    rank: number;
}

export interface KnowledgeBridge {
    domain: string;
    explanation: string;
    topNotes: KnowledgeNetworkNode[];
    connections: string[];
    insights: string;
}

export interface KnowledgeFoundation {
    domain: string;
    explanation: string;
    topNotes: KnowledgeNetworkNode[];
    coverage: string[];
    insights: string;
}

export interface KnowledgeAuthority {
    domain: string;
    explanation: string;
    topNotes: KnowledgeNetworkNode[];
    influence: string[];
    insights: string;
}

export interface KnowledgeNetwork {
    bridges: KnowledgeBridge[];
    foundations: KnowledgeFoundation[];
    authorities: KnowledgeAuthority[];
}

export interface KnowledgeNetworkAnalysis {
    knowledgeNetwork: KnowledgeNetwork;
    knowledgeGaps: string[];
}

/**
 * Schema for knowledge network analysis using Google Gemini structured output
 */
export function createKnowledgeNetworkSchema(): unknown {
    return {
        type: Type.OBJECT,
        properties: {
            knowledgeNetwork: {
                type: Type.OBJECT,
                description: "Knowledge network with bridges, foundations, and authorities",
                properties: {
                    bridges: {
                        type: Type.ARRAY,
                        description: "Knowledge bridges - domains connecting disparate areas (betweenness centrality)",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                domain: { type: Type.STRING, description: "Domain name" },
                                explanation: { type: Type.STRING, description: "Why this domain qualifies as a bridge" },
                                topNotes: {
                                    type: Type.ARRAY,
                                    description: "Top 3 notes contributing to this domain",
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            title: { type: Type.STRING, description: "Note title" },
                                            path: { type: Type.STRING, description: "Note path" },
                                            rank: { type: Type.NUMBER, description: "Centrality rank" }
                                        },
                                        propertyOrdering: ["title", "path", "rank"]
                                    }
                                },
                                connections: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING },
                                    description: "Connected domains or concepts"
                                },
                                insights: { type: Type.STRING, description: "Key insights about this bridge" }
                            },
                            propertyOrdering: ["domain", "explanation", "topNotes", "connections", "insights"]
                        }
                    },
                    foundations: {
                        type: Type.ARRAY,
                        description: "Knowledge foundations - core domains (closeness centrality)",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                domain: { type: Type.STRING, description: "Domain name" },
                                explanation: { type: Type.STRING, description: "Why this domain qualifies as a foundation" },
                                topNotes: {
                                    type: Type.ARRAY,
                                    description: "Top 3 notes contributing to this domain",
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            title: { type: Type.STRING, description: "Note title" },
                                            path: { type: Type.STRING, description: "Note path" },
                                            rank: { type: Type.NUMBER, description: "Centrality rank" }
                                        },
                                        propertyOrdering: ["title", "path", "rank"]
                                    }
                                },
                                coverage: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING },
                                    description: "Coverage areas"
                                },
                                insights: { type: Type.STRING, description: "Key insights about this foundation" }
                            },
                            propertyOrdering: ["domain", "explanation", "topNotes", "coverage", "insights"]
                        }
                    },
                    authorities: {
                        type: Type.ARRAY,
                        description: "Knowledge authorities - influential domains (eigenvector centrality)",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                domain: { type: Type.STRING, description: "Domain name" },
                                explanation: { type: Type.STRING, description: "Why this domain qualifies as an authority" },
                                topNotes: {
                                    type: Type.ARRAY,
                                    description: "Top 3 notes contributing to this domain",
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            title: { type: Type.STRING, description: "Note title" },
                                            path: { type: Type.STRING, description: "Note path" },
                                            rank: { type: Type.NUMBER, description: "Centrality rank" }
                                        },
                                        propertyOrdering: ["title", "path", "rank"]
                                    }
                                },
                                influence: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING },
                                    description: "Areas of influence"
                                },
                                insights: { type: Type.STRING, description: "Key insights about this authority" }
                            },
                            propertyOrdering: ["domain", "explanation", "topNotes", "influence", "insights"]
                        }
                    }
                },
                propertyOrdering: ["bridges", "foundations", "authorities"]
            },
            knowledgeGaps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Identified knowledge gaps or areas to develop"
            }
        },
        propertyOrdering: ["knowledgeNetwork", "knowledgeGaps"]
    };
} 