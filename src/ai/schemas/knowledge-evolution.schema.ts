import { Type } from '@google/genai';
import { EvolutionInsight, TimelineAnalysis, TopicPatternsAnalysis, FocusShiftAnalysis } from '../visualization/KnowledgeEvolutionManager';

/**
 * Schema for knowledge evolution analysis using Google Gemini structured output
 */
export function createKnowledgeEvolutionSchema(): any {
    return {
        type: Type.OBJECT,
        properties: {
            timeline: {
                type: Type.OBJECT,
                properties: {
                    narrative: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            content: { type: Type.STRING },
                            keyPoints: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING }
                            }
                        },
                        propertyOrdering: ['title', 'content', 'keyPoints']
                    },
                    phases: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                period: { type: Type.STRING },
                                description: { type: Type.STRING },
                                keyDomains: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING }
                                },
                                metrics: {
                                    type: Type.OBJECT,
                                    properties: {
                                        noteCount: { type: Type.NUMBER },
                                        wordCount: { type: Type.NUMBER },
                                        avgWordsPerNote: { type: Type.NUMBER }
                                    },
                                    propertyOrdering: ['noteCount', 'wordCount', 'avgWordsPerNote']
                                }
                            },
                            propertyOrdering: ['period', 'description', 'keyDomains', 'metrics']
                        }
                    },
                    trends: {
                        type: Type.OBJECT,
                        properties: {
                            productivity: { 
                                type: Type.STRING,
                                enum: ['increasing', 'decreasing', 'stable']
                            },
                            diversity: { 
                                type: Type.STRING,
                                enum: ['expanding', 'narrowing', 'stable']
                            },
                            depth: { 
                                type: Type.STRING,
                                enum: ['increasing', 'decreasing', 'stable']
                            }
                        },
                        propertyOrdering: ['productivity', 'diversity', 'depth']
                    }
                },
                propertyOrdering: ['narrative', 'phases', 'trends']
            },
            topicPatterns: {
                type: Type.OBJECT,
                properties: {
                    exploration: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            content: { type: Type.STRING },
                            keyPoints: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING }
                            }
                        },
                        propertyOrdering: ['title', 'content', 'keyPoints']
                    },
                    introductionTimeline: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                period: { type: Type.STRING },
                                newDomains: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING }
                                },
                                acquisitionPattern: {
                                    type: Type.STRING,
                                    enum: ['burst', 'gradual', 'project-based']
                                }
                            },
                            propertyOrdering: ['period', 'newDomains', 'acquisitionPattern']
                        }
                    },
                    strategy: {
                        type: Type.OBJECT,
                        properties: {
                            style: {
                                type: Type.STRING,
                                enum: ['depth-first', 'breadth-first', 'balanced']
                            },
                            consistency: {
                                type: Type.STRING,
                                enum: ['focused', 'exploratory', 'mixed']
                            }
                        },
                        propertyOrdering: ['style', 'consistency']
                    }
                },
                propertyOrdering: ['exploration', 'introductionTimeline', 'strategy']
            },
            focusShift: {
                type: Type.OBJECT,
                properties: {
                    narrative: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            content: { type: Type.STRING },
                            keyPoints: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING }
                            }
                        },
                        propertyOrdering: ['title', 'content', 'keyPoints']
                    },
                    shifts: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                period: { type: Type.STRING },
                                type: {
                                    type: Type.STRING,
                                    enum: ['major', 'minor', 'gradual']
                                },
                                newAreas: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING }
                                },
                                increasedFocus: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING }
                                },
                                decreasedFocus: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING }
                                },
                                consistentAreas: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING }
                                },
                                trigger: { type: Type.STRING }
                            },
                            propertyOrdering: ['period', 'type', 'newAreas', 'increasedFocus', 'decreasedFocus', 'consistentAreas', 'trigger']
                        }
                    },
                    patterns: {
                        type: Type.OBJECT,
                        properties: {
                            frequency: {
                                type: Type.STRING,
                                enum: ['frequent', 'occasional', 'rare']
                            },
                            direction: {
                                type: Type.STRING,
                                enum: ['expanding', 'pivoting', 'deepening']
                            }
                        },
                        propertyOrdering: ['frequency', 'direction']
                    }
                },
                propertyOrdering: ['narrative', 'shifts', 'patterns']
            },
            insights: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        content: { type: Type.STRING },
                        keyPoints: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        }
                    },
                    propertyOrdering: ['title', 'content', 'keyPoints']
                }
            }
        },
        propertyOrdering: ['timeline', 'topicPatterns', 'focusShift', 'insights']
    };
}
