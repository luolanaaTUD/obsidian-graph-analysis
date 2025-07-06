import { App } from 'obsidian';
import { GraphAnalysisSettings } from '../types/types';
import { 
    KnowledgeStructureData,
    KnowledgeEvolutionData, 
    KnowledgeActionsData,
    TimelineAnalysis,
    TopicPatternsAnalysis,
    FocusShiftAnalysis,
    LearningVelocityAnalysis,
    EvolutionInsight,
    HierarchicalDomain,
    DomainConnection
} from './visualization/managers';
import { AIModelService, TokenUsage } from '../services/AIModelService';

export interface VaultAnalysisResult {
    id: string;
    title: string;
    summary: string;
    keywords: string;
    knowledgeDomain: string;
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
            
            // Extract domain distribution data
            const domainDistribution = parsedJson.knowledgeDomainDistribution;
            
            if (!domainDistribution || !domainDistribution.sectionClassification) {
                throw new Error('Invalid knowledge domain distribution data');
            }
            
            // Extract summary indicators
            const summaryIndicators = domainDistribution.summary || null;
            
            // Extract section classification - this is now the primary data structure
            const sectionClassification = domainDistribution.sectionClassification;
            
            // Log the number of sections for debugging
            const sectionCount = Object.keys(sectionClassification).length;
            console.log(`Found ${sectionCount} sections in AI classification response`);
            
            // Create a map of domains to notes for building the hierarchy
            const domainMap = new Map<string, VaultAnalysisResult[]>();
            
            // Process each note to extract its knowledge domain
            analysisData.results.forEach(note => {
                if (note.knowledgeDomain) {
                    // Split multiple domains if they exist
                    const domains = note.knowledgeDomain.split(',').map(d => d.trim());
                    
                    domains.forEach(domain => {
                        if (!domainMap.has(domain)) {
                            domainMap.set(domain, []);
                        }
                        domainMap.get(domain)!.push(note);
                    });
                }
            });
            
