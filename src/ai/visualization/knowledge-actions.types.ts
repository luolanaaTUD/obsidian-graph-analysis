export interface MaintenanceAction {
    noteId: string;
    title: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    action: string;
}

/** Rule-based + AI hybrid candidate for the review cards grid. */
export interface ReviewCandidate {
    noteId: string;
    title: string;
    path: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    action: string;
    lastModified: string;
    urgencyScore: number;
    centralityRole: 'hub' | 'bridge' | 'authority' | 'normal';
    centralityScore: number;
    fromAI: boolean;
}

export interface ConnectionSuggestion {
    sourceId: string;
    targetId: string;
    reason: string;
    confidence: number;
}

export interface LearningPath {
    title: string;
    description: string;
    noteIds: string[];
    rationale: string;
}

export interface OrganizationSuggestion {
    type: 'tag' | 'folder' | 'structure';
    suggestion: string;
    affectedNotes: string[];
}

export interface KnowledgeActionsData {
    maintenance: MaintenanceAction[];
    connections: ConnectionSuggestion[];
    learningPaths: LearningPath[];
    organization: OrganizationSuggestion[];
}
