import { Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { GraphAnalysisSettings, DEFAULT_SETTINGS, GraphData, Node, GraphNeighborsResult, GraphMetadata, VaultData, VaultNote, CentralityScores } from './types/types';
import { GraphView } from './components/graph-view/GraphView';
import { GraphAnalysisView, GRAPH_ANALYSIS_VIEW_TYPE } from './views/GraphAnalysisView';
import { CentralityResultsView, CENTRALITY_RESULTS_VIEW_TYPE } from './views/CentralityResultsView';
import { GraphAnalysisSettingTab } from './settings/GraphAnalysisSettingTab';
import { VaultSemanticAnalysisManager } from './ai/VaultSemanticAnalysisManager';
import { ExclusionUtils } from './utils/ExclusionUtils';
import { VaultScope } from './utils/VaultScope';
import { PluginDataStore } from './utils/PluginDataStore';
import { configureI18n, t } from './i18n';

// Import our styles 
import './styles/styles.css';

// WASM glue code and EMBEDDED_WASM_BYTES are injected at the top of this file during build
declare const EMBEDDED_WASM_BYTES: Uint8Array;
declare function build_graph_from_vault(vault_data_json: string): string;
declare function calculate_degree_centrality_cached(): string;
declare function calculate_eigenvector_centrality_cached(): string;
declare function calculate_betweenness_centrality_cached(): string;
declare function calculate_closeness_centrality_cached(): string;
declare function clear_graph(): string;
declare function get_node_neighbors_cached(node_id: number): string;
declare function get_graph_metadata(): string;
declare function __wbg_init(options: { module_or_path: WebAssembly.Module | string | URL | Response | BufferSource }): Promise<unknown>;

export default class GraphAnalysisPlugin extends Plugin {
    settings!: GraphAnalysisSettings;
    wasmInitialized: boolean = false;
    graphView: GraphView | null = null;
    vaultAnalysisManager: VaultSemanticAnalysisManager | null = null;
    dataStore: PluginDataStore | null = null;
    exclusionUtils: ExclusionUtils | null = null;
    vaultScope: VaultScope | null = null;
    
    private wasmLoadingPromise: Promise<void> | null = null;
    private wasmLoadingNotice: Notice | null = null;

    private pluginIsLoaded = false;

    async onload() {
        await this.loadSettings();

        // Initialize exclusion utils and vault scope
        this.exclusionUtils = new ExclusionUtils(this.app, this.settings);
        this.vaultScope = new VaultScope(this.app, this.exclusionUtils);

        // Initialize WASM module with improved async handling
        void this.initializeWasmModule();
        
        // Mark plugin as loaded (event listeners removed - graph only updates when explicitly opened)
        this.app.workspace.onLayoutReady(() => {
            this.pluginIsLoaded = true;
        });
        
        // Register the graph analysis view
        this.registerView(
            GRAPH_ANALYSIS_VIEW_TYPE,
            (leaf) => new GraphAnalysisView(leaf, this)
        );

        // Register the centrality results view
        this.registerView(
            CENTRALITY_RESULTS_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => new CentralityResultsView(leaf)
        );

        // // Add command for degree centrality
        // this.addCommand({
        //     id: 'analyze-vault-degree-centrality',
        //     name: 'Analyze Vault (Degree Centrality)',
        //     callback: () => this.analyzeCentrality('degree')
        // });

        // // Add command for eigenvector centrality
        // this.addCommand({
        //     id: 'analyze-vault-eigenvector-centrality',
        //     name: 'Analyze Vault (Eigenvector Centrality)',
        //     callback: () => this.analyzeCentrality('eigenvector')
        // });

        // // Add command for betweenness centrality
        // this.addCommand({
        //     id: 'analyze-vault-betweenness-centrality',
        //     name: 'Analyze Vault (Betweenness Centrality)',
        //     callback: () => this.analyzeCentrality('betweenness')
        // });

        // // Add command for closeness centrality
        // this.addCommand({
        //     id: 'analyze-vault-closeness-centrality',
        //     name: 'Analyze Vault (Closeness Centrality)',
        //     callback: () => this.analyzeCentrality('closeness')
        // });

        // Add settings tab
        this.addSettingTab(new GraphAnalysisSettingTab(this.app, this));

        // Add command to show exclusion statistics
        this.addCommand({
            id: 'show-exclusion-stats',
            name: t('commands.showExclusionStats'),
            callback: () => this.showExclusionStats()
        });

        this.dataStore = new PluginDataStore(this);
        await this.dataStore.migrateLegacyCacheFromVaultFiles(this.app);

        // Initialize Vault Analysis Manager (no status bar button - now in graph view)
        this.vaultAnalysisManager = new VaultSemanticAnalysisManager(this.app, this.settings, this.dataStore);

        // Add command for vault analysis
        this.addCommand({
            id: 'generate-vault-analysis',
            name: t('commands.generateVaultAnalysis'),
            callback: () => {
                if (this.vaultAnalysisManager) {
                    void this.vaultAnalysisManager.generateVaultAnalysis();
                } else {
                    new Notice(t('notices.vaultAnalysisNotInitialized'));
                }
            }
        });

        // Add command to view vault analysis results
        this.addCommand({
            id: 'view-vault-analysis',
            name: t('commands.viewVaultAnalysis'),
            callback: () => {
                if (this.vaultAnalysisManager) {
                    void this.vaultAnalysisManager.viewVaultAnalysisResults();
                } else {
                    new Notice(t('notices.vaultAnalysisNotInitialized'));
                }
            }
        });

        // Add a ribbon icon to show the graph view
        this.addRibbonIcon('waypoints', t('ribbon.graphView'), () => {
            void (async () => {
                const existing = this.app.workspace.getLeavesOfType(GRAPH_ANALYSIS_VIEW_TYPE);
                if (existing.length > 0) {
                    void this.app.workspace.revealLeaf(existing[0]);
                    return;
                }
                await this.ensureWasmLoaded();
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.setViewState({
                    type: GRAPH_ANALYSIS_VIEW_TYPE,
                    active: true
                });
                void this.app.workspace.revealLeaf(leaf);
            })();
        });
    }

    async loadSettings() {
        const data = await this.loadData() as Partial<GraphAnalysisSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
        configureI18n(this.settings.uiLanguage);
    }

    async saveSettings() {
        await this.saveData(this.settings);
        configureI18n(this.settings.uiLanguage);
        // Update Vault Analysis Manager settings
        if (this.vaultAnalysisManager) {
            this.vaultAnalysisManager.updateSettings(this.settings);
        }
        // Update exclusion utils settings
        if (this.exclusionUtils) {
            this.exclusionUtils.updateSettings(this.settings);
        }
        if (this.vaultScope && this.exclusionUtils) {
            this.vaultScope = new VaultScope(this.app, this.exclusionUtils);
        }
        // Update GraphAnalysisView settings
        const graphViews = this.app.workspace.getLeavesOfType(GRAPH_ANALYSIS_VIEW_TYPE);
        graphViews.forEach(leaf => {
            if (leaf.view instanceof GraphAnalysisView) {
                leaf.view.updateSettings();
            }
        });
    }

    private initializeWasmModule(): void {
        if (this.wasmLoadingPromise) return;

        this.wasmLoadingPromise = (async () => {
            try {
                this.wasmLoadingNotice = new Notice(t('notices.wasmInitializing'), 0);

                const wasmBinary = this.getWasmBinary();

                const wasmBinaryHash = await this.calculateBinaryHash(wasmBinary);

                await __wbg_init({ module_or_path: wasmBinary });
                
                const dataToSave = (await this.loadData() as Record<string, unknown>) || {};
                dataToSave.wasmHash = wasmBinaryHash;
                await this.saveData(dataToSave);
                
                this.wasmInitialized = true;
                // console.log('Graph Analysis: WASM initialized');
                
                if (this.wasmLoadingNotice) {
                    this.wasmLoadingNotice.hide();
                    this.wasmLoadingNotice = null;
                }
            } catch (error) {
                // console.error('Failed to initialize WASM module:', error);
                
                if (this.wasmLoadingNotice) {
                    this.wasmLoadingNotice.hide();
                    this.wasmLoadingNotice = null;
                }
                
                new Notice(t('notices.wasmInitFailed', { message: (error as Error).message }));
                this.wasmLoadingPromise = null;
            }
        })();
    }

  /** WASM binary embedded in main.js at build time. */
    private getWasmBinary(): ArrayBuffer {
        const copy = EMBEDDED_WASM_BYTES.slice();
        return copy.buffer;
    }

    private calculateBinaryHash(buffer: ArrayBuffer): Promise<string> {
        const array = new Uint8Array(buffer);
        const startBytes = array.slice(0, Math.min(1024, array.length));
        const endBytes = array.slice(Math.max(0, array.length - 1024));
        
        let hash = 0;
        for (let i = 0; i < startBytes.length; i++) {
            hash = ((hash << 5) - hash) + startBytes[i];
            hash |= 0;
        }
        for (let i = 0; i < endBytes.length; i++) {
            hash = ((hash << 5) - hash) + endBytes[i];
            hash |= 0;
        }
        
        return Promise.resolve(hash.toString(16));
    }

    public async ensureWasmLoaded(): Promise<void> {
        if (this.wasmInitialized) {
            return Promise.resolve();
        }
        
        if (this.wasmLoadingPromise) {
            return this.wasmLoadingPromise;
        }
        
        void this.initializeWasmModule();
        return this.wasmLoadingPromise!;
    }


    onunload() {
        // console.log('Unloading Graph Analysis plugin');
        
        if (this.wasmLoadingNotice) {
            this.wasmLoadingNotice.hide();
            this.wasmLoadingNotice = null;
        }
        
        // Clean up Vault Analysis Manager
        if (this.vaultAnalysisManager) {
            this.vaultAnalysisManager.destroy();
            this.vaultAnalysisManager = null;
        }
        
        this.wasmInitialized = false;
        this.wasmLoadingPromise = null;
        
        // Ensure status bar is restored when plugin is unloaded
        const doc = this.app.workspace.containerEl.ownerDocument;
        doc.body.removeClass('graph-analysis-hide-status-bar');
        doc.body.classList.remove('graph-view-dragging');
        doc.body.classList.remove('graph-analysis-active');
    }

    async analyzeCentrality(algorithm: 'degree' | 'eigenvector' | 'betweenness' | 'closeness') {
        await this.ensureWasmLoaded();
        
        try {
            // Build graph if not already built
            await this.buildGraphFromVault();
            
            // Calculate the requested centrality
            let results: Node[];
            switch (algorithm) {
                case 'degree':
                    results = this.calculateDegreeCentralityCached();
                    break;
                case 'eigenvector':
                    results = this.calculateEigenvectorCentralityCached();
                    break;
                case 'betweenness':
                    results = this.calculateBetweennessCentralityCached();
                    break;
                case 'closeness':
                    results = this.calculateClosenessCentralityCached();
                    break;
            }
            
            // Display the results
            this.displayResults(results, `${algorithm.charAt(0).toUpperCase() + algorithm.slice(1)} Centrality`);
        } catch (error) {
            // console.error(`Failed to analyze ${algorithm} centrality:`, error);
            new Notice(t('notices.analyzeCentralityFailed', {
                algorithm,
                message: (error as Error).message
            }));
        }
    }

    /**
     * Builds the graph from the vault files and links.
     * This is the main entry point for creating the graph from Obsidian notes.
     */
    public async buildGraphFromVault(): Promise<GraphData> {
        await this.ensureWasmLoaded();
        // Build the graph data structure from vault files
        const graphData = this.buildGraphDataFromVault();
        // Convert to VaultData format for Rust
        const vaultData = this.createVaultDataFromGraph(graphData);
        // Call Rust function to build graph
        this.processJsonResult<{ status: string }>(
            build_graph_from_vault(JSON.stringify(vaultData)),
            'Graph Building'
        );
        return graphData;
    }
    
    /**
     * Creates the GraphData structure by analyzing vault files and their links.
     * This is extracted as a separate method to avoid code duplication.
     */
    private buildGraphDataFromVault(): GraphData {
        // Get all files that we want to include in the graph
        const files = this.getVaultFiles();
        
        // Create nodes array from file paths
        const nodes: string[] = files.map(file => file.path);
        
        // Build links between files
        const links: [number, number][] = [];
        const pathToIndex = new Map<string, number>();
        
        // Create index mapping
        nodes.forEach((path, index) => {
            pathToIndex.set(path, index);
        });
        
        // Process each file to find links
        for (const file of files) {
            const sourceIndex = pathToIndex.get(file.path);
            if (sourceIndex === undefined) continue;
            
            // Get links from the file using metadata cache
            const abstractFile = this.app.vault.getAbstractFileByPath(file.path);
            const cache = abstractFile instanceof TFile ? this.app.metadataCache.getFileCache(abstractFile) : null;
            
            if (!cache) continue;
            
            // Collect all types of links
            const allLinks = [
                ...(cache.links || []),
                ...(cache.embeds || []),
                ...(cache.frontmatterLinks || [])
            ];
            
            // Process each link
            for (const link of allLinks) {
                const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
                if (resolvedFile) {
                    const targetIndex = pathToIndex.get(resolvedFile.path);
                    if (targetIndex !== undefined) {
                        // For undirected graph, store each edge only once
                        const minIndex = Math.min(sourceIndex, targetIndex);
                        const maxIndex = Math.max(sourceIndex, targetIndex);
                        
                        // Check if link already exists to avoid duplicates
                        if (!links.some(([s, t]) => s === minIndex && t === maxIndex)) {
                            links.push([minIndex, maxIndex]);
                        }
                    }
                }
            }
        }
        
        // Return the complete graph data
        return { nodes, edges: links };
    }
    
    getIncludedMarkdownFiles(): TFile[] {
        if (!this.vaultScope) {
            return this.app.vault.getMarkdownFiles();
        }
        return this.vaultScope.getIncludedMarkdownFiles();
    }

    private getVaultFiles() {
        return this.getIncludedMarkdownFiles().map((file) => ({ path: file.path }));
    }

    /**
     * Helper method to process centrality calculation results.
     * This eliminates code duplication across the different centrality methods.
     * 
     * @param jsonResult The raw JSON result from WASM
     * @param centralityType The type of centrality being calculated
     * @returns Processed Node array with normalized centrality values
     */
    private processCentralityResult(jsonResult: string, centralityType: 'degree' | 'eigenvector' | 'betweenness' | 'closeness'): Node[] {
        const parsed = JSON.parse(jsonResult) as unknown;
        if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as { error: string }).error === 'string') {
            throw new Error((parsed as { error: string }).error);
        }
        if (!Array.isArray(parsed)) {
            throw new Error(`${centralityType} centrality result is not an array`);
        }
        const parsedResult = parsed as Array<{ node_id?: number; node_name?: string; centrality?: CentralityScores }>;
        return parsedResult.map((node) => {
            const centralityScores: CentralityScores = {
                degree: node.centrality?.degree,
                eigenvector: node.centrality?.eigenvector,
                betweenness: node.centrality?.betweenness,
                closeness: node.centrality?.closeness
            };
            
            // Ensure that the requested centrality type has a value (default to 0)
            centralityScores[centralityType] = centralityScores[centralityType] ?? 0;
            
            return {
                node_id: node.node_id ?? 0,
                node_name: node.node_name ?? '',
                centrality: centralityScores
            };
        });
    }

    public calculateDegreeCentralityCached(): Node[] {
        return this.processCentralityResult(calculate_degree_centrality_cached(), 'degree');
    }
    
    public calculateEigenvectorCentralityCached(): Node[] {
        return this.processCentralityResult(calculate_eigenvector_centrality_cached(), 'eigenvector');
    }
    
    public calculateBetweennessCentralityCached(): Node[] {
        return this.processCentralityResult(calculate_betweenness_centrality_cached(), 'betweenness');
    }
    
    public calculateClosenessCentralityCached(): Node[] {
        return this.processCentralityResult(calculate_closeness_centrality_cached(), 'closeness');
    }
    
    /**
     * Helper method to process JSON results from Rust WASM side.
     * This eliminates code duplication in methods that return JSON results.
     * 
     * @param jsonResult The raw JSON result from WASM
     * @param errorContext A descriptive context for error messages
     * @returns The parsed result
     */
    private processJsonResult<T>(jsonResult: string, errorContext: string): T {
        const parsed = JSON.parse(jsonResult) as unknown;
        if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as { error: unknown }).error === 'string') {
            throw new Error((parsed as { error: string }).error);
        }
        return parsed as T;
    }
    
    public getNodeNeighborsCached(nodeId: number): GraphNeighborsResult {
        return this.processJsonResult<GraphNeighborsResult>(
            get_node_neighbors_cached(nodeId),
            'Get Node Neighbors'
        );
    }
    
    public clearGraphCache(): void {
        this.processJsonResult<{ status: string }>(
            clear_graph(),
            'Clear Graph'
        );
    }
    
    public getGraphMetadata(): GraphMetadata {
        return this.processJsonResult<GraphMetadata>(
            get_graph_metadata(),
            'Get Graph Metadata'
        );
    }

    public async initializeGraphAndCalculateCentrality(): Promise<{ graphData: GraphData, degreeCentrality: Node[] }> {
        if (!this.wasmInitialized) {
            throw new Error('WASM module not initialized');
        }
        
        try {
            const graphData = await this.buildGraphFromVault();
            return {
                graphData: graphData,
                degreeCentrality: this.calculateDegreeCentralityCached()
            };
        } catch (error) {
            // console.error('Error initializing graph and calculating centrality:', error);
            throw new Error(`Failed to initialize graph and calculate centrality: ${(error as Error).message}`);
        }
    }
    
    isFileExcluded(file: TFile): boolean {
        if (!this.exclusionUtils) {
            // Fallback to basic exclusion logic if exclusionUtils is not initialized
            return false;
        }
        return this.exclusionUtils.isFileExcluded(file);
    }
    
    displayResults(results: Node[], algorithmName: string) {
        // Show results in the right sidebar (all results, pagination handled in view)
        void this.activateCentralityView(results, algorithmName);
        
        // console.log(`Graph Analysis Results (${algorithmName}):`, results);
    }

    showExclusionStats() {
        if (!this.exclusionUtils) {
            new Notice(t('notices.exclusionUtilsNotInitialized'));
            return;
        }

        try {
            const allFiles = this.vaultScope?.getAllMarkdownFiles() ?? this.app.vault.getMarkdownFiles();
            const stats = this.exclusionUtils.getExclusionStats(allFiles);
            new Notice(t('notices.exclusionStatsConsole', { count: stats.totalExcluded }));
        } catch {
            new Notice(t('notices.exclusionStatsError'));
        }
    }

    private async activateCentralityView(results: Node[], algorithmName: string) {
        let leaf = this.app.workspace.getLeavesOfType(CENTRALITY_RESULTS_VIEW_TYPE)[0];
        let isNewLeaf = false;

        if (!leaf) {
            isNewLeaf = true;
            // Create a new leaf in the right sidebar
            const rightSplit = this.app.workspace.getRightLeaf(false);
            if (rightSplit) {
                await rightSplit.setViewState({
                    type: CENTRALITY_RESULTS_VIEW_TYPE,
                    active: true
                });
                leaf = rightSplit;
            } else {
                // console.error('Failed to create right sidebar leaf');
                return;
            }
        }

        // Only reveal when leaf was just created - avoids triggering layout events when switching centrality
        if (isNewLeaf) {
            void this.app.workspace.revealLeaf(leaf);
        }

        // Update the view with new results (resolve from leaf instead of storing reference)
        const view = leaf?.view instanceof CentralityResultsView ? leaf.view : null;
        if (view) {
            await view.setResults(results, algorithmName);
        }
    }

    /**
     * Creates a VaultData structure from GraphData
     * Internal helper method used by both buildGraphFromVault and initializeGraphWithData
     */
    private createVaultDataFromGraph(graphData: GraphData): VaultData {
        const notes: VaultNote[] = graphData.nodes.map(node => ({ id: node }));
        return { 
            notes,
            links: graphData.edges
        };
    }

    /**
     * Initialize the graph with provided graph data directly.
     * This method allows for direct initialization of the graph with externally constructed data.
     * 
     * @param graphData The graph data to initialize with
     * @returns A Promise that resolves when initialization is complete
     */
    public async initializeGraphWithData(graphData: GraphData): Promise<void> {
        await this.ensureWasmLoaded();
        const vaultData = this.createVaultDataFromGraph(graphData);
        this.processJsonResult<{ status: string }>(
            build_graph_from_vault(JSON.stringify(vaultData)),
            'Graph Initialization'
        );
    }
}