            // Build hierarchical domain structure from section classification
            const domainHierarchy = this.buildHierarchyFromSections(sectionClassification);
            
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
                    summaryIndicators ? `Growth trend: ${summaryIndicators.growthTrend.description}` : "No growth trend identified",
                    `Classified into ${sectionCount} different knowledge sections`
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
     * Build hierarchical domain structure from section classification
     * This builds a 2-level hierarchy: Main Class > Section (skipping Division level)
     */
    private buildHierarchyFromSections(
        sectionClassification: any
    ): HierarchicalDomain[] {
        // Create a map for the top-level main classes (based on the first digit of section ID)
        const classMap = new Map<string, HierarchicalDomain>();
        
        // Track section count for debugging
        let validSectionCount = 0;
        let invalidSectionCount = 0;
        
        // Process each section in the classification
        Object.entries(sectionClassification).forEach(([sectionId, sectionData]: [string, any]) => {
            if (!this.isValidDDCSectionId(sectionId)) {
                console.warn(`Invalid DDC section ID: ${sectionId}`);
                invalidSectionCount++;
                return;
            }
            
            validSectionCount++;
            
            // Extract class ID from the section ID (first digit)
            const classId = this.getClassIdFromSection(sectionId);
            
            // Get section info
            const sectionInfo = this.getDDCSectionInfo(sectionId);
            if (!sectionInfo) {
                console.warn(`Section info not found for: ${sectionId}`);
                return;
            }
            
            // Get or create main class node (top level)
            if (!classMap.has(classId)) {
                const className = this.ddcMainClasses[classId] || `Class ${classId}`;
                
                classMap.set(classId, {
                    name: className,
                    noteCount: 0,
                    children: [],
                    level: 1,
                    ddcCode: classId
                });
            }
            
            // Create section node (second level)
            const sectionNode: HierarchicalDomain = {
                name: sectionData.sectionName || sectionInfo.name,
                noteCount: sectionData.noteCount || 0,
                keywords: sectionData.keywords || [],
                level: 2,
                ddcCode: sectionId,
                parent: classId
            };
            
            // Add section to its parent main class
            const classNode = classMap.get(classId);
            if (classNode && classNode.children) {
                classNode.children.push(sectionNode);
                
                // Update note count for the main class
                classNode.noteCount += sectionNode.noteCount;
            }
        });
        
        // Log section processing results
        console.log(`Processed ${validSectionCount} valid sections and skipped ${invalidSectionCount} invalid sections`);
        console.log(`Created ${classMap.size} main class nodes in the hierarchy`);
        
        // Convert the map to an array and sort by note count (descending)
        return Array.from(classMap.values())
            .sort((a, b) => b.noteCount - a.noteCount);
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

        // Generate optimized sections list for AI prompt in JSON format
        const sectionsJson = JSON.stringify(
            this.ddcSectionsList.map(section => ({
                id: section.id,
                name: section.name
            }))
        );

        return `# KNOWLEDGE STRUCTURE ANALYSIS

## DDC Classification Task
You are analyzing a knowledge vault containing notes with various topics and domains. Your task is to map the knowledge domains in this vault to the Dewey Decimal Classification (DDC) system.

## Input Data Description
The input data contains:
- Notes with titles, summaries, and assigned knowledge domains
- Each note has a "knowledgeDomain" field containing user-defined categories
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
        "name": "Technology"
      },
      "bridgeMaker": {
        "score": 0.229,
        "name": "Ancient History"
      },
      "growthTrend": {
        "percentage": 62,
        "description": "Increasing Depth"
      },
      "recentFocus": {
        "count": 6,
        "name": "AI Ethics"
      }
    },
    "sectionClassification": {
      "0-0-4": {
        "sectionName": "Computer science",
        "noteCount": 15,
        "keywords": ["algorithms", "data structures", "programming"]
      },
      "1-5-1": {
        "sectionName": "Perception, movement, emotions & drives",
        "noteCount": 8,
        "keywords": ["cognition", "behavior", "mental processes"]
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

### Important Requirements for Classification
1. **Be comprehensive and detailed** - Analyze each note thoroughly and classify it into ALL relevant DDC sections
2. **Use DDC sections as the primary classification unit** - Each note should be classified into one or more DDC sections
3. **Notes can belong to multiple sections** - A single note may contain knowledge that spans multiple domains
4. **Count notes accurately** - The noteCount should reflect the actual number of notes touching that section
5. **Extract relevant keywords** - Use the note summaries and titles to identify key concepts for each section
6. **ONLY include sections that match the user's actual content** - Do not include sections that aren't represented in the vault
7. **Be generous with classification** - If a note contains even a small reference to a topic, include it in that section

### Important Requirements for Summary Indicators
1. **Top Domain**: The most prevalent knowledge domain by percentage of notes
2. **Bridge Maker**: The domain that best connects different areas based on betweenness centrality
3. **Growth Trend**: The domain showing the most growth based on recent note creation/modification
4. **Recent Focus**: The domain with the most notes created/modified in the last month

### Classification Approach
1. First, read each note's title, summary, and knowledge domain carefully
2. Identify ALL potential DDC sections that might apply to the note's content
3. For each identified section, check if it's in the DDC Sections Reference
4. Add the note to ALL relevant sections, not just the most obvious one
5. If a note touches on multiple subjects, it should be counted in multiple sections
6. Be specific - use the most detailed section that applies rather than a general one

**DDC Sections Reference**:
\`\`\`json
${sectionsJson}
\`\`\`

CRITICAL: Your response MUST include the full JSON structure with all required sections. Only include DDC sections that are actually represented in the user's vault content, but be thorough in identifying ALL relevant sections for each note.`;
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
1. Only include DDC sections that are ACTUALLY represented in the user's vault content
2. Use the actual knowledge domains from the data (found in the "knowledgeDomain" field)
3. Your response MUST include the full JSON structure with all required sections:
   - knowledgeDomainDistribution with summary and sectionClassification
   - knowledgeNetwork
   - knowledgeGaps
4. Provide accurate summary indicators (topDomain, bridgeMaker, growthTrend, recentFocus)
5. Focus on accurate classification of knowledge domains to DDC sections
6. Do NOT return a template response - analyze the actual content and provide real insights`;
    }

    /**
     * NEW: Process AI response and build hierarchy for D3 visualization
     */
    public async processAIResponseForVisualization(
        aiResponse: string, 
        analysisData: VaultAnalysisData
    ): Promise<HierarchicalDomain[]> {
        // Parse the AI response to extract section classification
        const knowledgeStructureMatch = aiResponse.match(/# KNOWLEDGE STRUCTURE ANALYSIS\s*([\s\S]*?)(?=\n# |\n---|\n# |$)/i);
        const knowledgeStructureSection = knowledgeStructureMatch ? knowledgeStructureMatch[1].trim() : '';
        
        // Build domain map from analysis data
        const domainMap = new Map<string, VaultAnalysisResult[]>();
        analysisData.results.forEach(note => {
            if (note.knowledgeDomain) {
                const domains = note.knowledgeDomain.split(',').map(d => d.trim());
                domains.forEach(domain => {
                    if (!domainMap.has(domain)) {
                        domainMap.set(domain, []);
                    }
                    domainMap.get(domain)!.push(note);
                });
            }
        });

        // Extract and validate section classification
        try {
            const jsonMatch = knowledgeStructureSection.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                const responseData = JSON.parse(jsonMatch[1]);
                if (responseData.sectionClassification) {
                    console.log('Processing DDC section classification for visualization');
                    
                    // Validate all section IDs exist in our template
                    const validSections: any = {};
                    Object.entries(responseData.sectionClassification).forEach(([sectionId, sectionData]) => {
                        if (this.isValidDDCSectionId(sectionId)) {
                            validSections[sectionId] = sectionData;
                        } else {
                            console.warn(`Invalid DDC section ID: ${sectionId}, skipping`);
                        }
                    });

                    return this.buildHierarchyFromSections(validSections);
                }
            }
        } catch (error) {
            console.error('Failed to process AI response for visualization:', error);
        }

        return [];
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
1. Only include DDC sections that are ACTUALLY represented in the user's vault content
2. Use the actual knowledge domains from the data (found in the "knowledgeDomain" field)
3. Your response MUST include the full JSON structure with all required sections:
   - knowledgeDomainDistribution with summary and sectionClassification
   - knowledgeNetwork
   - knowledgeGaps
4. Provide accurate summary indicators (topDomain, bridgeMaker, growthTrend, recentFocus)
5. Focus on accurate classification of knowledge domains to DDC sections
6. Do NOT return a template response - analyze the actual content and provide real insights`;

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