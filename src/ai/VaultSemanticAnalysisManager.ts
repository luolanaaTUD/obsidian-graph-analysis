import { App, Notice, TFile, setIcon } from 'obsidian';
import { GraphAnalysisSettings } from '../types/types';
import { VaultAnalysisModal } from '../views/VaultAnalysisModals';
import { 
    VaultAnalysisResult, 
    VaultAnalysisData,
    MasterAnalysisManager
} from './MasterAnalysisManager';
import { AIModelService, SemanticAnalysisError } from '../services/AIModelService';
import { getUserFriendlyMessage } from '../utils/GeminiErrorUtils';
import { t } from '../i18n';
import { GraphDataBuilder } from '../components/graph-view/data/graph-builder';
import { PluginService } from '../services/PluginService';
import { KnowledgeDomainHelper } from './KnowledgeDomainHelper';
import { cleanupNoteContent } from '../utils/NoteContentUtils';
import { PluginDataStore } from '../utils/PluginDataStore';
import { VisualizationDerivationService } from '../services/VisualizationDerivationService';
import type { FailedBatchEntry, FailedBatchesData } from '../types/plugin-cache-data';
import {
    buildContextSampleFromNoteContents,
    buildLanguagePromptSection
} from './promptLanguage';

export class VaultSemanticAnalysisManager {
    private app: App;
    private settings: GraphAnalysisSettings;
    private aiService: AIModelService;
    private graphDataBuilder: GraphDataBuilder;
    private pluginService: PluginService;
    private masterAnalysisManager: MasterAnalysisManager;
    private dataStore: PluginDataStore;
    private visualizationDerivation: VisualizationDerivationService;
    private subdivisionsList: Array<{id: string, name: string, domain: string, domainId: string}> = [];
    private domainTemplateLoaded: boolean = false;
    private readonly MAX_CHARS_PER_NOTE = 8000;
    private readonly MAX_NOTES_PER_BATCH = 30;
    private readonly DELAY_BETWEEN_BATCHES = 6000; // 6s between batches (Gemini 2.5 Flash Lite RPM 10)

    private _analysisInProgress: 'semantic' | 'structure' | 'evolution' | 'actions' | null = null;
    private activeVaultAnalysisModal: VaultAnalysisModal | null = null;

    /** Window from app workspace (avoids global for pop-out compatibility) */
    private get win(): Window {
        return this.app.workspace.containerEl.ownerDocument.defaultView!;
    }

    isAnalysisInProgress(): boolean {
        return this._analysisInProgress !== null;
    }

    setAnalysisInProgress(type: 'semantic' | 'structure' | 'evolution' | 'actions'): void {
        this._analysisInProgress = type;
    }

    clearAnalysisInProgress(): void {
        this._analysisInProgress = null;
    }

    clearActiveVaultAnalysisModal(modal: VaultAnalysisModal): void {
        if (this.activeVaultAnalysisModal === modal) {
            this.activeVaultAnalysisModal = null;
        }
    }

    openVaultAnalysisModal(
        analysisData: VaultAnalysisData | null,
        hasExistingData: boolean,
        initialView = 'semantic'
    ): VaultAnalysisModal {
        if (this.activeVaultAnalysisModal) {
            this.activeVaultAnalysisModal.close();
        }
        const modal = new VaultAnalysisModal(
            this.app,
            analysisData,
            hasExistingData,
            this,
            this.settings,
            this.dataStore,
            initialView
        );
        this.activeVaultAnalysisModal = modal;
        modal.open();
        return modal;
    }

    private getTabDisplayNameForReopen(tabName: string): string {
        switch (tabName) {
            case 'structure':
                return t('vaultAnalysis.tabDisplayStructure');
            case 'evolution':
                return t('vaultAnalysis.tabDisplayEvolution');
            case 'actions':
                return t('vaultAnalysis.tabDisplayActions');
            default:
                return t('vaultAnalysis.tabDisplayDefault');
        }
    }

    public async reopenVaultAnalysisToTab(tabName: string): Promise<void> {
        try {
            const analysisData = await this.dataStore.getVaultAnalysis();
            const hasExistingData =
                analysisData !== null && analysisData.results && analysisData.results.length > 0;
            new Notice(
                t('notices.tabAnalysisComplete', { tab: this.getTabDisplayNameForReopen(tabName) })
            );
            this.openVaultAnalysisModal(analysisData, hasExistingData, tabName);
        } catch (error) {
            new Notice(error instanceof Error ? error.message : t('notices.reopenModalFailed'));
        }
    }

