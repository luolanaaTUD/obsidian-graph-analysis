import { App } from 'obsidian';
import { GraphAnalysisSettings, HierarchicalDomain, DomainConnection } from '../types/types';
import { KnowledgeStructureData } from './visualization/KnowledgeStructureManager';
import { 
    KnowledgeEvolutionData,
    TimelineAnalysis,
    TopicPatternsAnalysis,
    FocusShiftAnalysis,
    LearningVelocityAnalysis,
    EvolutionInsight
} from './visualization/KnowledgeEvolutionManager';
import { KnowledgeActionsData } from './visualization/KnowledgeActionsManager';
import { AIModelService, TokenUsage } from '../services/AIModelService';

// Remove re-export since we now import directly from types.ts

export interface VaultAnalysisResult {
    id: string;
    title: string;
    summary: string;
    keywords: string;
    knowledgeDomains: string[]; // Changed from knowledgeDomain string to knowledgeDomains string array
    created: string;
    modified: string;
    path: string;
    wordCount: number;
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
    totalFiles: number;
    apiProvider: string;
    tokenUsage: TokenUsage;
    results: VaultAnalysisResult[];
}

/**
 * @deprecated Use tab-specific analysis data interfaces (StructureAnalysisData, EvolutionAnalysisData, ActionsAnalysisData) instead.
 */
export interface MasterAnalysisData {
    generatedAt: string;
    sourceAnalysisId: string; // Reference to vault-analysis.json used
    apiProvider: string;
    tokenUsage: TokenUsage;
    // rawAIResponse field removed as it's no longer needed
    
    // Tab 2: Knowledge Structure
    knowledgeStructure: KnowledgeStructureData;
    
    // Tab 3: Knowledge Evolution  
    knowledgeEvolution: KnowledgeEvolutionData;
    
    // Tab 4: Recommended Actions
    recommendedActions: KnowledgeActionsData;
}

// NEW: Interface for tab-specific analysis data
export interface TabAnalysisData {
    generatedAt: string;
    sourceAnalysisId: string;
    apiProvider: string;
    tokenUsage: TokenUsage;
    rawAIResponse: string;
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
}

// DDC Template interfaces - UPDATED for new structured ID system
interface DDCSection {
    id: string;
    name: string;
}

interface DDCDivision {
    id: string;
    name: string;
    sections: DDCSection[];
}

interface DDCClass {
    id: string;
    name: string;
    divisions: DDCDivision[];
}

interface DDCTemplate {
    ddc_23_summaries: {
        title: string;
        classes: DDCClass[];
    };
}

export class MasterAnalysisManager {
    private app: App;
    private settings: GraphAnalysisSettings;
    private aiService: AIModelService;
    private readonly MAX_CHUNK_SIZE = 600000; // Increased chunk size to take advantage of 1M TPM limit
    
    // DDC data loaded from external JSON file - UPDATED for new structure
    private ddcTemplate: DDCTemplate | null = null;
    private ddcMainClasses: { [key: string]: string } = {};
    private ddcDivisions: { [key: string]: string } = {};
    private ddcSections: { [key: string]: string } = {};
    
    // NEW: Optimized section list for AI classification
    private ddcSectionsList: Array<{id: string, name: string, division: string, mainClass: string}> = [];
    
