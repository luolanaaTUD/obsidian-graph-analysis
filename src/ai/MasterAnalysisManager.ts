import { App, requestUrl } from 'obsidian';
import { GraphAnalysisSettings } from '../types/types';

// Import interfaces from visualization managers for type consistency
import { KnowledgeStructureData } from './visualization/KnowledgeStructureManager';
import { KnowledgeEvolutionData } from './visualization/KnowledgeEvolutionManager';
import { KnowledgeActionsData } from './visualization/KnowledgeActionsManager';

export interface TokenUsage {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
}

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
}

export interface VaultAnalysisData {
    generatedAt: string;
    totalFiles: number;
    apiProvider: string;
    tokenUsage: TokenUsage;
    results: VaultAnalysisResult[];
}

export interface MasterAnalysisData {
    generatedAt: string;
    sourceAnalysisId: string; // Reference to vault-analysis.json used
    apiProvider: string;
    tokenUsage: TokenUsage;
    
    // Tab 2: Knowledge Structure
    knowledgeStructure: KnowledgeStructureData;
    
    // Tab 3: Knowledge Evolution  
    knowledgeEvolution: KnowledgeEvolutionData;
    
    // Tab 4: Recommended Actions
    recommendedActions: KnowledgeActionsData;
}

export class MasterAnalysisManager {
    private app: App;
    private settings: GraphAnalysisSettings;

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.settings = settings;
    }

    public async loadCachedMasterAnalysis(): Promise<MasterAnalysisData | null> {
        try {
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/master-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const data = JSON.parse(content);
            
            // Validate that the cached analysis matches current semantic analysis
            const currentAnalysisData = await this.loadVaultAnalysisData();
            if (currentAnalysisData && data?.sourceAnalysisId !== this.generateAnalysisId(currentAnalysisData)) {
                console.log('Cached master analysis is outdated, will regenerate');
                return null;
            }
            
            return data;
        } catch (error) {
            console.warn('No cached master analysis found:', error);
            return null;
        }
    }

    public async generateAndCacheMasterAnalysis(): Promise<MasterAnalysisData> {
        const analysisData = await this.loadVaultAnalysisData();
        if (!analysisData) {
            throw new Error('No vault analysis data found. Please generate vault analysis first.');
        }

        console.log('Generating master analysis with single AI call...');
        
        // Prepare comprehensive context for the single AI call
        const comprehensiveContext = this.prepareComprehensiveContext(analysisData);
        
        // Make single comprehensive AI call
        const masterInsights = await this.generateComprehensiveMasterInsights(comprehensiveContext);
        
        // Parse the comprehensive response into structured data
        const parsedInsights = this.parseMasterInsights(masterInsights, comprehensiveContext);

        // Create structured master analysis data
        const masterData: MasterAnalysisData = {
            generatedAt: new Date().toISOString(),
            sourceAnalysisId: this.generateAnalysisId(analysisData),
            apiProvider: 'Google Gemini',
            tokenUsage: { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 }, // TODO: Track tokens
            knowledgeStructure: parsedInsights.knowledgeStructure,
            knowledgeEvolution: parsedInsights.knowledgeEvolution,
            recommendedActions: parsedInsights.recommendedActions
        };

        // Cache the results
        await this.cacheMasterAnalysis(masterData);

        return masterData;
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

    private async cacheMasterAnalysis(data: MasterAnalysisData): Promise<void> {
        try {
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/master-analysis.json`;
            
            // Ensure the plugin directory exists
            const pluginDir = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis`;
            try {
                await this.app.vault.adapter.mkdir(pluginDir);
            } catch {
                // Directory might already exist
            }
            
            await this.app.vault.adapter.write(filePath, JSON.stringify(data, null, 2));
            console.log('Master analysis cached successfully');
        } catch (error) {
            console.error('Failed to cache master analysis:', error);
        }
    }

    private prepareComprehensiveContext(analysisData: VaultAnalysisData): any {
        const results = analysisData.results;
        
        // Create a comprehensive context for the single AI analysis
        const totalNotes = results.length;
        const totalWords = results.reduce((sum, note) => sum + note.wordCount, 0);
        const timeSpan = this.getTimeSpan(results);
        
        // Extract all unique domains and keywords
        const allDomains = new Set<string>();
        const allKeywords = new Set<string>();
        results.forEach(note => {
            if (note.knowledgeDomain) {
                note.knowledgeDomain.split(',').forEach(d => allDomains.add(d.trim().toLowerCase()));
            }
            if (note.keywords) {
                note.keywords.split(',').forEach(k => allKeywords.add(k.trim().toLowerCase()));
            }
        });

        // Group notes by time periods for evolution analysis
        const notesByPeriod = this.groupNotesByTimePeriod(results);
        
        // Create detailed period summaries
        const periodSummaries = Object.entries(notesByPeriod.quarters).map(([period, notes]: [string, VaultAnalysisResult[]]) => {
            const domains = new Set<string>();
            const keywords = new Set<string>();
            const noteCount = notes.length;
            const wordCount = notes.reduce((sum, note) => sum + note.wordCount, 0);
            
            notes.forEach(note => {
                if (note.knowledgeDomain) {
                    note.knowledgeDomain.split(',').forEach(d => domains.add(d.trim().toLowerCase()));
                }
                if (note.keywords) {
                    note.keywords.split(',').forEach(k => keywords.add(k.trim().toLowerCase()));
                }
            });
            
            // Include detailed note data for comprehensive analysis
            const noteDetails = notes.map(note => ({
                title: note.title,
                summary: note.summary,
                keywords: note.keywords,
                knowledgeDomain: note.knowledgeDomain,
                wordCount: note.wordCount,
                graphMetrics: note.graphMetrics
            }));
            
            return {
                period,
                noteCount,
                wordCount,
                domains: Array.from(domains),
                keywords: Array.from(keywords),
                avgWordsPerNote: noteCount > 0 ? Math.round(wordCount / noteCount) : 0,
                noteDetails
            };
        }).sort((a, b) => a.period.localeCompare(b.period));

        // Analyze graph centrality patterns
        const centralityAnalysis = this.analyzeCentralityPatterns(results);

        return {
            totalNotes,
            totalWords,
            timeSpan,
            totalDomains: allDomains.size,
            totalKeywords: allKeywords.size,
            periodSummaries,
            topDomains: Array.from(allDomains).slice(0, 30),
            topKeywords: Array.from(allKeywords).slice(0, 50),
            centralityAnalysis,
            allNoteDetails: results // Include full analysis for comprehensive insights
        };
    }

    private groupNotesByTimePeriod(results: VaultAnalysisResult[]): any {
        const periods: { [key: string]: VaultAnalysisResult[] } = {};
        
        results.forEach(result => {
            const date = new Date(result.modified || result.created);
            const quarterKey = `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
            
            if (!periods[quarterKey]) {
                periods[quarterKey] = [];
            }
            
            periods[quarterKey].push(result);
        });

        return { quarters: periods };
    }

    private getTimeSpan(results: VaultAnalysisResult[]): string {
        if (results.length === 0) return 'Unknown';
        
        const dates = results.map(note => new Date(note.modified || note.created)).sort((a, b) => a.getTime() - b.getTime());
        const firstDate = dates[0];
        const lastDate = dates[dates.length - 1];
        
        const diffTime = lastDate.getTime() - firstDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 30) {
            return `${diffDays} days`;
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            return `${months} month${months !== 1 ? 's' : ''}`;
        } else {
            const years = Math.floor(diffDays / 365);
            const remainingMonths = Math.floor((diffDays % 365) / 30);
            if (remainingMonths > 0) {
                return `${years} year${years !== 1 ? 's' : ''}, ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
            } else {
                return `${years} year${years !== 1 ? 's' : ''}`;
            }
        }
    }

    private analyzeCentralityPatterns(results: VaultAnalysisResult[]): any {
        const notesWithMetrics = results.filter(note => note.graphMetrics);
        
        if (notesWithMetrics.length === 0) {
            return {
                bridges: [],
                foundations: [],
                authorities: [],
                hasMetrics: false
            };
        }

        // Sort by different centrality measures
        const bridges = notesWithMetrics
            .sort((a, b) => (b.graphMetrics?.betweennessCentrality || 0) - (a.graphMetrics?.betweennessCentrality || 0))
            .slice(0, 10);
            
        const foundations = notesWithMetrics
            .sort((a, b) => (b.graphMetrics?.closenessCentrality || 0) - (a.graphMetrics?.closenessCentrality || 0))
            .slice(0, 10);
            
        const authorities = notesWithMetrics
            .sort((a, b) => (b.graphMetrics?.eigenvectorCentrality || 0) - (a.graphMetrics?.eigenvectorCentrality || 0))
            .slice(0, 10);

        return {
            bridges,
            foundations,
            authorities,
            hasMetrics: true
        };
    }

    private async generateComprehensiveMasterInsights(context: any): Promise<string> {
        const prompt = `You are an AI knowledge analyst tasked with providing comprehensive insights about a user's knowledge vault. Based on the complete vault analysis data provided, generate detailed insights for three key areas: Knowledge Structure, Knowledge Evolution, and Recommended Actions.

## VAULT OVERVIEW
- Total Notes: ${context.totalNotes}
- Total Words: ${context.totalWords.toLocaleString()}
- Knowledge Journey: ${context.timeSpan}
- Domains Covered: ${context.totalDomains}
- Unique Keywords: ${context.totalKeywords}

## GLOBAL KNOWLEDGE LANDSCAPE
**Primary Domains**: ${context.topDomains.slice(0, 15).join(', ')}
**Key Research Themes**: ${context.topKeywords.slice(0, 20).join(', ')}

## GRAPH ANALYSIS CONTEXT
${context.centralityAnalysis.hasMetrics ? `
**Top Knowledge Bridges**: ${context.centralityAnalysis.bridges.slice(0, 5).map((n: any) => n.title).join(', ')}
**Knowledge Foundations**: ${context.centralityAnalysis.foundations.slice(0, 5).map((n: any) => n.title).join(', ')}
**Knowledge Authorities**: ${context.centralityAnalysis.authorities.slice(0, 5).map((n: any) => n.title).join(', ')}
` : 'Graph metrics not available - focus on semantic analysis.'}

## TEMPORAL EVOLUTION DATA
${context.periodSummaries.map((period: any) => `
**${period.period}**: ${period.noteCount} notes, ${period.wordCount.toLocaleString()} words
- Domains: ${period.domains.slice(0, 5).join(', ')}
- Key Themes: ${period.keywords.slice(0, 8).join(', ')}
- Sample Notes: ${period.noteDetails.slice(0, 3).map((note: any) => `"${note.title}" (${note.knowledgeDomain})`).join(', ')}
`).join('')}

## DETAILED NOTE ANALYSIS (Sample)
${context.allNoteDetails.slice(0, 10).map((note: any) => `
• "${note.title}" (${note.wordCount} words)
  Domain: ${note.knowledgeDomain}
  Summary: ${note.summary}
  Keywords: ${note.keywords}
  ${note.graphMetrics ? `Graph Metrics: Degree=${note.graphMetrics.degreeCentrality?.toFixed(3)}, Betweenness=${note.graphMetrics.betweennessCentrality?.toFixed(3)}` : ''}
`).join('')}

---

Please provide comprehensive analysis in the following format. Be specific, actionable, and reference actual note content and patterns from the data:

# KNOWLEDGE STRUCTURE ANALYSIS

## Domain Distribution Insights
[Analyze the distribution of knowledge domains, identify patterns, dominant areas, and gaps]

## Knowledge Network Analysis  
[${context.centralityAnalysis.hasMetrics ? 'Analyze the graph structure using centrality metrics' : 'Analyze knowledge connections using semantic relationships'}]

## Knowledge Gaps
[Identify 3-5 specific knowledge gaps or underexplored areas]

## Structure Insights
[Provide 2-3 key insights about knowledge organization]

---

# KNOWLEDGE EVOLUTION ANALYSIS

## Timeline Narrative
[Describe the overall learning journey and growth patterns]

## Learning Phases
[Identify distinct phases in the knowledge development]

## Topic Introduction Patterns
[Analyze how new topics are introduced over time]

## Focus Shifts
[Identify major shifts in intellectual focus]

## Learning Velocity Trends
[Analyze productivity and learning velocity patterns]

## Evolution Insights
[Provide 2-3 key insights about knowledge evolution]

---

# RECOMMENDED ACTIONS

## Knowledge Maintenance (5 items)
[Identify specific notes that need review, updates, or improvements]

## Connection Opportunities (5 items)
[Suggest specific links between notes with rationale]

## Learning Paths (3 items)
[Recommend learning sequences based on knowledge structure]

## Organization Suggestions (5 items)
[Suggest improvements for tags, folders, or structure]

---

Make your response specific, actionable, and grounded in the actual vault data. Reference specific notes, domains, and patterns from the analysis.`;

        return this.callGeminiForMasterAnalysis(prompt);
    }

    private async callGeminiForMasterAnalysis(prompt: string): Promise<string> {
        if (!this.settings?.geminiApiKey || this.settings.geminiApiKey.trim() === '') {
            throw new Error('Gemini API key not configured');
        }

        const apiKey = this.settings.geminiApiKey;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`;

        const requestBody = { 
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.4,
                topK: 40,
                topP: 0.9,
                maxOutputTokens: 8000, // Increased for comprehensive analysis
            }
        };

        try {
            const response = await requestUrl({
                url: url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (response.status !== 200) {
                throw new Error(`Gemini API returned status ${response.status}: ${response.text}`);
            }

            const data = response.json;
            
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Invalid response format from Gemini API');
            }

            return data.candidates[0].content.parts[0].text.trim();
        } catch (error) {
            console.error('Gemini API error in master analysis:', error);
            throw error;
        }
    }

    private parseMasterInsights(rawResponse: string, context: any): any {
        // Parse the comprehensive AI response into structured data for each tab
        
        // Extract sections using markdown headers
        const structureSection = this.extractSection(rawResponse, 'KNOWLEDGE STRUCTURE ANALYSIS');
        const evolutionSection = this.extractSection(rawResponse, 'KNOWLEDGE EVOLUTION ANALYSIS');
        const actionsSection = this.extractSection(rawResponse, 'RECOMMENDED ACTIONS');

        return {
            knowledgeStructure: this.parseKnowledgeStructure(structureSection, context),
            knowledgeEvolution: this.parseKnowledgeEvolution(evolutionSection, context),
            recommendedActions: this.parseRecommendedActions(actionsSection, context)
        };
    }

    private extractSection(text: string, sectionHeader: string): string {
        const sectionStart = text.indexOf(`# ${sectionHeader}`);
        if (sectionStart === -1) return '';
        
        const nextSectionStart = text.indexOf('\n# ', sectionStart + 1);
        return nextSectionStart === -1 
            ? text.substring(sectionStart)
            : text.substring(sectionStart, nextSectionStart);
    }

    private parseKnowledgeStructure(section: string, context: any): KnowledgeStructureData {
        // Parse the knowledge structure section
        const domainDistribution = context.topDomains.slice(0, 10).map((domain: string) => {
            const notesInDomain = context.allNoteDetails.filter((note: any) => 
                note.knowledgeDomain?.toLowerCase().includes(domain.toLowerCase())
            );
            const avgCentrality = notesInDomain.length > 0 
                ? notesInDomain.reduce((sum: number, note: any) => 
                    sum + (note.graphMetrics?.degreeCentrality || 0), 0) / notesInDomain.length
                : 0;

            return {
                domain,
                noteCount: notesInDomain.length,
                avgCentrality,
                keywords: context.topKeywords.filter((k: string) => 
                    notesInDomain.some((note: any) => 
                        note.keywords?.toLowerCase().includes(k.toLowerCase())
                    )
                ).slice(0, 5)
            };
        });

        const knowledgeNetwork = {
            bridges: context.centralityAnalysis.bridges.slice(0, 5).map((note: any) => ({
                title: note.title,
                score: note.graphMetrics?.betweennessCentrality || 0,
                connections: [] // Would need to calculate actual connections
            })),
            foundations: context.centralityAnalysis.foundations.slice(0, 5).map((note: any) => ({
                title: note.title,
                score: note.graphMetrics?.closenessCentrality || 0,
                reach: Math.round((note.graphMetrics?.closenessCentrality || 0) * 100)
            })),
            authorities: context.centralityAnalysis.authorities.slice(0, 5).map((note: any) => ({
                title: note.title,
                score: note.graphMetrics?.eigenvectorCentrality || 0,
                influence: Math.round((note.graphMetrics?.eigenvectorCentrality || 0) * 100)
            }))
        };

        return {
            domainDistribution,
            knowledgeNetwork,
            insights: this.extractInsights(section),
            gaps: this.extractKnowledgeGaps(section)
        };
    }

    private parseKnowledgeEvolution(section: string, context: any): KnowledgeEvolutionData {
        // Parse the knowledge evolution section using existing interfaces
        const timeline = {
            narrative: {
                title: 'Learning Journey Overview',
                content: this.extractNarrative(section),
                keyPoints: this.extractKeyPoints(section),
                recommendations: []
            },
            phases: context.periodSummaries.map((period: any) => ({
                period: period.period,
                description: `${period.noteCount} notes created with focus on ${period.domains.slice(0, 3).join(', ')}`,
                keyDomains: period.domains.slice(0, 5),
                metrics: {
                    noteCount: period.noteCount,
                    wordCount: period.wordCount,
                    avgWordsPerNote: period.avgWordsPerNote
                }
            })),
            trends: {
                productivity: 'stable' as const,
                diversity: 'expanding' as const,
                depth: 'increasing' as const
            }
        };

        // Create other evolution analyses with parsed data
        const topicPatterns = this.parseTopicPatterns(section, context);
        const focusShift = this.parseFocusShift(section, context);
        const learningVelocity = this.parseLearningVelocity(section, context);

        return {
            timeline,
            topicPatterns,
            focusShift,
            learningVelocity,
            insights: this.extractInsights(section)
        };
    }

    private parseRecommendedActions(section: string, context: any): KnowledgeActionsData {
        // Parse the recommended actions section
        return {
            maintenance: this.parseMaintenanceActions(section, context),
            connections: this.parseConnectionSuggestions(section, context),
            learningPaths: this.parseLearningPaths(section, context),
            organization: this.parseOrganizationSuggestions(section, context)
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

    // Placeholder parsing methods - would implement full parsing logic
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
        // Parse maintenance actions from the AI response
        return [];
    }

    private parseConnectionSuggestions(section: string, context: any): any[] {
        // Parse connection suggestions from the AI response
        return [];
    }

    private parseLearningPaths(section: string, context: any): any[] {
        // Parse learning paths from the AI response
        return [];
    }

    private parseOrganizationSuggestions(section: string, context: any): any[] {
        // Parse organization suggestions from the AI response
        return [];
    }

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
    }
}