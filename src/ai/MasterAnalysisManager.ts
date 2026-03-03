import { App, Notice, TFile } from 'obsidian';
import { GraphAnalysisSettings } from '../types/types';
import { AIModelService } from '../services/AIModelService';
import { SemanticAnalysisError, getUserFriendlyMessage } from '../utils/GeminiErrorUtils';
import { KnowledgeStructureData } from './visualization/KnowledgeStructureManager';
import { 
    KnowledgeEvolutionData,
    TimelineAnalysis,
    TopicPatternsAnalysis,
    FocusShiftAnalysis,
    EvolutionInsight
} from './visualization/KnowledgeEvolutionManager';
import { KnowledgeActionsData } from './visualization/KnowledgeActionsManager';
import { KnowledgeDomainHelper } from './KnowledgeDomainHelper';
import { KDECalculationService } from '../utils/KDECalculationService';
import { NoteResolver } from '../utils/NoteResolver';
import { AIContextPreparationService } from '../services/AIContextPreparationService';
import type { VaultSemanticAnalysisManager } from '../views/VaultAnalysisModals';


export interface VaultAnalysisResult {
    id: string;
    title: string;
    summary: string;
    keywords: string;
    knowledgeDomains: string[]; // Changed from knowledgeDomain string to knowledgeDomains string array
    created: string;
    modified: string;
    path: string;
    charCount: number;
    graphMetrics?: {
        degreeCentrality?: number;
        betweennessCentrality?: number;
        closenessCentrality?: number;
        eigenvectorCentrality?: number;
    };
    centralityRankings?: {
        betweennessRank?: number;
        closenessRank?: number;
        eigenvectorRank?: number;
        degreeRank?: number;
    };
    knowledgeDomainNames?: string[];
}

export interface VaultAnalysisData {
    generatedAt: string;
    updatedAt?: string; // Last update timestamp
    totalFiles: number;
    generatedFiles: number; // Count from first generation
    updatedFiles: number; // Cumulative count of updated files
    apiProvider: string;
    tokenUsage?: {
        promptTokens: number;
        candidatesTokens: number;
        totalTokens: number;
    };
    results: VaultAnalysisResult[];
}


// NEW: Interface for tab-specific analysis data
export interface TabAnalysisData {
    generatedAt: string;
    sourceAnalysisId: string;
    apiProvider: string;
    isOutdated?: boolean;  // Indicates if cache doesn't match current vault state
}

// NEW: Interface for knowledge structure tab analysis
export interface StructureAnalysisData extends TabAnalysisData {
    knowledgeStructure: KnowledgeStructureData;
}

// NEW: Interface for knowledge evolution tab analysis
export interface EvolutionAnalysisData extends TabAnalysisData {
    knowledgeEvolution: KnowledgeEvolutionData;
}

// NEW: Interface for recommended actions tab analysis
export interface ActionsAnalysisData extends TabAnalysisData {
    recommendedActions: KnowledgeActionsData;
    connectionsAddedAt?: string; // ISO timestamp; if set, links have been committed
}

// DDC Template interfaces - UPDATED for new structured ID system

