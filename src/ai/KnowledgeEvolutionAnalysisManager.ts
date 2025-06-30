import { App, requestUrl } from 'obsidian';
import { GraphAnalysisSettings } from '../types/types';

// Knowledge Evolution Analysis Interfaces
export interface EvolutionInsight {
    title: string;
    content: string;
    keyPoints: string[];
    recommendations?: string[];
}

export interface TimelineAnalysis {
    narrative: EvolutionInsight;
    phases: Array<{
        period: string;
        description: string;
        keyDomains: string[];
        metrics: {
            noteCount: number;
            wordCount: number;
            avgWordsPerNote: number;
        };
    }>;
    trends: {
        productivity: 'increasing' | 'decreasing' | 'stable';
        diversity: 'expanding' | 'narrowing' | 'stable';
        depth: 'increasing' | 'decreasing' | 'stable';
    };
}

export interface TopicPatternsAnalysis {
    exploration: EvolutionInsight;
    introductionTimeline: Array<{
        period: string;
        newDomains: string[];
        acquisitionPattern: 'burst' | 'gradual' | 'project-based';
    }>;
    strategy: {
        style: 'depth-first' | 'breadth-first' | 'balanced';
        consistency: 'focused' | 'exploratory' | 'mixed';
    };
}

export interface FocusShiftAnalysis {
    narrative: EvolutionInsight;
    shifts: Array<{
        period: string;
        type: 'major' | 'minor' | 'gradual';
        newAreas: string[];
        increasedFocus: string[];
        decreasedFocus: string[];
        consistentAreas: string[];
        trigger?: string;
    }>;
    patterns: {
        frequency: 'frequent' | 'occasional' | 'rare';
        direction: 'expanding' | 'pivoting' | 'deepening';
    };
}

export interface LearningVelocityAnalysis {
    trends: EvolutionInsight;
    metrics: Array<{
        period: string;
        notesCreated: number;
        wordsWritten: number;
        domainsExplored: number;
        avgComplexity: number;
        trendIndicator: 'up' | 'down' | 'stable';
    }>;
    optimization: {
        peakPeriods: string[];
        recommendations: string[];
        productivityScore: number;
    };
}

export interface TokenUsage {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
}

export interface KnowledgeEvolutionData {
    generatedAt: string;
    sourceAnalysisId: string; // Reference to the vault analysis used
    totalPeriods: number;
    timeSpan: string;
    apiProvider: string;
    tokenUsage: TokenUsage;
    analysis: {
        timeline: TimelineAnalysis;
        topicPatterns: TopicPatternsAnalysis;
        focusShift: FocusShiftAnalysis;
        learningVelocity: LearningVelocityAnalysis;
    };
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
    // Graph metrics - added for enhanced analysis
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

export class KnowledgeEvolutionAnalysisManager {
    private app: App;
    private settings: GraphAnalysisSettings;

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.settings = settings;
    }

    public async loadCachedKnowledgeEvolution(): Promise<KnowledgeEvolutionData | null> {
        try {
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/knowledge-evolution.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const data = JSON.parse(content);
            
            // Validate that the cached analysis matches current semantic analysis
            const currentAnalysisData = await this.loadVaultAnalysisData();
            if (currentAnalysisData && data?.sourceAnalysisId !== this.generateAnalysisId(currentAnalysisData)) {
                console.log('Cached evolution analysis is outdated, will regenerate');
                return null;
            }
            
            return data;
        } catch (error) {
            // File doesn't exist or invalid - that's okay
            return null;
        }
    }

