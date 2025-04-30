import { App, Plugin, PluginSettingTab, Setting, TFile, Notice, Modal, MarkdownRenderer, WorkspaceLeaf, ItemView } from 'obsidian';
import { GraphView } from './components/graph-view/GraphView';

// Import our styles 
import './styles.css';

// The WASM module code will be injected at the top of this file during build
// We need to declare the functions that will be available
declare function calculate_degree_centrality(graph_data_json: string): string;
declare function calculate_eigenvector_centrality(graph_data_json: string): string;
declare function calculate_betweenness_centrality(graph_data_json: string): string;
declare function build_graph_from_vault(vault_data_json: string): string;
declare function __wbg_init(options: { module_or_path: WebAssembly.Module | string | URL | Response | BufferSource }): Promise<any>;

// New cached graph functions
declare function initialize_graph(graph_data_json: string): string;
declare function clear_graph(): string;
declare function get_node_neighbors_cached(node_id: number): string;
declare function calculate_degree_centrality_cached(): string;
declare function get_graph_metadata(): string;
declare function find_shortest_path_cached(source_id: number, target_id: number): string;

interface GraphAnalysisSettings {
    excludeFolders: string[];
    excludeTags: string[];
    resultLimit: number;
}

const DEFAULT_SETTINGS: GraphAnalysisSettings = {
    excludeFolders: [],
    excludeTags: [],
    resultLimit: 10
};

interface CentralityResult {
    node_id: number;
    node_name: string;
    score: number;
}

// Modal to display analysis results
class ResultsModal extends Modal {
    results: CentralityResult[];
    algorithm: string;

    constructor(app: App, results: CentralityResult[], algorithm: string) {
        super(app);
        this.results = results;
        this.algorithm = algorithm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: `${this.algorithm} Analysis Results` });

        // Create a table for the results
        const table = contentEl.createEl('table');
        table.addClass('graph-analysis-results-table');
        
        // Add table header
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Rank' });
        headerRow.createEl('th', { text: 'Note' });
        headerRow.createEl('th', { text: 'Score' });
        
        // Add table body
        const tbody = table.createEl('tbody');
        this.results.forEach((result, index) => {
            const row = tbody.createEl('tr');
            row.createEl('td', { text: `${index + 1}` });
            
            // Create a clickable link for the note
            const noteCell = row.createEl('td');
            const noteLink = noteCell.createEl('a', { 
                text: result.node_name,
                href: '#'
            });
            noteLink.addEventListener('click', (e) => {
                e.preventDefault();
                // Open the note when clicked
                const file = this.app.vault.getAbstractFileByPath(result.node_name);
                if (file instanceof TFile) {
                    this.app.workspace.getLeaf().openFile(file);
                    this.close();
                }
            });
            
            row.createEl('td', { text: result.score.toFixed(3) });
        });
        
        // Add a close button
        const buttonContainer = contentEl.createEl('div');
        buttonContainer.addClass('graph-analysis-button-container');
        const closeButton = buttonContainer.createEl('button', { text: 'Close' });
        closeButton.addEventListener('click', () => this.close());
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Define a new view type for our graph analysis
export const GRAPH_ANALYSIS_VIEW_TYPE = 'graph-analysis-view';

// Create a new ItemView for our graph
export class GraphAnalysisView extends ItemView {
    private graphView: GraphView;
    
    constructor(leaf: WorkspaceLeaf, private plugin: GraphAnalysisPlugin) {
        super(leaf);
        this.graphView = new GraphView(
            this.app,
            this.plugin.calculateDegreeCentrality.bind(this.plugin)
        );
    }

    getViewType(): string {
        return GRAPH_ANALYSIS_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Graph Analysis';
    }

    getIcon(): string {
        return 'waypoints';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.classList.add('graph-analysis-view-container');
        
        // Initialize the graph view
        await this.graphView.onload(container);
        
        return;
    }
    
    // Handle view reactivation to ensure graph is centered
    async onResize(): Promise<void> {
        // When view is resized, ensure the graph is properly centered
        // with a slight delay to allow DOM elements to settle
        if (this.graphView) {
            // Use larger timeout for resize since the container needs time
            // to be fully resized by Obsidian before we calculate dimensions
            setTimeout(() => {
                this.centerGraphSafely();
            }, 50);
        }
        return;
    }
    
