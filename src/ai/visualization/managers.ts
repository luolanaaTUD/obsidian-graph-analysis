// Export all visualization managers for easy importing
export { KnowledgeStructureManager } from './KnowledgeStructureManager';
export { KnowledgeEvolutionManager } from './KnowledgeEvolutionManager';
export { KnowledgeActionsManager } from './KnowledgeActionsManager';

// Export interfaces for type checking
export type { 
    KnowledgeStructureData,
    DomainData,
    NetworkNode 
} from './KnowledgeStructureManager';

export type { 
    KnowledgeEvolutionData,
    EvolutionInsight,
    TimelineAnalysis,
    TopicPatternsAnalysis,
    FocusShiftAnalysis,
    LearningVelocityAnalysis 
} from './KnowledgeEvolutionManager';

export type { 
    KnowledgeActionsData,
    MaintenanceAction,
    ConnectionSuggestion,
    LearningPath,
    OrganizationSuggestion 
} from './KnowledgeActionsManager'; 