    constructor(app: App, settings: GraphAnalysisSettings, dataStore: PluginDataStore) {
        this.app = app;
        this.settings = settings;
        this.dataStore = dataStore;
        this.aiService = new AIModelService(app, settings);
        this.graphDataBuilder = new GraphDataBuilder(app);
        this.pluginService = new PluginService(app);
        this.masterAnalysisManager = new MasterAnalysisManager(app, settings, dataStore);
        this.visualizationDerivation = new VisualizationDerivationService(app, dataStore);
    }

    private scheduleDerivedVisualizations(analysisData: VaultAnalysisData): void {
        void this.visualizationDerivation.computeAndPersist(analysisData).catch(() => {
            // Non-blocking; tabs can compute on demand if persistence fails
        });
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
            text: t('vaultAnalysis.buttonTitle')
        });
        
        // Add description
        const description = tooltipEl.createDiv({ cls: 'tooltip-description' });
        description.setText(t('vaultAnalysis.buttonDesc'));
        
        // Add click handler for vault analysis - directly open results modal
        button.addEventListener('click', (event: MouseEvent) => {
            if (event.shiftKey) {
                void (async () => {
                    try {
                        const enhanceNotice = new Notice(t('notices.enhancingWithMetrics'), 0);
                        const enhanced = await this.enhanceWithGraphMetrics();
                        enhanceNotice.hide();
                        if (enhanced) {
                            new Notice(t('notices.enhancedWithMetrics'));
                        } else {
                            new Notice(t('notices.noAnalysisForEnhance'));
                        }
                    } catch (err) {
                        new Notice(t('notices.enhanceFailed', {
                            message: err instanceof Error ? err.message : String(err)
                        }));
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
        return this.dataStore.getVaultAnalysis();
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
            const includedFiles = this.getIncludedMarkdownFiles();
            return includedFiles.length > 0;
        }

        const includedFiles = this.getIncludedMarkdownFiles();
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
            const existingData = await this.dataStore.getVaultAnalysis();
            if (!existingData) {
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
            
            await this.dataStore.setVaultAnalysis(updatedData);
            this.scheduleDerivedVisualizations(updatedData);

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
                new Notice(t('notices.configureApiKey'));
                return false;
            }

            // Load existing analysis data for incremental updates
            const existingAnalysis = await this.loadExistingAnalysisData();
            const isIncrementalUpdate = existingAnalysis !== null && existingAnalysis.results && existingAnalysis.results.length > 0;

            const includedFiles = this.getIncludedMarkdownFiles();
            
            if (includedFiles.length === 0) {
                new Notice(t('notices.noFilesAfterExclusion'));
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
                const includedPaths = new Set(this.getIncludedMarkdownFiles().map((f) => f.path));
                if (file instanceof TFile && includedPaths.has(path)) {
                    filesToProcess.push(file);
                    inFilesToProcess.add(path);
                }
            }

            if (filesToProcess.length === 0) {
                new Notice(t('notices.allFilesUpToDate', { count: unchangedCount }));
                return false;
            }

            // Show initial notice with incremental update info and estimated time
            // ~4 batches per minute based on rate limits and processing
            const batchCount = Math.ceil(filesToProcess.length / this.MAX_NOTES_PER_BATCH);
            const estimatedMins = Math.max(1, Math.ceil(batchCount / 4));
            const initialMessage = isIncrementalUpdate
                ? t('notices.vaultAnalysisUpdating', {
                    changed: changedCount,
                    new: newCount,
                    unchanged: unchangedCount,
                    processing: filesToProcess.length,
                    minutes: estimatedMins
                })
                : t('notices.vaultAnalysisStarting', {
                    count: filesToProcess.length,
                    minutes: estimatedMins
                });
            const progressNotice = new Notice(initialMessage, 0);
            
            const results: VaultAnalysisResult[] = [];
            let processed = 0;
            let failed = 0;

            // Prepare file data first to get char counts
            progressNotice.setMessage(t('notices.preparingFiles'));
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

                    const created = file.stat.ctime ? new Date(file.stat.ctime).toISOString() : '';
                    const modified = file.stat.mtime ? new Date(file.stat.mtime).toISOString() : '';

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
                const modelName = this.aiService.getSemanticModelName();

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
                    const err = batchError instanceof SemanticAnalysisError ? batchError : new SemanticAnalysisError((batchError as Error).message, 'other', modelName);

                    if (err.errorType === 'quota_exhausted') {
                        await this.appendFailedBatch(batch, batchIndex, modelName, err.message);
                        failed += batch.length;
                        processed += batch.length;
                        progressNotice.hide();
                        stoppedDueToQuota = true;
                        break;
                    }

                    if (err.errorType === 'rate_limit') {
                        progressNotice.setMessage(`Rate limited, waiting 15s before retry...`);
                        await new Promise(resolve => this.win.setTimeout(resolve, 15000));
                        try {
                            batchResult = await this.analyzeBatch(batch, batchIndex);
                        } catch (retryError) {
                            await this.appendFailedBatch(batch, batchIndex, modelName, (retryError as Error).message);
                            failed += batch.length;
                            processed += batch.length;
                        }
                    } else {
                        await this.appendFailedBatch(batch, batchIndex, modelName, err.message);
                        failed += batch.length;
                        processed += batch.length;
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
                    await new Promise(resolve => this.win.setTimeout(resolve, delayBetweenBatches));
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
            const enhanceNotice = new Notice(t('notices.calculatingGraphMetrics'), 0);
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
                completionMessage = t('notices.vaultCompleteQuota', {
                    success: successCount,
                    total: filesToProcess.length,
                    remaining: remainingCount,
                    retryTime: retryTimeStr
                });
            } else if (isIncrementalUpdate) {
                completionMessage = failed === 0
                    ? t('notices.vaultCompleteIncrementalOk', {
                        success: successCount,
                        changed: changedCount,
                        new: newCount,
                        unchanged: unchangedCount,
                        deleted: deletedFilePaths.length
                    })
                    : t('notices.vaultCompleteIncrementalWarn', {
                        success: successCount,
                        failed,
                        unchanged: unchangedCount,
                        deleted: deletedFilePaths.length
                    });
            } else {
                completionMessage = failed === 0
                    ? t('notices.vaultCompleteFullOk', { success: successCount })
                    : t('notices.vaultCompleteFullWarn', { success: successCount, failed });
            }

            new Notice(completionMessage);
            
            // Return true to indicate analysis completed successfully
            return true;
            
        } catch (error) {
            // console.error('Failed to generate vault analysis:', error);
            const err = error instanceof Error ? error : new Error(String(error));
            new Notice(t('notices.vaultAnalysisFailed', { message: getUserFriendlyMessage(err) }));
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
                    const model = modelOverride ?? this.aiService.getSemanticModelName();
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
            const data = await this.readFailedBatchesData();
            const paths = new Set<string>();
            if ('remaining' in data && data.remaining?.notes) {
                for (const note of data.remaining.notes) {
                    if (note.path) paths.add(note.path);
                }
            }
            for (const fb of data.failed) {
                for (const note of fb.notes) {
                    if (note.path) paths.add(note.path);
                }
            }
            return [...paths];
        } catch {
            return [];
        }
    }

    private async clearFailedBatches(): Promise<void> {
        await this.dataStore.setFailedBatches(this.FAILED_BATCHES_EMPTY);
    }

    private async readFailedBatchesData(): Promise<FailedBatchesData> {
        const raw = await this.dataStore.getFailedBatches();
        if (!raw) {
            return this.FAILED_BATCHES_EMPTY;
        }
        if (raw.remaining != null || Array.isArray(raw.failed)) {
            return { remaining: raw.remaining ?? null, failed: raw.failed ?? [] };
        }
        const legacy = raw as FailedBatchesData & {
            failedBatches?: Array<{
                timestamp?: string;
                batchIndex?: number;
                primaryModel?: string;
                retryModel?: string;
                error?: string;
                notes?: FailedBatchEntry['notes'];
            }>;
        };
        const migrated: FailedBatchesData = { remaining: null, failed: [] };
        for (const fb of legacy.failedBatches ?? []) {
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
    }

    private async appendFailedBatch(
        batch: Array<{ file: TFile; charCount: number }>,
        batchIndex: number,
        modelName: string,
        error: string
    ): Promise<void> {
        const data = await this.readFailedBatchesData();
        data.failed.push({
            timestamp: new Date().toISOString(),
            batchIndex,
            primaryModel: modelName,
            retryModel: modelName,
            error,
            notes: batch.map(b => ({ path: b.file.path, basename: b.file.basename, charCount: b.charCount }))
        });
        await this.dataStore.setFailedBatches(data);
    }

    private async appendFailedNotes(
        notes: Array<{ path: string; basename: string; charCount: number }>,
        batchIndex: number,
        error: string
    ): Promise<void> {
        if (notes.length === 0) return;
        const data = await this.readFailedBatchesData();
        data.failed.push({
            timestamp: new Date().toISOString(),
            batchIndex,
            primaryModel: '',
            retryModel: '',
            error,
            notes
        });
        await this.dataStore.setFailedBatches(data);
    }

    private async saveRemainingNotes(
        batches: Array<Array<{ file: TFile; charCount: number }>>
    ): Promise<void> {
        const notes = batches.flatMap(batch =>
            batch.map(b => ({ path: b.file.path, basename: b.file.basename, charCount: b.charCount }))
        );
        if (notes.length === 0) return;
        const data = await this.readFailedBatchesData();
        const now = new Date();
        const retryAfter = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        data.remaining = {
            savedAt: now.toISOString(),
            retryAfter: retryAfter.toISOString(),
            reason: 'quota_exhausted',
            notes
        };
        await this.dataStore.setFailedBatches(data);
    }

    private async ensureVaultAnalysisFileExists(): Promise<void> {
        const existing = await this.dataStore.getVaultAnalysis();
        if (existing) {
            return;
        }
        const initialData: VaultAnalysisData = {
            generatedAt: new Date().toISOString(),
            totalFiles: 0,
            generatedFiles: 0,
            updatedFiles: 0,
            apiProvider: 'Google Gemini',
            results: []
        };
        await this.dataStore.setVaultAnalysis(initialData);
    }

    public async viewVaultAnalysisResults(): Promise<void> {
        if (this.isAnalysisInProgress()) {
            new Notice(t('notices.vaultAnalysisInProgress'));
            return;
        }

        try {
            let analysisData = await this.dataStore.getVaultAnalysis();
            let hasExistingData = false;

            if (analysisData && Array.isArray(analysisData.results)) {
                hasExistingData = analysisData.results.length > 0;
            } else {
                const initialData: VaultAnalysisData = {
                    generatedAt: new Date().toISOString(),
                    totalFiles: 0,
                    generatedFiles: 0,
                    updatedFiles: 0,
                    apiProvider: 'Google Gemini',
                    results: []
                };
                await this.dataStore.setVaultAnalysis(initialData);
                analysisData = initialData;
                hasExistingData = false;
            }

            // Open modal immediately (no blocking enhancement prompt)
            this.openVaultAnalysisModal(analysisData, hasExistingData);

            // Non-blocking: offer graph metrics enhancement after modal is visible
            if (hasExistingData && analysisData) {
                const hasGraphMetrics = analysisData.results.some((result: VaultAnalysisResult) =>
                    result.graphMetrics && Object.keys(result.graphMetrics).length > 0
                );

                if (!hasGraphMetrics) {
                    const notice = new Notice(t('notices.enhanceMetricsPrompt'), 0);
                    const noticeContainer = (notice as { messageEl: HTMLElement }).messageEl;
                    const enhanceBtn = noticeContainer.createEl('button', {
                        text: t('notices.enhanceMetricsButton'),
                        cls: 'graph-enhance-btn'
                    });

                    enhanceBtn.onclick = () => {
                        notice.hide();
                        void (async () => {
                            const enhanceNotice = new Notice(t('notices.enhancingWithMetrics'), 0);
                            try {
                                await this.enhanceWithGraphMetrics();
                                enhanceNotice.hide();
                                new Notice(t('notices.enhancedWithMetrics'));
                                await this.viewVaultAnalysisResults();
                            } catch (err) {
                                enhanceNotice.hide();
                                new Notice(t('notices.enhanceAnalysisFailed', {
                                    message: err instanceof Error ? err.message : String(err)
                                }));
                            }
                        })();
                    };

                    this.win.setTimeout(() => notice.hide(), 8000);
                }
            }
        } catch (error) {
            // console.error('Failed to load vault analysis results:', error);
            new Notice(error instanceof Error ? error.message : t('notices.loadVaultAnalysisFailed'));
        }
    }


    private getIncludedMarkdownFiles(): TFile[] {
        return this.pluginService.getPlugin().getIncludedMarkdownFiles();
    }

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
        this.aiService.updateSettings(settings);
        this.masterAnalysisManager.updateSettings(settings);
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
        await this.dataStore.setVaultAnalysis(outputData);
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

            const existingData = await this.dataStore.getVaultAnalysis();

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
            await this.dataStore.setVaultAnalysis(outputData);
            this.scheduleDerivedVisualizations(outputData);
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

## Notes to Analyze:`;

        const contextSample = buildContextSampleFromNoteContents(
            meaningfulFiles.map(data => ({ content: data.content }))
        );
        const languageSection = buildLanguagePromptSection(this.settings, contextSample);

        // Build the complete prompt by combining all components
        let fullPrompt = `${systemPrompt}\n\n${contextPrompt}\n\n${instructionPrompt}\n\n${languageSection}\n\n`;
        
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

 