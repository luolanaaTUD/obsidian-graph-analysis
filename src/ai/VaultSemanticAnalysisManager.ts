import { App, Notice, TFile, setIcon } from 'obsidian';
import { GraphAnalysisSettings } from '../types/types';
import { VaultAnalysisModal } from '../views/VaultAnalysisModals';
import { 
    VaultAnalysisResult, 
    VaultAnalysisData,
    MasterAnalysisManager
} from './MasterAnalysisManager';
import { AIModelService, SEMANTIC_MODELS, SemanticAnalysisError } from '../services/AIModelService';
import { getUserFriendlyMessage } from '../utils/GeminiErrorUtils';
import { GraphDataBuilder } from '../components/graph-view/data/graph-builder';
import { PluginService } from '../services/PluginService';
import { KnowledgeDomainHelper } from './KnowledgeDomainHelper';
import { cleanupNoteContent } from '../utils/NoteContentUtils';

interface FailedBatchEntry {
    timestamp: string;
    batchIndex: number;
    primaryModel: string;
    retryModel: string;
    error: string;
    notes: Array<{ path: string; basename: string; charCount: number }>;
}

interface FailedBatchesData {
    remaining: {
        savedAt: string;
        retryAfter: string;
        reason: string;
        notes: Array<{ path: string; basename: string; charCount: number }>;
    } | null;
    failed: FailedBatchEntry[];
}

export class VaultSemanticAnalysisManager {
    private app: App;
    private settings: GraphAnalysisSettings;
    private aiService: AIModelService;
    private graphDataBuilder: GraphDataBuilder;
    private pluginService: PluginService;
    private masterAnalysisManager: MasterAnalysisManager;
    private subdivisionsList: Array<{id: string, name: string, domain: string, domainId: string}> = [];
    private domainTemplateLoaded: boolean = false;
    private readonly MAX_CHARS_PER_NOTE = 8000;
    private readonly MAX_NOTES_PER_BATCH = 30;
    private readonly DELAY_BETWEEN_BATCHES = 6000; // 6s between batches (Gemini 2.5 Flash Lite RPM 10)

    private _analysisInProgress: 'semantic' | 'structure' | 'evolution' | 'actions' | null = null;
    private responsesDirectoryEnsured = false;

    isAnalysisInProgress(): boolean {
        return this._analysisInProgress !== null;
    }

    setAnalysisInProgress(type: 'semantic' | 'structure' | 'evolution' | 'actions'): void {
        this._analysisInProgress = type;
    }

    clearAnalysisInProgress(): void {
        this._analysisInProgress = null;
    }

    /**
     * Get the path to vault-analysis.json in the responses folder
     */
    private getVaultAnalysisFilePath(): string {
        return `${this.app.vault.configDir}/plugins/knowledge-graph-analysis/responses/vault-analysis.json`;
    }

    private getFailedBatchesFilePath(): string {
        return `${this.app.vault.configDir}/plugins/knowledge-graph-analysis/responses/vault-analysis-failed-batches.json`;
    }

    private getSemanticModelForBatch(batchIndex: number): string {
        return SEMANTIC_MODELS[batchIndex % 2];
    }

