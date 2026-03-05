import { Type } from '@google/genai';

/**
 * Schema for knowledge evolution analysis using Google Gemini structured output
 */
export function createKnowledgeEvolutionSchema(): unknown {
    return {
        type: Type.OBJECT,
        properties: {
            timeline: {
                type: Type.OBJECT,
                description: "Timeline analysis of knowledge evolution",
                properties: {
                    narrative: {
                        type: Type.OBJECT,
                        description: "Overall narrative of knowledge growth",
                        properties: {
                            title: { type: Type.STRING, description: "Narrative title" },
                            content: { type: Type.STRING, description: "Narrative content" },
                            keyPoints: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                                description: "Key points"
                            }
                        },
                        propertyOrdering: ['title', 'content', 'keyPoints']
                    },
                    phases: {
                        type: Type.ARRAY,
                        description: "Evolution phases over time",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                period: { type: Type.STRING, description: "Time period" },
                                description: { type: Type.STRING, description: "Phase description" },
                                keyDomains: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING },
                                    description: "Key domains in this phase"
                                },
                                metrics: {
                                    type: Type.OBJECT,
                                    description: "Phase metrics",
                                    properties: {
                                        noteCount: { type: Type.NUMBER, description: "Note count" },
                                        wordCount: { type: Type.NUMBER, description: "Word count" },
                                        avgWordsPerNote: { type: Type.NUMBER, description: "Avg words per note" }
                                    },
                                    propertyOrdering: ['noteCount', 'wordCount', 'avgWordsPerNote']
                                }
                            },
                            propertyOrdering: ['period', 'description', 'keyDomains', 'metrics']
                        }
                    },
                    trends: {
                        type: Type.OBJECT,
                        description: "Trend indicators",
                        properties: {
                            productivity: { 
                                type: Type.STRING,
                                enum: ['increasing', 'decreasing', 'stable'],
                                description: "Productivity trend"
                            },
                            diversity: { 
                                type: Type.STRING,
                                enum: ['expanding', 'narrowing', 'stable'],
                                description: "Diversity trend"
                            },
                            depth: { 
                                type: Type.STRING,
                                enum: ['increasing', 'decreasing', 'stable'],
                                description: "Depth trend"
                            }
                        },
                        propertyOrdering: ['productivity', 'diversity', 'depth']
                    }
                },
                propertyOrdering: ['narrative', 'phases', 'trends']
            },
            topicPatterns: {
                type: Type.OBJECT,
                description: "Topic exploration patterns",
                properties: {
                    exploration: {
                        type: Type.OBJECT,
                        description: "Exploration narrative",
                        properties: {
                            title: { type: Type.STRING, description: "Title" },
                            content: { type: Type.STRING, description: "Content" },
                            keyPoints: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                                description: "Key points"
                            }
                        },
                        propertyOrdering: ['title', 'content', 'keyPoints']
                    },
                    introductionTimeline: {
                        type: Type.ARRAY,
                        description: "When new domains were introduced",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                period: { type: Type.STRING, description: "Time period" },
                                newDomains: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING },
                                    description: "New domains introduced"
                                },
                                acquisitionPattern: {
                                    type: Type.STRING,
                                    enum: ['burst', 'gradual', 'project-based'],
                                    description: "How knowledge was acquired"
                                }
                            },
                            propertyOrdering: ['period', 'newDomains', 'acquisitionPattern']
                        }
                    },
                    strategy: {
                        type: Type.OBJECT,
                        description: "Learning strategy",
                        properties: {
                            style: {
                                type: Type.STRING,
                                enum: ['depth-first', 'breadth-first', 'balanced'],
                                description: "Exploration style"
                            },
                            consistency: {
                                type: Type.STRING,
                                enum: ['focused', 'exploratory', 'mixed'],
                                description: "Consistency of focus"
                            }
                        },
                        propertyOrdering: ['style', 'consistency']
                    }
                },
                propertyOrdering: ['exploration', 'introductionTimeline', 'strategy']
            },
            focusShift: {
                type: Type.OBJECT,
                description: "Focus shift analysis",
                properties: {
                    narrative: {
                        type: Type.OBJECT,
                        description: "Narrative of focus changes",
                        properties: {
                            title: { type: Type.STRING, description: "Title" },
                            content: { type: Type.STRING, description: "Content" },
                            keyPoints: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                                description: "Key points"
                            }
                        },
                        propertyOrdering: ['title', 'content', 'keyPoints']
                    },
                    shifts: {
                        type: Type.ARRAY,
                        description: "Focus shifts over time",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                period: { type: Type.STRING, description: "Time period" },
                                type: {
                                    type: Type.STRING,
                                    enum: ['major', 'minor', 'gradual'],
                                    description: "Shift magnitude"
                                },
                                newAreas: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING },
                                    description: "New focus areas"
                                },
                                increasedFocus: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING },
                                    description: "Areas of increased focus"
                                },
                                decreasedFocus: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING },
                                    description: "Areas of decreased focus"
                                },
                                consistentAreas: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING },
                                    description: "Consistently focused areas"
                                },
                                trigger: { type: Type.STRING, description: "What triggered the shift" }
                            },
                            propertyOrdering: ['period', 'type', 'newAreas', 'increasedFocus', 'decreasedFocus', 'consistentAreas', 'trigger']
                        }
                    },
                    patterns: {
                        type: Type.OBJECT,
                        description: "Shift patterns",
                        properties: {
                            frequency: {
                                type: Type.STRING,
                                enum: ['frequent', 'occasional', 'rare'],
                                description: "How often focus shifts"
                            },
                            direction: {
                                type: Type.STRING,
                                enum: ['expanding', 'pivoting', 'deepening'],
                                description: "Direction of shifts"
                            }
                        },
                        propertyOrdering: ['frequency', 'direction']
                    }
                },
                propertyOrdering: ['narrative', 'shifts', 'patterns']
            },
            insights: {
                type: Type.ARRAY,
                description: "Key insights from evolution analysis",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: "Insight title" },
                        content: { type: Type.STRING, description: "Insight content" },
                        keyPoints: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "Key points"
                        }
                    },
                    propertyOrdering: ['title', 'content', 'keyPoints']
                }
            }
        },
        propertyOrdering: ['timeline', 'topicPatterns', 'focusShift', 'insights']
    };
}
