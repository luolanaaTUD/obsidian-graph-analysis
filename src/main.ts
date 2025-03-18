import { App, Plugin, PluginSettingTab, Setting, TFile, Notice, Modal, MarkdownRenderer } from 'obsidian';

// The WASM module code will be injected at the top of this file during build
// We need to declare the functions that will be available
declare function calculate_degree_centrality(graph_data_json: string): string;
declare function calculate_eigenvector_centrality(graph_data_json: string): string;
declare function __wbg_init(wasm_path: string): Promise<any>;

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

export default class GraphAnalysisPlugin extends Plugin {
    settings: GraphAnalysisSettings;
    wasmInitialized: boolean = false;

    async onload() {
        await this.loadSettings();

        // Initialize WASM module
        try {
            // We need to use Obsidian's resource loading mechanism
            // First, get the plugin's resource path
            const wasmBinaryPath = this.manifest.dir ? 
                `${this.manifest.dir}/graph_analysis_wasm_bg.wasm` : 
                'graph_analysis_wasm_bg.wasm';
            
            console.log('Loading WASM binary from path:', wasmBinaryPath);
            
            // Get the absolute path to the WASM file
            const adapter = this.app.vault.adapter;
            const wasmAbsPath = adapter.getResourcePath(wasmBinaryPath);
            
            console.log('Resolved WASM path:', wasmAbsPath);
            
            // Initialize the WASM module with the absolute path
            await __wbg_init(wasmAbsPath);
            
            this.wasmInitialized = true;
            console.log('Graph Analysis WASM module initialized successfully');
        } catch (error) {
            console.error('Failed to initialize WASM module:', error);
            new Notice('Failed to initialize Graph Analysis WASM module: ' + (error as Error).message);
        }

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

        // Add settings tab
        this.addSettingTab(new GraphAnalysisSettingTab(this.app, this));
    }

    onunload() {
        console.log('Unloading Graph Analysis plugin');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async analyzeCentrality(algorithm: 'degree' | 'eigenvector') {
        if (!this.wasmInitialized) {
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

    async buildGraphData() {
        const files = this.app.vault.getMarkdownFiles();
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