    /**
     * Ensure responses directory exists (cached per session)
     */
    private async ensureResponsesDirectory(): Promise<void> {
        if (this.responsesDirectoryEnsured) return;
        try {
            const responsesDir = `${this.app.vault.configDir}/plugins/knowledge-graph-analysis/responses`;
            try {
                await this.app.vault.adapter.mkdir(responsesDir);
            } catch {
                // Directory might already exist
            }
        } catch {
            // Directory creation may fail if it already exists
        }
        this.responsesDirectoryEnsured = true;
    }

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.settings = settings;
        this.aiService = new AIModelService(settings);
        this.graphDataBuilder = new GraphDataBuilder(app);
        this.pluginService = new PluginService(app);
        this.masterAnalysisManager = new MasterAnalysisManager(app, settings);
    }

    /**
     * Load knowledge domain template
     */
    private async loadDomainTemplate(): Promise<boolean> {
        if (this.domainTemplateLoaded && this.subdivisionsList.length > 0) {
            return true; // Already loaded
        }

        try {
            // Ensure knowledge domain template is loaded using KnowledgeDomainHelper directly
            const domainHelper = KnowledgeDomainHelper.getInstance(this.app);
            const loaded = await domainHelper.ensureDomainTemplateLoaded();
            if (!loaded) {
                // console.error('Failed to load knowledge domain template from KnowledgeDomainHelper');
                return false;
            }

            // Get the knowledge domain subdivisions list
            this.subdivisionsList = domainHelper.getAllSubdivisions();
            this.domainTemplateLoaded = this.subdivisionsList.length > 0;
            
            // console.log(`📚 Knowledge domain template loaded for VaultSemanticAnalysisManager: ${this.subdivisionsList.length} subdivisions available`);
            return this.domainTemplateLoaded;
        } catch {
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
        button.addEventListener('click', (event: MouseEvent) => {
            if (event.shiftKey) {
                void (async () => {
                    try {
                        const enhanceNotice = new Notice('Enhancing vault analysis with graph metrics...', 0);
                        const enhanced = await this.enhanceWithGraphMetrics();
                        enhanceNotice.hide();
                        if (enhanced) {
                            new Notice('✅ vault analysis enhanced with graph metrics!');
                        } else {
                            new Notice('ℹ️ no existing vault analysis found. Generate analysis first.');
                        }
                    } catch (err) {
                        new Notice(`❌ Failed to enhance: ${err instanceof Error ? err.message : String(err)}`);
                    }
                })();
            } else {
                void this.viewVaultAnalysisResults();
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
            
        } catch {
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
     * Load existing vault analysis data if it exists
     */
    private async loadExistingAnalysisData(): Promise<VaultAnalysisData | null> {
        try {
            const filePath = this.getVaultAnalysisFilePath();
            const content = await this.app.vault.adapter.read(filePath);
            return JSON.parse(content) as VaultAnalysisData;
        } catch {
            return null;
        }
    }

    /**
     * Identify which files need to be re-analyzed
     * Compares file modification times with existing analysis results
     * Uses TFile.stat.mtime (synchronous) instead of adapter.stat for performance
     * Returns: { changedFiles, newFiles, deletedFilePaths, unchangedResults }
     */
    private identifyChangedFiles(
        currentFiles: TFile[],
        existingAnalysis: VaultAnalysisData | null
    ): {
        changedFiles: TFile[];
        newFiles: TFile[];
        deletedFilePaths: string[];
        unchangedResults: VaultAnalysisResult[];
    } {
        const changedFiles: TFile[] = [];
        const newFiles: TFile[] = [];
        const unchangedResults: VaultAnalysisResult[] = [];
        const deletedFilePaths: string[] = [];

        // If no existing analysis, all files are new
        if (!existingAnalysis || !existingAnalysis.results || existingAnalysis.results.length === 0) {
            return {
                changedFiles: [],
                newFiles: currentFiles,
                deletedFilePaths: [],
                unchangedResults: []
            };
        }

        // Create a map of existing results by file path for quick lookup
        const existingResultsMap = new Map<string, VaultAnalysisResult>();
        existingAnalysis.results.forEach(result => {
            existingResultsMap.set(result.path, result);
        });

        // Check each current file - use TFile.stat.mtime (synchronous, no I/O)
        for (const file of currentFiles) {
            const existingResult = existingResultsMap.get(file.path);

            if (!existingResult) {
                // File doesn't exist in analysis - it's new
                newFiles.push(file);
            } else {
                // File exists - check if it's been modified
                const currentMtime = file.stat.mtime;
                const existingMtime = existingResult.modified ? new Date(existingResult.modified).getTime() : 0;

                if (currentMtime > existingMtime) {
                    // File has been modified since last analysis
                    changedFiles.push(file);
                } else {
                    // File hasn't changed - keep existing result
                    unchangedResults.push(existingResult);
                }
            }
        }

        // Find deleted files (exist in analysis but not in vault)
        const currentFilePaths = new Set(currentFiles.map(f => f.path));
        existingAnalysis.results.forEach(result => {
            if (!currentFilePaths.has(result.path)) {
                deletedFilePaths.push(result.path);
            }
        });

        return {
            changedFiles,
            newFiles,
            deletedFilePaths,
            unchangedResults
        };
    }

    /**
     * Check if there are pending changes (modified or new files) that would require
     * re-running semantic analysis. Used to enable/disable the Update Analysis button.
     * @param preloadedData - Optional vault analysis data to avoid re-reading from disk
     */
    public async hasPendingSemanticChanges(preloadedData?: VaultAnalysisData | null): Promise<boolean> {
        const existingAnalysis = preloadedData !== undefined ? preloadedData : await this.loadExistingAnalysisData();
        const isIncrementalUpdate = existingAnalysis !== null && existingAnalysis.results && existingAnalysis.results.length > 0;

        if (!isIncrementalUpdate) {
            // No existing analysis - all files would need processing
            const allFiles = this.app.vault.getMarkdownFiles();
            const includedFiles = allFiles.filter(file => !this.isFileExcluded(file));
            return includedFiles.length > 0;
        }

        const allFiles = this.app.vault.getMarkdownFiles();
        const includedFiles = allFiles.filter(file => !this.isFileExcluded(file));
        const changeInfo = this.identifyChangedFiles(includedFiles, existingAnalysis);
        const pendingCount = changeInfo.changedFiles.length + changeInfo.newFiles.length;
        return pendingCount > 0;
    }

    /**
     * Merge new analysis results with existing unchanged results
     * Removes deleted files and sorts by title
     */
    private mergeAnalysisResults(
        unchangedResults: VaultAnalysisResult[],
        newResults: VaultAnalysisResult[],
        deletedFilePaths: string[]
    ): VaultAnalysisResult[] {
        // Start with unchanged results
        const mergedResults = [...unchangedResults];
        
        // Add new/updated results
        mergedResults.push(...newResults);
        
        // Remove deleted files from the merged results
        const deletedPathsSet = new Set(deletedFilePaths);
        const beforeFilterCount = mergedResults.length;
        const filteredResults = mergedResults.filter(result => {
            const isDeleted = deletedPathsSet.has(result.path);
            if (isDeleted) {
                // console.log(`Removing deleted file from analysis: ${result.path}`);
            }
            return !isDeleted;
        });
        
        const removedCount = beforeFilterCount - filteredResults.length;
        if (removedCount > 0) {
            // console.log(`Removed ${removedCount} deleted file(s) from analysis results`);
        }
        
        // Sort by title for consistency
        return filteredResults.sort((a, b) => a.title.localeCompare(b.title));
    }

    /**
     * Enhance existing vault analysis results with graph metrics
     * This handles scenario 2: cached vault-analysis.json exists
     */
    public async enhanceWithGraphMetrics(): Promise<boolean> {
        try {
            // Load existing analysis data
            const filePath = this.getVaultAnalysisFilePath();
            
            let existingData: VaultAnalysisData;
            try {
                const content = await this.app.vault.adapter.read(filePath);
                existingData = JSON.parse(content) as VaultAnalysisData;
            } catch {
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
            // Preserve existing metadata fields, migrate from old format if needed
            const existingGeneratedFiles = existingData.generatedFiles ?? existingData.totalFiles;
            const existingUpdatedFiles = existingData.updatedFiles ?? 0;
            
            const updatedData: VaultAnalysisData = {
                ...existingData,
                results: resultsWithRankings,
                // Preserve generation metadata, don't overwrite generatedAt
                generatedFiles: existingGeneratedFiles,
                updatedFiles: existingUpdatedFiles
            };
            
            // Ensure responses directory exists before saving
            await this.ensureResponsesDirectory();
            
            // Save the enhanced data
            await this.app.vault.adapter.write(filePath, JSON.stringify(updatedData, null, 2));
            
            // console.log('Enhanced existing vault analysis with graph metrics and rankings');
            return true;
            
        } catch (error) {
            // console.error('Error enhancing vault analysis with graph metrics:', error);
            throw new Error(`Failed to enhance with graph metrics: ${(error as Error).message}`);
        }
    }

    public async generateVaultAnalysis(): Promise<boolean> {
        this.setAnalysisInProgress('semantic');
        try {
            // Check if Gemini API key is configured
            if (!this.settings.geminiApiKey || this.settings.geminiApiKey.trim() === '') {
                new Notice('Please configure your gemini API key in settings to use vault analysis.');
                return false;
            }

            // Load existing analysis data for incremental updates
            const existingAnalysis = await this.loadExistingAnalysisData();
            const isIncrementalUpdate = existingAnalysis !== null && existingAnalysis.results && existingAnalysis.results.length > 0;

            // Get all markdown files in the vault
            const allFiles = this.app.vault.getMarkdownFiles();
            
            // Filter out excluded files using the same logic as the main plugin
            const includedFiles = allFiles.filter(file => !this.isFileExcluded(file));
            
            if (includedFiles.length === 0) {
                new Notice('No files found for analysis after applying exclusion rules.');
                return false;
            }

            // Create a Set of new file paths for quick lookup during batch processing
            const newFilePaths = new Set<string>();
            
            // Identify changed files for incremental update
            let filesToProcess: TFile[];
            let unchangedResults: VaultAnalysisResult[] = [];
            let deletedFilePaths: string[] = [];
            let changedCount = 0;
            let newCount = 0;
            let unchangedCount = 0;

            if (isIncrementalUpdate) {
                // Incremental update: only process changed/new files
                const changeInfo = this.identifyChangedFiles(includedFiles, existingAnalysis);
                filesToProcess = [...changeInfo.changedFiles, ...changeInfo.newFiles];
                unchangedResults = changeInfo.unchangedResults;
                deletedFilePaths = changeInfo.deletedFilePaths;
                changedCount = changeInfo.changedFiles.length;
                newCount = changeInfo.newFiles.length;
                unchangedCount = changeInfo.unchangedResults.length;

                // Populate Set of new file paths for quick lookup during batch processing
                changeInfo.newFiles.forEach(file => newFilePaths.add(file.path));
            } else {
                // Full update: process all files
                filesToProcess = [...includedFiles];
                unchangedCount = 0;
                filesToProcess.forEach(file => newFilePaths.add(file.path));
            }

            // Append failed-batch files at the end (for resume)
            const failedPaths = await this.getFailedBatchFilePaths();
            const inFilesToProcess = new Set(filesToProcess.map(f => f.path));
            for (const path of failedPaths) {
                if (inFilesToProcess.has(path)) continue;
                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile && !this.isFileExcluded(file)) {
                    filesToProcess.push(file);
                    inFilesToProcess.add(path);
                }
            }

            if (filesToProcess.length === 0) {
                new Notice(`✅ All files are up to date. No changes detected. (${unchangedCount} files unchanged)`);
                return false;
            }

            // Show initial notice with incremental update info and estimated time
            // ~4 batches per minute based on rate limits and processing
            const batchCount = Math.ceil(filesToProcess.length / this.MAX_NOTES_PER_BATCH);
            const estimatedMins = Math.max(1, Math.ceil(batchCount / 4));
            let initialMessage: string;
            if (isIncrementalUpdate) {
                initialMessage = `Updating analysis: ${changedCount} changed, ${newCount} new, ${unchangedCount} unchanged files (processing ${filesToProcess.length} files). Est. ~${estimatedMins} min`;
            } else {
                initialMessage = `Starting vault analysis for ${filesToProcess.length} files. Est. ~${estimatedMins} min`;
            }
            const progressNotice = new Notice(initialMessage, 0);
            
            const results: VaultAnalysisResult[] = [];
            let processed = 0;
            let failed = 0;

            // Prepare file data first to get char counts
            progressNotice.setMessage('Preparing files for analysis...');
            const fileDataList: Array<{
                file: TFile;
                content: string;
                charCount: number;
                created: string;
                modified: string;
                isShort: boolean;
            }> = [];

            for (const file of filesToProcess) {
                try {
                    const content = await this.app.vault.read(file);
                    const rawCharCount = content.trim().length;
                    let cleanedContent = cleanupNoteContent(content);
                    if (cleanedContent.length > this.MAX_CHARS_PER_NOTE) {
                        cleanedContent = cleanedContent.slice(0, this.MAX_CHARS_PER_NOTE) + '...';
                    }
                    const charCount = cleanedContent.length;
                    const isShort = rawCharCount < 50;
                    if (isShort) {
                        // console.log(`File "${file.basename}": raw=${rawCharCount} chars, cleaned=${charCount} chars -> isShort=${isShort}`);
                    }

                    // Get file stats
                    const stat = await this.app.vault.adapter.stat(file.path);
                    const created = stat?.ctime ? new Date(stat.ctime).toISOString() : '';
                    const modified = stat?.mtime ? new Date(stat.mtime).toISOString() : '';

                    fileDataList.push({
                        file,
                        content: cleanedContent,
                        charCount,
                        created,
                        modified,
                        isShort
                    });
                } catch {
                    fileDataList.push({
                        file,
                        content: '',
                        charCount: 0,
                        created: '',
                        modified: '',
                        isShort: true
                    });
                }
            }

            // Create note-based batches (30 notes per batch for Gemini 2.5 Flash Lite: RPM 10)
            const delayBetweenBatches = this.DELAY_BETWEEN_BATCHES;
            
            const batches: Array<typeof fileDataList> = [];
            let currentBatch: typeof fileDataList = [];

            for (const fileData of fileDataList) {
                // If current batch is full (30 notes), start a new batch
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
            // Log batch distribution for transparency (uncomment for debugging)
            // const _averageBatchSize = Math.round(fileDataList.length / totalBatches);
            // const _updateType = isIncrementalUpdate ? 'incremental' : 'full';
            // if (totalBatches > 1) {
            //     const _batchSizes = batches.map(batch => batch.length);
            // }
            
            // Aggregate token usage across all batches
            let totalTokenUsage = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };
            let stoppedDueToQuota = false;
            let firstBatchTimestamp: string | null = null;
            let lastBatchIndex = -1;

            // Process batches sequentially with proper rate limiting
            for (let batchIndex = 0; batchIndex < totalBatches && !stoppedDueToQuota; batchIndex++) {
                lastBatchIndex = batchIndex;
                const batch = batches[batchIndex];
                const batchFileCount = batch.length;
                const batchCharCount = batch.reduce((sum, f) => sum + f.charCount, 0);
                const primaryModel = this.getSemanticModelForBatch(batchIndex);
                const alternateModel = SEMANTIC_MODELS[(batchIndex + 1) % 2];

                // Update progress with batch info
                const totalToProcess = filesToProcess.length;
                const progressText = isIncrementalUpdate
                    ? `Processing batch ${batchIndex + 1}/${totalBatches} (${batchFileCount} notes, ${batchCharCount} chars)... (${processed}/${totalToProcess} completed, ${failed} failed, ${unchangedCount} unchanged)`
                    : `Processing batch ${batchIndex + 1}/${totalBatches} (${batchFileCount} notes, ${batchCharCount} chars)... (${processed}/${totalToProcess} completed, ${failed} failed)`;
                progressNotice.setMessage(progressText);

                let batchResult: { results: Array<{ success: boolean; data?: VaultAnalysisResult; error?: string }>; tokenUsage: { promptTokens: number; candidatesTokens: number; totalTokens: number } } | null = null;

                try {
                    batchResult = await this.analyzeBatch(batch, batchIndex);
                } catch (batchError) {
                    const err = batchError instanceof SemanticAnalysisError ? batchError : new SemanticAnalysisError((batchError as Error).message, 'other', primaryModel);

                    if (err.errorType === 'quota_exhausted') {
                        // console.warn(`Daily API quota (20 RPD) exhausted at batch ${batchIndex + 1}. Stopping. Remaining notes saved for retry tomorrow.`);
                        await this.appendFailedBatch(batch, batchIndex, primaryModel, alternateModel, err.message);
                        failed += batch.length;
                        processed += batch.length;
                        progressNotice.hide();
                        stoppedDueToQuota = true;
                        break;
                    }

                    // console.error(`Error processing batch ${batchIndex + 1}:`, batchError);
                    progressNotice.setMessage(`Retrying batch ${batchIndex + 1}/${totalBatches} with ${alternateModel}...`);
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    try {
                        batchResult = await this.analyzeBatch(batch, batchIndex, alternateModel);
                    } catch (retryError) {
                        const retryErr = retryError instanceof SemanticAnalysisError ? retryError : new SemanticAnalysisError((retryError as Error).message, 'other', alternateModel);
                        // console.error(`Retry failed for batch ${batchIndex + 1}:`, retryError);

                        if (retryErr.errorType === 'quota_exhausted') {
                            await this.appendFailedBatch(batch, batchIndex, primaryModel, alternateModel, retryErr.message);
                            failed += batch.length;
                            processed += batch.length;
                            progressNotice.hide();
                            stoppedDueToQuota = true;
                            break;
                        }

                        if (retryErr.errorType === 'rate_limit') {
                            progressNotice.setMessage(`Rate limited, waiting 15s before retry...`);
                            await new Promise(resolve => setTimeout(resolve, 15000));
                            try {
                                batchResult = await this.analyzeBatch(batch, batchIndex);
                            } catch (thirdError) {
                                await this.appendFailedBatch(batch, batchIndex, primaryModel, alternateModel, (thirdError as Error).message);
                                failed += batch.length;
                                processed += batch.length;
                            }
                        } else {
                            await this.appendFailedBatch(batch, batchIndex, primaryModel, alternateModel, retryErr.message);
                            failed += batch.length;
                            processed += batch.length;
                        }
                    }
                }

                if (batchResult) {
                    totalTokenUsage.promptTokens += batchResult.tokenUsage.promptTokens;
                    totalTokenUsage.candidatesTokens += batchResult.tokenUsage.candidatesTokens;
                    totalTokenUsage.totalTokens += batchResult.tokenUsage.totalTokens;
                    // console.log(`Batch ${batchIndex + 1} completed successfully: ${batchFileCount} notes, ${batchCharCount} chars`);
                    const perNoteFailures: Array<{ path: string; basename: string; charCount: number }> = [];
                    for (let i = 0; i < batch.length; i++) {
                        const fileData = batch[i];
                        const result = batchResult.results[i];
                        if (result && result.success && result.data) {
                            results.push(result.data);
                            processed++;
                        } else {
                            // console.error(`Failed to analyze file ${fileData.file.path}:`, result?.error || 'Unknown error');
                            perNoteFailures.push({
                                path: fileData.file.path,
                                basename: fileData.file.basename,
                                charCount: fileData.charCount
                            });
                            failed++;
                            processed++;
                        }
                    }
                    if (perNoteFailures.length > 0) {
                        await this.appendFailedNotes(perNoteFailures, batchIndex, 'Empty or missing analysis in batch response');
                    }

                    // Persist after each successful batch
                    const mergedSoFar = this.mergeAnalysisResults(unchangedResults, results, deletedFilePaths);
                    if (firstBatchTimestamp === null) firstBatchTimestamp = new Date().toISOString();
                    const batchMetadata = isIncrementalUpdate && existingAnalysis
                        ? {
                            generatedAt: existingAnalysis.generatedAt,
                            totalFiles: mergedSoFar.length,
                            generatedFiles: existingAnalysis.generatedFiles ?? existingAnalysis.totalFiles,
                            updatedFiles: (existingAnalysis.updatedFiles ?? 0) + results.length
                        }
                        : {
                            generatedAt: firstBatchTimestamp,
                            totalFiles: mergedSoFar.length,
                            generatedFiles: results.length,
                            updatedFiles: 0
                        };
                    await this.saveBatchResults(mergedSoFar, isIncrementalUpdate, totalTokenUsage, batchMetadata);
                }

                // Wait between batches (rate limiting handled internally)
                if (batchIndex < totalBatches - 1) {
                    const preparingNextBatchText = isIncrementalUpdate
                        ? `Preparing batch ${batchIndex + 2}/${totalBatches}... (${processed}/${filesToProcess.length} completed, ${failed} failed, ${unchangedCount} unchanged)`
                        : `Preparing batch ${batchIndex + 2}/${totalBatches}... (${processed}/${filesToProcess.length} completed, ${failed} failed)`;
                    progressNotice.setMessage(preparingNextBatchText);
                    await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
                } else if (totalBatches === 1) {
                    // Single batch - no rate limiting needed
                    // console.log('Single batch processing completed - no rate limiting required');
                }
            }

            if (stoppedDueToQuota && lastBatchIndex + 1 < totalBatches) {
                const remainingBatches = batches.slice(lastBatchIndex + 1);
                await this.saveRemainingNotes(remainingBatches);
            }

            // Hide progress notice
            progressNotice.hide();

            // Merge results: combine new/updated results with unchanged results
            let finalResults: VaultAnalysisResult[];
            if (isIncrementalUpdate) {
                // Merge new results with unchanged results, removing deleted files
                finalResults = this.mergeAnalysisResults(unchangedResults, results, deletedFilePaths);
                // console.log(`Merged results: ${unchangedResults.length} unchanged + ${results.length} new/updated - ${deletedFilePaths.length} deleted = ${finalResults.length} total`);
            } else {
                // Full update: use all results
                // Note: Deleted files are automatically excluded because we only process files that exist in the vault
                finalResults = results;
                // console.log(`Full update: ${results.length} files processed (deleted files automatically excluded)`);
            }

            // Calculate graph metrics and enhance results
            const enhanceNotice = new Notice('Calculating graph metrics...', 0);
            const graphMetrics = await this.calculateGraphMetrics();
            
            // Enhance results with graph metrics (for all files, including unchanged ones)
            const enhancedResults = finalResults.map(result => {
                const metrics = graphMetrics.get(result.path);
                return {
                    ...result,
                    graphMetrics: metrics
                };
            });
            
            // Calculate and add centrality rankings
            const resultsWithRankings = this.calculateCentralityRankings(enhancedResults);
            
            // Save enhanced results to JSON file
            await this.saveAnalysisResults(
                resultsWithRankings,
                isIncrementalUpdate,
                newCount,
                changedCount,
                totalTokenUsage
            );

            if (!stoppedDueToQuota && failed === 0) {
                await this.clearFailedBatches();
            }

            enhanceNotice.hide();
            
            // Show completion notice with detailed stats
            const successCount = processed - failed;
            let completionMessage: string;

            if (stoppedDueToQuota) {
                const retryTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
                const retryTimeStr = retryTime.toLocaleString();
                const remainingCount = filesToProcess.length - successCount;
                completionMessage = `Saved partial results (${successCount}/${filesToProcess.length} files). `
                    + `Free tier limit: ~500 notes per day. `
                    + `You can continue analyzing the remaining ${remainingCount} notes after ${retryTimeStr} by running the analysis again.`;
            } else if (isIncrementalUpdate) {
                if (failed === 0) {
                    completionMessage = `✅ Analysis updated successfully! Processed ${successCount} changed/new files (${changedCount} changed, ${newCount} new), kept ${unchangedCount} unchanged, removed ${deletedFilePaths.length} deleted.`;
                } else {
                    completionMessage = `⚠️ Analysis update completed with some issues. Processed ${successCount} files successfully, ${failed} failed, kept ${unchangedCount} unchanged, removed ${deletedFilePaths.length} deleted.`;
                }
            } else {
                if (failed === 0) {
                    completionMessage = `✅ Vault analysis with graph metrics completed successfully! Processed ${successCount} files. Results saved to plugin data folder`;
                } else {
                    completionMessage = `⚠️ Vault analysis with graph metrics completed with some issues. Processed ${successCount} files successfully, ${failed} failed. Results saved to plugin data folder`;
                }
            }

            new Notice(completionMessage);
            
            // Return true to indicate analysis completed successfully
            return true;
            
        } catch (error) {
            // console.error('Failed to generate vault analysis:', error);
            const err = error instanceof Error ? error : new Error(String(error));
            new Notice(`❌ Failed to generate vault analysis: ${getUserFriendlyMessage(err)}`);
            return false;
        } finally {
            this.clearAnalysisInProgress();
        }
    }

    private async analyzeBatch(fileDataList: Array<{
        file: TFile;
        content: string;
        charCount: number;
        created: string;
        modified: string;
        isShort: boolean;
    }>, batchIndex: number, modelOverride?: string): Promise<{
        results: Array<{ success: boolean; data?: VaultAnalysisResult; error?: string }>;
        tokenUsage: { promptTokens: number; candidatesTokens: number; totalTokens: number };
    }> {
        try {
            // File data is already prepared, no need to read files again
            const fileData = fileDataList;

            // Separate short files from files that need API analysis
            const shortFiles = fileData.filter(data => data.isShort);
            const apiFiles = fileData.filter(data => !data.isShort);
            
            let batchTokenUsage = this.ZERO_TOKEN_USAGE;
            const results: Array<{ success: boolean; data?: VaultAnalysisResult; error?: string }> = [];
            
            // Handle short files locally without API call
            shortFiles.forEach(data => {
                results.push({
                    success: true,
                    data: {
                        id: this.generateFileId(data.file),
                        title: data.file.basename,
                        summary: `Note is empty or too short for semantic analysis (${data.charCount} chars)`,
                        keywords: '',
                        knowledgeDomains: [], // Empty array instead of empty string
                        created: data.created,
                        modified: data.modified,
                        path: data.file.path,
                        charCount: data.charCount
                    }
                });
            });

            // Process API files if any exist
            if (apiFiles.length > 0) {
                try {
                    const model = modelOverride ?? this.getSemanticModelForBatch(batchIndex);
                    const batchAnalysisResult = await this.generateStructuredBatchAnalysis(apiFiles, model);
                    batchTokenUsage = batchAnalysisResult.tokenUsage;
                    
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
                                    charCount: data.charCount
                                }
                            });
                        } else {
                            results.push({ success: false, error: 'Failed to generate analysis' });
                        }
                    }
                } catch (apiError) {
                    if (apiError instanceof SemanticAnalysisError) {
                        throw apiError;
                    }
                    // console.error('Error in API batch analysis:', apiError);
                    throw apiError;
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
            
            return { results: sortedResults, tokenUsage: batchTokenUsage };
        } catch (error) {
            if (error instanceof SemanticAnalysisError) {
                throw error;
            }
            // console.error('Error in batch analysis:', error);
            return {
                results: fileDataList.map(() => ({ success: false, error: (error as Error).message })),
                tokenUsage: this.ZERO_TOKEN_USAGE
            };
        }
    }

    private generateFileId(file: TFile): string {
        // Generate a consistent ID based on file path
        // Obsidian doesn't provide a built-in unique ID, so we create one
        return file.path.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    }

    private readonly FAILED_BATCHES_EMPTY: FailedBatchesData = { remaining: null, failed: [] };

    private async getFailedBatchFilePaths(): Promise<string[]> {
        try {
            const content = await this.app.vault.adapter.read(this.getFailedBatchesFilePath());
            const data = JSON.parse(content) as FailedBatchesData | { failedBatches?: Array<{ notes: Array<{ path: string }> }> };
            const paths = new Set<string>();
            if ('remaining' in data && data.remaining?.notes) {
                for (const note of data.remaining.notes) {
                    if (note.path) paths.add(note.path);
                }
            }
            if ('failed' in data && Array.isArray(data.failed)) {
                for (const fb of data.failed) {
                    for (const note of fb.notes ?? []) {
                        if (note.path) paths.add(note.path);
                    }
                }
            }
            if ('failedBatches' in data && Array.isArray(data.failedBatches)) {
                for (const fb of data.failedBatches) {
                    for (const note of fb.notes ?? []) {
                        if (note.path) paths.add(note.path);
                    }
                }
            }
            return [...paths];
        } catch {
            return [];
        }
    }

    private async clearFailedBatches(): Promise<void> {
        await this.ensureResponsesDirectory();
        await this.app.vault.adapter.write(this.getFailedBatchesFilePath(), JSON.stringify(this.FAILED_BATCHES_EMPTY, null, 2));
        // console.log('Cleared vault-analysis-failed-batches.json');
    }

    private async readFailedBatchesData(): Promise<FailedBatchesData> {
        const filePath = this.getFailedBatchesFilePath();
        try {
            const content = await this.app.vault.adapter.read(filePath);
            const raw = JSON.parse(content) as {
                remaining?: FailedBatchesData['remaining'];
                failed?: FailedBatchEntry[];
                failedBatches?: Array<{
                    timestamp?: string;
                    batchIndex?: number;
                    primaryModel?: string;
                    retryModel?: string;
                    error?: string;
                    notes?: FailedBatchEntry['notes'];
                }>;
            };
            if (raw.remaining != null || Array.isArray(raw.failed)) {
                return { remaining: raw.remaining ?? null, failed: raw.failed ?? [] };
            }
            const migrated: FailedBatchesData = { remaining: null, failed: [] };
            for (const fb of raw.failedBatches ?? []) {
                migrated.failed.push({
                    timestamp: fb.timestamp ?? new Date().toISOString(),
                    batchIndex: fb.batchIndex ?? -1,
                    primaryModel: fb.primaryModel ?? '',
                    retryModel: fb.retryModel ?? '',
                    error: fb.error ?? 'Unknown',
                    notes: fb.notes ?? []
                });
            }
            return migrated;
        } catch {
            return this.FAILED_BATCHES_EMPTY;
        }
    }

    private async appendFailedBatch(
        batch: Array<{ file: TFile; charCount: number }>,
        batchIndex: number,
        primaryModel: string,
        retryModel: string,
        error: string
    ): Promise<void> {
        await this.ensureResponsesDirectory();
        const data = await this.readFailedBatchesData();
        data.failed.push({
            timestamp: new Date().toISOString(),
            batchIndex,
            primaryModel,
            retryModel,
            error,
            notes: batch.map(b => ({ path: b.file.path, basename: b.file.basename, charCount: b.charCount }))
        });
        await this.app.vault.adapter.write(this.getFailedBatchesFilePath(), JSON.stringify(data, null, 2));
        // console.log(`Appended failed batch ${batchIndex + 1} to ${this.getFailedBatchesFilePath()}`);
    }

    private async appendFailedNotes(
        notes: Array<{ path: string; basename: string; charCount: number }>,
        batchIndex: number,
        error: string
    ): Promise<void> {
        if (notes.length === 0) return;
        await this.ensureResponsesDirectory();
        const data = await this.readFailedBatchesData();
        data.failed.push({
            timestamp: new Date().toISOString(),
            batchIndex,
            primaryModel: '',
            retryModel: '',
            error,
            notes
        });
        await this.app.vault.adapter.write(this.getFailedBatchesFilePath(), JSON.stringify(data, null, 2));
        // console.log(`Appended ${notes.length} failed notes to ${this.getFailedBatchesFilePath()}`);
    }

    private async saveRemainingNotes(
        batches: Array<Array<{ file: TFile; charCount: number }>>
    ): Promise<void> {
        const notes = batches.flatMap(batch =>
            batch.map(b => ({ path: b.file.path, basename: b.file.basename, charCount: b.charCount }))
        );
        if (notes.length === 0) return;
        await this.ensureResponsesDirectory();
        const data = await this.readFailedBatchesData();
        const now = new Date();
        const retryAfter = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        data.remaining = {
            savedAt: now.toISOString(),
            retryAfter: retryAfter.toISOString(),
            reason: 'quota_exhausted',
            notes
        };
        await this.app.vault.adapter.write(this.getFailedBatchesFilePath(), JSON.stringify(data, null, 2));
        // console.log(`Saved ${notes.length} remaining notes to ${this.getFailedBatchesFilePath()}`);
    }

    private async ensureVaultAnalysisFileExists(): Promise<void> {
        const filePath = this.getVaultAnalysisFilePath();
        try {
            await this.app.vault.adapter.read(filePath);
        } catch {
            // File doesn't exist, create it with empty structure
            const initialData: VaultAnalysisData = {
                generatedAt: new Date().toISOString(),
                totalFiles: 0,
                generatedFiles: 0,
                updatedFiles: 0,
                apiProvider: 'Google Gemini',
                results: []
            };
            // Ensure responses directory exists
            await this.ensureResponsesDirectory();
            await this.app.vault.adapter.write(filePath, JSON.stringify(initialData, null, 2));
            // console.log('Created initial vault analysis file in responses folder');
        }
    }

    public async viewVaultAnalysisResults(): Promise<void> {
        try {
            const filePath = this.getVaultAnalysisFilePath();
            let analysisData: VaultAnalysisData | null = null;
            let hasExistingData = false;

            try {
                const content = await this.app.vault.adapter.read(filePath);
                const parsed = JSON.parse(content) as { results?: unknown[] };
                if (parsed && typeof parsed === 'object' && Array.isArray(parsed.results)) {
                    analysisData = parsed as VaultAnalysisData;
                    hasExistingData = analysisData.results.length > 0;
                } else {
                    throw new Error('Invalid vault analysis format');
                }
            } catch {
                // File doesn't exist or is invalid - create empty structure if needed
                const initialData: VaultAnalysisData = {
                    generatedAt: new Date().toISOString(),
                    totalFiles: 0,
                    generatedFiles: 0,
                    updatedFiles: 0,
                    apiProvider: 'Google Gemini',
                    results: []
                };
                await this.ensureResponsesDirectory();
                await this.app.vault.adapter.write(filePath, JSON.stringify(initialData, null, 2));
                analysisData = initialData;
                hasExistingData = false;
            }

            // Open modal immediately (no blocking enhancement prompt)
            const modal = new VaultAnalysisModal(this.app, analysisData, hasExistingData, this, this.settings);
            modal.open();

            // Non-blocking: offer graph metrics enhancement after modal is visible
            if (hasExistingData && analysisData) {
                const hasGraphMetrics = analysisData.results.some((result: VaultAnalysisResult) =>
                    result.graphMetrics && Object.keys(result.graphMetrics).length > 0
                );

                if (!hasGraphMetrics) {
                    const notice = new Notice('Your vault analysis exists but lacks graph metrics. Click to enhance it with centrality scores.', 0);
                    const noticeContainer = (notice as { messageEl: HTMLElement }).messageEl;
                    const enhanceBtn = noticeContainer.createEl('button', {
                        text: 'Enhance with graph metrics',
                        cls: 'graph-enhance-btn'
                    });

                    enhanceBtn.onclick = () => {
                        notice.hide();
                        void (async () => {
                            const enhanceNotice = new Notice('Enhancing vault analysis with graph metrics...', 0);
                            try {
                                await this.enhanceWithGraphMetrics();
                                enhanceNotice.hide();
                                new Notice('Vault analysis enhanced with graph metrics!');
                                await this.viewVaultAnalysisResults();
                            } catch (err) {
                                enhanceNotice.hide();
                                new Notice(`Failed to enhance analysis: ${err instanceof Error ? err.message : String(err)}`);
                            }
                        })();
                    };

                    setTimeout(() => notice.hide(), 8000);
                }
            }
        } catch (error) {
            // console.error('Failed to load vault analysis results:', error);
            new Notice(error instanceof Error ? error.message : 'Failed to load vault analysis results');
        }
    }


    private isFileExcluded(file: TFile): boolean {
        const pathLower = file.path.toLowerCase();
        const excludeFolders = this.settings.excludeFolders ?? [];
        if (excludeFolders.length > 0) {
            for (const folder of excludeFolders) {
                if (typeof folder === 'string' && folder && pathLower.includes(folder.toLowerCase())) {
                    return true;
                }
            }
        }

        const excludeTags = this.settings.excludeTags ?? [];
        if (excludeTags.length > 0) {
            const fileCache = this.app.metadataCache.getFileCache(file);
            if (fileCache) {
                const rawTags: unknown = fileCache.frontmatter?.tags;
                const frontmatterTags: string[] = Array.isArray(rawTags)
                    ? (rawTags as string[]).map(t => (typeof t === 'string' ? t : String(t)))
                    : typeof rawTags === 'string'
                        ? [rawTags]
                        : [];
                const inlineTags = (fileCache.tags ?? []).map((tag: { tag: string }) => tag.tag.replace('#', ''));
                const allTags: string[] = [...frontmatterTags, ...inlineTags];

                for (const tag of excludeTags) {
                    if (typeof tag === 'string' && tag && allTags.some(t =>
                        t.toLowerCase().includes(tag.toLowerCase())
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

    /**
     * Build enhanced results (domain code-to-name conversion) and output data for vault-analysis.json.
     * Shared by saveBatchResults and saveAnalysisResults.
     */
    private async buildEnhancedResultsAndOutputData(
        results: VaultAnalysisResult[],
        isIncrementalUpdate: boolean,
        metadata: {
            generatedAt: string;
            totalFiles: number;
            generatedFiles: number;
            updatedFiles: number;
            tokenUsage?: { promptTokens: number; candidatesTokens: number; totalTokens: number };
        }
    ): Promise<{ enhancedResults: VaultAnalysisResult[]; outputData: VaultAnalysisData }> {
        const sortedResults = [...results].sort((a, b) => a.title.localeCompare(b.title));
        const domainHelper = KnowledgeDomainHelper.getInstance(this.app);
        await domainHelper.loadDomainTemplate();
        const ddcCodeToNameMap = domainHelper.getDomainCodeToNameMap();

        /** Legacy format used knowledgeDomain (string); new format uses knowledgeDomains (string[]) */
        type LegacyResult = VaultAnalysisResult & { knowledgeDomain?: string };
        const enhancedResults = sortedResults.map((result): VaultAnalysisResult => {
            let domainCodes: string[] = [];
            const legacy = result as LegacyResult;
            if (legacy.knowledgeDomain && typeof legacy.knowledgeDomain === 'string') {
                domainCodes = legacy.knowledgeDomain
                    .split(',')
                    .map((code: string) => code.trim())
                    .filter((code: string) => code.length > 0);
            } else if (result.knowledgeDomains && Array.isArray(result.knowledgeDomains)) {
                domainCodes = result.knowledgeDomains;
            }
            const domainNames = domainCodes.map(code => ddcCodeToNameMap.get(code) || code);
            const cleanResult: VaultAnalysisResult = {
                id: result.id,
                title: result.title,
                summary: result.summary,
                keywords: result.keywords,
                knowledgeDomains: domainNames,
                created: result.created,
                modified: result.modified,
                path: result.path,
                charCount: result.charCount ?? (result as { wordCount?: number }).wordCount ?? 0
            };
            if (result.graphMetrics) cleanResult.graphMetrics = result.graphMetrics;
            if (result.centralityRankings) cleanResult.centralityRankings = result.centralityRankings;
            return cleanResult;
        });

        const outputData: VaultAnalysisData = {
            generatedAt: metadata.generatedAt,
            ...(isIncrementalUpdate && { updatedAt: new Date().toISOString() }),
            totalFiles: metadata.totalFiles,
            generatedFiles: metadata.generatedFiles,
            updatedFiles: metadata.updatedFiles,
            apiProvider: 'Google Gemini',
            ...(metadata.tokenUsage && { tokenUsage: metadata.tokenUsage }),
            results: enhancedResults
        };
        return { enhancedResults, outputData };
    }

    /**
     * Save batch results to disk (no graph metrics). Called after each successful batch.
     */
    private async saveBatchResults(
        mergedResults: VaultAnalysisResult[],
        isIncrementalUpdate: boolean,
        totalTokenUsage: { promptTokens: number; candidatesTokens: number; totalTokens: number },
        metadata: { generatedAt: string; totalFiles: number; generatedFiles: number; updatedFiles: number }
    ): Promise<void> {
        await this.ensureVaultAnalysisFileExists();
        const { outputData } = await this.buildEnhancedResultsAndOutputData(mergedResults, isIncrementalUpdate, {
            ...metadata,
            tokenUsage: totalTokenUsage
        });
        await this.ensureResponsesDirectory();
        await this.app.vault.adapter.write(this.getVaultAnalysisFilePath(), JSON.stringify(outputData, null, 2));
        // console.log(`Batch results saved (${mergedResults.length} total)`);
    }

    private async saveAnalysisResults(
        results: VaultAnalysisResult[],
        isIncrementalUpdate: boolean,
        newCount: number,
        changedCount: number,
        batchTokenUsage?: { promptTokens: number; candidatesTokens: number; totalTokens: number }
    ): Promise<void> {
        try {
            await this.ensureVaultAnalysisFileExists();

            let existingData: VaultAnalysisData | null = null;
            try {
                const content = await this.app.vault.adapter.read(this.getVaultAnalysisFilePath());
                existingData = JSON.parse(content) as VaultAnalysisData;
            } catch {
                existingData = null;
            }

            let metadata: { generatedAt: string; totalFiles: number; generatedFiles: number; updatedFiles: number; tokenUsage?: { promptTokens: number; candidatesTokens: number; totalTokens: number } };
            if (!isIncrementalUpdate) {
                metadata = {
                    generatedAt: new Date().toISOString(),
                    totalFiles: results.length,
                    generatedFiles: results.length,
                    updatedFiles: 0,
                    ...(batchTokenUsage && { tokenUsage: batchTokenUsage })
                };
            } else if (existingData) {
                const existingGeneratedFiles = existingData.generatedFiles ?? existingData.totalFiles;
                const existingUpdatedFiles = existingData.updatedFiles ?? 0;
                const existingTokens = existingData.tokenUsage ?? { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };
                metadata = {
                    generatedAt: existingData.generatedAt,
                    totalFiles: results.length,
                    generatedFiles: existingGeneratedFiles,
                    updatedFiles: existingUpdatedFiles + newCount + changedCount,
                    tokenUsage: batchTokenUsage ? {
                        promptTokens: existingTokens.promptTokens + batchTokenUsage.promptTokens,
                        candidatesTokens: existingTokens.candidatesTokens + batchTokenUsage.candidatesTokens,
                        totalTokens: existingTokens.totalTokens + batchTokenUsage.totalTokens
                    } : existingData.tokenUsage
                };
            } else {
                metadata = {
                    generatedAt: new Date().toISOString(),
                    totalFiles: results.length,
                    generatedFiles: results.length,
                    updatedFiles: 0,
                    ...(batchTokenUsage && { tokenUsage: batchTokenUsage })
                };
            }

            const { outputData } = await this.buildEnhancedResultsAndOutputData(results, isIncrementalUpdate, metadata);
            await this.ensureResponsesDirectory();
            await this.app.vault.adapter.write(this.getVaultAnalysisFilePath(), JSON.stringify(outputData, null, 2));
            // console.log(`Vault analysis results saved to responses folder: ${this.getVaultAnalysisFilePath()}`);
        } catch (error) {
            // console.error('Failed to save analysis results:', error);
            throw new Error(`Failed to save results: ${(error as Error).message}`);
        }
    }


    // Core analysis function.
    // Core analysis function using structured output API

    private readonly ZERO_TOKEN_USAGE = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };

    private async generateStructuredBatchAnalysis(fileData: Array<{
        file: TFile;
        content: string;
        charCount: number;
        created: string;
        modified: string;
        isShort: boolean;
    }>, modelOverride: string): Promise<{
        results: Array<{
            summary: string;
            keywords: string;
            knowledgeDomain: string;
        }>;
        tokenUsage: { promptTokens: number; candidatesTokens: number; totalTokens: number };
    }> {
        // Filter out short files (they should already be filtered, but double-check)
        const meaningfulFiles = fileData.filter(data => !data.isShort && data.content.trim().length > 0);
        
        if (meaningfulFiles.length === 0) {
            return {
                results: [],
                tokenUsage: this.ZERO_TOKEN_USAGE
            };
        }

        // Ensure knowledge domain template is loaded
        await this.loadDomainTemplate();

        // Generate optimized subdivisions list for AI prompt in JSON format
        const sectionsJson = JSON.stringify(
            this.subdivisionsList.map(subdivision => ({
                id: subdivision.id,
                name: subdivision.name
            }))
        );

        // Build optimized prompt with clear system/context/instruction structure
        const systemPrompt = `You are an expert knowledge analyst specializing in semantic analysis and knowledge classification. Your role is to analyze notes and extract meaningful insights using the Modern Knowledge Taxonomy system.`;

        const contextPrompt = `## Knowledge Domain Classification Reference
Use the following knowledge domain subdivisions for classification. Each subdivision has an ID and name:

\`\`\`json
${sectionsJson}
\`\`\`

## Classification Guidelines:
- Be specific: use the most detailed subdivision that applies
- Multi-domain notes: a note can belong to multiple subdivisions if it spans different domains
- Valid codes only: only use knowledge domain codes from the provided reference list
- Format: comma-separated knowledge domain codes (e.g., "1-1,3-2")`;

        const instructionPrompt = `## Analysis Instructions
For each note, provide:
1. **Summary**: A two to three sentence summary of the main concept or purpose (be detailed and insightful)
2. **Keywords**: 3-6 key terms or phrases (comma-separated)
3. **Knowledge Domain**: Knowledge domain subdivision codes that best match the content (comma-separated)

## Language Rule
Always respond in the same language as the note content. If a note is written in Chinese, the summary and keywords must be in Chinese. If in English, respond in English. Match each note's language independently.

## Notes to Analyze:`;

        // Build the complete prompt by combining all components
        let fullPrompt = `${systemPrompt}\n\n${contextPrompt}\n\n${instructionPrompt}\n\n`;
        
        // Add each meaningful file to the prompt
        meaningfulFiles.forEach((data, index) => {
            fullPrompt += `--- Note ${index + 1}: "${data.file.basename}" (${data.charCount} chars) ---\n${data.content}\n\n`;
        });

        try {
            // Use structured output instead of deprecated generateBatchAnalysis
            const responseSchema = this.aiService.createVaultSemanticAnalysisSchema(meaningfulFiles.length);

            // 1024 tokens per note + 4K buffer for schema overhead
            const maxOutputTokens = meaningfulFiles.length * 1024 + 4000;

            // Add debugging info
            // console.log(`Structured analysis: ${meaningfulFiles.length} notes, prompt length: ${fullPrompt.length} chars`);
            // console.log('Response schema:', JSON.stringify(responseSchema, null, 2));
            
            const response = await this.aiService.generateSemanticAnalysis<Array<{
                summary: string;
                keywords: string;
                knowledgeDomain: string;
            }>>(
                fullPrompt,
                responseSchema,
                maxOutputTokens,
                0.3, // Low temperature for consistent results
                0.72, // Default topP
                modelOverride
            );

            // console.log(`Batch analysis completed with DDC classification using structured output`);

            return {
                results: response.result.map(item => ({
                    summary: item.summary || '',
                    keywords: item.keywords || '',
                    knowledgeDomain: item.knowledgeDomain || ''
                })),
                tokenUsage: response.tokenUsage
            };

        } catch (structuredError) {
            if (!(structuredError instanceof SemanticAnalysisError)) {
                // console.error('Structured output batch analysis failed:', structuredError);
            }
            throw structuredError;
        }
    }
}

 