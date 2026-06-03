export interface EvolutionInsight {
    title: string;
    content: string;
    keyPoints: string[];
    recommendations?: string[];
}

export interface TimelineAnalysis {
    narrative: EvolutionInsight;
    phases: Array<{
        period: string;
        description: string;
        keyDomains: string[];
        metrics: {
            noteCount: number;
            wordCount: number;
            avgWordsPerNote: number;
        };
    }>;
    trends: {
        productivity: 'increasing' | 'decreasing' | 'stable';
        diversity: 'expanding' | 'narrowing' | 'stable';
        depth: 'increasing' | 'decreasing' | 'stable';
    };
}

export interface TopicPatternsAnalysis {
    exploration: EvolutionInsight;
    introductionTimeline: Array<{
        period: string;
        newDomains: string[];
        acquisitionPattern: 'burst' | 'gradual' | 'project-based';
    }>;
    strategy: {
        style: 'depth-first' | 'breadth-first' | 'balanced';
        consistency: 'focused' | 'exploratory' | 'mixed';
    };
}

export interface FocusShiftAnalysis {
    narrative: EvolutionInsight;
    shifts: Array<{
        period: string;
        type: 'major' | 'minor' | 'gradual';
        newAreas: string[];
        increasedFocus: string[];
        decreasedFocus: string[];
        consistentAreas: string[];
        trigger?: string;
    }>;
    patterns: {
        frequency: 'frequent' | 'occasional' | 'rare';
        direction: 'expanding' | 'pivoting' | 'deepening';
    };
}

export interface KnowledgeEvolutionData {
    timeline: TimelineAnalysis;
    topicPatterns: TopicPatternsAnalysis;
    focusShift: FocusShiftAnalysis;
    insights: EvolutionInsight[];
}
