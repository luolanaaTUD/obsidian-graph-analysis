# AI Analysis Architecture

This folder contains the AI-powered analysis managers for the Obsidian Graph Analysis plugin. The architecture has been refactored to separate concerns and improve maintainability.

## Architecture Overview

The AI analysis system is organized into three main responsibilities:

### 1. AISummaryManager.ts
**Responsibility**: Generate AI summaries for individual notes
- Provides AI-powered summaries for the currently active note
- Extracts keywords and identifies knowledge domains for single notes
- Integrates with the status bar for easy access
- Uses Google Gemini API for content analysis

### 2. VaultSemanticAnalysisManager.ts (formerly VaultAnalysisManager.ts)
**Responsibility**: Generate semantic analysis for the entire vault
- Analyzes all notes in the vault (excluding specified folders/tags)
- Extracts summaries, keywords, and knowledge domains for each note
- Processes files in batches with rate limiting
- Caches results in `vault-analysis.json`
- Provides the foundation data for other AI analysis types

### 3. KnowledgeEvolutionAnalysisManager.ts
**Responsibility**: Analyze knowledge evolution and learning patterns
- Takes cached vault semantic data as input
- Generates AI insights about knowledge development timeline
- Analyzes topic introduction patterns and focus shifts
- Tracks learning velocity and productivity trends
- Caches results in `knowledge-evolution.json`

### 4. KnowledgeStructureAnalysisManager.ts
**Responsibility**: Analyze knowledge structure and relationships (placeholder)
- Will analyze semantic relationships between notes
- Identifies knowledge clusters and connection strengths
- Finds knowledge gaps and suggests areas for development
- Maps topic hierarchies and knowledge organization
- Caches results in `knowledge-structure.json`

## Data Flow

```
Individual Notes → AISummaryManager → Single Note Analysis
     ↓
All Vault Notes → VaultSemanticAnalysisManager → vault-analysis.json
     ↓
Cached Semantic Data → KnowledgeEvolutionAnalysisManager → knowledge-evolution.json
     ↓
Cached Semantic Data → KnowledgeStructureAnalysisManager → knowledge-structure.json
```

## Key Benefits

1. **Separation of Concerns**: Each manager has a single, well-defined responsibility
2. **Better Maintainability**: AI logic is separated from UI code
3. **Reusability**: Managers can be used independently or combined
4. **Caching Strategy**: Results are cached to avoid redundant API calls
5. **Scalable Architecture**: Easy to add new analysis types

## Usage

The managers are instantiated and used by the main plugin and UI components:

```typescript
// Create managers
const aiSummaryManager = new AISummaryManager(app, settings);
const vaultSemanticManager = new VaultSemanticAnalysisManager(app, settings);
const knowledgeEvolutionManager = new KnowledgeEvolutionAnalysisManager(app, settings);

// Use in UI components
const modal = new VaultAnalysisModal(
    app, 
    analysisData, 
    hasExistingData, 
    vaultSemanticManager,
    knowledgeEvolutionManager,
    settings
);
```

## Interface Definitions

All major interfaces and types are defined in the respective manager files:
- `TokenUsage`, `VaultAnalysisResult`, `VaultAnalysisData` in `KnowledgeEvolutionAnalysisManager.ts`
- Evolution-specific interfaces: `TimelineAnalysis`, `TopicPatternsAnalysis`, `FocusShiftAnalysis`, `LearningVelocityAnalysis`
- Structure-specific interfaces: `KnowledgeCluster`, `ConnectionStrength`, `KnowledgeGap`, `TopicHierarchy` 