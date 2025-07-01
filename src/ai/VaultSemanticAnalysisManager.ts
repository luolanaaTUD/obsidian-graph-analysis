import { App, Notice, requestUrl, TFile, setIcon } from 'obsidian';
import { GraphAnalysisSettings } from '../types/types';
import { VaultAnalysisModal, VaultAnalysisInfoModal } from '../views/VaultAnalysisModals';
import { 
    TokenUsage, 
    VaultAnalysisResult, 
    VaultAnalysisData 
} from './MasterAnalysisManager';
import { GraphDataBuilder } from '../components/graph-view/data/graph-builder';
import { PluginService } from '../services/PluginService';

export class VaultSemanticAnalysisManager {
    private app: App;
    private settings: GraphAnalysisSettings;
    private statusBarItem: HTMLElement | null = null;
    private graphDataBuilder: GraphDataBuilder;
    private pluginService: PluginService;

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.settings = settings;
        this.graphDataBuilder = new GraphDataBuilder(app);
        this.pluginService = new PluginService(app);
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
            
            // Update the analysis data
            const updatedData: VaultAnalysisData = {
                ...existingData,
                results: enhancedResults,
                // Update timestamp to reflect the enhancement
                generatedAt: new Date().toISOString()
            };
            
            // Save the enhanced data
            await this.app.vault.adapter.write(filePath, JSON.stringify(updatedData, null, 2));
            
            console.log('Enhanced existing vault analysis with graph metrics');
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

            // Process files in batches to avoid rate limiting
            const batchSize = 10; // 10 files per batch
            const delayBetweenBatches = 5000; // 5 seconds between batches for rate limiting
            const totalBatches = Math.ceil(includedFiles.length / batchSize);
            
            // Process batches sequentially
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                const startIndex = batchIndex * batchSize;
                const endIndex = Math.min(startIndex + batchSize, includedFiles.length);
                const batch = includedFiles.slice(startIndex, endIndex);
                
                // API response status flag
                let apiResponseStatus: number | null = null;
                let apiResponseReceived = false;
                
                // Update progress with token usage
                const tokenInfo = totalTokenUsage.totalTokens > 0 ? ` (${totalTokenUsage.totalTokens} tokens used)` : '';
                progressNotice.setMessage(`Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} files)... (${processed}/${includedFiles.length} completed, ${failed} failed)${tokenInfo}`);
                
                try {
                    // Process entire batch in a single API request
                    const batchResult = await this.analyzeBatch(batch);
                    const batchResults = batchResult.results;
                    
                    // Accumulate token usage
                    totalTokenUsage.promptTokens += batchResult.tokenUsage.promptTokens;
                    totalTokenUsage.candidatesTokens += batchResult.tokenUsage.candidatesTokens;
                    totalTokenUsage.totalTokens += batchResult.tokenUsage.totalTokens;
                    
                    // Set flag when API response is successful
                    apiResponseStatus = 200;
                    apiResponseReceived = true;
                    
                    // Process batch results immediately after successful API response
                    for (let i = 0; i < batch.length; i++) {
                        const file = batch[i];
                        const result = batchResults[i];
                        
                        if (result && result.success && result.data) {
                            results.push(result.data);
                            processed++;
                        } else {
                            console.error(`Failed to analyze file ${file.path}:`, result?.error || 'Unknown error');
                            failed++;
                            processed++;
                        }
                    }
                    
                } catch (batchError) {
                    console.error(`Error processing batch ${batchIndex + 1}:`, batchError);
                    
                    // Set error flag
                    apiResponseReceived = true;
                    if (batchError instanceof Error && batchError.message.includes('429')) {
                        apiResponseStatus = 429;
                    } else {
                        apiResponseStatus = 500; // Generic error status
                    }
                    
                    // Check if it's a rate limit error (429) and retry with longer delay
                    if (batchError instanceof Error && batchError.message.includes('429')) {
                        console.log(`Rate limit hit, retrying batch ${batchIndex + 1} after longer delay...`);
                        const tokenInfo = totalTokenUsage.totalTokens > 0 ? ` (${totalTokenUsage.totalTokens} tokens used)` : '';
                        progressNotice.setMessage(`Rate limit exceeded, waiting 10s before retry... (${processed}/${includedFiles.length} completed, ${failed} failed)${tokenInfo}`);
                        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay for rate limit retry
                        
                        // Retry the batch once
                        try {
                            const retryResult = await this.analyzeBatch(batch);
                            const retryResults = retryResult.results;
                            
                            // Accumulate token usage from retry
                            totalTokenUsage.promptTokens += retryResult.tokenUsage.promptTokens;
                            totalTokenUsage.candidatesTokens += retryResult.tokenUsage.candidatesTokens;
                            totalTokenUsage.totalTokens += retryResult.tokenUsage.totalTokens;
                            
                            // Update flag after successful retry
                            apiResponseStatus = 200;
                            apiResponseReceived = true;
                            
                            for (let i = 0; i < batch.length; i++) {
                                const file = batch[i];
                                const result = retryResults[i];
                                
                                if (result && result.success && result.data) {
                                    results.push(result.data);
                                    processed++;
                                } else {
                                    console.error(`Failed to analyze file ${file.path} on retry:`, result?.error || 'Unknown error');
                                    failed++;
                                    processed++;
                                }
                            }
                        } catch (retryError) {
                            console.error(`Retry failed for batch ${batchIndex + 1}:`, retryError);
                            // Mark all files in this batch as failed
                            failed += batch.length;
                            processed += batch.length;
                            apiResponseStatus = 500;
                        }
                    } else {
                        // Non-rate-limit error, mark all files in this batch as failed
                        failed += batch.length;
                        processed += batch.length;
                    }
                }
                
