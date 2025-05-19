import { Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { GraphAnalysisSettings, DEFAULT_SETTINGS, GraphData, Node, GraphNeighborsResult, GraphMetadata, VaultData, VaultNote, CentralityScores } from './types/types';
import { GraphView } from './components/graph-view/GraphView';
import { GraphAnalysisView, GRAPH_ANALYSIS_VIEW_TYPE } from './views/GraphAnalysisView';
import { CentralityResultsView, CENTRALITY_RESULTS_VIEW_TYPE } from './views/CentralityResultsView';
import { GraphAnalysisSettingTab } from './settings/GraphAnalysisSettingTab';

// Import our styles 
import './styles.css';

// The WASM module code will be injected at the top of this file during build
declare function build_graph_from_vault(vault_data_json: string): string;
declare function calculate_degree_centrality_cached(): string;
declare function calculate_eigenvector_centrality_cached(): string;
declare function calculate_betweenness_centrality_cached(): string;
declare function calculate_closeness_centrality_cached(): string;
declare function clear_graph(): string;
declare function get_node_neighbors_cached(node_id: number): string;
declare function get_graph_metadata(): string;
declare function __wbg_init(options: { module_or_path: WebAssembly.Module | string | URL | Response | BufferSource }): Promise<any>;

export default class GraphAnalysisPlugin extends Plugin {
    settings: GraphAnalysisSettings;
    wasmInitialized: boolean = false;
    graphView: GraphView | null = null;
    centralityView: CentralityResultsView | null = null;
    
    private fileCreatedHandler: ((file: TFile) => void) | null = null;
    private fileDeletedHandler: ((file: TFile) => void) | null = null;
    private fileModifiedHandler: ((file: TFile) => void) | null = null;
    private metadataChangedHandler: ((file: TFile) => void) | null = null;
    
    private graphDataNeedsRefresh: boolean = false;
    private refreshDebounceTimeout: NodeJS.Timeout | null = null;
    private lastRefreshTime: number = 0;
    private readonly MIN_REFRESH_INTERVAL = 5000;
    
    private wasmLoadingPromise: Promise<void> | null = null;
    private wasmLoadingNotice: Notice | null = null;

    private pluginIsLoaded = false;

    async onload() {
        await this.loadSettings();

        // Initialize WASM module with improved async handling
        this.initializeWasmModule();
        
        // Register event handlers for vault changes after plugin is fully loaded
        this.app.workspace.onLayoutReady(() => {
            this.pluginIsLoaded = true;
            this.registerVaultEventListeners();
        });
        
        // Register the graph analysis view
        this.registerView(
            GRAPH_ANALYSIS_VIEW_TYPE,
            (leaf) => new GraphAnalysisView(leaf, this)
        );

        // Register the centrality results view
        this.registerView(
            CENTRALITY_RESULTS_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => {
                this.centralityView = new CentralityResultsView(leaf);
                return this.centralityView;
            }
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

        // Add a ribbon icon to show the graph view
        this.addRibbonIcon('waypoints', 'Graph Analysis View', async () => {
            const existing = this.app.workspace.getLeavesOfType(GRAPH_ANALYSIS_VIEW_TYPE);
            if (existing.length > 0) {
                this.app.workspace.revealLeaf(existing[0]);
                return;
            }
            
            await this.ensureWasmLoaded();
            
            let leaf = this.app.workspace.getLeaf(false);
            await leaf.setViewState({
                type: GRAPH_ANALYSIS_VIEW_TYPE,
                active: true
            });
            
            this.app.workspace.revealLeaf(leaf);
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private async initializeWasmModule() {
        if (this.wasmLoadingPromise) return;
        
        this.wasmLoadingPromise = (async () => {
            try {
                this.wasmLoadingNotice = new Notice('Initializing Graph Analysis...', 0);
                
                const wasmBinaryPath = this.manifest.dir ? 
                    `${this.manifest.dir}/graph_analysis_wasm_bg.wasm` : 
                    'graph_analysis_wasm_bg.wasm';
                
                const adapter = this.app.vault.adapter;
                const wasmAbsPath = adapter.getResourcePath(wasmBinaryPath);
                
                const wasmCache = await this.loadData();
                // const wasmHash = wasmCache?.wasmHash;
                
                const timeoutPromise = new Promise<ArrayBuffer>((_, reject) => {
                    setTimeout(() => reject(new Error('WASM loading timed out')), 10000);
                });
                
                const fetchPromise = fetch(wasmAbsPath).then(r => r.arrayBuffer());
                const wasmBinary = await Promise.race([fetchPromise, timeoutPromise]);
                
                const wasmBinaryHash = await this.calculateBinaryHash(wasmBinary);
                
                await __wbg_init({ module_or_path: wasmBinary });
                
                const dataToSave = await this.loadData() || {};
                dataToSave.wasmHash = wasmBinaryHash;
                await this.saveData(dataToSave);
                
                this.wasmInitialized = true;
                console.log('Graph Analysis: WASM initialized');
                
                if (this.wasmLoadingNotice) {
                    this.wasmLoadingNotice.hide();
                    this.wasmLoadingNotice = null;
                }
            } catch (error) {
                console.error('Failed to initialize WASM module:', error);
                
                if (this.wasmLoadingNotice) {
                    this.wasmLoadingNotice.hide();
                    this.wasmLoadingNotice = null;
                }
                
                new Notice('Failed to initialize Graph Analysis WASM module: ' + (error as Error).message);
                this.wasmLoadingPromise = null;
            }
        })();
    }

    private async calculateBinaryHash(buffer: ArrayBuffer): Promise<string> {
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
        
        return hash.toString(16);
    }

    public async ensureWasmLoaded(): Promise<void> {
        if (this.wasmInitialized) {
            return Promise.resolve();
        }
        
        if (this.wasmLoadingPromise) {
            return this.wasmLoadingPromise;
        }
        
        this.initializeWasmModule();
        return this.wasmLoadingPromise!;
    }

    private registerVaultEventListeners() {
        this.fileCreatedHandler = (file: TFile) => {
            if (!this.pluginIsLoaded) return;
            
            if (file.extension === 'md' && !this.isFileExcluded(file)) {
                this.scheduleGraphDataRefresh('File created');
            }
        };
        
        this.fileDeletedHandler = (file: TFile) => {
            if (!this.pluginIsLoaded) return;
            
            if (file.extension === 'md') {
                this.scheduleGraphDataRefresh('File deleted');
            }
        };
        
        this.fileModifiedHandler = (file: TFile) => {
            if (!this.pluginIsLoaded) return;
            
            if (file.extension === 'md' && !this.isFileExcluded(file)) {
                this.scheduleGraphDataRefresh('File modified');
            }
        };
        
        this.metadataChangedHandler = (file: TFile) => {
            if (!this.pluginIsLoaded) return;
            
            if (file.extension === 'md' && !this.isFileExcluded(file)) {
                this.scheduleGraphDataRefresh('Metadata changed');
            }
        };
        
        this.registerEvent(this.app.vault.on('create', this.fileCreatedHandler));
        this.registerEvent(this.app.vault.on('delete', this.fileDeletedHandler));
        this.registerEvent(this.app.vault.on('modify', this.fileModifiedHandler));
        this.registerEvent(this.app.metadataCache.on('changed', this.metadataChangedHandler));
    }

    private scheduleGraphDataRefresh(reason: string) {
        this.graphDataNeedsRefresh = true;
        
        if (this.refreshDebounceTimeout) {
            clearTimeout(this.refreshDebounceTimeout);
        }
        
        const now = Date.now();
        const timeSinceLastRefresh = now - this.lastRefreshTime;
        const timeToWait = Math.max(0, this.MIN_REFRESH_INTERVAL - timeSinceLastRefresh);
        
        this.refreshDebounceTimeout = setTimeout(() => {
            this.refreshGraphDataIfNeeded(reason);
        }, timeToWait + 1000);
    }

    private async refreshGraphDataIfNeeded(reason: string) {
        if (!this.graphDataNeedsRefresh || !this.graphView) {
            return;
        }
        
        if (this.graphView) {
            try {
                await this.ensureWasmLoaded();
                
                const { graphData, degreeCentrality } = await this.initializeGraphAndCalculateCentrality();
                
                // Convert the raw graph data to the format expected by updateData
                const nodes = graphData.nodes.map((nodePath: string, index: number) => {
                    const fileName = nodePath.split('/').pop() || nodePath;
                    const displayName = fileName.replace('.md', '');
                    
                    const nodeData = degreeCentrality?.find(r => r?.node_id === index);
                    const degreeCentralityScore = nodeData && nodeData.centrality && nodeData.centrality.degree !== undefined
                        ? nodeData.centrality.degree 
                        : 0;
                    
                    return {
                        id: index.toString(),
                        name: displayName,
                        path: nodePath,
                        degreeCentrality: degreeCentralityScore,
                    };
                });
                
                const links = graphData.edges.map(([sourceIdx, targetIdx]) => ({
                    source: sourceIdx.toString(),
                    target: targetIdx.toString()
                }));
                
                await this.graphView.updateData({ nodes, links });
                
                this.graphDataNeedsRefresh = false;
                this.lastRefreshTime = Date.now();
            } catch (error) {
                console.error('Failed to refresh graph data:', error);
            }
        }
    }

    onunload() {
        console.log('Unloading Graph Analysis plugin');
        
        if (this.refreshDebounceTimeout) {
            clearTimeout(this.refreshDebounceTimeout);
            this.refreshDebounceTimeout = null;
        }
        
        if (this.wasmLoadingNotice) {
            this.wasmLoadingNotice.hide();
            this.wasmLoadingNotice = null;
        }
        
        this.wasmInitialized = false;
        this.wasmLoadingPromise = null;
        
        this.fileCreatedHandler = null;
        this.fileDeletedHandler = null;
        this.fileModifiedHandler = null;
        this.metadataChangedHandler = null;
        
        const leaves = this.app.workspace.getLeavesOfType(GRAPH_ANALYSIS_VIEW_TYPE);
        for (const leaf of leaves) {
            leaf.detach();
        }
        
        document.body.classList.remove('graph-view-dragging');
        document.body.classList.remove('graph-analysis-active');
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
            console.error(`Failed to analyze ${algorithm} centrality:`, error);
            new Notice(`Failed to analyze ${algorithm} centrality: ${(error as Error).message}`);
        }
    }

    /**
     * Builds the graph from the vault files and links.
     * This is the main entry point for creating the graph from Obsidian notes.
     */
    public async buildGraphFromVault(): Promise<GraphData> {
        await this.ensureWasmLoaded();
        
        try {
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
        } catch (error) {
            console.error('Failed to build graph from vault:', error);
            throw error;
        }
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
            const cache = this.app.metadataCache.getFileCache(this.app.vault.getAbstractFileByPath(file.path) as TFile);
            
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
    
    private getVaultFiles() {
        const files = this.app.vault.getMarkdownFiles();
        const vaultFiles = [];
        
        for (const file of files) {
            // Skip excluded files
            if (this.isFileExcluded(file)) {
                continue;
            }
            
            vaultFiles.push({ path: file.path });
        }
        
        return vaultFiles;
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
        const parsedResult = JSON.parse(jsonResult);
        
        if (parsedResult.error) {
            console.error(`${centralityType} Centrality Error:`, parsedResult.error);
            throw new Error(parsedResult.error);
        }
        
        // Verify that the parsed result is an array of nodes
        if (!Array.isArray(parsedResult)) {
            console.error('Unexpected result format:', parsedResult);
            throw new Error(`${centralityType} centrality result is not an array`);
        }
        
        // Validate and normalize each node to ensure it has the expected structure
        return parsedResult.map((node: any) => {
            const centralityScores: CentralityScores = {
                degree: node.centrality?.degree,
                eigenvector: node.centrality?.eigenvector,
                betweenness: node.centrality?.betweenness,
                closeness: node.centrality?.closeness
            };
            
            // Ensure that the requested centrality type has a value (default to 0)
            centralityScores[centralityType] = centralityScores[centralityType] ?? 0;
            
            return {
                node_id: node.node_id,
                node_name: node.node_name,
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
        const parsedResult = JSON.parse(jsonResult);
        
        if (parsedResult.error) {
            console.error(`${errorContext} Error:`, parsedResult.error);
            throw new Error(parsedResult.error);
        }
        
        return parsedResult as T;
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
            console.error('Error initializing graph and calculating centrality:', error);
            throw new Error(`Failed to initialize graph and calculate centrality: ${(error as Error).message}`);
        }
    }
    
    isFileExcluded(file: TFile): boolean {
        for (const folder of this.settings.excludeFolders) {
            if (folder && file.path.startsWith(folder)) {
                return true;
            }
        }
        
        const fileCache = this.app.metadataCache.getFileCache(file);
        if (fileCache && fileCache.frontmatter && fileCache.frontmatter.tags) {
            const fileTags = Array.isArray(fileCache.frontmatter.tags) 
                ? fileCache.frontmatter.tags 
                : [fileCache.frontmatter.tags];
                
            for (const tag of this.settings.excludeTags) {
                if (tag && fileTags.includes(tag)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    displayResults(results: Node[], algorithmName: string) {
        const limitedResults = results.slice(0, this.settings.resultLimit);
        
        // Show results in the right sidebar
        this.activateCentralityView(limitedResults, algorithmName);
        
        console.log(`Graph Analysis Results (${algorithmName}):`, results);
    }

    private async activateCentralityView(results: Node[], algorithmName: string) {
        let leaf = this.app.workspace.getLeavesOfType(CENTRALITY_RESULTS_VIEW_TYPE)[0];
        
        if (!leaf) {
            // Create a new leaf in the right sidebar
            const rightSplit = this.app.workspace.getRightLeaf(false);
            if (rightSplit) {
                await rightSplit.setViewState({
                    type: CENTRALITY_RESULTS_VIEW_TYPE,
                    active: true
                });
                leaf = rightSplit;
            } else {
                console.error('Failed to create right sidebar leaf');
                return;
            }
        }

        // Reveal the leaf in case it was hidden
        this.app.workspace.revealLeaf(leaf);

        // Update the view with new results
        if (this.centralityView) {
            await this.centralityView.setResults(results, algorithmName);
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
        
        try {
            // Convert GraphData to VaultData format expected by Rust
            const vaultData = this.createVaultDataFromGraph(graphData);
            
            // Call Rust function to build graph
            this.processJsonResult<{ status: string }>(
                build_graph_from_vault(JSON.stringify(vaultData)),
                'Graph Initialization'
            );
            
            // Success
            console.log('Graph initialized with provided data');
        } catch (error) {
            console.error('Failed to initialize graph with provided data:', error);
            throw error;
        }
    }
}