# AI-Powered Knowledge Analysis Development Plan

This document outlines both the user-facing insights and technical implementation strategy for AI-powered vault analysis.

---

## User-Facing Insights Overview

### Knowledge Structure Analysis

- **Knowledge domain distribution** - percentage and depth of each domain
- **Topic hierarchies** - how concepts nest within broader disciplines
- **Knowledge cluster detection** - identifying related concept groups
- **Knowledge gaps** - underexplored areas ripe for expansion

_Visualizations_: [Zoomable Sunburst](https://observablehq.com/@d3/zoomable-sunburst), [Chord Diagram](https://observablehq.com/@d3/chord-diagram)

### Knowledge Network Analysis

- **Knowledge Bridges** _(Betweenness Centrality)_
    - Notes that connect different knowledge domains
    - Interdisciplinary concepts linking separate fields
    - Critical integration points in your thinking
- **Knowledge Foundations** _(Closeness Centrality)_
    - Core concepts central to your understanding
    - Frequently referenced mental models
    - Ideal starting points for knowledge exploration
- **Knowledge Authorities** _(Eigenvector Centrality)_
    - Your most developed expertise areas
    - Prestigious concepts connected to other important ideas
    - Theoretical foundations with deep interconnections

### Knowledge Evolution

- **Knowledge Development Timeline** - [Calendar View](https://observablehq.com/@d3/calendar/2)
- **Topic introduction patterns** - when different subjects entered your system
- **Focus shift analysis** - current interests vs historical patterns
- **Learning velocity** - pace of knowledge acquisition over time

### Recommended Actions

- **Knowledge Maintenance**
    - Review schedules for reinforcing key concepts
    - Identify neglected but important notes
- **Connection Opportunities**
    - Suggest potential cross-disciplinary links
    - Auto-recommend related notes for linking
    - Highlight missing bridges between knowledge clusters
- **Learning Path Optimization**
    - Personalized learning sequences based on your knowledge structure
    - Prerequisite mapping for complex topics
    - Strategic knowledge gap filling recommendations

---

## Technical Implementation Plan

### Architecture Overview: Optimized AI Call Strategy

**Goal**: Minimize AI API calls while supporting all insights through an enhanced caching system that aligns with the 4-tab UI structure.

### UI Structure & Data Flow

#### Current 4-Tab Interface
1. **Semantic Analysis Tab** ✅ (Already implemented)
   - Shows vault analysis results with search/filtering
   - Displays summaries, keywords, knowledge domains per note

2. **Knowledge Structure Tab** 🔄 (Needs implementation) 
   - **Knowledge Structure Analysis**: Domain distribution, topic hierarchies, clusters, gaps
   - **Knowledge Network Analysis**: Centrality-based insights (bridges, foundations, authorities)
   - **Visualizations**: Sunburst charts, chord diagrams, network views

3. **Knowledge Evolution Tab** 🔄 (Partially implemented)
   - Calendar view ✅ (Already working)
   - AI-powered evolution insights 🔄 (Needs master analysis integration)

4. **Recommended Actions Tab** 🔄 (Needs implementation)
   - Maintenance recommendations
   - Connection opportunities  
   - Learning path suggestions

### Enhanced Three-Stage Architecture

#### Stage 1: Enhanced Semantic Cache (Modified Existing)
- **Input**: Raw vault notes
- **Output**: `vault-analysis.json` (enhanced with graph metrics)
- **AI Calls**: ~N/10 (existing batched file analysis)
- **Trigger**: User clicks "Generate Analysis" button
- **Enhancement**: Add centrality scores and graph metrics to each note

#### Stage 2: Master Analysis (New - Single AI Call)
- **Input**: Enhanced `vault-analysis.json` (semantic + graph data)
- **Output**: `master-analysis.json` (all insights for tabs 2-4)
- **AI Calls**: **1 comprehensive call** (vs 4+ separate calls)
- **Trigger**: User opens Knowledge Structure/Evolution/Actions tabs
- **Content**: Generate all insights for the remaining 3 tabs in one call

#### Stage 3: Tab-Specific Data Formatting (No AI)
- **Input**: `master-analysis.json`
- **Output**: UI-ready data for each tab
- **AI Calls**: 0
- **Process**: Format cached insights for display in respective tabs

### Graph Metrics Integration Strategy

#### Optimal Trigger Point: Modal Open
```typescript
// When VaultAnalysisModal opens:
1. Check if vault-analysis.json exists and is current
2. If user has semantic analysis data:
   - Trigger background graph calculation
   - Enrich semantic data with centrality scores
   - Update vault-analysis.json with graph metrics
3. Cache graph data for immediate use in Knowledge Structure tab
```

#### Background Graph Calculation Flow
```typescript
onModalOpen() {
    // Existing modal setup...
    
    // Background task: Enrich semantic data with graph metrics
    if (hasSemanticData && !hasGraphMetrics) {
        this.enrichSemanticDataWithGraphMetrics();
    }
}

private async enrichSemanticDataWithGraphMetrics() {
    try {
        // Calculate all centrality metrics in parallel
        await pluginService.buildGraphFromVault();
        const [degree, betweenness, closeness, eigenvector] = await Promise.all([
            pluginService.calculateDegreeCentrality(),
            pluginService.calculateBetweennessCentrality(),
            pluginService.calculateClosenessCentrality(),
            pluginService.calculateEigenvectorCentrality()
        ]);
        
        // Enrich existing semantic data
        const enrichedData = await this.addGraphMetricsToSemanticData(centralityResults);
        
        // Update vault-analysis.json with enhanced data
        await this.updateVaultAnalysisCache(enrichedData);
        
        console.log('Graph metrics added to vault analysis cache');
    } catch (error) {
        console.log('Graph metrics calculation failed, proceeding without');
    }
}
```

### Enhanced Data Structures

#### Enhanced Vault Analysis Data
```typescript
interface EnhancedVaultAnalysisData {
    generatedAt: string;
    totalFiles: number;
    apiProvider: string;
    tokenUsage: TokenUsage;
    
    // NEW: Graph metadata
    graphMetrics: {
        generatedAt: string;
        totalNodes: number;
        totalEdges: number;
        density: number;
        averageDegree: number;
        enrichmentStatus: 'pending' | 'completed' | 'failed';
    };
    
    // NEW: Enhanced results with centrality scores
    results: EnhancedVaultAnalysisResult[];
}

interface EnhancedVaultAnalysisResult extends VaultAnalysisResult {
    // NEW: Centrality scores for each note
    centrality?: {
        degree: number;
        betweenness: number;
        closeness: number;
        eigenvector: number;
    };
    
    // NEW: Graph-specific metadata  
    connections?: number;           // Direct link count
    neighborDomains?: string[];     // Knowledge domains of connected notes
}
```

#### Master Analysis Data (For Tabs 2-4)
```typescript
interface MasterAnalysisData {
    generatedAt: string;
    sourceVaultId: string;       // Hash of vault-analysis.json
    sourceGraphId: string;       // Hash of graph structure
    apiProvider: string;
    tokenUsage: TokenUsage;
    
    // Tab 2: Knowledge Structure (combines Structure + Network Analysis)
    knowledgeStructure: {
        // Knowledge Structure Analysis
        domainDistribution: DomainAnalysis[];
        topicHierarchies: TopicHierarchy[];
        knowledgeClusters: KnowledgeCluster[];
        knowledgeGaps: KnowledgeGap[];
        
        // Knowledge Network Analysis  
        networkInsights: {
            knowledgeBridges: NetworkNode[];      // High betweenness
            knowledgeFoundations: NetworkNode[];  // High closeness  
            knowledgeAuthorities: NetworkNode[];  // High eigenvector
            bridgeAnalysis: string;
            foundationAnalysis: string;
            authorityAnalysis: string;
        };
    };
    
    // Tab 3: Knowledge Evolution
    knowledgeEvolution: {
        timeline: TimelineAnalysis;
        topicPatterns: TopicPatternsAnalysis;
        focusShift: FocusShiftAnalysis;
        learningVelocity: LearningVelocityAnalysis;
    };
    
    // Tab 4: Recommended Actions
    recommendedActions: {
        maintenance: MaintenanceAction[];
        connectionOpportunities: ConnectionSuggestion[];
        learningPaths: LearningPath[];
    };
}
```

### Implementation Steps

#### Week 1: Enhanced Caching Infrastructure
1. ✅ Modify `VaultSemanticAnalysisManager.ts` to support graph metrics enrichment
2. ✅ Add background graph calculation trigger in `VaultAnalysisModal.onOpen()`
3. ✅ Implement graph metrics integration with existing semantic cache
4. ✅ Add cache validation for graph data freshness

#### Week 2: Master Analysis Manager  
1. Create `MasterAnalysisManager.ts` with single comprehensive AI call
2. Design comprehensive AI prompt template covering all 3 remaining tabs
3. Implement response parsing for structured data extraction
4. Add smart caching and validation for master analysis results

#### Week 3: Tab Implementation
1. **Knowledge Structure Tab**: Combine structure + network analysis display
2. **Knowledge Evolution Tab**: Integrate with existing calendar + add AI insights
3. **Recommended Actions Tab**: Display actionable recommendations
4. Create `VisualizationDataManager.ts` for D3 data preparation

#### Week 4: UI & Polish
1. Add D3 visualizations (sunburst, chord diagrams) to Knowledge Structure tab
2. Integrate centrality insights display with network analysis
3. Performance optimization and comprehensive testing
4. Error handling and fallback strategies

### File Structure Updates

```
src/ai/
├── README.md                                  // Updated architecture docs
├── AI-insights.md                            // This file - development plan
├── VaultSemanticAnalysisManager.ts          // Enhanced with graph metrics
├── MasterAnalysisManager.ts                 // New: Single AI call for tabs 2-4
├── VisualizationDataManager.ts              // New: D3 data preparation
├── AISummaryManager.ts                       // Existing: Individual notes
└── legacy/                                   // Move existing partial managers
    ├── KnowledgeEvolutionAnalysisManager.ts  // Keep for backward compatibility
    └── KnowledgeStructureAnalysisManager.ts
```

### Tab-Specific Implementation Details

#### Knowledge Structure Tab (Tab 2)
- **Upper Section**: Knowledge Structure Analysis
  - Domain distribution pie chart
  - Topic hierarchies tree view
  - Knowledge clusters visualization
  - Identified knowledge gaps
- **Lower Section**: Knowledge Network Analysis  
  - Top knowledge bridges (betweenness centrality)
  - Top knowledge foundations (closeness centrality)
  - Top knowledge authorities (eigenvector centrality)
  - Network insights and recommendations

#### Knowledge Evolution Tab (Tab 3)
- **Existing**: Calendar view (already working)
- **New**: AI-generated evolution insights
  - Knowledge development timeline
  - Topic introduction patterns
  - Focus shift analysis
  - Learning velocity metrics

#### Recommended Actions Tab (Tab 4)
- **Knowledge Maintenance**: Notes needing review/updates
- **Connection Opportunities**: Suggested links between notes
- **Learning Paths**: Recommended learning sequences
- **Organization Suggestions**: Tag and structure improvements

### Benefits of This Revised Approach

✅ **UI Alignment**: Matches actual 4-tab structure  
✅ **Smart Triggering**: Graph calculation when user shows interest (opens modal)  
✅ **Background Processing**: Graph metrics calculated asynchronously  
✅ **Tab Optimization**: One master analysis serves 3 tabs  
✅ **Progressive Enhancement**: Works even if graph calculation fails  
✅ **User Experience**: No blocking operations, responsive UI  
✅ **API Efficiency**: Still ~75% reduction in AI API calls

### Cache Invalidation Strategy

```typescript
// Regenerate semantic analysis when:
- Vault content changes (file count, major content modifications)
- Exclusion settings change
- Manual refresh requested

// Regenerate graph metrics when:
- Vault structure changes (new connections, significant link changes)
- Semantic analysis regenerated
- Graph metrics older than semantic analysis

// Regenerate master analysis when:
- Semantic analysis updated
- Graph metrics updated  
- User explicitly requests refresh
```

This revised approach ensures the implementation aligns perfectly with your existing UI while optimizing for performance and user experience.

# AI Insights Implementation Plan

## ✅ COMPLETED: Enhanced Semantic Analysis with Graph Metrics

### Graph Metrics Integration

We have successfully implemented the first stage of the enhanced AI insights plan by integrating graph centrality metrics with semantic analysis. This provides a comprehensive view of each note's content significance and structural importance in the knowledge graph.

#### ✅ Stage 1: Enhanced Semantic Cache (COMPLETED)

**Features Added:**
- **Input**: Raw vault notes
- **Output**: `vault-analysis.json` (enhanced with graph metrics)
- **AI Calls**: ~N/10 (existing batched file analysis)
- **Trigger**: User clicks "Generate Analysis" button
- **Enhancement**: Add centrality scores and graph metrics to each note

**Graph Metrics Included:**
- **Degree Centrality**: Number of direct connections to other notes
- **Betweenness Centrality**: How often a note acts as a bridge between other notes
- **Closeness Centrality**: How efficiently a note can reach all other notes
- **Eigenvector Centrality**: Importance based on connections to other important notes

**User Interface:**
- Enhanced vault analysis modal displays all graph metrics for each note
- Automatic enhancement prompt for existing analysis without graph metrics
- Shift+click on vault analysis button to force refresh graph metrics
- Visual metrics grid with tooltips explaining each centrality type

#### Usage Instructions

**For New Analysis:**
1. Click the vault analysis button (sun icon) in graph view
2. Choose "Generate Analysis" 
3. The system will automatically calculate both semantic analysis and graph metrics
4. Results are saved to `.obsidian/plugins/obsidian-graph-analysis/vault-analysis.json`

**For Existing Analysis:**
1. Click the vault analysis button to view results
2. If graph metrics are missing, you'll see an enhancement prompt
3. Click "Enhance with Graph Metrics" to add centrality scores
4. Alternative: Shift+click the vault analysis button to force enhancement

**Data Structure Enhancement:**
```typescript
interface VaultAnalysisResult {
    // Existing fields
    id: string;
    title: string;
    summary: string;
    keywords: string;
    knowledgeDomain: string;
    // New graph metrics
    graphMetrics?: {
        degreeCentrality?: number;
        betweennessCentrality?: number;
        closenessCentrality?: number;
        eigenvectorCentrality?: number;
    };
}
```

### Enhanced Three-Stage Architecture

#### Stage 1: Enhanced Semantic Cache (✅ COMPLETED)
- **Input**: Raw vault notes
- **Output**: `vault-analysis.json` (enhanced with graph metrics)
- **AI Calls**: ~N/10 (existing batched file analysis)
- **Trigger**: User clicks "Generate Analysis" button
- **Enhancement**: Add centrality scores and graph metrics to each note

#### Stage 2: Master Analysis Manager (TODO)
- **Purpose**: Consolidate multiple AI analysis types
- **Components**: 
  - Knowledge Structure Analysis Manager
  - Knowledge Evolution Analysis Manager (existing)
  - Vault Semantic Analysis Manager (enhanced)
- **Benefits**: 
  - Unified analysis pipeline
  - Reduced API calls through intelligent caching
  - Cross-analysis insights

#### Stage 3: Recommended Actions System (TODO)
- **Input**: All cached analysis results + graph metrics
- **Output**: Actionable recommendations
- **AI Calls**: 1 per analysis generation
- **Features**:
  - Note creation suggestions based on knowledge gaps
  - Link recommendations using graph analysis
  - Content expansion suggestions for high-centrality notes
  - Knowledge domain exploration recommendations

### Technical Implementation Details

#### Graph Metrics Calculation
- Uses existing WASM-based graph analysis engine
- Calculates all centrality types in parallel for efficiency
- Maps file paths to centrality scores using node indices
- Graceful fallback when graph calculation fails

#### Data Integration
- Enhances existing semantic analysis with graph metrics
- Preserves backward compatibility with existing analysis files
- Automatic detection and enhancement of older analysis files
- Smart caching to avoid redundant calculations

#### User Experience Improvements
- Non-intrusive enhancement prompts
- Visual metrics display in analysis modal
- Descriptive tooltips for each centrality type
- Responsive design for mobile viewing
- Error handling and user feedback

### Next Steps

1. **Stage 2 Implementation**: Create Master Analysis Manager to consolidate AI analysis types
2. **Knowledge Structure Analysis**: Develop graph-based clustering and relationship analysis
3. **Stage 3 Implementation**: Build recommendation system using combined insights
4. **Performance Optimization**: Implement intelligent caching and incremental updates
5. **Advanced Visualizations**: Add interactive charts for graph metrics and trends

### Code Changes Summary

**Files Modified:**
- `src/ai/KnowledgeEvolutionAnalysisManager.ts`: Extended VaultAnalysisResult interface
- `src/ai/VaultSemanticAnalysisManager.ts`: Added graph metrics calculation and integration
- `src/views/VaultAnalysisModals.ts`: Enhanced UI to display graph metrics
- `src/styles/styles.css`: Added styling for graph metrics display

**Key Methods Added:**
- `calculateGraphMetrics()`: Computes all centrality types for vault files
- `enhanceWithGraphMetrics()`: Updates existing analysis with graph data
- Enhanced `generateVaultAnalysis()`: Includes graph metrics in new analysis
- Enhanced `viewVaultAnalysisResults()`: Automatic enhancement detection and prompting

This implementation provides a solid foundation for the enhanced AI insights system, combining semantic understanding with structural graph analysis to give users deeper insights into their knowledge vault.