    // This event is triggered when the view becomes active
    setEphemeralState(state: any): void {
        super.setEphemeralState(state);
        // When view becomes active, ensure the graph is properly positioned
        this.centerGraphSafely();
    }
    
    // Called when the parent plugin asks for the state
    getState(): any {
        const state = super.getState();
        
        // Return current view state with our additional info
        return {
            ...state,
            lastActive: Date.now()
        };
    }
    
    async onClose(): Promise<void> {
        // Clean up the graph view
        if (this.graphView) {
            try {
                this.graphView.onunload();
            } catch (e) {
                console.warn('Error unloading graph view:', e);
            }
        }
        
        // Clear references
        this.contentEl.empty();
        return;
    }
    
    // Safely center the graph with error handling
    private async centerGraphSafely(): Promise<void> {
        try {
            // Use the new public methods we created
            if (this.graphView) {
                // Use the refreshGraphView method instead of individual calls
                this.graphView.refreshGraphView();
                console.log("Graph position updated after view activation/resize");
                
                // Restart the simulation gently after a short delay
                setTimeout(() => {
                    try {
                        this.graphView.restartSimulationGently();
                    } catch (e) {
                        console.warn("Error restarting force simulation:", e);
                    }
                }, 50);
            }
        } catch (e) {
            console.warn("Error updating graph position:", e);
        }
    }
}

export default class GraphAnalysisPlugin extends Plugin {
    settings: GraphAnalysisSettings;
    wasmInitialized: boolean = false;
    graphView: GraphView | null = null;
    
    // Event handlers reference storage
    private fileCreatedHandler: ((file: TFile) => void) | null = null;
    private fileDeletedHandler: ((file: TFile) => void) | null = null;
    private fileModifiedHandler: ((file: TFile) => void) | null = null;
    private metadataChangedHandler: ((file: TFile) => void) | null = null;
    
    // Track if graph data needs to be refreshed due to vault changes
    private graphDataNeedsRefresh: boolean = false;
    private refreshDebounceTimeout: NodeJS.Timeout | null = null;
    private lastRefreshTime: number = 0;
    private readonly MIN_REFRESH_INTERVAL = 5000; // Minimum ms between refreshes
    
    // WASM loading status tracking
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

        // Add commands for different centrality algorithms
        this.addCommand({
            id: 'analyze-vault-degree-centrality',
            name: 'Analyze Vault (Degree Centrality)',
            callback: () => this.analyzeCentrality('degree')
        });

        this.addCommand({
            id: 'analyze-vault-eigenvector-centrality',
            name: 'Analyze Vault (Eigenvector Centrality)',
            callback: () => this.analyzeCentrality('eigenvector')
        });
        
        // Add command for betweenness centrality
        this.addCommand({
            id: 'analyze-vault-betweenness-centrality',
            name: 'Analyze Vault (Betweenness Centrality)',
            callback: () => this.analyzeCentrality('betweenness')
        });

        // Add settings tab
        this.addSettingTab(new GraphAnalysisSettingTab(this.app, this));

