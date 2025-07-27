import { App, Notice, TFile, setIcon } from 'obsidian';
import { GraphAnalysisSettings } from '../types/types';
import { VaultAnalysisModal } from '../views/VaultAnalysisModals';
import { 
    VaultAnalysisResult, 
    VaultAnalysisData,
    MasterAnalysisManager
} from './MasterAnalysisManager';
import { AIModelService, TokenUsage } from '../services/AIModelService';
import { GraphDataBuilder } from '../components/graph-view/data/graph-builder';
import { PluginService } from '../services/PluginService';
import { DDCHelper } from './DDCHelper';

export class VaultSemanticAnalysisManager {
    private app: App;
    private settings: GraphAnalysisSettings;
    private aiService: AIModelService;
    private graphDataBuilder: GraphDataBuilder;
    private pluginService: PluginService;
    private masterAnalysisManager: MasterAnalysisManager;
    private ddcSectionsList: Array<{id: string, name: string, division: string, mainClass: string}> = [];
    private ddcTemplateLoaded: boolean = false;
    private readonly MAX_WORDS_PER_NOTE = 1000;
    private readonly MAX_NOTES_PER_BATCH = 50;
    private readonly DELAY_BETWEEN_BATCHES = 3000; // 3 seconds between batches for 30 RPM rate limiting
    private readonly RATE_LIMIT_RETRY_DELAY = 8000; // 8 second delay for rate limit retry

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.settings = settings;
        this.aiService = new AIModelService(settings);
        this.graphDataBuilder = new GraphDataBuilder(app);
        this.pluginService = new PluginService(app);
        this.masterAnalysisManager = new MasterAnalysisManager(app, settings);
    }

    /**
     * Load DDC template from MasterAnalysisManager
     */
    private async loadDDCTemplate(): Promise<boolean> {
        if (this.ddcTemplateLoaded && this.ddcSectionsList.length > 0) {
            return true; // Already loaded
        }

        try {
            // Ensure DDC template is loaded using DDCHelper directly
            const ddcHelper = DDCHelper.getInstance(this.app);
            const loaded = await ddcHelper.ensureDDCTemplateLoaded();
            if (!loaded) {
                console.error('Failed to load DDC template from DDCHelper');
                return false;
            }

            // Get the DDC sections list
            this.ddcSectionsList = ddcHelper.getAllDDCSections();
            this.ddcTemplateLoaded = this.ddcSectionsList.length > 0;
            
            console.log(`📚 DDC template loaded for VaultSemanticAnalysisManager: ${this.ddcSectionsList.length} sections available`);
            return this.ddcTemplateLoaded;
        } catch (error) {
            console.error('Failed to load DDC template for VaultSemanticAnalysisManager:', error);
            return false;
        }
    }

    public createGraphViewButton(container: HTMLElement): HTMLElement {
        // Create vault analysis button for graph view - positioned at right bottom
        const button = container.createDiv({ cls: 'vault-analysis-icon' });
        
        // Use brain icon for vault analysis
        setIcon(button, 'sun');
        
        // Create tooltip with description
        const tooltipEl = button.createDiv({ cls: 'vault-analysis-icon-tooltip' });
        
        // Add title
        tooltipEl.createDiv({ 
            cls: 'tooltip-title',
            text: 'Vault Analysis'
        });
        
        // Add description
        const description = tooltipEl.createDiv({ cls: 'tooltip-description' });
        description.setText('AI-powered analysis of your entire vault to extract summaries, keywords, knowledge domains, and graph centrality metrics. Shift+click to force refresh graph metrics.');
        
        // Add click handler for vault analysis - directly open results modal
        button.addEventListener('click', async (event) => {
            // Check if shift is held to force graph metrics enhancement
            if (event.shiftKey) {
                try {
                    const enhanceNotice = new Notice('Enhancing vault analysis with graph metrics...', 0);
                    const enhanced = await this.enhanceWithGraphMetrics();
                    enhanceNotice.hide();
                    
                    if (enhanced) {
                        new Notice('✅ Vault analysis enhanced with graph metrics!');
                    } else {
                        new Notice('ℹ️ No existing vault analysis found. Generate analysis first.');
                    }
                } catch (error) {
                    new Notice(`❌ Failed to enhance: ${(error as Error).message}`);
                }
            } else {
                this.viewVaultAnalysisResults();
            }
        });

        return button;
    }

    /**
     * Calculate graph metrics for all nodes in the vault
     * Returns a map from file path to graph metrics
     */
    private async calculateGraphMetrics(): Promise<Map<string, VaultAnalysisResult['graphMetrics']>> {
        const metricsMap = new Map<string, VaultAnalysisResult['graphMetrics']>();
        
        try {
            // Build graph data and get degree centrality
            const { graphData } = await this.graphDataBuilder.buildGraphData();
            
            // Calculate all centrality types
            const degreeCentrality = this.pluginService.calculateDegreeCentrality();
            const betweennessCentrality = this.pluginService.calculateBetweennessCentrality();
            const closenessCentrality = this.pluginService.calculateClosenessCentrality();
            const eigenvectorCentrality = this.pluginService.calculateEigenvectorCentrality();
            
            // Create maps for quick lookup by node_id
            const degreeMap = new Map<number, number>();
            const betweennessMap = new Map<number, number>();
            const closenessMap = new Map<number, number>();
            const eigenvectorMap = new Map<number, number>();
            
            degreeCentrality.forEach(node => {
                if (node.centrality.degree !== undefined) {
                    degreeMap.set(node.node_id, node.centrality.degree);
                }
            });
            
            betweennessCentrality.forEach(node => {
                if (node.centrality.betweenness !== undefined) {
                    betweennessMap.set(node.node_id, node.centrality.betweenness);
                }
            });
            
            closenessCentrality.forEach(node => {
                if (node.centrality.closeness !== undefined) {
                    closenessMap.set(node.node_id, node.centrality.closeness);
                }
            });
            
            eigenvectorCentrality.forEach(node => {
                if (node.centrality.eigenvector !== undefined) {
                    eigenvectorMap.set(node.node_id, node.centrality.eigenvector);
                }
            });
            
            // Map file paths to their graph metrics using node indices
            graphData.nodes.forEach((filePath, nodeIndex) => {
                const metrics: VaultAnalysisResult['graphMetrics'] = {
                    degreeCentrality: degreeMap.get(nodeIndex),
                    betweennessCentrality: betweennessMap.get(nodeIndex),
                    closenessCentrality: closenessMap.get(nodeIndex),
                    eigenvectorCentrality: eigenvectorMap.get(nodeIndex)
                };
                
                metricsMap.set(filePath, metrics);
            });
            
        } catch (error) {
            console.error('Error calculating graph metrics:', error);
            // Return empty map on error - semantic analysis can proceed without graph metrics
        }
        
        return metricsMap;
    }

    /**
     * Calculate centrality rankings for all notes with graph metrics
     */
    private calculateCentralityRankings(results: VaultAnalysisResult[]): VaultAnalysisResult[] {
        const notesWithMetrics = results.filter(note => note.graphMetrics);
        
        if (notesWithMetrics.length === 0) {
            return results; // Return unchanged if no metrics
        }

        // Sort by each centrality measure and assign rankings
        const betweennessSorted = [...notesWithMetrics]
            .sort((a, b) => (b.graphMetrics?.betweennessCentrality || 0) - (a.graphMetrics?.betweennessCentrality || 0));
        
        const closenessSorted = [...notesWithMetrics]
            .sort((a, b) => (b.graphMetrics?.closenessCentrality || 0) - (a.graphMetrics?.closenessCentrality || 0));
            
        const eigenvectorSorted = [...notesWithMetrics]
            .sort((a, b) => (b.graphMetrics?.eigenvectorCentrality || 0) - (a.graphMetrics?.eigenvectorCentrality || 0));
            
        const degreeSorted = [...notesWithMetrics]
            .sort((a, b) => (b.graphMetrics?.degreeCentrality || 0) - (a.graphMetrics?.degreeCentrality || 0));

        // Create ranking maps
        const betweennessRankMap = new Map<string, number>();
        const closenessRankMap = new Map<string, number>();
        const eigenvectorRankMap = new Map<string, number>();
        const degreeRankMap = new Map<string, number>();

        betweennessSorted.forEach((note, index) => {
            betweennessRankMap.set(note.id, index + 1);
        });
        
        closenessSorted.forEach((note, index) => {
            closenessRankMap.set(note.id, index + 1);
        });
        
        eigenvectorSorted.forEach((note, index) => {
            eigenvectorRankMap.set(note.id, index + 1);
        });
        
        degreeSorted.forEach((note, index) => {
            degreeRankMap.set(note.id, index + 1);
        });

        // Apply rankings to all results
        return results.map(result => {
            if (!result.graphMetrics) {
                return result;
            }
            
            return {
                ...result,
                centralityRankings: {
                    betweennessRank: betweennessRankMap.get(result.id),
                    closenessRank: closenessRankMap.get(result.id),
                    eigenvectorRank: eigenvectorRankMap.get(result.id),
                    degreeRank: degreeRankMap.get(result.id)
                }
            };
        });
    }

    /**
     * Enhance existing vault analysis results with graph metrics
     * This handles scenario 2: cached vault-analysis.json exists
     */
    public async enhanceWithGraphMetrics(): Promise<boolean> {
        try {
            // Load existing analysis data
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/vault-analysis.json`;
            
            let existingData: VaultAnalysisData;
            try {
                const content = await this.app.vault.adapter.read(filePath);
                existingData = JSON.parse(content);
            } catch (error) {
                // File doesn't exist or invalid - return false to indicate no cached data
                return false;
            }
            
            // Calculate current graph metrics
            const graphMetrics = await this.calculateGraphMetrics();
            
            // Enhance each result with graph metrics
            const enhancedResults = existingData.results.map((result: VaultAnalysisResult) => {
                const metrics = graphMetrics.get(result.path);
                return {
                    ...result,
                    graphMetrics: metrics
                };
            });
            
            // Calculate and add centrality rankings
            const resultsWithRankings = this.calculateCentralityRankings(enhancedResults);
            
            // Update the analysis data
            const updatedData: VaultAnalysisData = {
                ...existingData,
                results: resultsWithRankings,
                // Update timestamp to reflect the enhancement
                generatedAt: new Date().toISOString()
            };
            
            // Save the enhanced data
            await this.app.vault.adapter.write(filePath, JSON.stringify(updatedData, null, 2));
            
            console.log('Enhanced existing vault analysis with graph metrics and rankings');
            return true;
            
        } catch (error) {
            console.error('Error enhancing vault analysis with graph metrics:', error);
            throw new Error(`Failed to enhance with graph metrics: ${(error as Error).message}`);
        }
    }

    public async generateVaultAnalysis(): Promise<void> {
        try {
            // Check if Gemini API key is configured
            if (!this.settings.geminiApiKey || this.settings.geminiApiKey.trim() === '') {
                new Notice('Please configure your Gemini API key in settings to use vault analysis.');
                return;
            }

            // Get all markdown files in the vault
            const allFiles = this.app.vault.getMarkdownFiles();
            
            // Filter out excluded files using the same logic as the main plugin
            const includedFiles = allFiles.filter(file => !this.isFileExcluded(file));
            
            if (includedFiles.length === 0) {
                new Notice('No files found for analysis after applying exclusion rules.');
                return;
            }

            // Show initial notice
            const progressNotice = new Notice(`Starting vault analysis for ${includedFiles.length} files...`, 0);
            
            const results: VaultAnalysisResult[] = [];
            let processed = 0;
            let failed = 0;
            let totalTokenUsage: TokenUsage = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };

            // Prepare file data first to get word counts
            progressNotice.setMessage('Preparing files for analysis...');
            const fileDataList: Array<{
                file: TFile;
                content: string;
                wordCount: number;
                created: string;
                modified: string;
                isShort: boolean;
            }> = [];

            for (const file of includedFiles) {
                try {
                    const content = await this.app.vault.read(file);
                    const cleanedContent = this.cleanupContent(content);
                    const wordCount = cleanedContent.split(/\s+/).filter(word => word.length > 0).length;
                    
                    // Get file stats
                    const stat = await this.app.vault.adapter.stat(file.path);
                    const created = stat?.ctime ? new Date(stat.ctime).toISOString() : '';
                    const modified = stat?.mtime ? new Date(stat.mtime).toISOString() : '';

                    fileDataList.push({
                        file,
                        content: cleanedContent,
                        wordCount,
                        created,
                        modified,
                        isShort: wordCount < 10
                    });
                } catch (error) {
                    console.error(`Error reading file ${file.path}:`, error);
                    fileDataList.push({
                        file,
                        content: '',
                        wordCount: 0,
                        created: '',
                        modified: '',
                        isShort: true
                    });
                }
            }

            // Create optimized note-based batches (50 notes per batch, max 1000 words per note)
            const delayBetweenBatches = this.DELAY_BETWEEN_BATCHES;
            
            const batches: Array<typeof fileDataList> = [];
            let currentBatch: typeof fileDataList = [];

            for (const fileData of fileDataList) {
                // If current batch is full (50 notes), start a new batch
                if (currentBatch.length >= this.MAX_NOTES_PER_BATCH) {
                    batches.push(currentBatch);
                    currentBatch = [fileData];
                } else {
                    // Add file to current batch
                    currentBatch.push(fileData);
                }
            }
            
            // Add the last batch if it has files
            if (currentBatch.length > 0) {
                batches.push(currentBatch);
            }

            const totalBatches = batches.length;
            const averageBatchSize = Math.round(fileDataList.length / totalBatches);
            
            // Log batch distribution for transparency
            console.log(`Processing ${includedFiles.length} files in ${totalBatches} note-based batches (max ${this.MAX_NOTES_PER_BATCH} notes per batch) using ${this.aiService.getModelName()}`);
            console.log(`Average batch size: ${averageBatchSize} notes per batch`);
            
            // Log batch size distribution for small vaults
            if (totalBatches === 1 && fileDataList.length < this.MAX_NOTES_PER_BATCH) {
                console.log(`Small vault detected: processing all ${fileDataList.length} notes in a single batch`);
            } else if (totalBatches > 1) {
                const batchSizes = batches.map(batch => batch.length);
                console.log(`Batch size distribution: ${batchSizes.join(', ')} notes per batch`);
            }
            
            // Process batches sequentially with proper rate limiting
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                const batch = batches[batchIndex];
                const batchFileCount = batch.length;
                const batchWordCount = batch.reduce((sum, f) => sum + f.wordCount, 0);
                
                // Update progress with batch info
                const tokenInfo = totalTokenUsage.totalTokens > 0 ? ` (${totalTokenUsage.totalTokens} tokens used)` : '';
                progressNotice.setMessage(`Processing batch ${batchIndex + 1}/${totalBatches} (${batchFileCount} notes, ${batchWordCount} words)... (${processed}/${includedFiles.length} completed, ${failed} failed)${tokenInfo}`);
                
                try {
                    // Process entire batch in a single API request
                    const batchResult = await this.analyzeBatch(batch);
                    const batchResults = batchResult.results;
                    
                    // Accumulate token usage
                    totalTokenUsage.promptTokens += batchResult.tokenUsage.promptTokens;
                    totalTokenUsage.candidatesTokens += batchResult.tokenUsage.candidatesTokens;
                    totalTokenUsage.totalTokens += batchResult.tokenUsage.totalTokens;
                    
                    console.log(`Batch ${batchIndex + 1} completed successfully: ${batchFileCount} notes, ${batchWordCount} words, ${batchResult.tokenUsage.totalTokens} tokens`);
                    
                    // Process batch results
                    for (let i = 0; i < batch.length; i++) {
                        const fileData = batch[i];
                        const result = batchResults[i];
                        
                        if (result && result.success && result.data) {
                            results.push(result.data);
                            processed++;
                        } else {
                            console.error(`Failed to analyze file ${fileData.file.path}:`, result?.error || 'Unknown error');
                            failed++;
                            processed++;
                        }
                    }
                    
                } catch (batchError) {
                    console.error(`Error processing batch ${batchIndex + 1}:`, batchError);
                    
                    // Check if it's a rate limit error (429) and retry with longer delay
                    if (batchError instanceof Error && batchError.message.includes('429')) {
                        console.log(`Rate limit hit, retrying batch ${batchIndex + 1} after longer delay...`);
                        const tokenInfo = totalTokenUsage.totalTokens > 0 ? ` (${totalTokenUsage.totalTokens} tokens used)` : '';
                        progressNotice.setMessage(`Rate limit exceeded, waiting before retry... (${processed}/${includedFiles.length} completed, ${failed} failed)${tokenInfo}`);
                        
                        // Wait longer for rate limit retry (respecting 30 RPM = max 2 requests per minute)
                        await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_RETRY_DELAY)); // 8 second delay for rate limit retry
                        
                        // Retry the batch once
                        try {
                            console.log(`Retrying batch ${batchIndex + 1}...`);
                            const retryResult = await this.analyzeBatch(batch);
                            const retryResults = retryResult.results;
                            
                            // Accumulate token usage from retry
                            totalTokenUsage.promptTokens += retryResult.tokenUsage.promptTokens;
                            totalTokenUsage.candidatesTokens += retryResult.tokenUsage.candidatesTokens;
                            totalTokenUsage.totalTokens += retryResult.tokenUsage.totalTokens;
                            
                            console.log(`Batch ${batchIndex + 1} retry completed successfully`);
                            
                            for (let i = 0; i < batch.length; i++) {
                                const fileData = batch[i];
                                const result = retryResults[i];
                                
                                if (result && result.success && result.data) {
                                    results.push(result.data);
                                    processed++;
                                } else {
                                    console.error(`Failed to analyze file ${fileData.file.path} on retry:`, result?.error || 'Unknown error');
                                    failed++;
                                    processed++;
                                }
                            }
                        } catch (retryError) {
                            console.error(`Retry failed for batch ${batchIndex + 1}:`, retryError);
                            // Mark all files in this batch as failed
                            failed += batch.length;
                            processed += batch.length;
                        }
                    } else {
                        // Non-rate-limit error, mark all files in this batch as failed
                        console.error(`Non-rate-limit error in batch ${batchIndex + 1}:`, batchError);
                        failed += batch.length;
                        processed += batch.length;
                    }
                }
                
                // Rate limiting: wait between batches to respect 30 RPM limit
                if (batchIndex < totalBatches - 1) {
                    const tokenInfo = totalTokenUsage.totalTokens > 0 ? ` (${totalTokenUsage.totalTokens} tokens used)` : '';
                    progressNotice.setMessage(`Rate limiting: waiting 3s before next batch... (${processed}/${includedFiles.length} completed, ${failed} failed)${tokenInfo}`);
                    await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
                } else if (totalBatches === 1) {
                    // Single batch - no rate limiting needed
                    console.log('Single batch processing completed - no rate limiting required');
                }
            }

            // Hide progress notice
            progressNotice.hide();

            // Calculate graph metrics and enhance results
            const enhanceNotice = new Notice('Calculating graph metrics...', 0);
            const graphMetrics = await this.calculateGraphMetrics();
            
            // Enhance results with graph metrics
            const enhancedResults = results.map(result => {
                const metrics = graphMetrics.get(result.path);
                return {
                    ...result,
                    graphMetrics: metrics
                };
            });
            
            // Calculate and add centrality rankings
            const resultsWithRankings = this.calculateCentralityRankings(enhancedResults);
            
            // Save enhanced results to JSON file with token usage
            await this.saveAnalysisResults(resultsWithRankings, totalTokenUsage);
            
            enhanceNotice.hide();
            
            // Show completion notice with detailed stats including token usage
            if (failed === 0) {
                new Notice(`✅ Vault analysis with graph metrics completed successfully! Processed ${processed} files using ${totalTokenUsage.totalTokens} tokens. Results saved to plugin data folder`);
            } else {
                new Notice(`⚠️ Vault analysis with graph metrics completed with some issues. Processed ${processed - failed} files successfully, ${failed} failed, using ${totalTokenUsage.totalTokens} tokens. Results saved to plugin data folder`);
            }
            
        } catch (error) {
            console.error('Failed to generate vault analysis:', error);
            new Notice(`❌ Failed to generate vault analysis: ${(error as Error).message}`);
        }
    }

    private async analyzeBatch(fileDataList: Array<{
        file: TFile;
        content: string;
        wordCount: number;
        created: string;
        modified: string;
        isShort: boolean;
    }>): Promise<{
        results: Array<{ success: boolean; data?: VaultAnalysisResult; error?: string }>;
        tokenUsage: TokenUsage;
    }> {
        try {
            // File data is already prepared, no need to read files again
            const fileData = fileDataList;

            // Separate short files from files that need API analysis
            const shortFiles = fileData.filter(data => data.isShort);
            const apiFiles = fileData.filter(data => !data.isShort);
            
            const results: Array<{ success: boolean; data?: VaultAnalysisResult; error?: string }> = [];
            let totalTokenUsage: TokenUsage = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };
            
            // Handle short files locally without API call
            shortFiles.forEach(data => {
                results.push({
                    success: true,
                    data: {
                        id: this.generateFileId(data.file),
                        title: data.file.basename,
                        summary: 'Note is empty or too short for semantic analysis',
                        keywords: '',
                        knowledgeDomains: [], // Empty array instead of empty string
                        created: data.created,
                        modified: data.modified,
                        path: data.file.path,
                        wordCount: data.wordCount
                    }
                });
            });

            // Process API files if any exist
            if (apiFiles.length > 0) {
                try {
                    // Use structured output instead of deprecated generateBatchAnalysis
                    const batchAnalysisResult = await this.generateStructuredBatchAnalysis(apiFiles);
                    
                    // Accumulate token usage
                    totalTokenUsage.promptTokens += batchAnalysisResult.tokenUsage.promptTokens;
                    totalTokenUsage.candidatesTokens += batchAnalysisResult.tokenUsage.candidatesTokens;
                    totalTokenUsage.totalTokens += batchAnalysisResult.tokenUsage.totalTokens;
                    
                    // Process API results
                    for (let i = 0; i < apiFiles.length; i++) {
                        const data = apiFiles[i];
                        const analysis = batchAnalysisResult.results[i];
                        
                        if (analysis && analysis.summary) {
                            // Convert comma-separated domains to array
                            const domainArray = analysis.knowledgeDomain 
                                ? analysis.knowledgeDomain.split(',').map(domain => domain.trim()).filter(domain => domain.length > 0)
                                : [];
                                
                            results.push({
                                success: true,
                                data: {
                                    id: this.generateFileId(data.file),
                                    title: data.file.basename,
                                    summary: analysis.summary,
                                    keywords: analysis.keywords,
                                    knowledgeDomains: domainArray, // Use array instead of string
                                    created: data.created,
                                    modified: data.modified,
                                    path: data.file.path,
                                    wordCount: data.wordCount
                                }
                            });
                        } else {
                            results.push({ success: false, error: 'Failed to generate analysis' });
                        }
                    }
                } catch (apiError) {
                    console.error('Error in API batch analysis:', apiError);
                    // Return error for all API files
                    apiFiles.forEach(() => {
                        results.push({ success: false, error: (apiError as Error).message });
                    });
                }
            }
            
            // Sort results to match original file order
            const sortedResults: Array<{ success: boolean; data?: VaultAnalysisResult; error?: string }> = [];
            for (const originalData of fileData) {
                const result = results.find(r => 
                    r.data && r.data.path === originalData.file.path
                ) || results.find(r => !r.success);
                
                if (result) {
                    sortedResults.push(result);
                    // Remove the result to avoid duplication
                    const index = results.indexOf(result);
                    if (index > -1) {
                        results.splice(index, 1);
                    }
                } else {
                    sortedResults.push({ success: false, error: 'Result not found' });
                }
            }
            
            return { results: sortedResults, tokenUsage: totalTokenUsage };
        } catch (error) {
            console.error('Error in batch analysis:', error);
            // Return error for all files in batch
            return {
                results: fileDataList.map(() => ({ success: false, error: (error as Error).message })),
                tokenUsage: { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 }
            };
        }
    }

    private generateFileId(file: TFile): string {
        // Generate a consistent ID based on file path
        // Obsidian doesn't provide a built-in unique ID, so we create one
        return file.path.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    }

    private cleanupContent(content: string): string {
        // Remove markdown syntax and clean up content
        let cleaned = content
            // Remove frontmatter
            .replace(/^---[\s\S]*?---\n?/m, '')
            // Remove empty lines
            .replace(/^\s*$/gm, '')
            // Remove multiple consecutive newlines
            .replace(/\n{3,}/g, '\n\n')
            // Remove markdown headers
            .replace(/^#{1,6}\s+/gm, '')
            // Remove markdown links but keep text
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // Remove markdown bold/italic
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            // Remove markdown code blocks
            .replace(/```[\s\S]*?```/g, '')
            // Remove inline code
            .replace(/`([^`]+)`/g, '$1')
            // Remove bullet points
            .replace(/^[\s]*[-*+]\s+/gm, '')
            // Remove numbered lists
            .replace(/^[\s]*\d+\.\s+/gm, '')
            // Clean up extra whitespace
            .replace(/\s+/g, ' ')
            .trim();

        // Limit to exactly MAX_WORDS_PER_NOTE words per note for consistent batch processing
        const words = cleaned.split(/\s+/);
        if (words.length > this.MAX_WORDS_PER_NOTE) {
            cleaned = words.slice(0, this.MAX_WORDS_PER_NOTE).join(' ') + '...';
        }

        return cleaned;
    }

    private async ensureVaultAnalysisFileExists(): Promise<void> {
        const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/vault-analysis.json`;
        try {
            await this.app.vault.adapter.read(filePath);
        } catch {
            // File doesn't exist, create it with empty structure
            const initialData: VaultAnalysisData = {
                generatedAt: new Date().toISOString(),
                totalFiles: 0,
                apiProvider: 'Google Gemini',
                tokenUsage: { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 },
                results: []
            };
            // Ensure the plugin directory exists
            const pluginDir = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis`;
            try {
                await this.app.vault.adapter.mkdir(pluginDir);
            } catch {
                // Directory might already exist
            }
            await this.app.vault.adapter.write(filePath, JSON.stringify(initialData, null, 2));
            console.log('Created initial vault analysis file in plugin data folder');
        }
    }

    public async viewVaultAnalysisResults(): Promise<void> {
        try {
            // Ensure the file exists
            await this.ensureVaultAnalysisFileExists();
            
            // Try to read existing vault analysis results from plugin data folder
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/vault-analysis.json`;
            let analysisData = null;
            let hasExistingData = false;
            
            try {
                const content = await this.app.vault.adapter.read(filePath);
                analysisData = JSON.parse(content);
                hasExistingData = analysisData.results && analysisData.results.length > 0;
                
                // Check if the data has graph metrics
                if (hasExistingData) {
                    const hasGraphMetrics = analysisData.results.some((result: VaultAnalysisResult) => 
                        result.graphMetrics && Object.keys(result.graphMetrics).length > 0
                    );
                    
                    if (!hasGraphMetrics) {
                        // Offer to enhance with graph metrics
                        const shouldEnhance = await new Promise<boolean>((resolve) => {
                            const notice = new Notice('Your vault analysis exists but lacks graph metrics. Click to enhance it with centrality scores.', 0);
                            
                            // Create enhance button in the notice
                            const enhanceBtn = notice.noticeEl.createEl('button', { 
                                text: 'Enhance with Graph Metrics',
                                cls: 'graph-enhance-btn'
                            });
                            enhanceBtn.style.marginLeft = '10px';
                            enhanceBtn.style.padding = '4px 8px';
                            enhanceBtn.style.backgroundColor = 'var(--interactive-accent)';
                            enhanceBtn.style.color = 'var(--text-on-accent)';
                            enhanceBtn.style.border = 'none';
                            enhanceBtn.style.borderRadius = '4px';
                            enhanceBtn.style.cursor = 'pointer';
                            
                            enhanceBtn.onclick = () => {
                                notice.hide();
                                resolve(true);
                            };
                            
                            // Auto-resolve to false after 8 seconds
                            setTimeout(() => {
                                notice.hide();
                                resolve(false);
                            }, 8000);
                        });

                        if (shouldEnhance) {
                            // Show loading notice and enhance with graph metrics
                            const enhanceNotice = new Notice('Enhancing vault analysis with graph metrics...', 0);
                            try {
                                await this.enhanceWithGraphMetrics();
                                enhanceNotice.hide();
                                new Notice('✅ Vault analysis enhanced with graph metrics!');
                                
                                // Reload the enhanced data
                                const enhancedContent = await this.app.vault.adapter.read(filePath);
                                analysisData = JSON.parse(enhancedContent);
                                
                            } catch (error) {
                                enhanceNotice.hide();
                                console.error('Error enhancing with graph metrics:', error);
                                new Notice(`❌ Failed to enhance analysis: ${(error as Error).message}`);
                                // Continue with original data
                            }
                        }
                    }
                }
            } catch (error) {
                // File doesn't exist or is invalid, we'll show empty state
                hasExistingData = false;
            }
            
            // Always display modal, passing whether we have existing data
            const modal = new VaultAnalysisModal(this.app, analysisData, hasExistingData, this, this.settings);
            modal.open();
        } catch (error) {
            console.error('Failed to load vault analysis results:', error);
            new Notice(error instanceof Error ? error.message : 'Failed to load vault analysis results');
        }
    }


    private isFileExcluded(file: TFile): boolean {
        // Check folder exclusions
        if (this.settings.excludeFolders && this.settings.excludeFolders.length > 0) {
            for (const excludeFolder of this.settings.excludeFolders) {
                if (excludeFolder && file.path.toLowerCase().includes(excludeFolder.toLowerCase())) {
                    return true;
                }
            }
        }

        // Check tag exclusions
        if (this.settings.excludeTags && this.settings.excludeTags.length > 0) {
            const fileCache = this.app.metadataCache.getFileCache(file);
            if (fileCache) {
                // Check frontmatter tags
                const frontmatterTags = fileCache.frontmatter?.tags || [];
                // Check inline tags
                const inlineTags = fileCache.tags?.map(tag => tag.tag.replace('#', '')) || [];
                
                const allTags = [...frontmatterTags, ...inlineTags];
                
                for (const excludeTag of this.settings.excludeTags) {
                    if (excludeTag && allTags.some(tag => 
                        tag.toLowerCase().includes(excludeTag.toLowerCase())
                    )) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
        this.aiService.updateSettings(settings);
    }

    public destroy(): void {
        // No cleanup needed - removed unused statusBarItem
    }

    private async saveAnalysisResults(results: VaultAnalysisResult[], totalTokenUsage: TokenUsage): Promise<void> {
        try {
            // Ensure the file exists
            await this.ensureVaultAnalysisFileExists();
            
            // Sort results by title for consistent ordering
            const sortedResults = results.sort((a, b) => a.title.localeCompare(b.title));

            // Build DDC code-to-name map using DDCHelper directly
            const ddcHelper = DDCHelper.getInstance(this.app);
            await ddcHelper.loadDDCTemplate();
            const ddcCodeToNameMap = ddcHelper.getDDCCodeToNameMap();

            // Convert DDC codes to domain names and store as string array
            const enhancedResults = sortedResults.map(result => {
                // Handle legacy data format (string) or new format (array)
                let domainCodes: string[] = [];
                
                // TypeScript doesn't know about the old property, so we need to use type assertion
                const oldResult = result as any;
                if (oldResult.knowledgeDomain && typeof oldResult.knowledgeDomain === 'string') {
                    domainCodes = oldResult.knowledgeDomain.split(',')
                        .map((code: string) => code.trim())
                        .filter((code: string) => code.length > 0);
                } else if (result.knowledgeDomains && Array.isArray(result.knowledgeDomains)) {
                    domainCodes = result.knowledgeDomains;
                }
                
                // Convert codes to names
                const domainNames = domainCodes.map(code => ddcCodeToNameMap.get(code) || code);
                
                // Create a clean result object with the new format
                const cleanResult: VaultAnalysisResult = {
                    id: result.id,
                    title: result.title,
                    summary: result.summary,
                    keywords: result.keywords,
                    knowledgeDomains: domainNames,
                    created: result.created,
                    modified: result.modified,
                    path: result.path,
                    wordCount: result.wordCount
                };
                
                // Add optional properties if they exist
                if (result.graphMetrics) {
                    cleanResult.graphMetrics = result.graphMetrics;
                }
                
                if (result.centralityRankings) {
                    cleanResult.centralityRankings = result.centralityRankings;
                }
                
                return cleanResult;
            });
            
            // Create the output data with metadata
            const outputData: VaultAnalysisData = {
                generatedAt: new Date().toISOString(),
                totalFiles: enhancedResults.length,
                apiProvider: 'Google Gemini',
                tokenUsage: totalTokenUsage,
                results: enhancedResults
            };
            
            // Save to plugin data folder
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/vault-analysis.json`;
            
            // Write the file
            await this.app.vault.adapter.write(filePath, JSON.stringify(outputData, null, 2));
            
            console.log(`Vault analysis results saved to plugin data folder: ${filePath}`);
            
            // Create initial structure-analysis.json file with domain hierarchy
            await this.masterAnalysisManager.createInitialStructureAnalysis();
        } catch (error) {
            console.error('Failed to save analysis results:', error);
            throw new Error(`Failed to save results: ${(error as Error).message}`);
        }
    }


    // Core analysis function.
    // Core analysis function using structured output API

    private async generateStructuredBatchAnalysis(fileData: Array<{
        file: TFile;
        content: string;
        wordCount: number;
        created: string;
        modified: string;
        isShort: boolean;
    }>): Promise<{
        results: Array<{
            summary: string;
            keywords: string;
            knowledgeDomain: string;
        }>;
        tokenUsage: TokenUsage;
    }> {
        // Filter out short files (they should already be filtered, but double-check)
        const meaningfulFiles = fileData.filter(data => !data.isShort && data.content.trim().length > 0);
        
        if (meaningfulFiles.length === 0) {
            return {
                results: [],
                tokenUsage: { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 }
            };
        }

        // Ensure DDC template is loaded
        await this.loadDDCTemplate();

        // Generate optimized sections list for AI prompt in JSON format
        const sectionsJson = JSON.stringify(
            this.ddcSectionsList.map(section => ({
                id: section.id,
                name: section.name
            }))
        );

        // Build optimized prompt with clear system/context/instruction structure
        const systemPrompt = `You are an expert knowledge analyst specializing in semantic analysis and knowledge classification. Your role is to analyze notes and extract meaningful insights using the Dewey Decimal Classification (DDC) system.`;

        const contextPrompt = `## DDC Classification Reference
Use the following DDC sections for classification. Each section has an ID and name:

\`\`\`json
${sectionsJson}
\`\`\`

## Classification Guidelines:
- Be specific: use the most detailed section that applies
- Multi-domain notes: a note can belong to multiple sections if it spans different domains
- Valid codes only: only use DDC codes from the provided reference list
- Format: comma-separated DDC codes (e.g., "0-0-4,1-5-1")`;

        const instructionPrompt = `## Analysis Instructions
For each note, provide:
1. **Summary**: A two to three sentence summary of the main concept or purpose (be detailed and insightful)
2. **Keywords**: 3-6 key terms or phrases (comma-separated)
3. **Knowledge Domain**: DDC classification codes that best match the content (comma-separated)

## Notes to Analyze:`;

        // Build the complete prompt by combining all components
        let fullPrompt = `${systemPrompt}\n\n${contextPrompt}\n\n${instructionPrompt}\n\n`;
        
        // Add each meaningful file to the prompt
        meaningfulFiles.forEach((data, index) => {
            fullPrompt += `--- Note ${index + 1}: "${data.file.basename}" (${data.wordCount} words) ---\n${data.content}\n\n`;
        });

        try {
            // Use structured output instead of deprecated generateBatchAnalysis
            const responseSchema = this.aiService.createVaultSemanticAnalysisSchema(meaningfulFiles.length);
            
                                        // Add debugging info
            console.log(`Structured analysis: ${meaningfulFiles.length} notes, prompt length: ${fullPrompt.length} chars`);
            console.log('Response schema:', JSON.stringify(responseSchema, null, 2));
            
            const response = await this.aiService.generateStructuredAnalysis<Array<{
                summary: string;
                keywords: string;
                knowledgeDomain: string;
            }>>(
                fullPrompt,
                responseSchema,
                meaningfulFiles.length * 150 + 300, // Calculate appropriate token limit
                0.2, // Low temperature for consistent results
                0.72 // Default topP
            );

            // Use actual token usage from API response instead of estimation
            const actualTokenUsage = response.tokenUsage;
            console.log(`Batch analysis completed with DDC classification using structured output. Actual token usage: ${actualTokenUsage.totalTokens} total (${actualTokenUsage.promptTokens} prompt + ${actualTokenUsage.candidatesTokens} response)`);

            return {
                results: response.result.map(item => ({
                    summary: item.summary || '',
                    keywords: item.keywords || '',
                    knowledgeDomain: item.knowledgeDomain || ''
                })),
                tokenUsage: actualTokenUsage
            };

        } catch (structuredError) {
            console.error('Structured output batch analysis failed:', structuredError);
            
            console.log('Structured analysis failed - no fallback available. Creating default results.');
            
            // Create default results for each file when structured analysis fails
            return {
                results: meaningfulFiles.map((data) => ({
                    summary: `Analysis failed for ${data.file.basename} - structured analysis error`,
                    keywords: '',
                    knowledgeDomain: ''
                })),
                tokenUsage: { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 }
            };
        }
    }
}

 