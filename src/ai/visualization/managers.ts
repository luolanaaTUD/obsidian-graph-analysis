// Export all visualization managers for easy importing
export { KnowledgeStructureManager } from './KnowledgeStructureManager';
export { KnowledgeEvolutionManager } from './KnowledgeEvolutionManager';
export { KnowledgeActionsManager } from './KnowledgeActionsManager';

// Export interfaces for type checking
export type { 
    KnowledgeStructureData,
    NetworkNode
} from './KnowledgeStructureManager';

// Export domain-related types from the correct location
export type {
    DomainData,
    HierarchicalDomain,
    DomainConnection
} from '../../components/domain-distribution/DomainDistributionChart';

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