                // Rate limiting: always wait between batches
                if (batchIndex < totalBatches - 1) {
                    // progressNotice.setMessage(`Rate limiting: waiting 5s... (${processed}/${includedFiles.length} completed, ${failed} failed)`);
                    await new Promise(resolve => setTimeout(resolve, delayBetweenBatches)); // Always wait between batches
                    
                    // After delay, check if we got a successful response
                    if (apiResponseReceived && apiResponseStatus === 200) {
                        const tokenInfo = totalTokenUsage.totalTokens > 0 ? ` (${totalTokenUsage.totalTokens} tokens used)` : '';
                        progressNotice.setMessage(`API responded successfully, proceeding to next batch... (${processed}/${includedFiles.length} completed, ${failed} failed)${tokenInfo}`);
                    } else {
                        // Wait until we get a successful response or timeout
                        let waitTime = 0;
                        const maxWaitTime = 30000; // Maximum 30 seconds additional wait
                        const checkInterval = 1000; // Check every 1 second
                        
                        while (waitTime < maxWaitTime && (!apiResponseReceived || apiResponseStatus !== 200)) {
                            const tokenInfo = totalTokenUsage.totalTokens > 0 ? ` (${totalTokenUsage.totalTokens} tokens used)` : '';
                            progressNotice.setMessage(`Waiting for successful API response... ${Math.ceil((maxWaitTime - waitTime)/1000)}s remaining (${processed}/${includedFiles.length} completed, ${failed} failed)${tokenInfo}`);
                            await new Promise(resolve => setTimeout(resolve, checkInterval));
                            waitTime += checkInterval;
                        }
                        
                        const tokenInfo = totalTokenUsage.totalTokens > 0 ? ` (${totalTokenUsage.totalTokens} tokens used)` : '';
                        if (apiResponseStatus === 200) {
                            progressNotice.setMessage(`API response successful after additional wait, proceeding... (${processed}/${includedFiles.length} completed, ${failed} failed)${tokenInfo}`);
                        } else {
                            progressNotice.setMessage(`Proceeding despite API issues (status: ${apiResponseStatus})... (${processed}/${includedFiles.length} completed, ${failed} failed)${tokenInfo}`);
                        }
                    }
                }
            }

            // Hide progress notice
            progressNotice.hide();

            // Calculate graph metrics and enhance results
            progressNotice.setMessage('Calculating graph metrics...');
            const graphMetrics = await this.calculateGraphMetrics();
            
            // Enhance results with graph metrics
            const enhancedResults = results.map(result => {
                const metrics = graphMetrics.get(result.path);
                return {
                    ...result,
                    graphMetrics: metrics
                };
            });
            
            // Save enhanced results to JSON file with token usage
            await this.saveAnalysisResults(enhancedResults, totalTokenUsage);
            
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

    private async analyzeBatch(files: TFile[]): Promise<{
        results: Array<{ success: boolean; data?: VaultAnalysisResult; error?: string }>;
        tokenUsage: TokenUsage;
    }> {
        try {
            // Prepare file data for batch processing
            const fileData: Array<{
                file: TFile;
                content: string;
                wordCount: number;
                created: string;
                modified: string;
                isShort: boolean;
            }> = [];

            for (const file of files) {
                try {
                    const content = await this.app.vault.read(file);
                    const cleanedContent = this.cleanupContent(content);
                    const wordCount = cleanedContent.split(/\s+/).filter(word => word.length > 0).length;
                    
                    // Get file stats
                    const stat = await this.app.vault.adapter.stat(file.path);
                    const created = stat?.ctime ? new Date(stat.ctime).toISOString() : '';
                    const modified = stat?.mtime ? new Date(stat.mtime).toISOString() : '';

                    fileData.push({
                        file,
                        content: cleanedContent,
                        wordCount,
                        created,
                        modified,
                        isShort: wordCount < 10 // Mark files that are too short
                    });
                } catch (error) {
                    console.error(`Error reading file ${file.path}:`, error);
                    fileData.push({
                        file,
                        content: '',
                        wordCount: 0,
                        created: '',
                        modified: '',
                        isShort: true
                    });
                }
            }

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
                        knowledgeDomain: '',
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
                    const batchAnalysisResult = await this.generateBatchAnalysis(apiFiles);
                    
                    // Accumulate token usage
                    totalTokenUsage.promptTokens += batchAnalysisResult.tokenUsage.promptTokens;
                    totalTokenUsage.candidatesTokens += batchAnalysisResult.tokenUsage.candidatesTokens;
                    totalTokenUsage.totalTokens += batchAnalysisResult.tokenUsage.totalTokens;
                    
                    // Process API results
                    for (let i = 0; i < apiFiles.length; i++) {
                        const data = apiFiles[i];
                        const analysis = batchAnalysisResult.results[i];
                        
                        if (analysis && analysis.summary) {
                            results.push({
                                success: true,
                                data: {
                                    id: this.generateFileId(data.file),
                                    title: data.file.basename,
                                    summary: analysis.summary,
                                    keywords: analysis.keywords,
                                    knowledgeDomain: analysis.knowledgeDomain,
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
                results: files.map(() => ({ success: false, error: (error as Error).message })),
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

        // Limit to approximately 1000 words
        const words = cleaned.split(/\s+/);
        if (words.length > 1000) {
            cleaned = words.slice(0, 1000).join(' ') + '...';
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

    private showVaultAnalysisInfo(): void {
        const modal = new VaultAnalysisInfoModal(this.app);
        modal.open();
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
    }

    public destroy(): void {
        if (this.statusBarItem) {
            this.statusBarItem.remove();
            this.statusBarItem = null;
        }
    }

    private async saveAnalysisResults(results: VaultAnalysisResult[], totalTokenUsage: TokenUsage): Promise<void> {
        try {
            // Ensure the file exists
            await this.ensureVaultAnalysisFileExists();
            
            // Sort results by title for consistent ordering
            const sortedResults = results.sort((a, b) => a.title.localeCompare(b.title));
            
            // Create the output data with metadata
            const outputData: VaultAnalysisData = {
                generatedAt: new Date().toISOString(),
                totalFiles: sortedResults.length,
                apiProvider: 'Google Gemini',
                tokenUsage: totalTokenUsage,
                results: sortedResults
            };
            
            // Save to plugin data folder
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/vault-analysis.json`;
            
            // Write the file
            await this.app.vault.adapter.write(filePath, JSON.stringify(outputData, null, 2));
            
            console.log(`Vault analysis results saved to plugin data folder: ${filePath}`);
        } catch (error) {
            console.error('Failed to save analysis results:', error);
            throw new Error(`Failed to save results: ${(error as Error).message}`);
        }
    }

    private async generateBatchAnalysis(fileData: Array<{
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
        const apiKey = this.settings.geminiApiKey;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

        // Filter out short files (they should already be filtered, but double-check)
        const meaningfulFiles = fileData.filter(data => !data.isShort && data.content.trim().length > 0);
        
        if (meaningfulFiles.length === 0) {
            return {
                results: [],
                tokenUsage: { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 }
            };
        }

        // Build the batch prompt
        let prompt = `Analyze the following ${meaningfulFiles.length} notes and provide analysis for each one. For each note, provide:
1. A one-sentence summary of the main concept or purpose
2. 3-6 key terms or phrases (comma-separated)
3. 2-4 knowledge domains or fields this content belongs to (comma-separated)

Format your response as a JSON array with exactly ${meaningfulFiles.length} objects in this format:
[
  {
    "summary": "One sentence summary",
    "keywords": "keyword1, keyword2, keyword3",
    "knowledgeDomain": "domain1, domain2, domain3"
  },
  ...
]

Notes to analyze:

`;

        // Add each meaningful file to the prompt
        meaningfulFiles.forEach((data, index) => {
            prompt += `--- Note ${index + 1}: "${data.file.basename}" (${data.wordCount} words) ---\n${data.content}\n\n`;
        });

        const requestBody = { 
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.2,
                topK: 20,
                topP: 0.8,
                maxOutputTokens: meaningfulFiles.length * 100 + 200, // Dynamic token limit based on file count
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

            // Extract token usage from the response
            const tokenUsage: TokenUsage = {
                promptTokens: data.usageMetadata?.promptTokenCount || 0,
                candidatesTokens: data.usageMetadata?.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata?.totalTokenCount || 0
            };

            const responseText = data.candidates[0].content.parts[0].text;
            
            // Try to parse as JSON array
            try {
                // Clean the response text by removing markdown code blocks
                let cleanedResponse = responseText.trim();
                
                // Remove markdown code block markers if present
                if (cleanedResponse.startsWith('```json')) {
                    cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                } else if (cleanedResponse.startsWith('```')) {
                    cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
                }
                
                const jsonResponse = JSON.parse(cleanedResponse);
                if (Array.isArray(jsonResponse) && jsonResponse.length === meaningfulFiles.length) {
                    return {
                        results: jsonResponse.map(item => ({
                            summary: item.summary || '',
                            keywords: item.keywords || '',
                            knowledgeDomain: item.knowledgeDomain || ''
                        })),
                        tokenUsage
                    };
                } else {
                    console.error('Response array length mismatch. Expected:', meaningfulFiles.length, 'Got:', jsonResponse.length);
                    // If length mismatch, pad with empty results or truncate
                    const paddedResults = [];
                    for (let i = 0; i < meaningfulFiles.length; i++) {
                        if (i < jsonResponse.length && jsonResponse[i]) {
                            paddedResults.push({
                                summary: jsonResponse[i].summary || 'Analysis incomplete',
                                keywords: jsonResponse[i].keywords || '',
                                knowledgeDomain: jsonResponse[i].knowledgeDomain || ''
                            });
                        } else {
                            paddedResults.push({
                                summary: 'Analysis incomplete',
                                keywords: '',
                                knowledgeDomain: ''
                            });
                        }
                    }
                    return { results: paddedResults, tokenUsage };
                }
            } catch (parseError) {
                console.error('Failed to parse batch response as JSON:', parseError);
                console.error('Raw response:', responseText);
                // Fallback: create default results for each file
                return {
                    results: meaningfulFiles.map((data) => ({
                        summary: `Analysis failed for ${data.file.basename}`,
                        keywords: '',
                        knowledgeDomain: ''
                    })),
                    tokenUsage
                };
            }
        } catch (error) {
            console.error('Gemini API error in batch analysis:', error);
            throw error;
        }
    }
}

 