    public async generateAndCacheEvolutionAnalysis(): Promise<KnowledgeEvolutionData> {
        const analysisData = await this.loadVaultAnalysisData();
        if (!analysisData) {
            throw new Error('No vault analysis data found. Please generate vault analysis first.');
        }

        const analysisResults = analysisData.results;
        
        // Group notes by time periods
        const notesByPeriod = this.groupNotesByTimePeriod(analysisResults);
        
        // Prepare data for AI analysis
        const evolutionContext = this.prepareEvolutionContext(analysisResults, notesByPeriod);
        
        // Generate AI insights for each analysis type
        const [timelineRaw, topicPatternsRaw, focusShiftRaw, learningVelocityRaw] = await Promise.all([
            this.generateTimelineInsights(evolutionContext),
            this.generateTopicPatternInsights(evolutionContext),
            this.generateFocusShiftInsights(evolutionContext),
            this.generateLearningVelocityInsights(evolutionContext)
        ]);

        // Parse AI responses into structured data
        const timeline = this.parseTimelineAnalysis(timelineRaw, evolutionContext);
        const topicPatterns = this.parseTopicPatternsAnalysis(topicPatternsRaw, evolutionContext);
        const focusShift = this.parseFocusShiftAnalysis(focusShiftRaw, evolutionContext);
        const learningVelocity = this.parseLearningVelocityAnalysis(learningVelocityRaw, evolutionContext);

        // Create structured evolution data
        const evolutionData: KnowledgeEvolutionData = {
            generatedAt: new Date().toISOString(),
            sourceAnalysisId: this.generateAnalysisId(analysisData),
            totalPeriods: evolutionContext.periodSummaries.length,
            timeSpan: evolutionContext.timeSpan,
            apiProvider: 'Google Gemini',
            tokenUsage: { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 }, // TODO: Track tokens
            analysis: {
                timeline,
                topicPatterns,
                focusShift,
                learningVelocity
            }
        };

        // Cache the results
        await this.cacheKnowledgeEvolution(evolutionData);

        return evolutionData;
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

    private async cacheKnowledgeEvolution(data: KnowledgeEvolutionData): Promise<void> {
        try {
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/knowledge-evolution.json`;
            
            // Ensure the plugin directory exists
            const pluginDir = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis`;
            try {
                await this.app.vault.adapter.mkdir(pluginDir);
            } catch {
                // Directory might already exist
            }
            
            await this.app.vault.adapter.write(filePath, JSON.stringify(data, null, 2));
            console.log('Knowledge evolution analysis cached successfully');
        } catch (error) {
            console.error('Failed to cache knowledge evolution analysis:', error);
        }
    }

    private groupNotesByTimePeriod(results: VaultAnalysisResult[]): any {
        const periods: { [key: string]: VaultAnalysisResult[] } = {};
        const monthlyGroups: { [key: string]: VaultAnalysisResult[] } = {};
        
        results.forEach(result => {
            const date = new Date(result.modified || result.created);
            const monthKey = date.toISOString().slice(0, 7); // YYYY-MM format
            const quarterKey = `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
            
            if (!periods[quarterKey]) {
                periods[quarterKey] = [];
            }
            if (!monthlyGroups[monthKey]) {
                monthlyGroups[monthKey] = [];
            }
            
            periods[quarterKey].push(result);
            monthlyGroups[monthKey].push(result);
        });

        return { quarters: periods, months: monthlyGroups };
    }

    private prepareEvolutionContext(results: VaultAnalysisResult[], notesByPeriod: any): any {
        // Create a comprehensive context for AI analysis including full vault analysis data
        const totalNotes = results.length;
        const totalWords = results.reduce((sum, note) => sum + note.wordCount, 0);
        const timeSpan = this.getTimeSpan(results);
        
        // Extract all unique domains across all periods
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

        // Create detailed period summaries with full note analysis data
        const periodSummaries = Object.entries(notesByPeriod.quarters).map(([period, notes]: [string, VaultAnalysisResult[]]) => {
            const domains = new Set<string>();
            const keywords = new Set<string>();
            const noteCount = notes.length;
            const wordCount = notes.reduce((sum, note) => sum + note.wordCount, 0);
            
            // Build detailed note summaries for this period
            const noteDetails = notes.map(note => ({
                title: note.title,
                summary: note.summary,
                keywords: note.keywords,
                knowledgeDomain: note.knowledgeDomain,
                wordCount: note.wordCount,
                created: note.created,
                modified: note.modified
            }));
            
            notes.forEach(note => {
                if (note.knowledgeDomain) {
                    note.knowledgeDomain.split(',').forEach(d => domains.add(d.trim().toLowerCase()));
                }
                if (note.keywords) {
                    note.keywords.split(',').forEach(k => keywords.add(k.trim().toLowerCase()));
                }
            });
            
            return {
                period,
                noteCount,
                wordCount,
                domains: Array.from(domains).slice(0, 10), // Top 10 domains
                keywords: Array.from(keywords).slice(0, 15), // Top 15 keywords
                avgWordsPerNote: noteCount > 0 ? Math.round(wordCount / noteCount) : 0,
                noteDetails // Include full note analysis data
            };
        }).sort((a, b) => a.period.localeCompare(b.period));

        return {
            totalNotes,
            totalWords,
            timeSpan,
            totalDomains: allDomains.size,
            totalKeywords: allKeywords.size,
            periodSummaries,
            // Include global insights
            topDomains: Array.from(allDomains).slice(0, 20),
            topKeywords: Array.from(allKeywords).slice(0, 30)
        };
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

    private async generateTimelineInsights(context: any): Promise<string> {
        const prompt = `Analyze this knowledge development timeline using the complete vault analysis data and provide comprehensive insights about the user's learning journey.

VAULT OVERVIEW:
- Total Notes: ${context.totalNotes}
- Total Words: ${context.totalWords.toLocaleString()}
- Time Span: ${context.timeSpan}
- Knowledge Domains: ${context.totalDomains}
- Total Keywords: ${context.totalKeywords}

GLOBAL KNOWLEDGE LANDSCAPE:
Top Knowledge Domains: ${context.topDomains.slice(0, 10).join(', ')}
Key Themes Across All Periods: ${context.topKeywords.slice(0, 15).join(', ')}

DETAILED CHRONOLOGICAL ANALYSIS:
${context.periodSummaries.map((period: any) => `
=== ${period.period} ===
Period Summary: ${period.noteCount} notes, ${period.wordCount.toLocaleString()} words
Primary Domains: ${period.domains.slice(0, 5).join(', ')}
Key Themes: ${period.keywords.slice(0, 8).join(', ')}

Note Details for Period:
${period.noteDetails.slice(0, 5).map((note: any) => `
• "${note.title}" (${note.wordCount} words)
  Summary: ${note.summary}
  Keywords: ${note.keywords}
  Domains: ${note.knowledgeDomain}`).join('\n')}${period.noteDetails.length > 5 ? `\n... and ${period.noteDetails.length - 5} more notes` : ''}`).join('\n')}

Using this comprehensive vault analysis data, please provide:

**NARRATIVE ANALYSIS:**
1. Overall learning progression and growth patterns based on actual note content
2. How the user's knowledge depth and breadth evolved through specific topics
3. Key phases or turning points in their learning journey (reference specific notes)
4. Notable increases in productivity or focus areas
5. Connections and relationships between different knowledge domains

**STRUCTURED TIMELINE:**
Present a chronological breakdown showing:
- Major knowledge development phases with supporting evidence from note content
- Evolution of key domains with specific examples
- Notable productivity patterns and their relationship to content themes
- Learning trajectory insights based on actual summaries and keywords

Format your response with clear sections and include both narrative insights and structured timeline data. Use headings, bullet points, and formatting to make it easily readable.`;

        return this.callGeminiForEvolutionAnalysis(prompt);
    }

    private async generateTopicPatternInsights(context: any): Promise<string> {
        const prompt = `Analyze how this user introduces and explores new topics over time using complete vault analysis data, including detailed topic introduction patterns.

VAULT KNOWLEDGE LANDSCAPE:
- Knowledge journey spans: ${context.timeSpan}
- Total domains explored: ${context.totalDomains}
- Total unique keywords: ${context.totalKeywords}

GLOBAL KNOWLEDGE DISTRIBUTION:
Primary Domains: ${context.topDomains.slice(0, 12).join(', ')}
Key Research Themes: ${context.topKeywords.slice(0, 18).join(', ')}

DETAILED CHRONOLOGICAL TOPIC INTRODUCTION:
${context.periodSummaries.map((period: any) => `
=== ${period.period} Topic Analysis ===
New/Active Domains: ${period.domains.join(', ')}
Key Topics: ${period.keywords.slice(0, 8).join(', ')}
Activity Level: ${period.noteCount} notes, ${period.wordCount.toLocaleString()} words

Representative Notes:
${period.noteDetails.slice(0, 3).map((note: any) => `
• "${note.title}"
  Focus: ${note.knowledgeDomain}
  Content: ${note.summary}
  Keywords: ${note.keywords}`).join('\n')}${period.noteDetails.length > 3 ? `\n... plus ${period.noteDetails.length - 3} more notes in this period` : ''}`).join('\n')}

Based on this comprehensive vault analysis data, please provide:

**TOPIC EXPLORATION ANALYSIS:**
1. How the user's topic exploration patterns evolved based on actual note content
2. Whether they tend to dive deep or explore broadly (evidence from note summaries)
3. Connections and intersections between different knowledge domains 
4. Timing patterns - do they introduce topics gradually or in bursts?
5. Relationship between note complexity and topic exploration depth

**TOPIC INTRODUCTION TIMELINE:**
Create a detailed breakdown showing:
- When different knowledge domains first appeared with specific note examples
- Which periods introduced the most new topics and why
- How topic diversity grew over time with supporting evidence
- Patterns of topic introduction (seasonal, project-based, etc.) based on content analysis

**KNOWLEDGE ACQUISITION STRATEGY:**
Analyze their learning style and provide insights about their knowledge building approach:
- Deep vs. broad exploration patterns
- How they build upon previous knowledge
- Topic interconnection and synthesis patterns
- Evolution of research sophistication over time

Format your response with clear sections, headings, and structured data presentation using the rich vault analysis content.`;

        return this.callGeminiForEvolutionAnalysis(prompt);
    }

    private async generateFocusShiftInsights(context: any): Promise<string> {
        const prompt = `Analyze how this user's focus and interests have shifted over time using complete vault analysis data, including detailed focus shift patterns.

VAULT EVOLUTION OVERVIEW:
- Total Knowledge Journey: ${context.timeSpan}
- Global Domains: ${context.totalDomains} unique areas
- Research Breadth: ${context.totalKeywords} unique keywords

KNOWLEDGE EVOLUTION DATA WITH CONTENT ANALYSIS:
${context.periodSummaries.map((period: any, index: number) => {
            const prevPeriod = index > 0 ? context.periodSummaries[index - 1] : null;
            const newDomains = prevPeriod ? 
                period.domains.filter((d: string) => !prevPeriod.domains.includes(d)) : 
                period.domains;
            
            return `
=== ${period.period} Focus Analysis ===
Primary Focus: ${period.domains.slice(0, 3).join(', ')}
New Areas: ${newDomains.slice(0, 3).join(', ') || 'None'}
Activity: ${period.noteCount} notes, ${period.avgWordsPerNote} avg words/note
Content Themes: ${period.keywords.slice(0, 6).join(', ')}

Key Notes Reflecting Focus:
${period.noteDetails.slice(0, 3).map((note: any) => `
• "${note.title}" (${note.wordCount} words)
  Domain: ${note.knowledgeDomain}
  Summary: ${note.summary}
  Keywords: ${note.keywords}`).join('\n')}${period.noteDetails.length > 3 ? `\n... and ${period.noteDetails.length - 3} additional notes` : ''}`;
        }).join('\n')}

Using this rich vault analysis content, please provide:

**FOCUS EVOLUTION NARRATIVE:**
1. Major shifts in intellectual focus and interests with specific note evidence
2. Whether the user maintains consistent interests or frequently pivots (cite examples)
3. How new interests relate to or build upon previous knowledge (show connections)
4. Current trajectory - where their interests seem to be heading based on recent content
5. Depth vs. breadth patterns in focus areas

**DETAILED FOCUS SHIFT ANALYSIS:**
For each significant period, identify and categorize using actual content:
- 🆕 New Areas Explored: Completely new domains introduced (with note examples)
- 📈 Increased Focus: Areas that gained more attention (show evidence from notes)
- 📉 Decreased Focus: Areas that received less attention (demonstrate with content gaps)
- ➡️ Consistent Areas: Domains that maintained steady focus (cite ongoing themes)

**FOCUS PATTERNS:**
Analyze patterns in how focus shifts occur based on content analysis:
- What drives changes in intellectual direction (project needs, curiosity, external factors)?
- How focus shifts correlate with note content complexity and depth
- Relationship between focus areas and knowledge synthesis patterns
- Predictive insights about likely future focus areas

Format your response with clear sections, use emojis for visual categorization, and provide both narrative insights and structured focus shift data supported by actual vault content.`;

        return this.callGeminiForEvolutionAnalysis(prompt);
    }

    private async generateLearningVelocityInsights(context: any): Promise<string> {
        const recentPeriods = context.periodSummaries.slice(-6); // Last 6 periods
        const totalWords = context.periodSummaries.reduce((sum: number, p: any) => sum + p.wordCount, 0);
        const avgWordsPerPeriod = Math.round(totalWords / context.periodSummaries.length);

        const prompt = `Analyze this user's learning velocity and productivity patterns using complete vault analysis data with detailed metrics and optimization recommendations.

COMPREHENSIVE PRODUCTIVITY METRICS:
Overall Average: ${avgWordsPerPeriod.toLocaleString()} words per period
Total Output: ${context.totalWords.toLocaleString()} words across ${context.periodSummaries.length} periods
Knowledge Domains Covered: ${context.totalDomains} unique areas
Research Keywords Generated: ${context.totalKeywords} unique terms

GLOBAL PRODUCTIVITY CONTEXT:
Most Active Domains: ${context.topDomains.slice(0, 8).join(', ')}
Primary Research Themes: ${context.topKeywords.slice(0, 12).join(', ')}

DETAILED PERIOD BREAKDOWN WITH CONTENT ANALYSIS:
${context.periodSummaries.map((period: any) => `
=== ${period.period} Productivity Analysis ===
Output: ${period.noteCount} notes, ${period.wordCount.toLocaleString()} words
Avg Complexity: ${period.avgWordsPerNote} words/note
Focus Areas: ${period.domains.slice(0, 4).join(', ')}
Key Themes: ${period.keywords.slice(0, 6).join(', ')}

Sample Content Quality:
${period.noteDetails.slice(0, 2).map((note: any) => `
• "${note.title}" (${note.wordCount} words)
  Domain: ${note.knowledgeDomain}
  Content: ${note.summary}
  Keywords: ${note.keywords}`).join('\n')}${period.noteDetails.length > 2 ? `\n... plus ${period.noteDetails.length - 2} more notes` : ''}`).join('\n')}

RECENT ACTIVITY ANALYSIS (last 6 periods):
${recentPeriods.map((period: any) => `
${period.period}: ${period.noteCount} notes, ${period.wordCount.toLocaleString()} words
Quality Focus: ${period.domains.slice(0, 4).join(', ')}
Content Complexity: ${period.avgWordsPerNote} avg words/note
Key Developments: ${period.keywords.slice(0, 5).join(', ')}`).join('\n')}

Using this comprehensive vault analysis data, please provide:

**VELOCITY TRENDS ANALYSIS:**
1. Learning velocity trends - is productivity increasing, stable, or declining? (cite specific evidence)
2. Relationship between output volume and knowledge depth based on actual content
3. How writing patterns correlate with topic exploration and domain sophistication
4. Seasonal or periodic patterns in productivity with content quality considerations
5. Correlation between note complexity and knowledge domain development

**DETAILED PRODUCTIVITY BREAKDOWN:**
Present a structured analysis showing:
- 📝 Notes created per period (with quality assessment)
- 📊 Words written per period (complexity trends)
- 🎯 Knowledge domains explored (depth vs breadth analysis)
- ⚖️ Average complexity evolution (words per note trends)
- 📈📉 Trend indicators (supported by content analysis)
- 🔬 Content sophistication patterns

**OPTIMIZATION RECOMMENDATIONS:**
Provide specific, actionable recommendations based on actual vault content for:
- Improving learning velocity while maintaining quality
- Optimizing writing productivity in specific knowledge domains
- Balancing depth vs breadth of exploration based on content patterns
- Maintaining consistent output while developing expertise
- Leveraging peak productivity periods and domain expertise
- Building upon successful content creation patterns

Format your response with clear sections, use emojis for metrics, and include both trend analysis and detailed productivity breakdowns supported by actual vault content analysis.`;

        return this.callGeminiForEvolutionAnalysis(prompt);
    }

    private async callGeminiForEvolutionAnalysis(prompt: string): Promise<string> {
        if (!this.settings?.geminiApiKey || this.settings.geminiApiKey.trim() === '') {
            throw new Error('Gemini API key not configured');
        }

        const apiKey = this.settings.geminiApiKey;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

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
                maxOutputTokens: 800,
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
            console.error('Gemini API error in evolution analysis:', error);
            throw error;
        }
    }

    // Helper methods for parsing AI responses into structured data
    private parseTimelineAnalysis(rawResponse: string, context: any): TimelineAnalysis {
        const narrative: EvolutionInsight = {
            title: 'Learning Journey Overview',
            content: rawResponse,
            keyPoints: this.extractKeyPoints(rawResponse),
            recommendations: this.extractRecommendations(rawResponse)
        };

        const phases = context.periodSummaries.map((period: any) => ({
            period: period.period,
            description: `${period.noteCount} notes created with focus on ${period.domains.slice(0, 3).join(', ')}`,
            keyDomains: period.domains.slice(0, 5),
            metrics: {
                noteCount: period.noteCount,
                wordCount: period.wordCount,
                avgWordsPerNote: period.avgWordsPerNote
            }
        }));

        return {
            narrative,
            phases,
            trends: this.analyzeTrends(context.periodSummaries)
        };
    }

    private parseTopicPatternsAnalysis(rawResponse: string, context: any): TopicPatternsAnalysis {
        const exploration: EvolutionInsight = {
            title: 'Knowledge Exploration Patterns',
            content: rawResponse,
            keyPoints: this.extractKeyPoints(rawResponse),
            recommendations: this.extractRecommendations(rawResponse)
        };

        const introductionTimeline = context.periodSummaries.map((period: any, index: number) => {
            const prevPeriod = index > 0 ? context.periodSummaries[index - 1] : null;
            const newDomains = prevPeriod ? 
                period.domains.filter((d: string) => !prevPeriod.domains.includes(d)) : 
                period.domains;
            
            return {
                period: period.period,
                newDomains: newDomains.slice(0, 5),
                acquisitionPattern: this.determineAcquisitionPattern(period, newDomains)
            };
        });

        return {
            exploration,
            introductionTimeline,
            strategy: this.analyzeStrategy(context.periodSummaries)
        };
    }

    private parseFocusShiftAnalysis(rawResponse: string, context: any): FocusShiftAnalysis {
        const narrative: EvolutionInsight = {
            title: 'Intellectual Focus Evolution',
            content: rawResponse,
            keyPoints: this.extractKeyPoints(rawResponse),
            recommendations: this.extractRecommendations(rawResponse)
        };

        const shifts = context.periodSummaries.map((period: any, index: number) => {
            const prevPeriod = index > 0 ? context.periodSummaries[index - 1] : null;
            if (!prevPeriod) return null;

            const newAreas = period.domains.filter((d: string) => !prevPeriod.domains.includes(d));
            const decreasedFocus = prevPeriod.domains.filter((d: string) => !period.domains.includes(d));
            const consistentAreas = period.domains.filter((d: string) => prevPeriod.domains.includes(d));

            return {
                period: period.period,
                type: newAreas.length > 2 ? 'major' : newAreas.length > 0 ? 'minor' : 'gradual',
                newAreas: newAreas.slice(0, 5),
                increasedFocus: [], // Would need more sophisticated analysis
                decreasedFocus: decreasedFocus.slice(0, 5),
                consistentAreas: consistentAreas.slice(0, 5)
            };
        }).filter(Boolean);

        return {
            narrative,
            shifts,
            patterns: this.analyzeFocusPatterns(shifts)
        };
    }

    private parseLearningVelocityAnalysis(rawResponse: string, context: any): LearningVelocityAnalysis {
        const trends: EvolutionInsight = {
            title: 'Learning Velocity Insights',
            content: rawResponse,
            keyPoints: this.extractKeyPoints(rawResponse),
            recommendations: this.extractRecommendations(rawResponse)
        };

        const metrics = context.periodSummaries.map((period: any, index: number) => {
            const prevPeriod = index > 0 ? context.periodSummaries[index - 1] : null;
            let trendIndicator: 'up' | 'down' | 'stable' = 'stable';
            
            if (prevPeriod) {
                const currentRate = period.wordCount / Math.max(period.noteCount, 1);
                const prevRate = prevPeriod.wordCount / Math.max(prevPeriod.noteCount, 1);
                trendIndicator = currentRate > prevRate * 1.1 ? 'up' : 
                               currentRate < prevRate * 0.9 ? 'down' : 'stable';
            }

            return {
                period: period.period,
                notesCreated: period.noteCount,
                wordsWritten: period.wordCount,
                domainsExplored: period.domains.length,
                avgComplexity: period.avgWordsPerNote,
                trendIndicator
            };
        });

        return {
            trends,
            metrics,
            optimization: this.analyzeOptimization(metrics, rawResponse)
        };
    }

    // Helper methods for parsing AI responses
    private extractKeyPoints(text: string): string[] {
        const points = text.match(/[•\-]\s*(.+)/g) || [];
        return points.map(point => point.replace(/^[•\-]\s*/, '').trim()).slice(0, 5);
    }

    private extractRecommendations(text: string): string[] {
        const recommendations = text.match(/recommend[^.]*[.]/gi) || [];
        return recommendations.map(rec => rec.trim()).slice(0, 3);
    }

    private analyzeTrends(periods: any[]): any {
        // Analyze productivity, diversity, and depth trends
        return {
            productivity: 'stable', // Would implement actual trend analysis
            diversity: 'expanding',
            depth: 'increasing'
        };
    }

    private determineAcquisitionPattern(period: any, newDomains: string[]): 'burst' | 'gradual' | 'project-based' {
        return newDomains.length > 3 ? 'burst' : newDomains.length > 1 ? 'gradual' : 'project-based';
    }

    private analyzeStrategy(periods: any[]): any {
        return {
            style: 'balanced',
            consistency: 'exploratory'
        };
    }

    private analyzeFocusPatterns(shifts: any[]): any {
        return {
            frequency: 'occasional',
            direction: 'expanding'
        };
    }

    private analyzeOptimization(metrics: any[], rawResponse: string): any {
        const peakPeriods = metrics
            .sort((a, b) => b.wordsWritten - a.wordsWritten)
            .slice(0, 3)
            .map(m => m.period);

        return {
            peakPeriods,
            recommendations: this.extractRecommendations(rawResponse),
            productivityScore: 7.5 // Would calculate based on actual metrics
        };
    }

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
    }
} 