        // Add a ribbon icon to show the graph view
        this.addRibbonIcon('waypoints', 'Graph Analysis View', async () => {
            // First, check if view is already open
            const existing = this.app.workspace.getLeavesOfType(GRAPH_ANALYSIS_VIEW_TYPE);
            if (existing.length > 0) {
                // If already open, just reveal the leaf
                this.app.workspace.revealLeaf(existing[0]);
                return;
            }
            
            // Ensure WASM is loaded before creating view
            await this.ensureWasmLoaded();
            
            // Get the most appropriate leaf - use current leaf if empty, otherwise create a new one
            let leaf: WorkspaceLeaf;
            const activeLeaf = this.app.workspace.activeLeaf;
            
            if (activeLeaf && !activeLeaf.getViewState().pinned && !activeLeaf.getViewState().active) {
                // If active leaf exists and isn't pinned/active with content, use it
                leaf = activeLeaf;
            } else {
                // Otherwise create a new leaf without splitting
                leaf = this.app.workspace.getLeaf(false);
            }
            
            // Set the view in the selected leaf
            await leaf.setViewState({
                type: GRAPH_ANALYSIS_VIEW_TYPE,
                active: true
            });
            
            // Focus the leaf
            this.app.workspace.revealLeaf(leaf);
        });
    }
    
    /**
     * Initialize the WASM module with better async handling and error recovery
     */
    private initializeWasmModule() {
        // Only start loading once
        if (this.wasmLoadingPromise) return;
        
        // Create a loading promise to track WASM initialization
        this.wasmLoadingPromise = (async () => {
            try {
                // Show an unobtrusive loading notice
                this.wasmLoadingNotice = new Notice('Initializing Graph Analysis...', 0);
                
                // Get the path to the WASM binary
                const wasmBinaryPath = this.manifest.dir ? 
                    `${this.manifest.dir}/graph_analysis_wasm_bg.wasm` : 
                    'graph_analysis_wasm_bg.wasm';
                
                const adapter = this.app.vault.adapter;
                const wasmAbsPath = adapter.getResourcePath(wasmBinaryPath);
                
                // Retrieve last known working WASM binary hash from settings
                const wasmCache = await this.loadData();
                const wasmHash = wasmCache?.wasmHash;
                
                // Initialize the WASM module with timeout
                const timeoutPromise = new Promise<ArrayBuffer>((_, reject) => {
                    setTimeout(() => reject(new Error('WASM loading timed out')), 10000);
                });
                
                // Fetch the WASM binary
                const fetchPromise = fetch(wasmAbsPath).then(r => r.arrayBuffer());
                const wasmBinary = await Promise.race([fetchPromise, timeoutPromise]);
                
                // Calculate hash of the binary for caching purposes
                const wasmBinaryHash = await this.calculateBinaryHash(wasmBinary);
                
                // Initialize the WASM module
                await __wbg_init({ module_or_path: wasmBinary });
                
                // Store the successful hash for future reference
                const dataToSave = await this.loadData() || {};
                dataToSave.wasmHash = wasmBinaryHash;
                await this.saveData(dataToSave);
                
                this.wasmInitialized = true;
                // Keep a simpler log message for WASM initialization
                console.log('Graph Analysis: WASM initialized');
                
                // Hide the loading notice
                if (this.wasmLoadingNotice) {
                    this.wasmLoadingNotice.hide();
                    this.wasmLoadingNotice = null;
                }
            } catch (error) {
                console.error('Failed to initialize WASM module:', error);
                
                // Hide the loading notice and show an error
                if (this.wasmLoadingNotice) {
                    this.wasmLoadingNotice.hide();
                    this.wasmLoadingNotice = null;
                }
                
                new Notice('Failed to initialize Graph Analysis WASM module: ' + (error as Error).message);
                this.wasmLoadingPromise = null; // Allow retry
            }
        })();
    }
    
    /**
     * Calculate a simple hash of a binary array buffer
     * Used for WASM binary caching
     */
    private async calculateBinaryHash(buffer: ArrayBuffer): Promise<string> {
        // Create a simple hash using first/last 1024 bytes
        // This is just to detect changes, not for security
        const array = new Uint8Array(buffer);
        const startBytes = array.slice(0, Math.min(1024, array.length));
        const endBytes = array.slice(Math.max(0, array.length - 1024));
        
        let hash = 0;
        for (let i = 0; i < startBytes.length; i++) {
            hash = ((hash << 5) - hash) + startBytes[i];
            hash |= 0; // Convert to 32bit integer
        }
        for (let i = 0; i < endBytes.length; i++) {
            hash = ((hash << 5) - hash) + endBytes[i];
            hash |= 0; // Convert to 32bit integer
        }
        
        return hash.toString(16);
    }
    
    /**
     * Ensure the WASM module is loaded before performing operations that require it
     * Returns a promise that resolves when WASM is ready
     */
    private async ensureWasmLoaded(): Promise<void> {
        if (this.wasmInitialized) {
            return Promise.resolve();
        }
        
        // If loading is in progress, wait for it
        if (this.wasmLoadingPromise) {
            return this.wasmLoadingPromise;
        }
        
        // If not loading, start loading now
        this.initializeWasmModule();
        return this.wasmLoadingPromise!;
    }

    private registerVaultEventListeners() {
        // Handler for file creation
        this.fileCreatedHandler = (file: TFile) => {
            // Only process events after plugin is fully loaded
            if (!this.pluginIsLoaded) return;
            
            // Only consider markdown files
            if (file.extension === 'md' && !this.isFileExcluded(file)) {
                this.scheduleGraphDataRefresh('File created');
            }
        };
        
        // Handler for file deletion
        this.fileDeletedHandler = (file: TFile) => {
            // Only process events after plugin is fully loaded
            if (!this.pluginIsLoaded) return;
            
            // Only consider markdown files
            if (file.extension === 'md') {
                this.scheduleGraphDataRefresh('File deleted');
            }
        };
        
        // Handler for file modification
        this.fileModifiedHandler = (file: TFile) => {
            // Only process events after plugin is fully loaded
            if (!this.pluginIsLoaded) return;
            
            // Only consider markdown files
            if (file.extension === 'md' && !this.isFileExcluded(file)) {
                this.scheduleGraphDataRefresh('File modified');
            }
        };
        
        // Handler for metadata changes (this captures link changes)
        this.metadataChangedHandler = (file: TFile) => {
            // Only process events after plugin is fully loaded
            if (!this.pluginIsLoaded) return;
            
            // Only consider markdown files
            if (file.extension === 'md' && !this.isFileExcluded(file)) {
                this.scheduleGraphDataRefresh('Metadata changed');
            }
        };
        
        // Register the event listeners
        this.registerEvent(this.app.vault.on('create', this.fileCreatedHandler));
        this.registerEvent(this.app.vault.on('delete', this.fileDeletedHandler));
        this.registerEvent(this.app.vault.on('modify', this.fileModifiedHandler));
        this.registerEvent(this.app.metadataCache.on('changed', this.metadataChangedHandler));
    }
    
    /**
     * Schedule a refresh of graph data with debouncing to prevent
     * excessive refreshes during bulk changes
     */
    private scheduleGraphDataRefresh(reason: string) {
        this.graphDataNeedsRefresh = true;
        
        // Clear any existing timeout
        if (this.refreshDebounceTimeout) {
            clearTimeout(this.refreshDebounceTimeout);
        }
        
        // Calculate how long to wait before refreshing
        const now = Date.now();
        const timeSinceLastRefresh = now - this.lastRefreshTime;
        const timeToWait = Math.max(0, this.MIN_REFRESH_INTERVAL - timeSinceLastRefresh);
        
        // Schedule the refresh
        this.refreshDebounceTimeout = setTimeout(() => {
            this.refreshGraphDataIfNeeded(reason);
        }, timeToWait + 1000); // Add 1 second debounce time
    }
    
    /**
     * Refresh graph data if it's needed and the graph view is visible
     */
    private async refreshGraphDataIfNeeded(reason: string) {
        if (!this.graphDataNeedsRefresh || !this.graphView) {
            return;
        }
        
        // Only refresh if the graph view is loaded
        if (this.graphView) {
            try {
                // Ensure WASM is loaded before proceeding
                await this.ensureWasmLoaded();
                
                // Rebuild the graph data
                const graphData = await this.buildGraphData();
                
                // Update the graph view with new data
                await this.graphView.updateData(graphData);
                
                // Mark as refreshed
                this.graphDataNeedsRefresh = false;
                this.lastRefreshTime = Date.now();
            } catch (error) {
                console.error('Failed to refresh graph data:', error);
            }
        }
    }

    onunload() {
        console.log('Unloading Graph Analysis plugin');
        
        // Clear any pending refresh
        if (this.refreshDebounceTimeout) {
            clearTimeout(this.refreshDebounceTimeout);
            this.refreshDebounceTimeout = null;
        }
        
        // Hide any loading notices
        if (this.wasmLoadingNotice) {
            this.wasmLoadingNotice.hide();
            this.wasmLoadingNotice = null;
        }
        
        // Mark WASM as uninitialized to prevent further usage
        this.wasmInitialized = false;
        
        // Release WASM resources for garbage collection
        // Note: WebAssembly doesn't provide explicit unload methods,
        // but marking as uninitialized and releasing references helps garbage collection
        this.wasmLoadingPromise = null;
        
        // Release event handlers explicitly (although registerEvent handles this)
        this.fileCreatedHandler = null;
        this.fileDeletedHandler = null;
        this.fileModifiedHandler = null;
        this.metadataChangedHandler = null;
        
        // Close any open graph views
        const leaves = this.app.workspace.getLeavesOfType(GRAPH_ANALYSIS_VIEW_TYPE);
        for (const leaf of leaves) {
            leaf.detach();
        }
        
        // Remove any added CSS classes from the body
        document.body.classList.remove('graph-view-dragging');
        document.body.classList.remove('graph-analysis-active');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async analyzeCentrality(algorithm: 'degree' | 'eigenvector' | 'betweenness') {
        // Ensure WASM is loaded first
        try {
            await this.ensureWasmLoaded();
        } catch (error) {
            new Notice('WASM module not initialized. Please try again later.');
            return;
        }

        try {
            // Show loading notice
            const loadingNotice = new Notice('Analyzing vault graph...', 0);
            
            // Build graph data from vault
            const graphData = await this.buildGraphData();
            
            // Calculate centrality using WASM
            let resultsJson: string;
            let algorithmName: string;
            
            if (algorithm === 'degree') {
                resultsJson = calculate_degree_centrality(JSON.stringify(graphData));
                algorithmName = 'Degree Centrality';
            } else if (algorithm === 'eigenvector') {
                resultsJson = calculate_eigenvector_centrality(JSON.stringify(graphData));
                algorithmName = 'Eigenvector Centrality';
            } else if (algorithm === 'betweenness') {
                resultsJson = calculate_betweenness_centrality(JSON.stringify(graphData));
                algorithmName = 'Betweenness Centrality';
            } else {
                throw new Error(`Unknown algorithm: ${algorithm}`);
            }
            
            // Parse results
            const results = JSON.parse(resultsJson) as CentralityResult[];
            
            // Check for error
            if (results.length === 1 && 'error' in results[0]) {
                throw new Error((results[0] as any).error as string);
            }
            
            // Close loading notice
            loadingNotice.hide();
            
            // Display results
            this.displayResults(results, algorithmName);
        } catch (error) {
            console.error(`Error analyzing vault with ${algorithm} centrality:`, error);
            new Notice(`Error analyzing vault: ${(error as Error).message}`);
        }
    }

    public async buildGraphData() {
        const files = this.app.vault.getMarkdownFiles();
        
        // First try to use the Rust implementation for better performance
        if (this.wasmInitialized && typeof build_graph_from_vault === 'function') {
            try {
                // Prepare vault data for Rust
                const vaultFiles = await Promise.all(files.map(async (file) => {
                    // Skip files in excluded folders
                    if (this.isFileExcluded(file)) {
                        return null;
                    }
                    
                    const content = await this.app.vault.read(file);
                    return {
                        path: file.path,
                        content: content
                    };
                }));
                
                // Filter out excluded files
                const filteredVaultFiles = vaultFiles.filter(file => file !== null);
                
                // Convert to JSON and call Rust function
                const vaultDataJson = JSON.stringify({ files: filteredVaultFiles });
                const graphDataJson = build_graph_from_vault(vaultDataJson);
                
                // Parse the result
                const graphData = JSON.parse(graphDataJson);
                
                // Check for error
                if (graphData.error) {
                    console.error('Error building graph in Rust:', graphData.error);
                    throw new Error(graphData.error);
                }
                
                return graphData;
            } catch (error) {
                console.error('Error using Rust graph builder, falling back to TS implementation:', error);
                // Fall back to TypeScript implementation
            }
        }
        
        // Fallback TypeScript implementation
        const nodes: string[] = [];
        const nodeMap: Map<string, number> = new Map();
        const edges: [number, number][] = [];
        
        // Create nodes
        for (const file of files) {
            // Skip files in excluded folders
            if (this.isFileExcluded(file)) {
                continue;
            }
            
            const nodeId = nodes.length;
            nodes.push(file.path);
            nodeMap.set(file.path, nodeId);
        }
        
        // Create edges (links between notes)
        for (const file of files) {
            if (this.isFileExcluded(file)) {
                continue;
            }
            
            const sourceId = nodeMap.get(file.path);
            if (sourceId === undefined) continue;
            
            // Get all links in the file
            const content = await this.app.vault.read(file);
            const linkRegex = /\[\[([^\]]+?)\]\]/g;
            let match;
            
            while ((match = linkRegex.exec(content)) !== null) {
                let linkPath = match[1];
                
                // Handle aliases in links
                if (linkPath.includes('|')) {
                    linkPath = linkPath.split('|')[0];
                }
                
                // Try to resolve the link to a file
                const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, file.path);
                
                if (linkedFile && !this.isFileExcluded(linkedFile)) {
                    const targetId = nodeMap.get(linkedFile.path);
                    if (targetId !== undefined) {
                        edges.push([sourceId, targetId]);
                    }
                }
            }
        }
        
        return { nodes, edges };
    }
    
    isFileExcluded(file: TFile): boolean {
        // Check if file is in excluded folder
        for (const folder of this.settings.excludeFolders) {
            if (folder && file.path.startsWith(folder)) {
                return true;
            }
        }
        
        // Check if file has excluded tag
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
        // Limit results based on settings
        const limitedResults = results.slice(0, this.settings.resultLimit);
        
        // Show a modal with the results
        new ResultsModal(this.app, limitedResults, algorithmName).open();
        
        // Also show a brief notice
        const topResults = results.slice(0, 3);
        let message = `Top 3 central notes (${algorithmName}):\n`;
        
        topResults.forEach((result, index) => {
            message += `${index + 1}. ${result.node_name} (${result.score.toFixed(3)})\n`;
        });
        
        new Notice(message);
        
        // Log full results to console
        console.log(`Graph Analysis Results (${algorithmName}):`, results);
    }

    // Method to calculate degree centrality using WASM
    public calculateDegreeCentrality(graphDataJson: string): string {
        if (!this.wasmInitialized) {
            throw new Error('WASM module not initialized');
        }
        
        try {
            return calculate_degree_centrality(graphDataJson);
        } catch (error) {
            console.error('Error in WASM degree centrality calculation:', error);
            throw new Error('Failed to calculate degree centrality');
        }
    }
    
    // Method to calculate eigenvector centrality using WASM
    public calculateEigenvectorCentrality(graphDataJson: string): string {
        if (!this.wasmInitialized) {
            throw new Error('WASM module not initialized');
        }
        
        try {
            return calculate_eigenvector_centrality(graphDataJson);
        } catch (error) {
            console.error('Error in WASM eigenvector centrality calculation:', error);
            throw new Error('Failed to calculate eigenvector centrality');
        }
    }
    
    // Method to calculate betweenness centrality using WASM
    public calculateBetweennessCentrality(graphDataJson: string): string {
        if (!this.wasmInitialized) {
            throw new Error('WASM module not initialized');
        }
        
        try {
            return calculate_betweenness_centrality(graphDataJson);
        } catch (error) {
            console.error('Error in WASM betweenness centrality calculation:', error);
            throw new Error('Failed to calculate betweenness centrality');
        }
    }
    
    // Method to initialize the cached graph
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
    
    // Method to clear the cached graph
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
    
    // Method to get neighbors for a node using the cached graph
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
    
    // Method to calculate degree centrality using the cached graph
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
    
    // Method to get metadata about the cached graph
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
    
    // Method to find shortest path between nodes using the cached graph
    public findShortestPathCached(sourceId: number, targetId: number): any {
        if (!this.wasmInitialized) {
            throw new Error('WASM module not initialized');
        }
        
        try {
            const result = find_shortest_path_cached(sourceId, targetId);
            return JSON.parse(result);
        } catch (error) {
            console.error('Error finding shortest path from cache:', error);
            throw new Error('Failed to find shortest path');
        }
    }
}

class GraphAnalysisSettingTab extends PluginSettingTab {
    plugin: GraphAnalysisPlugin;

    constructor(app: App, plugin: GraphAnalysisPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Graph Analysis Settings' });

        new Setting(containerEl)
            .setName('Exclude Folders')
            .setDesc('Folders to exclude from analysis (comma-separated)')
            .addText(text => text
                .setPlaceholder('folder1,folder2')
                .setValue(this.plugin.settings.excludeFolders.join(','))
                .onChange(async (value) => {
                    this.plugin.settings.excludeFolders = value.split(',').map(s => s.trim()).filter(s => s);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Exclude Tags')
            .setDesc('Tags to exclude from analysis (comma-separated)')
            .addText(text => text
                .setPlaceholder('tag1,tag2')
                .setValue(this.plugin.settings.excludeTags.join(','))
                .onChange(async (value) => {
                    this.plugin.settings.excludeTags = value.split(',').map(s => s.trim()).filter(s => s);
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Result Limit')
            .setDesc('Maximum number of results to display')
            .addSlider(slider => slider
                .setLimits(5, 50, 5)
                .setValue(this.plugin.settings.resultLimit)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.resultLimit = value;
                    await this.plugin.saveSettings();
                }));
    }
} 