export class MasterAnalysisManager {
    private app: App;
    private aiService: AIModelService;
    private responsesDirectoryEnsured = false;

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.aiService = new AIModelService(settings);
    }

    // NEW: Ensure responses directory exists (cached per session)
    private async ensureResponsesDirectory(): Promise<void> {
        if (this.responsesDirectoryEnsured) return;
        try {
            const responsesDir = `${this.app.vault.configDir}/plugins/knowledge-graph-analysis/responses`;
            try {
                await this.app.vault.adapter.mkdir(responsesDir);
            } catch {
                // Directory might already exist
            }
        } catch (error) {
            // console.error('Failed to create responses directory:', error);
        }
        this.responsesDirectoryEnsured = true;
    }

    // Update loadCachedTabAnalysis to ensure responses directory exists
    public async loadCachedTabAnalysis(tabName: string, preloadedVaultData?: VaultAnalysisData | null): Promise<TabAnalysisData | null> {
        try {
            // Ensure responses directory exists
            await this.ensureResponsesDirectory();

            // Look for the tab-specific analysis in the responses directory
            const filePath = `${this.app.vault.configDir}/plugins/knowledge-graph-analysis/responses/${tabName}-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const data = JSON.parse(content);

            // Check if cached analysis matches current vault state (use preloaded data to avoid re-read)
            const currentAnalysisData = preloadedVaultData !== undefined ? preloadedVaultData : await this.loadVaultAnalysisData();
            if (currentAnalysisData && data?.sourceAnalysisId !== this.generateAnalysisId(currentAnalysisData)) {
                // console.log(`Cached ${tabName} analysis is outdated but will still be displayed`);
                data.isOutdated = true;  // Mark as outdated but still return
            } else {
                data.isOutdated = false;  // Explicitly mark as current if IDs match
            }
            
            return data;  // Always return cached data if it exists
        } catch (error) {
            // Check if this is a file not found error (ENOENT)
            if (error && typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
                // console.log(`No cached ${tabName} analysis found yet. This is normal for first-time use.`);
            } else {
                // Log other unexpected errors
                // console.warn(`Error loading cached ${tabName} analysis:`, error);
            }
            return null;
        }
    }

    /**
     * Get the path to vault-analysis.json in the responses folder
     */
    private getVaultAnalysisFilePath(): string {
        return `${this.app.vault.configDir}/plugins/knowledge-graph-analysis/responses/vault-analysis.json`;
    }

    private async loadVaultAnalysisData(): Promise<VaultAnalysisData | null> {
        try {
            const filePath = this.getVaultAnalysisFilePath();
            const content = await this.app.vault.adapter.read(filePath);
            return JSON.parse(content);
        } catch (error) {
            return null;
        }
    }

    private generateAnalysisId(analysisData: VaultAnalysisData): string {
        return `${analysisData.generatedAt}_${analysisData.totalFiles}`;
    }

    /**
     * Validate that network node data contains real notes from the vault
     */
    private validateNetworkNodeData(knowledgeNetwork: any, analysisData: VaultAnalysisData): void {
        const vaultNotes = new Map(analysisData.results.map(note => [note.path, note]));
        const vaultTitles = new Set(analysisData.results.map(note => note.title));
        
        const categories = ['bridges', 'foundations', 'authorities'];
        let issuesFound = 0;
        
        categories.forEach(category => {
            if (knowledgeNetwork[category] && Array.isArray(knowledgeNetwork[category])) {
                knowledgeNetwork[category].forEach((domain: any, domainIndex: number) => {
                    if (domain.topNotes && Array.isArray(domain.topNotes)) {
                        domain.topNotes.forEach((note: any, noteIndex: number) => {
                            // Check for dummy/example data
                            if (note.title === 'Note Title' || 
                                note.path === 'path/to/note.md' ||
                                note.title?.includes('Example') ||
                                note.title?.includes('Sample')) {
                                // console.warn(`⚠️  Dummy note detected in ${category}[${domainIndex}].topNotes[${noteIndex}]: "${note.title}"`);
                                issuesFound++;
                                return;
                            }
                            
                            // Validate note exists in vault
                            if (!vaultNotes.has(note.path)) {
                                // console.warn(`⚠️  Note path not found in vault: "${note.path}" (title: "${note.title}")`);
                                
                                // Try to find by title
                                if (vaultTitles.has(note.title)) {
                                    const matchingNote = analysisData.results.find(n => n.title === note.title);
                                    if (matchingNote) {
                                        // console.log(`✅ Found note by title, correcting path: "${note.path}" → "${matchingNote.path}"`);
                                        note.path = matchingNote.path;
                                    }
                                } else {
                                    // console.warn(`❌ Note title also not found in vault: "${note.title}"`);
                                    issuesFound++;
                                }
                            } else {
                                // Validate title matches path
                                const vaultNote = vaultNotes.get(note.path);
                                if (vaultNote && vaultNote.title !== note.title) {
                                    // console.warn(`⚠️  Title mismatch for path "${note.path}": AI says "${note.title}", vault has "${vaultNote.title}"`);
                                    // Correct the title
                                    note.title = vaultNote.title;
                                }
                            }
                        });
                    }
                });
            }
        });
        
        if (issuesFound > 0) {
            // console.warn(`🔍 Found ${issuesFound} note data issues. Check console for details.`);
            // console.log('💡 Tip: If you see dummy data, try regenerating the AI analysis.');
        } else {
            // console.log('✅ All note data validated successfully against vault contents.');
        }
    }

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.aiService.updateSettings(settings);
    }

 

    /**
     * NEW: Generate Knowledge Structure Analysis using structured output
     */
    public async generateKnowledgeStructureAnalysis(): Promise<StructureAnalysisData> {
        try {
            // console.log('Generating Knowledge Structure Analysis with structured output...');
            

            const analysisData = await this.loadVaultAnalysisData();
            if (!analysisData) {
                throw new Error('No vault analysis data found. Please generate vault analysis first.');
            }
            
            // Prepare optimized context for AI
            const contextService = new AIContextPreparationService();
            const optimizedContext = contextService.prepareOptimizedContext(analysisData);
            
            // Calculate comprehensive statistics for centrality scores
            const kdeService = new KDECalculationService();
            const comprehensiveStats = kdeService.getComprehensiveStats(analysisData);
            
            // Format optimized context for AI consumption
            const formattedContext = contextService.formatForAI(optimizedContext, comprehensiveStats);
            
            // Build the system, context, and instruction like in test-ai-model.js
            const system = "You are an expert in knowledge management. You are highly skilled in applying graph theory and network analysis to knowledge graphs. Use your expertise to extract insights from the provided context which contains knowledge domains and centrality rankings. Please focus on network analysis and determining knowledge gaps.";
            
            const context = `VAULT ANALYSIS DATA (Optimized):
${formattedContext}`;
            
            const instruction = `Analyze the vault data to identify key knowledge domains using network centrality metrics. Return a JSON object matching the required schema.

**Network Analysis Framework:**
- **Knowledge Bridges** (Betweenness Centrality): Domains that connect disparate knowledge areas and facilitate interdisciplinary thinking
- **Knowledge Foundations** (Closeness Centrality): Core domains that are central to the knowledge network and serve as conceptual starting points  
- **Knowledge Authorities** (Eigenvector Centrality): Domains representing areas of expertise with deep interconnections to other important concepts

**Instructions:**
1. Identify top-ranking domains for each centrality type based on the provided data
2. For each domain, output top 3 contributing notes with the highest centrality ranking for each domain
3. Explain why each domain qualifies as a bridge/foundation/authority based on its network position
4. Use only domains explicitly present in the vault data - do not invent domains
5. Treat domains as independent entities (multiple domains from one note are separate)`;

            // Combine system, context, and instruction
            const prompt = `${system}\n\n${context}\n\n${instruction}`;
            
            // Get the response schema for knowledge network analysis
            const responseSchema = this.aiService.createKnowledgeNetworkSchema();
            
            // Use the new structured output method
            const response = await this.aiService.generateStructuredAnalysis<any>(
                prompt,
                responseSchema,
                8192, // maxOutputTokens
                0.3,  // temperature
                0.72  // topP
            );
            
            // Parse the structured response directly (it's already JSON)
            const structureData = this.parseStructuredKnowledgeNetwork(response.result, analysisData);
            
            // Create structured analysis data
            const tabData: StructureAnalysisData = {
                generatedAt: new Date().toISOString(),
                sourceAnalysisId: this.generateAnalysisId(analysisData),
                apiProvider: 'Google Gemini',
                knowledgeStructure: structureData
            };
            
            // Cache the results
            await this.cacheTabAnalysis('structure', tabData);
            
            return tabData;
        } catch (error) {
            // console.error('Failed to generate Knowledge Structure Analysis:', error);
            if (error instanceof SemanticAnalysisError && error.errorType === 'quota_exhausted') {
                new Notice(getUserFriendlyMessage(error));
            }
            throw error;
        }
    }

    /**
     * NEW: Parse structured knowledge network response (replaces old parseKnowledgeStructure)
     */
    private parseStructuredKnowledgeNetwork(structuredResponse: any, analysisData: VaultAnalysisData): KnowledgeStructureData {
        try {
            // The response is already parsed JSON from structured output
            const knowledgeNetwork = structuredResponse.knowledgeNetwork || {
                bridges: [],
                foundations: [],
                authorities: []
            };
            
            // Validate note data against vault analysis
            this.validateNetworkNodeData(knowledgeNetwork, analysisData);
            
            // Extract knowledge gaps
            const knowledgeGaps = structuredResponse.knowledgeGaps || [];
            
            return {
                knowledgeNetwork,
                gaps: knowledgeGaps
            };
        } catch (error) {
            // console.error('Error parsing structured knowledge network:', error);
            // console.error('Structured response:', structuredResponse);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to parse structured knowledge network: ${errorMessage}`);
        }
    }




    // NEW: Cache tab-specific analysis
    public async cacheTabAnalysis(tabName: string, data: TabAnalysisData): Promise<void> {
        try {
            // Ensure responses directory exists
            await this.ensureResponsesDirectory();
            
            // Store the tab-specific analysis in the responses directory
            const filePath = `${this.app.vault.configDir}/plugins/knowledge-graph-analysis/responses/${tabName}-analysis.json`;
            await this.app.vault.adapter.write(filePath, JSON.stringify(data, null, 2));
            // console.log(`${tabName} analysis cached successfully in responses directory`);
        } catch (error) {
            // console.error(`Failed to cache ${tabName} analysis:`, error);
        }
    }

    // TODO: Implement these methods tomorrow with structured output approach
    
    /**
     * Generate Knowledge Evolution Analysis using structured output
     */
    public async generateKnowledgeEvolutionAnalysis(): Promise<EvolutionAnalysisData> {
        try {
            // console.log('Generating Knowledge Evolution Analysis with structured output...');

            const analysisData = await this.loadVaultAnalysisData();
            if (!analysisData) {
                throw new Error('No vault analysis data found. Please generate vault analysis first.');
            }

            // Prepare evolution-specific context
            const contextService = new AIContextPreparationService();
            const evolutionContext = contextService.prepareEvolutionContext(analysisData);
            const formattedContext = contextService.formatEvolutionContextForAI(evolutionContext);

            // Build the system, context, and instruction
            const system = "You are an expert in knowledge management and learning analytics. You specialize in analyzing how knowledge evolves over time, identifying patterns in topic introduction, and detecting shifts in intellectual focus. Use your expertise to extract insights from the provided temporal context which contains notes grouped by period and domain evolution data.";

            const context = `VAULT EVOLUTION DATA (Optimized):
${formattedContext}`;

            const instruction = `Analyze the vault evolution data to identify knowledge development patterns over time. Return a JSON object matching the required schema.

**Analysis Framework:**

1. **Knowledge Development Timeline**: Identify distinct phases in the knowledge development journey, describing key periods, dominant domains, and overall trends in productivity, diversity, and depth.

2. **Topic Introduction Patterns**: Analyze when different knowledge domains first appeared, identify acquisition patterns (burst, gradual, or project-based), and assess the learning strategy (depth-first, breadth-first, or balanced).

3. **Focus Shift Analysis**: Detect significant changes in knowledge focus between periods, identify new areas being explored, areas with increased/decreased attention, and consistent areas. Determine the frequency and direction of focus shifts.

**Instructions:**
1. Group notes into meaningful phases (typically 3-6 phases) based on domain activity and note creation patterns
2. For each phase, provide key domains, metrics (note count, word count), and a narrative description
3. Identify when domains first appeared and characterize the acquisition pattern
4. Detect focus shifts by comparing domain activity across periods
5. Use only domains and data explicitly present in the vault data - do not invent domains or metrics
6. Provide insights that are specific, actionable, and grounded in the actual data`;

            // Combine system, context, and instruction
            const prompt = `${system}\n\n${context}\n\n${instruction}`;

            // Get the response schema for knowledge evolution analysis
            const responseSchema = this.aiService.createKnowledgeEvolutionSchema();

            // Use the structured output method
            const response = await this.aiService.generateStructuredAnalysis<any>(
                prompt,
                responseSchema,
                8192, // maxOutputTokens
                0.3,  // temperature
                0.72  // topP
            );

            // Parse the structured response directly (it's already JSON)
            const evolutionData = this.parseStructuredKnowledgeEvolution(response.result, analysisData);

            // Create structured analysis data
            const tabData: EvolutionAnalysisData = {
                generatedAt: new Date().toISOString(),
                sourceAnalysisId: this.generateAnalysisId(analysisData),
                apiProvider: 'Google Gemini',
                knowledgeEvolution: evolutionData
            };

            // Cache the results
            await this.cacheTabAnalysis('evolution', tabData);

            return tabData;
        } catch (error) {
            // console.error('Failed to generate Knowledge Evolution Analysis:', error);
            if (error instanceof SemanticAnalysisError && error.errorType === 'quota_exhausted') {
                new Notice(getUserFriendlyMessage(error));
            }
            throw error;
        }
    }

    /**
     * Parse structured knowledge evolution response
     */
    private parseStructuredKnowledgeEvolution(structuredResponse: any, analysisData: VaultAnalysisData): KnowledgeEvolutionData {
        try {
            // The response is already parsed JSON from structured output
            const timeline = structuredResponse.timeline || {
                narrative: { title: '', content: '', keyPoints: [] },
                phases: [],
                trends: { productivity: 'stable', diversity: 'stable', depth: 'stable' }
            };

            const topicPatterns = structuredResponse.topicPatterns || {
                exploration: { title: '', content: '', keyPoints: [] },
                introductionTimeline: [],
                strategy: { style: 'balanced', consistency: 'mixed' }
            };

            const focusShift = structuredResponse.focusShift || {
                narrative: { title: '', content: '', keyPoints: [] },
                shifts: [],
                patterns: { frequency: 'occasional', direction: 'expanding' }
            };

            const insights = structuredResponse.insights || [];

            return {
                timeline,
                topicPatterns,
                focusShift,
                insights
            };
        } catch (error) {
            // console.error('Error parsing structured knowledge evolution:', error);
            // console.error('Structured response:', structuredResponse);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to parse structured knowledge evolution: ${errorMessage}`);
        }
    }

    /**
     * Generate Recommended Actions Analysis using structured output
     */
    public async generateRecommendedActionsAnalysis(): Promise<ActionsAnalysisData> {
        try {
            // console.log('Generating Recommended Actions Analysis with structured output...');

            const analysisData = await this.loadVaultAnalysisData();
            if (!analysisData) {
                throw new Error('No vault analysis data found. Please generate vault analysis first.');
            }

            // Prepare actions-specific context (includes connectivity insights)
            const contextService = new AIContextPreparationService();
            const actionsContext = contextService.prepareActionsContext(this.app, analysisData);
            const formattedContext = contextService.formatActionsContextForAI(actionsContext);

            // Build the system, context, and instruction
            const system = "You are an expert in knowledge management and knowledge graph optimization. You specialize in identifying notes that need maintenance, suggesting connections between related concepts, and optimizing knowledge structure. Use your expertise to analyze the provided connectivity and centrality data to generate actionable recommendations.";

            const context = `VAULT ANALYSIS DATA WITH CONNECTIVITY INSIGHTS:
${formattedContext}`;

            const instruction = `Analyze the vault data and connectivity insights to generate actionable recommendations. Return a JSON object matching the required schema.

**Analysis Framework:**

1. **Knowledge Maintenance**: Identify notes that need attention based on:
   - Integration opportunities (high outbound, low inbound links) - these notes need incoming connections
   - Isolated notes (low connectivity) - these need more links
   - Orphan notes (zero links) - these need urgent attention
   - Notes with high centrality but low connectivity - important concepts that are underlinked
   - Notes that haven't been modified recently but are important (check modified dates)
   - Notes that serve as bridges or authorities but need reinforcement

2. **Connection Recommendations**: Suggest links between notes based on:
   - Integration opportunities - notes that should receive incoming links
   - Same knowledge domains but no existing links
   - Complementary content (based on keywords and summaries)
   - Missing bridges between knowledge clusters
   - Notes that would benefit from cross-domain connections

**Instructions:**
1. For maintenance actions, prioritize based on urgency:
   - High priority: Orphan notes, important notes with zero inbound links, critical bridges/authorities that are underlinked
   - Medium priority: Isolated notes, integration opportunities, notes needing updates
   - Low priority: Notes that could benefit from minor improvements
   - Limit to the top 12 most impactful maintenance items.
   - Provide a concise reason (1-2 sentences) and a specific action for each.

2. For connection recommendations, provide:
   - sourceId: the note that will RECEIVE the new link (we will add [[target]] inside this note)
   - targetId: the note being linked to
   - Clear, concise reason (1-2 sentences) why the connection makes sense
   - Confidence score (0.0-1.0) based on how strong the connection rationale is
   - Focus on high-value connections (integration opportunities, domain bridges)
   - Limit to the top 20 highest-value connection suggestions.

3. Use only notes and data explicitly present in the vault data - do not invent notes or paths.
4. Use the EXACT path format from the vault data (e.g. "Folder/Note.md") for noteId, sourceId, and targetId.
5. Provide specific, actionable recommendations grounded in the connectivity and centrality patterns.
6. For learningPaths and organization, return empty arrays (to be implemented in future).`;

            // Combine system, context, and instruction
            const prompt = `${system}\n\n${context}\n\n${instruction}`;

            // Get the response schema for recommended actions analysis
            const responseSchema = this.aiService.createRecommendedActionsSchema();

            // Use the structured output method
            const response = await this.aiService.generateStructuredAnalysis<any>(
                prompt,
                responseSchema,
                8192, // maxOutputTokens
                0.3,  // temperature
                0.72  // topP
            );

            // Parse the structured response
            const actionsData = this.parseStructuredRecommendedActions(response.result, analysisData);

            // Create structured analysis data
            const tabData: ActionsAnalysisData = {
                generatedAt: new Date().toISOString(),
                sourceAnalysisId: this.generateAnalysisId(analysisData),
                apiProvider: 'Google Gemini',
                recommendedActions: actionsData
            };

            // Cache the results
            await this.cacheTabAnalysis('actions', tabData);

            return tabData;
        } catch (error) {
            // console.error('Failed to generate Recommended Actions Analysis:', error);
            if (error instanceof SemanticAnalysisError && error.errorType === 'quota_exhausted') {
                new Notice(getUserFriendlyMessage(error));
            }
            throw error;
        }
    }

    /**
     * Parse structured recommended actions response
     */
    private parseStructuredRecommendedActions(structuredResponse: any, analysisData: VaultAnalysisData): KnowledgeActionsData {
        try {
            // The response is already parsed JSON from structured output
            const maintenance = structuredResponse.maintenance || [];
            const connections = structuredResponse.connections || [];
            const learningPaths = structuredResponse.learningPaths || [];
            const organization = structuredResponse.organization || [];

            // Validate and normalize paths using NoteResolver (single source of truth)
            const validatedMaintenance = maintenance.map((action: any) => {
                const noteId = NoteResolver.resolveToPath(
                    this.app,
                    action.noteId || action.path || action.title || ''
                );
                return {
                    noteId,
                    title: action.title || '',
                    reason: action.reason || '',
                    priority: (action.priority === 'high' || action.priority === 'medium' || action.priority === 'low')
                        ? action.priority
                        : ('medium' as 'high' | 'medium' | 'low'),
                    action: action.action || ''
                };
            }).filter((action: any) => action.noteId);

            const validatedConnections = connections.map((conn: any) => {
                const sourceId = NoteResolver.resolveToPath(this.app, conn.sourceId || '');
                const targetId = NoteResolver.resolveToPath(this.app, conn.targetId || '');
                return {
                    sourceId,
                    targetId,
                    reason: conn.reason || '',
                    confidence: Math.max(0, Math.min(1, conn.confidence || 0.5))
                };
            }).filter((conn: any) => conn.sourceId && conn.targetId && conn.sourceId !== conn.targetId);

            return {
                maintenance: validatedMaintenance,
                connections: validatedConnections,
                learningPaths: learningPaths, // Keep as-is for now
                organization: organization // Keep as-is for now
            };
        } catch (error) {
            // console.error('Error parsing structured recommended actions:', error);
            // console.error('Structured response:', structuredResponse);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to parse structured recommended actions: ${errorMessage}`);
        }
    }

    /**
     * Reopen the vault analysis modal to a specific tab after AI analysis completes.
     * This provides a better UX by closing the modal during processing and reopening with results.
     */
    public async reopenModalToTab(
        vaultSemanticAnalysisManager: VaultSemanticAnalysisManager,
        settings: GraphAnalysisSettings,
        tabName: string
    ): Promise<void> {
        try {
            // Load fresh vault analysis data
            const analysisData = await this.loadVaultAnalysisData();
            const hasExistingData = analysisData !== null && analysisData.results && analysisData.results.length > 0;
            
            // Dynamically import VaultAnalysisModal to avoid circular dependency issues
            const { VaultAnalysisModal } = await import('../views/VaultAnalysisModals');
            
            // Get tab display name for success message
            const tabDisplayNames: Record<string, string> = {
                'structure': 'Knowledge Structure',
                'evolution': 'Knowledge Evolution',
                'actions': 'Recommended Actions'
            };
            const tabDisplayName = tabDisplayNames[tabName] || 'Knowledge';
            
            // Show success notice
            new Notice(`✅ ${tabDisplayName} Analysis completed successfully!`);
            
            // Create and open modal with the specified tab
            const modal = new VaultAnalysisModal(
                this.app,
                analysisData,
                hasExistingData,
                vaultSemanticAnalysisManager,
                settings,
                tabName
            );
            modal.open();
        } catch (error) {
            // console.error('Failed to reopen modal:', error);
            new Notice(error instanceof Error ? error.message : 'Failed to reopen analysis modal');
        }
    }
}