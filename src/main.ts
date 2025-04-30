import { App, Plugin, TFile, Notice } from 'obsidian';
import { GraphAnalysisSettings, DEFAULT_SETTINGS, CentralityResult } from './types/types';
import { ResultsModal } from './views/ResultsModal';
import { GraphAnalysisView, GRAPH_ANALYSIS_VIEW_TYPE } from './views/GraphAnalysisView';
import { GraphAnalysisSettingTab } from './settings/GraphAnalysisSettingTab';
import { GraphView } from './components';

// Import our styles 
import './styles.css';

// The WASM module code will be injected at the top of this file during build
declare function build_graph_from_vault(vault_data_json: string): string;
declare function __wbg_init(options: { module_or_path: WebAssembly.Module | string | URL | Response | BufferSource }): Promise<any>;

// New cached graph functions
declare function initialize_graph(graph_data_json: string): string;
declare function clear_graph(): string;
declare function get_node_neighbors_cached(node_id: number): string;
declare function calculate_degree_centrality_cached(): string;
declare function get_graph_metadata(): string;

export default class GraphAnalysisPlugin extends Plugin {
    settings: GraphAnalysisSettings;
    wasmInitialized: boolean = false;
    graphView: GraphView | null = null;
    
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

        // Add command for degree centrality
        this.addCommand({
            id: 'analyze-vault-degree-centrality',
            name: 'Analyze Vault (Degree Centrality)',
            callback: () => this.analyzeCentrality('degree')
        });

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

    private async ensureWasmLoaded(): Promise<void> {
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
                
                const { graphData } = await this.initializeGraphAndCalculateCentrality();
                
                await this.graphView.updateData(graphData);
                
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

    async analyzeCentrality(algorithm: 'degree' | 'eigenvector' | 'betweenness') {
        try {
            await this.ensureWasmLoaded();
        } catch (error) {
            new Notice('WASM module not initialized. Please try again later.');
            return;
        }

        try {
            const loadingNotice = new Notice('Analyzing vault graph...', 0);
            
            let resultsJson: string;
            let algorithmName: string;
            
            // For degree centrality, we can use the cached result since it's calculated at initialization
            if (algorithm === 'degree') {
                resultsJson = calculate_degree_centrality_cached();
                algorithmName = 'Degree Centrality';
            } else if (algorithm === 'eigenvector') {
                // TODO: Implement eigenvector centrality
                new Notice('Eigenvector centrality analysis is not implemented yet');
                loadingNotice.hide();
                return;
            } else if (algorithm === 'betweenness') {
                // TODO: Implement betweenness centrality
                new Notice('Betweenness centrality analysis is not implemented yet');
                loadingNotice.hide();
                return;
            } else {
                throw new Error(`Unknown algorithm: ${algorithm}`);
            }
            
            const results = JSON.parse(resultsJson) as CentralityResult[];
            
            if (results.length === 1 && 'error' in results[0]) {
                throw new Error((results[0] as any).error as string);
            }
            
            loadingNotice.hide();
            
            this.displayResults(results, algorithmName);
        } catch (error) {
            console.error(`Error analyzing vault with ${algorithm} centrality:`, error);
            new Notice(`Error analyzing vault: ${(error as Error).message}`);
        }
    }

    public async buildGraphData() {
        if (!this.wasmInitialized) {
            throw new Error('WASM module not initialized');
        }

        const files = this.app.vault.getMarkdownFiles();
        
        const vaultFiles = await Promise.all(files.map(async (file) => {
            if (this.isFileExcluded(file)) {
                return null;
            }
            
            const content = await this.app.vault.read(file);
            return {
                path: file.path,
                content: content
            };
        }));
        
        const filteredVaultFiles = vaultFiles.filter(file => file !== null);
        const vaultDataJson = JSON.stringify({ files: filteredVaultFiles });
        
        try {
            // Build graph and initialize cache
            const graphDataJson = build_graph_from_vault(vaultDataJson);
            const graphData = JSON.parse(graphDataJson);
            
            if (graphData.error) {
                console.error('Error building graph in Rust:', graphData.error);
                throw new Error(graphData.error);
            }
            
            // Initialize graph cache and calculate degree centrality immediately
            const cacheResult = this.initializeGraphCache(graphDataJson);
            if (cacheResult.error) {
                throw new Error(cacheResult.error);
            }
            
            // Calculate degree centrality right after graph initialization
            const degreeCentrality = this.calculateDegreeCentralityCached();
            if ('error' in degreeCentrality) {
                throw new Error(degreeCentrality.error);
            }
            
            // Combine graph data with degree centrality
            return {
                ...graphData,
                degreeCentrality
            };
        } catch (error) {
            console.error('Error in graph initialization:', error);
            throw new Error(`Failed to initialize graph: ${(error as Error).message}`);
        }
    }
    
    public async initializeGraphAndCalculateCentrality(): Promise<{ graphData: any, degreeCentrality: any }> {
        if (!this.wasmInitialized) {
            throw new Error('WASM module not initialized');
        }
        
        try {
            const graphData = await this.buildGraphData();
            return {
                graphData: graphData,
                degreeCentrality: graphData.degreeCentrality
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
    
    displayResults(results: CentralityResult[], algorithmName: string) {
        const limitedResults = results.slice(0, this.settings.resultLimit);
        
        new ResultsModal(this.app, limitedResults, algorithmName).open();
        
        const topResults = results.slice(0, 3);
        let message = `Top 3 central notes (${algorithmName}):\n`;
        
        topResults.forEach((result, index) => {
            message += `${index + 1}. ${result.node_name} (${result.score.toFixed(3)})\n`;
        });
        
        new Notice(message);
        
        console.log(`Graph Analysis Results (${algorithmName}):`, results);
    }


    
    public initializeGraphCache(graphDataJson: string): any {
        if (!this.wasmInitialized) {
            throw new Error('WASM module not initialized');
        }
        
        try {
            const result = initialize_graph(graphDataJson);
            return JSON.parse(result);
        } catch (error) {
            console.error('Error initializing graph cache:', error);
            throw new Error('Failed to initialize graph cache');
        }
    }
    
    public clearGraphCache(): any {
        if (!this.wasmInitialized) {
            throw new Error('WASM module not initialized');
        }
        
        try {
            const result = clear_graph();
            return JSON.parse(result);
        } catch (error) {
            console.error('Error clearing graph cache:', error);
            throw new Error('Failed to clear graph cache');
        }
    }
    
    public getNodeNeighborsCached(nodeId: number): any {
        if (!this.wasmInitialized) {
            throw new Error('WASM module not initialized');
        }
        
        try {
            const result = get_node_neighbors_cached(nodeId);
            return JSON.parse(result);
        } catch (error) {
            console.error('Error getting node neighbors from cache:', error);
            throw new Error('Failed to get node neighbors');
        }
    }
    
    public calculateDegreeCentralityCached(): any {
        if (!this.wasmInitialized) {
            throw new Error('WASM module not initialized');
        }
        
        try {
            const result = calculate_degree_centrality_cached();
            return JSON.parse(result);
        } catch (error) {
            console.error('Error calculating degree centrality from cache:', error);
            throw new Error('Failed to calculate degree centrality');
        }
    }
    
    public getGraphMetadata(): any {
        if (!this.wasmInitialized) {
            throw new Error('WASM module not initialized');
        }
        
        try {
            const result = get_graph_metadata();
            return JSON.parse(result);
        } catch (error) {
            console.error('Error getting graph metadata:', error);
            throw new Error('Failed to get graph metadata');
        }
    }
}