    // NEW: Track if context has been loaded to avoid redundant loading
    private contextLoaded: boolean = false;

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.settings = settings;
        this.aiService = new AIModelService(settings);
    }

    /**
     * NEW: Helper function to get all section-level domains (third level)
     */
    public getAllDDCSections(): Array<{id: string, name: string, division: string, mainClass: string}> {
        return this.ddcSectionsList;
    }


    /**
     * Load DDC template from external JSON file and extract optimized section list
     */
    private async loadDDCTemplate(): Promise<void> {
        if (this.ddcTemplate) {
            console.log('DDC template already loaded, skipping load');
            return; // Already loaded
        }

        try {
            // Check if template exists in plugin root directory
            const templatePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/DDC-template.json`;
            console.log('Attempting to load DDC template from:', templatePath);
            
            let ddcContent: string | null = null;
            
            try {
                ddcContent = await this.app.vault.adapter.read(templatePath);
                console.log(`Successfully loaded DDC template from: ${templatePath}`);
            } catch (pathError) {
                console.log(`DDC template not found at: ${templatePath}`);
                
                // Try to copy from source as fallback
                const copied = await this.copyDDCTemplateFile();
                if (copied) {
                    // Try loading again after copy
                    try {
                        ddcContent = await this.app.vault.adapter.read(templatePath);
                        console.log(`Successfully loaded DDC template after copying to: ${templatePath}`);
                    } catch (retryError) {
                        throw new Error('Failed to load DDC template even after copying it. Please ensure the plugin is installed correctly.');
                    }
                } else {
                    throw new Error('DDC template not found in the plugin directory and copy attempt failed. Please ensure the DDC-template.json file is properly copied to the plugin directory during installation.');
                }
            }
            
            try {
                this.ddcTemplate = JSON.parse(ddcContent);
                console.log('Successfully parsed DDC template JSON');
            } catch (parseError) {
                console.error('Failed to parse DDC template JSON:', parseError);
                console.log('DDC content preview:', ddcContent.substring(0, 200) + '...');
                throw new Error(`Failed to parse DDC template JSON: ${parseError.message}`);
            }
            
            // Extract classes, divisions, and sections for the new structure
            this.ddcMainClasses = {};
            this.ddcDivisions = {};
            this.ddcSections = {};
            this.ddcSectionsList = []; // Reset the optimized list
            
            if (this.ddcTemplate?.ddc_23_summaries?.classes) {
                const classCount = this.ddcTemplate.ddc_23_summaries.classes.length;
                console.log(`Processing ${classCount} DDC classes`);
                
                this.ddcTemplate.ddc_23_summaries.classes.forEach(ddcClass => {
                    // Store main class
                    this.ddcMainClasses[ddcClass.id] = ddcClass.name;
                    
                    // Process divisions
                    const divisionCount = ddcClass.divisions.length;
                    console.log(`Processing ${divisionCount} divisions for class ${ddcClass.id} (${ddcClass.name})`);
                    
                    ddcClass.divisions.forEach(division => {
                        this.ddcDivisions[division.id] = division.name;
                        
                        // Process sections and build optimized list
                        const sectionCount = division.sections.length;
                        console.log(`Processing ${sectionCount} sections for division ${division.id} (${division.name})`);
                        
                        division.sections.forEach(section => {
                            this.ddcSections[section.id] = section.name;
                            
                            // Add to optimized sections list with parent information
                            this.ddcSectionsList.push({
                                id: section.id,
                                name: section.name,
                                division: division.name,
                                mainClass: ddcClass.name
                            });
                        });
                    });
                });
                
                console.log(`📚 DDC template loaded from ${templatePath}: ${this.ddcTemplate.ddc_23_summaries.classes.length} main classes, ${Object.keys(this.ddcDivisions).length} divisions, ${Object.keys(this.ddcSections).length} sections`);
                console.log(`🎯 Optimized sections list: ${this.ddcSectionsList.length} leaf nodes for AI classification`);
            } else {
                console.error('DDC template has invalid structure:', this.ddcTemplate);
                throw new Error('DDC template has invalid structure. Expected ddc_23_summaries.classes array.');
            }
        } catch (error) {
            console.error('Failed to load DDC template:', error);
            // Fallback to empty structure
            this.ddcTemplate = null;
            this.ddcMainClasses = {};
            this.ddcDivisions = {};
            this.ddcSections = {};
            this.ddcSectionsList = [];
        }
    }

    // NEW: Ensure responses directory exists
    private async ensureResponsesDirectory(): Promise<void> {
        try {
            const responsesDir = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/responses`;
            try {
                await this.app.vault.adapter.mkdir(responsesDir);
            } catch {
                // Directory might already exist
            }
        } catch (error) {
            console.error('Failed to create responses directory:', error);
        }
    }

    // Update loadCachedTabAnalysis to ensure responses directory exists
    public async loadCachedTabAnalysis(tabName: string): Promise<TabAnalysisData | null> {
        try {
            // Ensure responses directory exists
            await this.ensureResponsesDirectory();
            
            // Look for the tab-specific analysis in the responses directory
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/responses/${tabName}-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const data = JSON.parse(content);
            
            // Validate that the cached analysis matches current semantic analysis
            const currentAnalysisData = await this.loadVaultAnalysisData();
            if (currentAnalysisData && data?.sourceAnalysisId !== this.generateAnalysisId(currentAnalysisData)) {
                console.log(`Cached ${tabName} analysis is outdated, will regenerate`);
                return null;
            }
            
            return data;
        } catch (error) {
            // Check if this is a file not found error (ENOENT)
            if (error.code === 'ENOENT') {
                console.log(`No cached ${tabName} analysis found yet. This is normal for first-time use.`);
            } else {
                // Log other unexpected errors
                console.warn(`Error loading cached ${tabName} analysis:`, error);
            }
            return null;
        }
    }

    private async loadVaultAnalysisData(): Promise<VaultAnalysisData | null> {
        try {
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/vault-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            return JSON.parse(content);
        } catch (error) {
            return null;
        }
    }

    private generateAnalysisId(analysisData: VaultAnalysisData): string {
        return `${analysisData.generatedAt}_${analysisData.totalFiles}`;
    }

    // Remove cacheMasterAnalysis as we're no longer using the master cache file

    /**
     * Split JSON data into larger, more efficient chunks for 2.0 Flash-Lite
     */
    private chunkJsonData(jsonData: string): string[] {
        const chunks: string[] = [];
        let currentIndex = 0;
        
        // Use larger chunk size to minimize API calls
        const chunkSize = this.MAX_CHUNK_SIZE;
        
        while (currentIndex < jsonData.length) {
            const chunkEnd = Math.min(currentIndex + chunkSize, jsonData.length);
            let chunk = jsonData.substring(currentIndex, chunkEnd);
            
            // Try to break at a logical point to maintain JSON structure
            if (chunkEnd < jsonData.length) {
                const lastBrace = chunk.lastIndexOf('}');
                const lastBracket = chunk.lastIndexOf(']');
                const lastComma = chunk.lastIndexOf(',');
                
                const breakPoint = Math.max(lastBrace, lastBracket, lastComma);
                if (breakPoint > chunk.length * 0.6) { // More flexible breaking point
                    chunk = chunk.substring(0, breakPoint + 1);
                    currentIndex += breakPoint + 1;
                } else {
                    currentIndex = chunkEnd;
                }
            } else {
                currentIndex = chunkEnd;
            }
            
            chunks.push(chunk);
        }
        
        console.log(`Split into ${chunks.length} chunks`);
        return chunks;
    }

    private parseKnowledgeStructure(section: string, analysisData: VaultAnalysisData): KnowledgeStructureData {
        try {
            // Extract JSON from the section
            const jsonMatch = section.match(/```json\s*([\s\S]*?)\s*```/);
            if (!jsonMatch) {
                throw new Error('No JSON found in the knowledge structure section');
            }
            
            const jsonStr = jsonMatch[1];
            const parsedJson = JSON.parse(jsonStr);
            
            // Extract domain distribution data - now we only need summary indicators
            const domainDistribution = parsedJson.knowledgeDomainDistribution;
            
            if (!domainDistribution) {
                throw new Error('Invalid knowledge domain distribution data');
            }
            
            // Extract summary indicators
            const summaryIndicators = domainDistribution.summary || null;
            
            // Build hierarchical domain structure directly from vault analysis data
            // instead of using sectionClassification from AI response
            const domainHierarchy = this.buildHierarchyFromVaultData(analysisData);
            
            // Extract knowledge network data
            const knowledgeNetwork = parsedJson.knowledgeNetwork || {
                bridges: [],
                foundations: [],
                authorities: []
            };
            
            // Extract knowledge gaps
            const knowledgeGaps = parsedJson.knowledgeGaps || [];
            
            // Create insights from the data
            const insights = [{
                title: "Knowledge Distribution Insight",
                content: summaryIndicators ? 
                    `Your knowledge vault primarily focuses on ${summaryIndicators.topDomain.name} (${summaryIndicators.topDomain.percentage}% of notes). Recently, you've been concentrating on ${summaryIndicators.recentFocus.name} with ${summaryIndicators.recentFocus.count} notes.` : 
                    "Analyze your knowledge distribution to identify key focus areas.",
                keyPoints: [
                    summaryIndicators ? `Top domain: ${summaryIndicators.topDomain.name}` : "No top domain identified",
                    summaryIndicators ? `Recent focus: ${summaryIndicators.recentFocus.name}` : "No recent focus identified",
                    summaryIndicators ? `Growth trend: ${summaryIndicators.growthTrend.description || summaryIndicators.growthTrend.percentage + '%'}` : "No growth trend identified",
                    `Classified into ${domainHierarchy.length} different knowledge areas`
                ]
            }];
            
            return {
                domainHierarchy,
                summaryIndicators,
                knowledgeNetwork,
                insights,
                gaps: knowledgeGaps
            };
        } catch (error) {
            console.error('Error parsing knowledge structure:', error);
            throw new Error(`Failed to parse knowledge structure: ${error.message}`);
        }
    }

    /**
     * Build hierarchical domain structure directly from vault analysis data
     * This builds a 3-level hierarchy: Main Class > Division > Section
     */
    public buildHierarchyFromVaultData(
        analysisData: VaultAnalysisData
    ): HierarchicalDomain[] {
        // Create maps for DDC hierarchy - we'll only use class and section now
        const classMap = new Map<string, HierarchicalDomain>();
        const sectionMap = new Map<string, HierarchicalDomain>();
        
        // Count notes per DDC section
        const sectionCounts = new Map<string, number>();
        const sectionNotes = new Map<string, VaultAnalysisResult[]>();
        
        // Get DDC name to code mapping for reverse lookup
        const nameToCodeMap = new Map<string, string>();
        const codeToNameMap = this.getDDCCodeToNameMap();
        
        // Add main class names to the code-to-name map
        if (this.ddcTemplate && this.ddcTemplate.ddc_23_summaries && this.ddcTemplate.ddc_23_summaries.classes) {
            this.ddcTemplate.ddc_23_summaries.classes.forEach(cls => {
                // Store main class names with their IDs (0, 1, 2, etc.)
                codeToNameMap.set(cls.id, cls.name);
            });
        }
        
        // Build reverse lookup map
        codeToNameMap.forEach((name, code) => {
            nameToCodeMap.set(name, code);
        });
        
        // Process each note to extract its DDC codes or names
        analysisData.results.forEach(note => {
            if (note.knowledgeDomains && note.knowledgeDomains.length > 0) {
                // Process each domain in the array
                note.knowledgeDomains.forEach(domain => {
                    let sectionId = '';
                    // Try to use domain as a DDC code first
                    if (this.isValidDDCSectionId(domain)) {
                        sectionId = domain;
                    } 
                    // If not a valid code, try to look up by name
                    else if (nameToCodeMap.has(domain)) {
                        sectionId = nameToCodeMap.get(domain) || '';
                    } 
                    // If still not found, skip this domain (do NOT create synthetic IDs)
                    else {
                        // Skip this domain
                        return;
                    }
                    // Skip if we couldn't determine a section ID
                    if (!sectionId) return;
                    // Get class ID from section ID
                    const classId = this.getClassIdFromSection(sectionId);
                    // Update section counts
                    sectionCounts.set(sectionId, (sectionCounts.get(sectionId) || 0) + 1);
                    // Update section notes
                    if (!sectionNotes.has(sectionId)) {
                        sectionNotes.set(sectionId, []);
                    }
                    sectionNotes.get(sectionId)?.push(note);
                    // Create class node if it doesn't exist
                    if (!classMap.has(classId)) {
                        // Get the proper name for the class - for standard DDC classes (0-9),
                        // this will be the proper main class name
                        const className = codeToNameMap.get(classId) || classId;
                        classMap.set(classId, {
                            ddcCode: classId,
                            name: className,
                            noteCount: 0,
                            level: 1, // Main class level
                            children: []
                        });
                    }
                    // Create section node if it doesn't exist
                    if (!sectionMap.has(sectionId)) {
                        const sectionNode: HierarchicalDomain = {
                            ddcCode: sectionId,
                            name: codeToNameMap.get(sectionId) || sectionId,
                            noteCount: 0,
                            level: 2, // Section level (was 3 before)
                            parent: classMap.get(classId)?.ddcCode // Fix: Use ddcCode string instead of the HierarchicalDomain object
                        };
                        sectionMap.set(sectionId, sectionNode);
                        // Add section as child of class
                        classMap.get(classId)?.children?.push(sectionNode);
                    }
                    // Update note count for section and class
                    if (sectionMap.has(sectionId)) {
                        const section = sectionMap.get(sectionId);
                        if (section) {
                            section.noteCount = (section.noteCount || 0) + 1;
                        }
                    }
                    if (classMap.has(classId)) {
                        const classNode = classMap.get(classId);
                        if (classNode) {
                            classNode.noteCount = (classNode.noteCount || 0) + 1;
                        }
                    }
                });
            }
        });
        
        // Extract keywords for each section
        sectionMap.forEach((section, sectionId) => {
            const notes = sectionNotes.get(sectionId) || [];
            const keywords = new Set<string>();
            
            notes.forEach(note => {
                if (note.keywords) {
                    note.keywords.split(',').forEach(keyword => {
                        const trimmed = keyword.trim();
                        if (trimmed) {
                            keywords.add(trimmed);
                        }
                    });
                }
            });
            
            section.keywords = Array.from(keywords); // Fix: Use string array instead of comma-joined string
        });
        
        // Convert class map to array and sort by note count
        const result = Array.from(classMap.values())
            .filter(cls => cls.noteCount && cls.noteCount > 0)
            .sort((a, b) => (b.noteCount || 0) - (a.noteCount || 0));
        
        return result;
    }
    
    /**
     * Simple string hash function for creating synthetic IDs
     */
    private hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Helper methods to extract IDs from section IDs - UPDATED for new structured ID system
     */
    private getClassIdFromSection(sectionId: string): string {
        // Extract class ID from section ID (e.g., "0-0-0" -> "0")
        return sectionId.split('-')[0];
    }

    private getDivisionIdFromSection(sectionId: string): string {
        // Extract division ID from section ID (e.g., "0-0-0" -> "0-0")
        const parts = sectionId.split('-');
        return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : sectionId;
    }

    // // DEPRECATED: Keep old methods for backward compatibility
    // private getMainClassCodeFromSection(sectionCode: string): string {
    //     // Old method - convert to new system
    //     return this.getClassIdFromSection(sectionCode);
    // }

    // private getDivisionCodeFromSection(sectionCode: string): string {
    //     // Old method - convert to new system  
    //     return this.getDivisionIdFromSection(sectionCode);
    // }

    private parseKnowledgeEvolution(section: string, analysisData: VaultAnalysisData): KnowledgeEvolutionData {
        // Create simplified timeline analysis
        const timeline: TimelineAnalysis = {
            narrative: {
                title: 'Knowledge Evolution Journey',
                content: this.extractNarrative(section),
                keyPoints: this.extractKeyPoints(this.extractNarrative(section)),
                recommendations: []
            },
            phases: [], // Simplified - no time period analysis
            trends: {
                productivity: 'stable' as const,
                diversity: 'expanding' as const,
                depth: 'increasing' as const
            }
        };

        return {
            timeline,
            topicPatterns: this.parseTopicPatterns(section, analysisData),
            focusShift: this.parseFocusShift(section, analysisData),
            learningVelocity: this.parseLearningVelocity(section, analysisData),
            insights: this.extractInsights(section)
        };
    }



    private parseRecommendedActions(section: string, analysisData: VaultAnalysisData): KnowledgeActionsData {
        return {
            maintenance: this.parseMaintenanceActions(section, analysisData),
            connections: this.parseConnectionSuggestions(section, analysisData),
            learningPaths: this.parseLearningPaths(section, analysisData),
            organization: this.parseOrganizationSuggestions(section, analysisData)
        };
    }

    // Helper parsing methods
    private extractInsights(section: string): any[] {
        // Extract insight items from the section
        const insights = section.match(/## .+?\n([\s\S]*?)(?=\n## |\n---|\n# |$)/g) || [];
        return insights.slice(0, 3).map(insight => ({
            title: insight.match(/## (.+)/)?.[1] || 'Insight',
            content: insight.replace(/## .+\n/, '').trim(),
            keyPoints: this.extractKeyPoints(insight)
        }));
    }

    private extractKeyPoints(text: string): string[] {
        const points = text.match(/[•\-*]\s*(.+)/g) || [];
        return points.map(point => point.replace(/^[•\-*]\s*/, '').trim()).slice(0, 5);
    }

    private extractNarrative(section: string): string {
        const narrative = section.match(/## Timeline Narrative\n([\s\S]*?)(?=\n## |\n---|\n# |$)/);
        return narrative?.[1]?.trim() || 'No narrative available';
    }

    private extractKnowledgeGaps(section: string): string[] {
        const gapsSection = section.match(/## Knowledge Gaps\n([\s\S]*?)(?=\n## |\n---|\n# |$)/);
        if (!gapsSection) return [];
        
        const gaps = gapsSection[1].match(/[•\-*]\s*(.+)/g) || [];
        return gaps.map(gap => gap.replace(/^[•\-*]\s*/, '').trim()).slice(0, 5);
    }

    // Simplified parsing methods
    private parseTopicPatterns(section: string, context: any): any {
        return {
            exploration: { title: 'Topic Exploration', content: 'Analysis pending', keyPoints: [] },
            introductionTimeline: [],
            strategy: { style: 'balanced', consistency: 'exploratory' }
        };
    }

    private parseFocusShift(section: string, context: any): any {
        return {
            narrative: { title: 'Focus Evolution', content: 'Analysis pending', keyPoints: [] },
            shifts: [],
            patterns: { frequency: 'occasional', direction: 'expanding' }
        };
    }

    private parseLearningVelocity(section: string, context: any): any {
        return {
            trends: { title: 'Learning Velocity', content: 'Analysis pending', keyPoints: [] },
            metrics: [],
            optimization: { peakPeriods: [], recommendations: [], productivityScore: 7.5 }
        };
    }

    private parseMaintenanceActions(section: string, context: any): any[] {
        return [];
    }

    private parseConnectionSuggestions(section: string, context: any): any[] {
        return [];
    }

    private parseLearningPaths(section: string, context: any): any[] {
        return [];
    }

    private parseOrganizationSuggestions(section: string, context: any): any[] {
        return [];
    }

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
        this.aiService.updateSettings(settings);
    }

    /**
     * Generate structure-specific analysis prompt
     */
    private generateStructureAnalysisPrompt(): string {
        // Ensure DDC template is loaded
        if (!this.ddcTemplate || this.ddcSectionsList.length === 0) {
            console.error('DDC template not loaded or empty, cannot generate proper structure analysis prompt');
            throw new Error('DDC template not loaded. Please ensure the DDC-template.json file is properly copied to the plugin directory.');
        }

        return `# KNOWLEDGE STRUCTURE ANALYSIS

## Input Data Description
The input data contains:
- Notes with titles, summaries, and knowledge domains (already classified with DDC section codes)
- Notes may have graph metrics showing their centrality in the knowledge network
- Creation and modification dates for tracking knowledge evolution

## Expected Output Format
You MUST output a JSON object with the following structure:
\`\`\`json
{
  "knowledgeDomainDistribution": {
    "summary": {
      "topDomain": {
        "percentage": 51,
        "name": "domain section name"
      },
      "bridgeMaker": {
        "score": 0.229,
        "name": "domain section name"
      },
      "growthTrend": {
        "percentage": 62,
        "name": "domain section name"
      },
      "recentFocus": {
        "count": 6,
        "name": "domain section name"
      }
    }
  },
  "knowledgeNetwork": {
    "bridges": [
      {
        "title": "Note Title",
        "score": 0.85,
        "rank": 1,
        "connections": []
      }
    ],
    "foundations": [
      {
        "title": "Note Title",
        "score": 0.92,
        "rank": 1,
        "reach": 15
      }
    ],
    "authorities": [
      {
        "title": "Note Title",
        "score": 0.78,
        "rank": 1,
        "influence": 0.78
      }
    ]
  },
  "knowledgeGaps": [
    "Gap description 1",
    "Gap description 2"
  ]
}
\`\`\`

### Important Requirements for Summary Indicators
1. **Top Domain**: The most prevalent knowledge domain by percentage of notes
2. **Bridge Maker**: The domain that best connects different areas based on betweenness centrality
3. **Growth Trend**: The domain showing the most growth based on recent note creation/modification
4. **Recent Focus**: The domain with the most notes created/modified in the last month

### Analysis Approach
1. Use the already classified DDC section codes in each note's knowledgeDomain field
2. Calculate summary indicators based on the distribution of these DDC codes
3. Identify knowledge network elements (bridges, foundations, authorities) based on centrality metrics
4. Identify potential knowledge gaps based on the overall domain distribution

CRITICAL: Your response MUST include the full JSON structure with all required sections. Focus on providing accurate summary indicators and network analysis based on the pre-classified notes.`;
    }


    /**
     * Generate evolution-specific analysis prompt
     */
    private generateEvolutionAnalysisPrompt(): string {
        return `# KNOWLEDGE EVOLUTION ANALYSIS

## Timeline Narrative
[Analyze note creation/modification patterns over time]

## Topic Introduction Patterns  
[Track how new knowledge domains emerge over time using section classification]

## Learning Velocity Trends
[Analyze productivity patterns using wordCount and time data]

Please provide your analysis in this JSON format:

\`\`\`json
{
  "timeline": {
    "narrative": {
      "title": "Knowledge Evolution Journey",
      "content": "A detailed narrative describing how the knowledge has evolved over time...",
      "keyPoints": ["Key point 1", "Key point 2", "Key point 3"]
    },
    "phases": [
      {
        "period": "Jan-Mar 2023",
        "description": "Initial exploration phase focusing on...",
        "domains": ["Domain 1", "Domain 2"],
        "noteCount": 15,
        "wordCount": 7500
      }
    ],
    "trends": {
      "productivity": "increasing",
      "diversity": "expanding",
      "depth": "increasing"
    }
  },
  "topicPatterns": {
    "exploration": {
      "title": "Topic Exploration Pattern",
      "content": "Analysis of how new topics are introduced and explored...",
      "keyPoints": ["Point 1", "Point 2", "Point 3"]
    },
    "introductionTimeline": [
      {
        "period": "Jan 2023",
        "newDomains": ["Domain A", "Domain B"],
        "expandedDomains": ["Domain C"]
      }
    ],
    "strategy": {
      "style": "depth-first",
      "consistency": "exploratory"
    }
  },
  "focusShift": {
    "narrative": {
      "title": "Focus Evolution",
      "content": "Analysis of how focus has shifted between domains...",
      "keyPoints": ["Point 1", "Point 2", "Point 3"]
    },
    "shifts": [
      {
        "period": "Q1 to Q2 2023",
        "from": ["Domain A", "Domain B"],
        "to": ["Domain C", "Domain D"],
        "reason": "Shift from theoretical to practical application"
      }
    ],
    "patterns": {
      "frequency": "quarterly",
      "direction": "specializing"
    }
  },
  "learningVelocity": {
    "trends": {
      "title": "Learning Velocity",
      "content": "Analysis of the pace and efficiency of knowledge acquisition...",
      "keyPoints": ["Point 1", "Point 2", "Point 3"]
    },
    "metrics": [
      {
        "period": "Jan 2023",
        "notesCreated": 10,
        "wordsWritten": 5000,
        "domainsExplored": 3,
        "trendIndicator": "up"
      }
    ],
    "optimization": {
      "peakPeriods": ["Feb 2023", "May 2023"],
      "recommendations": ["Recommendation 1", "Recommendation 2"],
      "productivityScore": 8.5
    }
  },
  "insights": [
    {
      "title": "Key Evolution Insight",
      "content": "Detailed insight about knowledge evolution pattern...",
      "keyPoints": ["Point 1", "Point 2", "Point 3"]
    }
  ]
}
\`\`\``;
    }

    /**
     * Generate actions-specific analysis prompt
     */
    private generateActionsAnalysisPrompt(): string {
        return `# RECOMMENDED ACTIONS

## Knowledge Maintenance (5 items)
[Identify specific notes needing updates based on centrality and content]

## Connection Opportunities (5 items)
[Suggest note connections using centrality rankings and section relationships]

## Learning Paths (3 paths)
[Recommend learning sequences based on DDC section structure]

## Organization Suggestions (5 items)
[Suggest structural improvements using DDC section analysis]

Please provide your analysis in this JSON format:

\`\`\`json
{
  "maintenance": [
    {
      "title": "Update Core Concept X",
      "path": "path/to/note.md",
      "reason": "High centrality note with outdated information",
      "priority": "high",
      "suggestedAction": "Review and update with latest research"
    }
  ],
  "connections": [
    {
      "title": "Connect Concepts A and B",
      "notes": ["path/to/noteA.md", "path/to/noteB.md"],
      "reason": "Strong conceptual overlap but no direct link",
      "suggestedLink": "Concept A relates to Concept B through..."
    }
  ],
  "learningPaths": [
    {
      "title": "Master Topic X",
      "description": "Structured path to understand Topic X from basics to advanced",
      "steps": ["Concept 1", "Concept 2", "Concept 3"],
      "existingNotes": ["path/to/note1.md", "path/to/note2.md"],
      "suggestedNewNotes": ["Concept 3 Application", "Advanced Topic X"]
    }
  ],
  "organization": [
    {
      "title": "Restructure Domain Y",
      "description": "Current structure is fragmented across multiple locations",
      "impact": "Will improve findability and connection density",
      "suggestedStructure": "Create a main index note with hierarchical organization"
    }
  ]
}
\`\`\``;
    }

    /**
     * Generate comprehensive analysis instructions for all sections with optimized DDC approach
     * UPDATED for new structured ID system
     */
    private generateComprehensiveAnalysisPrompt(): string {
        // Combined prompt for backward compatibility
        return `${this.generateStructureAnalysisPrompt()}

---

${this.generateEvolutionAnalysisPrompt()}

---

${this.generateActionsAnalysisPrompt()}

**CRITICAL REMINDERS**:
1. Notes are already classified with DDC section codes in their knowledgeDomain field
2. Focus on providing accurate summary indicators and network analysis
3. Your response MUST include the full JSON structure with all required sections:
   - knowledgeDomainDistribution with summary
   - knowledgeNetwork
   - knowledgeGaps
4. Provide accurate summary indicators (topDomain, bridgeMaker, growthTrend, recentFocus)
5. Do NOT return a template response - analyze the actual content and provide real insights`;
    }

    /**
     * NEW: Process AI response and build hierarchy for D3 visualization
     */
    public async processAIResponseForVisualization(
        aiResponse: string, 
        analysisData: VaultAnalysisData
    ): Promise<HierarchicalDomain[]> {
        // Instead of parsing AI response, build hierarchy directly from vault analysis data
        console.log('Building domain hierarchy directly from vault analysis data for visualization');
        return this.buildHierarchyFromVaultData(analysisData);
    }

    /**
     * Check if a section ID is valid in the DDC template
     */
    private isValidDDCSectionId(sectionId: string): boolean {
        // First check if it's in our loaded sections list
        if (this.ddcSections[sectionId]) {
            return true;
        }
        
        // Try to normalize the section ID format
        let normalizedId = sectionId;
        
        // Handle formats like "004" or "4" instead of "0-0-4"
        if (!sectionId.includes('-')) {
            // Try to convert numeric format to DDC format
            if (sectionId.length === 3) {
                // Format like "004" -> "0-0-4"
                normalizedId = `${sectionId[0]}-${sectionId[1]}-${sectionId[2]}`;
            } else if (sectionId.length === 1) {
                // Format like "4" -> "0-0-4" (assuming it's in the first division)
                normalizedId = `0-0-${sectionId}`;
            }
        }
        
        // Check if normalized ID is valid
        if (this.ddcSections[normalizedId]) {
            console.log(`Normalized section ID ${sectionId} to ${normalizedId}`);
            return true;
        }
        
        // If still not found, try to match by extracting numbers
        const numbers = sectionId.match(/\d+/g);
        if (numbers && numbers.length === 3) {
            const constructed = `${numbers[0]}-${numbers[1]}-${numbers[2]}`;
            if (this.ddcSections[constructed]) {
                console.log(`Constructed valid section ID ${constructed} from ${sectionId}`);
                return true;
            }
        }
        
        return false;
    }

    /**
     * NEW: Get section information by ID
     */
    public getDDCSectionInfo(sectionId: string): {id: string, name: string, division: string, mainClass: string} | null {
        return this.ddcSectionsList.find(section => section.id === sectionId) || null;
    }

    /**
     * NEW: Get all sections within a specific division
     */
    public getSectionsInDivision(divisionId: string): Array<{id: string, name: string, division: string, mainClass: string}> {
        return this.ddcSectionsList.filter(section => 
            this.getDivisionIdFromSection(section.id) === divisionId
        );
    }

    /**
     * NEW: Get all sections within a specific class
     */
    public getSectionsInClass(classId: string): Array<{id: string, name: string, division: string, mainClass: string}> {
        return this.ddcSectionsList.filter(section => 
            this.getClassIdFromSection(section.id) === classId
        );
    }

    /**
     * Get a map from DDC section code to section name
     */
    public getDDCCodeToNameMap(): Map<string, string> {
        const map = new Map<string, string>();
        
        // Add section names from the sections list
        this.ddcSectionsList.forEach(section => {
            map.set(section.id, section.name);
        });
        
        // Add main class names from the DDC template
        if (this.ddcTemplate && this.ddcTemplate.ddc_23_summaries && this.ddcTemplate.ddc_23_summaries.classes) {
            this.ddcTemplate.ddc_23_summaries.classes.forEach(cls => {
                map.set(cls.id, cls.name);
            });
        }
        
        // Add any manually defined class and division names
        Object.entries(this.ddcMainClasses).forEach(([code, name]) => {
            map.set(code, name);
        });
        
        Object.entries(this.ddcDivisions).forEach(([code, name]) => {
            map.set(code, name);
        });
        
        Object.entries(this.ddcSections).forEach(([code, name]) => {
            map.set(code, name);
        });
        
        return map;
    }

    /**
     * Helper method to flatten object keys for deep searching
     */
    private flattenObjectKeys(obj: any, prefix = ''): string[] {
        let keys: string[] = [];
        
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const newKey = prefix ? `${prefix}.${key}` : key;
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    keys = keys.concat(this.flattenObjectKeys(obj[key], newKey));
                } else {
                    keys.push(newKey);
                }
            }
        }
        
        return keys;
    }

    /**
     * Helper method to get a nested property using a path string
     */
    private getNestedProperty(obj: any, path: string): any {
        const parts = path.split('.');
        let current = obj;
        
        for (const part of parts) {
            if (current === null || current === undefined) {
                return undefined;
            }
            current = current[part];
        }
        
        return current;
    }

    // NEW: Load analysis context once for all tab-specific analyses
    private async loadAnalysisContext(analysisData: VaultAnalysisData): Promise<void> {
        try {
            // Check if context is already loaded in AIModelService
            if (this.aiService.isContextLoaded()) {
                console.log('Analysis context already loaded, skipping load');
                this.contextLoaded = true;
                return;
            }
            
            // Convert analysis data to JSON string - use compact format to save tokens
            const jsonData = JSON.stringify(analysisData);
            
            // Split into chunks
            const chunks = this.chunkJsonData(jsonData);
            const isChunked = chunks.length > 1;
            
            console.log(`Loading analysis context: ${isChunked ? `${chunks.length} chunks` : 'single chunk'}`);
            
            // Stage 1: Send all data chunks as background context
            for (let i = 0; i < chunks.length; i++) {
                let contextPrompt: string;
                
                if (isChunked) {
                    // Multi-chunk format with chunk information
                    contextPrompt = `This is chunk ${i + 1} of ${chunks.length} containing vault analysis data for an upcoming knowledge analysis task. 
                    
IMPORTANT: Store this data in your context for the next step. DO NOT generate a full analysis yet. 
Simply confirm receipt with "Received chunk ${i + 1}/${chunks.length}" and wait for all chunks and final instructions.

CHUNK DATA ${i + 1}/${chunks.length}:
${chunks[i]}`;
                } else {
                    // Single chunk format (original vault data)
                    contextPrompt = `I'm providing you with complete vault analysis data for an upcoming knowledge analysis task. 
                    
IMPORTANT: Store this data in your context for the next step. DO NOT generate a full analysis yet.
Simply confirm receipt with "Received complete vault data" and wait for analysis instructions.

VAULT ANALYSIS DATA:
${chunks[i]}`;
                }

                console.log(`Processing chunk ${i+1}/${chunks.length}...`);
                const response = await this.aiService.storeDataChunk(contextPrompt, i + 1, chunks.length);
                
                // Add delays between chunks for rate limiting (only needed for multiple chunks)
                if (isChunked && i < chunks.length - 1) {
                    const delay = 2500;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            
            // Mark context as loaded
            this.contextLoaded = true;
            
            // Brief pause after loading context
            const pauseDelay = isChunked ? 3000 : 1000;
            await new Promise(resolve => setTimeout(resolve, pauseDelay));
            
        } catch (error) {
            console.error('ERROR - Failed to load analysis context:', error);
            throw new Error(`Failed to load analysis context: ${error.message}`);
        }
    }

    // NEW: Generate Knowledge Structure Analysis
    public async generateKnowledgeStructureAnalysis(): Promise<StructureAnalysisData> {
        try {
            console.log('Generating Knowledge Structure Analysis...');
            
            const analysisData = await this.loadVaultAnalysisData();
            if (!analysisData) {
                throw new Error('No vault analysis data found. Please generate vault analysis first.');
            }
            
            // Ensure DDC template is loaded
            console.log('Checking DDC template status: ', {
                templateLoaded: !!this.ddcTemplate,
                sectionsListLength: this.ddcSectionsList.length
            });
            
            if (!this.ddcTemplate) {
                console.log('DDC template not loaded, attempting to load it now...');
                try {
                    await this.loadDDCTemplate();
                    console.log('DDC template loaded successfully on second attempt');
                } catch (ddcError) {
                    console.error('Failed to load DDC template on second attempt:', ddcError);
                    throw new Error(`DDC template loading failed: ${ddcError.message}. Please ensure the DDC-template.json file is properly copied to the plugin directory.`);
                }
            }
            
            if (!this.ddcTemplate || this.ddcSectionsList.length === 0) {
                throw new Error('DDC template not loaded or empty. Please ensure the DDC-template.json file is properly copied to the plugin directory.');
            }
            
            // Ensure context is loaded
            if (!this.contextLoaded) {
                await this.loadAnalysisContext(analysisData);
            }
            
            // Generate structure-specific analysis
            const structurePrompt = `Using the vault analysis data I provided earlier, generate a focused analysis for the Knowledge Structure tab following these exact instructions:

IMPORTANT: You MUST respond with properly formatted JSON in code blocks as specified. Do not say you're waiting for data or need more information - all required data has already been provided.

${this.generateStructureAnalysisPrompt()}

CRITICAL REMINDERS:
1. Notes are already classified with DDC section codes in their knowledgeDomain field
2. Focus on providing accurate summary indicators and network analysis
3. Your response MUST include the full JSON structure with all required sections
4. Do NOT return a template response - analyze the actual content and provide real insights`;

            // Use the new tab-specific analysis method
            const response = await this.aiService.generateTabAnalysis('structure', structurePrompt);
            
            // Parse the structure-specific response
            const structureData = this.parseKnowledgeStructure(response.result, analysisData);
            
            // Create structured analysis data
            const tabData: StructureAnalysisData = {
                generatedAt: new Date().toISOString(),
                sourceAnalysisId: this.generateAnalysisId(analysisData),
                apiProvider: 'Google Gemini',
                tokenUsage: response.tokenUsage || { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 },
                rawAIResponse: response.result,
                knowledgeStructure: structureData
            };
            
            // Cache the results
            await this.cacheTabAnalysis('structure', tabData);
            
            return tabData;
        } catch (error) {
            console.error('Failed to generate Knowledge Structure Analysis:', error);
            throw error;
        }
    }

    // NEW: Generate Knowledge Evolution Analysis
    public async generateKnowledgeEvolutionAnalysis(): Promise<EvolutionAnalysisData> {
        try {
            console.log('Generating Knowledge Evolution Analysis...');
            
            const analysisData = await this.loadVaultAnalysisData();
            if (!analysisData) {
                throw new Error('No vault analysis data found. Please generate vault analysis first.');
            }
            
            // Ensure context is loaded
            if (!this.contextLoaded) {
                await this.loadAnalysisContext(analysisData);
            }
            
            // Generate evolution-specific analysis
            const evolutionPrompt = `Using the vault analysis data I provided earlier, generate a focused analysis for the Knowledge Evolution tab following these exact instructions:

IMPORTANT: You MUST respond with properly formatted JSON in code blocks as specified. Do not say you're waiting for data or need more information - all required data has already been provided.

${this.generateEvolutionAnalysisPrompt()}

CRITICAL: Your response MUST include all required JSON objects in code blocks exactly as specified in the instructions.`;

            // Use the new tab-specific analysis method
            const response = await this.aiService.generateTabAnalysis('evolution', evolutionPrompt);
            
            // Parse the evolution-specific response
            const evolutionData = this.parseKnowledgeEvolution(response.result, analysisData);
            
            // Create structured analysis data
            const tabData: EvolutionAnalysisData = {
                generatedAt: new Date().toISOString(),
                sourceAnalysisId: this.generateAnalysisId(analysisData),
                apiProvider: 'Google Gemini',
                tokenUsage: response.tokenUsage || { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 },
                rawAIResponse: response.result,
                knowledgeEvolution: evolutionData
            };
            
            // Cache the results
            await this.cacheTabAnalysis('evolution', tabData);
            
            return tabData;
        } catch (error) {
            console.error('Failed to generate Knowledge Evolution Analysis:', error);
            throw error;
        }
    }

    // NEW: Generate Recommended Actions Analysis
    public async generateRecommendedActionsAnalysis(): Promise<ActionsAnalysisData> {
        try {
            console.log('Generating Recommended Actions Analysis...');
            
            const analysisData = await this.loadVaultAnalysisData();
            if (!analysisData) {
                throw new Error('No vault analysis data found. Please generate vault analysis first.');
            }
            
            // Ensure context is loaded
            if (!this.contextLoaded) {
                await this.loadAnalysisContext(analysisData);
            }
            
            // Generate actions-specific analysis
            const actionsPrompt = `Using the vault analysis data I provided earlier, generate a focused analysis for the Recommended Actions tab following these exact instructions:

IMPORTANT: You MUST respond with properly formatted JSON in code blocks as specified. Do not say you're waiting for data or need more information - all required data has already been provided.

${this.generateActionsAnalysisPrompt()}

CRITICAL: Your response MUST include all required JSON objects in code blocks exactly as specified in the instructions.`;

            // Use the new tab-specific analysis method
            const response = await this.aiService.generateTabAnalysis('actions', actionsPrompt);
            
            // Parse the actions-specific response
            const actionsData = this.parseRecommendedActions(response.result, analysisData);
            
            // Create structured analysis data
            const tabData: ActionsAnalysisData = {
                generatedAt: new Date().toISOString(),
                sourceAnalysisId: this.generateAnalysisId(analysisData),
                apiProvider: 'Google Gemini',
                tokenUsage: response.tokenUsage || { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 },
                rawAIResponse: response.result,
                recommendedActions: actionsData
            };
            
            // Cache the results
            await this.cacheTabAnalysis('actions', tabData);
            
            return tabData;
        } catch (error) {
            console.error('Failed to generate Recommended Actions Analysis:', error);
            throw error;
        }
    }

    // NEW: Cache tab-specific analysis
    private async cacheTabAnalysis(tabName: string, data: TabAnalysisData): Promise<void> {
        try {
            // Ensure responses directory exists
            await this.ensureResponsesDirectory();
            
            // Store the tab-specific analysis in the responses directory
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/responses/${tabName}-analysis.json`;
            await this.app.vault.adapter.write(filePath, JSON.stringify(data, null, 2));
            console.log(`${tabName} analysis cached successfully in responses directory`);
        } catch (error) {
            console.error(`Failed to cache ${tabName} analysis:`, error);
        }
    }

    /**
     * Copy the DDC template file from the source directory to the plugin directory
     * This is a fallback mechanism if the file is not found in the expected location
     */
    private async copyDDCTemplateFile(): Promise<boolean> {
        try {
            // Check if the file exists in the source directory
            const sourceFile = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/src/ai/DDC-template.json`;
            const targetFile = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/DDC-template.json`;
            
            // Try to read from source directory
            let sourceContent: string | null = null;
            
            try {
                sourceContent = await this.app.vault.adapter.read(sourceFile);
                console.log(`Found DDC template in source directory: ${sourceFile}`);
            } catch (error) {
                console.error('DDC template not found in source directory');
                return false;
            }
            
            // Write to target location
            await this.app.vault.adapter.write(targetFile, sourceContent);
            console.log(`Successfully copied DDC template from ${sourceFile} to ${targetFile}`);
            
            return true;
        } catch (error) {
            console.error('Failed to copy DDC template file:', error);
            return false;
        }
    }

    /**
     * Public method to ensure the DDC template is loaded
     * This can be called from other classes to ensure the template is loaded before using it
     */
    public async ensureDDCTemplateLoaded(): Promise<boolean> {
        if (this.ddcTemplate) {
            return true; // Already loaded
        }
        
        try {
            await this.loadDDCTemplate();
            return this.ddcTemplate !== null;
        } catch (error) {
            console.error('Failed to load DDC template:', error);
            return false;
        }
    }
}