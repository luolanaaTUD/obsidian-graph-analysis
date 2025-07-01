import { App, requestUrl } from 'obsidian';
import { GraphAnalysisSettings } from '../types/types';
import { 
    KnowledgeStructureData,
    KnowledgeEvolutionData, 
    KnowledgeActionsData,
    TimelineAnalysis,
    TopicPatternsAnalysis,
    FocusShiftAnalysis,
    LearningVelocityAnalysis,
    EvolutionInsight
} from './visualization/managers';

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
    private readonly MAX_CHUNK_SIZE = 600000; // Increased chunk size to take advantage of 1M TPM limit

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

        console.log('Generating master analysis using chunked JSON approach...');
        
        // Use chunked strategy to send complete JSON data
        const masterInsights = await this.generateMasterInsightsWithChunking(analysisData);
        
        // Parse the comprehensive response into structured data
        const parsedInsights = this.parseMasterInsights(masterInsights, analysisData);

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

    private async generateMasterInsightsWithChunking(analysisData: VaultAnalysisData): Promise<string> {
        try {
            // Convert analysis data to JSON string
            const jsonData = JSON.stringify(analysisData, null, 2);
            
            console.log(`Vault data size: ${jsonData.length} characters`);
            
            // With Gemini 2.0 Flash-Lite's 1M TPM limit, we can send much larger payloads
            // Only chunk if data is extremely large (>800k characters)
            if (jsonData.length <= this.MAX_CHUNK_SIZE) {
                console.log('Sending complete data in single request (optimal for 2.0 Flash-Lite)...');
                return await this.sendCompleteAnalysisRequest(jsonData);
            } else {
                console.log(`Data exceeds ${this.MAX_CHUNK_SIZE} characters, using minimal chunking...`);
                const chunks = this.chunkJsonData(jsonData);
                console.log(`Sending vault data in ${chunks.length} chunk(s) to AI...`);
                
                // Send chunks with appropriate delays for 30 RPM limit
                for (let i = 0; i < chunks.length - 1; i++) {
                    console.log(`Sending chunk ${i + 1}/${chunks.length}...`);
                    await this.sendDataChunk(chunks[i], i + 1, chunks.length);
                    
                    // Respect 30 RPM limit: wait 2+ seconds between requests
                    await new Promise(resolve => setTimeout(resolve, 2500));
                }
                
                // Send final chunk with analysis instructions
                console.log(`Sending final chunk with analysis instructions...`);
                const finalResponse = await this.sendFinalChunkWithInstructions(
                    chunks[chunks.length - 1], 
                    chunks.length, 
                    chunks.length
                );
                
                return finalResponse;
            }
            
        } catch (error) {
            console.error('Error in master analysis:', error);
            throw error;
        }
    }

    /**
     * New method: Send complete analysis in single request (optimal for 2.0 Flash-Lite)
     */
    private async sendCompleteAnalysisRequest(jsonData: string): Promise<string> {
        const prompt = `I have complete vault analysis data that I need you to analyze comprehensively. Please provide insights in the following structured format:

# KNOWLEDGE STRUCTURE ANALYSIS

## Domain Distribution Insights
[Analyze knowledge domain distribution, identify dominant areas and gaps using the knowledgeDomain field]

## Centrality-Based Network Analysis
[Use centralityRankings to identify:
- Top Knowledge Bridges (low betweennessRank = high betweenness centrality)
- Top Knowledge Foundations (low closenessRank = high closeness centrality)  
- Top Knowledge Authorities (low eigenvectorRank = high eigenvector centrality)]

## Knowledge Gaps
[Identify 3-5 underexplored knowledge areas]

---

# KNOWLEDGE EVOLUTION ANALYSIS

## Timeline Narrative
[Analyze note creation/modification patterns over time using created/modified fields]

## Topic Introduction Patterns
[Track how new knowledge domains emerge over time]

## Learning Velocity Trends
[Analyze productivity patterns using wordCount and time data]

---

# RECOMMENDED ACTIONS

## Knowledge Maintenance (5 items)
[Identify specific notes needing updates based on centrality and content]

## Connection Opportunities (5 items)
[Suggest note connections using centrality rankings and knowledge domains]

## Learning Paths (3 paths)
[Recommend learning sequences based on knowledge structure]

## Organization Suggestions (5 items)
[Suggest structural improvements using domain and keyword analysis]

Please reference specific notes, rankings, and data patterns from the complete dataset in your analysis.

VAULT ANALYSIS DATA:
${jsonData}`;

        return await this.callGeminiFlashLite(prompt);
    }

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
        
        console.log(`Split into ${chunks.length} large chunks of average size ${Math.round(jsonData.length / chunks.length)} characters`);
        return chunks;
    }

    /**
     * Send a data chunk to AI for storage (respecting 30 RPM limit)
     */
    private async sendDataChunk(chunk: string, chunkIndex: number, totalChunks: number): Promise<void> {
        const prompt = `Store chunk ${chunkIndex}/${totalChunks} for later analysis. Respond only with "OK ${chunkIndex}".

CHUNK ${chunkIndex}/${totalChunks}:
${chunk}`;

        await this.callGeminiFlashLiteForDataChunk(prompt);
        console.log(`Chunk ${chunkIndex}/${totalChunks} processed successfully`);
    }

    /**
     * Optimized API call for Gemini 2.0 Flash-Lite data chunks
     */
    private async callGeminiFlashLiteForDataChunk(prompt: string, retryCount: number = 0): Promise<string> {
        if (!this.settings?.geminiApiKey || this.settings.geminiApiKey.trim() === '') {
            throw new Error('Gemini API key not configured');
        }

        const apiKey = this.settings.geminiApiKey;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;

        const requestBody = { 
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.1,
                topK: 10,
                topP: 0.5,
                maxOutputTokens: 50, // Brief acknowledgment only
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
                // Handle rate limiting with exponential backoff for 30 RPM limit
                if (response.status === 429 && retryCount < 3) {
                    const waitTime = Math.pow(2, retryCount) * 3000; // 3s, 6s, 12s
                    console.log(`Rate limited on data chunk. Retrying in ${waitTime/1000}s... (attempt ${retryCount + 1}/3)`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    return await this.callGeminiFlashLiteForDataChunk(prompt, retryCount + 1);
                }
                
                throw new Error(`Gemini API returned status ${response.status}: ${response.text}`);
            }

            const data = response.json;
            
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Invalid response format from Gemini API');
            }

            return data.candidates[0].content.parts[0].text.trim();
        } catch (error) {
            console.error('Gemini API error in data chunk:', error);
            
            const errorMessage = (error as Error).message;
            if (errorMessage.includes('status 429') && retryCount < 3) {
                const waitTime = Math.pow(2, retryCount) * 3000;
                console.log(`Rate limit detected in data chunk error. Retrying in ${waitTime/1000}s... (attempt ${retryCount + 1}/3)`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                return await this.callGeminiFlashLiteForDataChunk(prompt, retryCount + 1);
            }
            
            throw error;
        }
    }

    /**
     * Send final chunk with analysis instructions
     */
    private async sendFinalChunkWithInstructions(
        finalChunk: string, 
        chunkIndex: number, 
        totalChunks: number
    ): Promise<string> {
        const prompt = `This is the final chunk ${chunkIndex}/${totalChunks} of the vault analysis data, followed by analysis instructions.

FINAL CHUNK ${chunkIndex}/${totalChunks}:
${finalChunk}

---

Now that you have the complete vault analysis dataset, please analyze it comprehensively and provide insights in the following structured format:

# KNOWLEDGE STRUCTURE ANALYSIS

## Domain Distribution Insights
[Analyze knowledge domain distribution, identify dominant areas and gaps using the knowledgeDomain field]

## Centrality-Based Network Analysis
[Use centralityRankings to identify:
- Top Knowledge Bridges (low betweennessRank = high betweenness centrality)
- Top Knowledge Foundations (low closenessRank = high closeness centrality)  
- Top Knowledge Authorities (low eigenvectorRank = high eigenvector centrality)]

## Knowledge Gaps
[Identify 3-5 underexplored knowledge areas]

---

# KNOWLEDGE EVOLUTION ANALYSIS

## Timeline Narrative
[Analyze note creation/modification patterns over time using created/modified fields]

## Topic Introduction Patterns
[Track how new knowledge domains emerge over time]

## Learning Velocity Trends
[Analyze productivity patterns using wordCount and time data]

---

# RECOMMENDED ACTIONS

## Knowledge Maintenance (5 items)
[Identify specific notes needing updates based on centrality and content]

## Connection Opportunities (5 items)
[Suggest note connections using centrality rankings and knowledge domains]

## Learning Paths (3 paths)
[Recommend learning sequences based on knowledge structure]

## Organization Suggestions (5 items)
[Suggest structural improvements using domain and keyword analysis]

Please reference specific notes, rankings, and data patterns from the complete dataset in your analysis.`;

        return await this.callGeminiFlashLite(prompt);
    }

    /**
     * Main API call method for Gemini 2.0 Flash-Lite
     */
    private async callGeminiFlashLite(prompt: string, retryCount: number = 0): Promise<string> {
        if (!this.settings?.geminiApiKey || this.settings.geminiApiKey.trim() === '') {
            throw new Error('Gemini API key not configured');
        }

        const apiKey = this.settings.geminiApiKey;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;

        const requestBody = { 
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.3,
                topK: 20,
                topP: 0.8,
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
                // Handle rate limiting for 30 RPM limit (2 seconds minimum between requests)
                if (response.status === 429 && retryCount < 3) {
                    const waitTime = Math.max(2500, Math.pow(2, retryCount) * 3000); // Min 2.5s, then 3s, 6s, 12s
                    console.log(`Rate limited (429). Retrying in ${waitTime/1000} seconds... (attempt ${retryCount + 1}/3)`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    return await this.callGeminiFlashLite(prompt, retryCount + 1);
                }
                
                // Provide user-friendly error messages
                if (response.status === 429) {
                    throw new Error('Rate limit exceeded. Please wait a few minutes before trying again.');
                } else if (response.status === 400) {
                    throw new Error('Invalid request. Please check your API key or try again.');
                } else if (response.status === 403) {
                    throw new Error('API access forbidden. Please check your Gemini API key permissions.');
                } else {
                    throw new Error(`Gemini API returned status ${response.status}: ${response.text}`);
                }
            }

            const data = response.json;
            
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Invalid response format from Gemini API');
            }

            return data.candidates[0].content.parts[0].text.trim();
        } catch (error) {
            console.error('Gemini 2.0 Flash-Lite API error:', error);
            
            const errorMessage = (error as Error).message;
            if (errorMessage.includes('status 429') && retryCount < 3) {
                const waitTime = Math.max(2500, Math.pow(2, retryCount) * 3000);
                console.log(`Rate limit detected in error. Retrying in ${waitTime/1000} seconds... (attempt ${retryCount + 1}/3)`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                return await this.callGeminiFlashLite(prompt, retryCount + 1);
            }
            
            // Network error retry
            if (retryCount < 2 && !errorMessage.includes('Rate limit') && !errorMessage.includes('status 429') && !errorMessage.includes('API')) {
                const waitTime = (retryCount + 1) * 3000;
                console.log(`Network error. Retrying in ${waitTime/1000} seconds... (attempt ${retryCount + 1}/2)`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                return await this.callGeminiFlashLite(prompt, retryCount + 1);
            }
            
            throw error;
        }
    }

    private parseMasterInsights(rawResponse: string, analysisData: VaultAnalysisData): any {
        // Parse the comprehensive AI response into structured data for each tab
        
        // Extract sections using markdown headers
        const structureSection = this.extractSection(rawResponse, 'KNOWLEDGE STRUCTURE ANALYSIS');
        const evolutionSection = this.extractSection(rawResponse, 'KNOWLEDGE EVOLUTION ANALYSIS');
        const actionsSection = this.extractSection(rawResponse, 'RECOMMENDED ACTIONS');

        return {
            knowledgeStructure: this.parseKnowledgeStructure(structureSection, analysisData),
            knowledgeEvolution: this.parseKnowledgeEvolution(evolutionSection, analysisData),
            recommendedActions: this.parseRecommendedActions(actionsSection, analysisData)
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

    private parseKnowledgeStructure(section: string, analysisData: VaultAnalysisData): KnowledgeStructureData {
        // Parse the knowledge structure section using the complete analysis data
        const results = analysisData.results;
        
        // Extract domain distribution from raw data
        const domainMap = new Map<string, VaultAnalysisResult[]>();
        results.forEach(note => {
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

        const domainDistribution = Array.from(domainMap.entries()).map(([domain, notes]) => {
            const avgCentrality = notes.length > 0 
                ? notes.reduce((sum, note) => sum + (note.graphMetrics?.degreeCentrality || 0), 0) / notes.length
                : 0;
            
            // Extract keywords for this domain
            const keywordSet = new Set<string>();
            notes.forEach(note => {
                if (note.keywords) {
                    note.keywords.split(',').forEach(k => keywordSet.add(k.trim()));
                }
            });
            
            return {
                domain,
                noteCount: notes.length,
                avgCentrality,
                keywords: Array.from(keywordSet).slice(0, 10) // Top keywords per domain
            };
        }).sort((a, b) => b.noteCount - a.noteCount);

        // Extract network analysis using centrality rankings
        const notesWithRankings = results.filter(note => note.centralityRankings);
        
        const bridges = notesWithRankings
            .filter(note => note.centralityRankings!.betweennessRank)
            .sort((a, b) => a.centralityRankings!.betweennessRank! - b.centralityRankings!.betweennessRank!)
            .slice(0, 10)
            .map(note => ({
                title: note.title,
                score: note.graphMetrics?.betweennessCentrality || 0,
                rank: note.centralityRankings!.betweennessRank!,
                connections: [] // TODO: Can be enhanced with actual connections
            }));

        const foundations = notesWithRankings
            .filter(note => note.centralityRankings!.closenessRank)
            .sort((a, b) => a.centralityRankings!.closenessRank! - b.centralityRankings!.closenessRank!)
            .slice(0, 10)
            .map(note => ({
                title: note.title,
                score: note.graphMetrics?.closenessCentrality || 0,
                rank: note.centralityRankings!.closenessRank!,
                reach: note.graphMetrics?.degreeCentrality || 0
            }));

        const authorities = notesWithRankings
            .filter(note => note.centralityRankings!.eigenvectorRank)
            .sort((a, b) => a.centralityRankings!.eigenvectorRank! - b.centralityRankings!.eigenvectorRank!)
            .slice(0, 10)
            .map(note => ({
                title: note.title,
                score: note.graphMetrics?.eigenvectorCentrality || 0,
                rank: note.centralityRankings!.eigenvectorRank!,
                influence: note.graphMetrics?.eigenvectorCentrality || 0
            }));

        return {
            domainDistribution,
            knowledgeNetwork: {
                bridges,
                foundations,
                authorities
            },
            insights: this.extractInsights(section),
            gaps: this.extractKnowledgeGaps(section)
        };
    }

    private parseKnowledgeEvolution(section: string, analysisData: VaultAnalysisData): KnowledgeEvolutionData {
        const results = analysisData.results;
        
        // Group notes by time periods for timeline analysis
        const timelineData = this.groupNotesByTimePeriod(results);
        
        // Create timeline analysis from the data
        const timeline: TimelineAnalysis = {
            narrative: {
                title: 'Knowledge Evolution Journey',
                content: this.extractNarrative(section),
                keyPoints: this.extractKeyPoints(this.extractNarrative(section)),
                recommendations: []
            },
            phases: Object.entries(timelineData.quarters).map(([period, notes]: [string, VaultAnalysisResult[]]) => {
                const domains = new Set<string>();
                const keywords = new Set<string>();
                const noteCount = notes.length;
                const wordCount = notes.reduce((sum, note) => sum + note.wordCount, 0);
                
                notes.forEach(note => {
                    if (note.knowledgeDomain) {
                        note.knowledgeDomain.split(',').forEach(d => domains.add(d.trim()));
                    }
                    if (note.keywords) {
                        note.keywords.split(',').forEach(k => keywords.add(k.trim()));
                    }
                });
                
                return {
                    period,
                    description: `${noteCount} notes created with focus on ${Array.from(domains).slice(0, 3).join(', ')}`,
                    keyDomains: Array.from(domains).slice(0, 5),
                    metrics: {
                        noteCount,
                        wordCount,
                        avgWordsPerNote: noteCount > 0 ? Math.round(wordCount / noteCount) : 0
                    }
                };
            }).sort((a, b) => a.period.localeCompare(b.period)),
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