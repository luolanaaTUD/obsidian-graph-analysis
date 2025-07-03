import { App } from 'obsidian';
import { GraphAnalysisSettings } from '../../types/types';
import { 
    DomainDistributionChart, 
    DomainDistributionData,
    HierarchicalDomain,
    DomainData,
    DomainConnection
} from '../../components/domain-distribution/DomainDistributionChart';
import * as d3 from 'd3';

// Note: DomainData, HierarchicalDomain, and DomainConnection are now imported from DomainDistributionChart

export interface NetworkNode {
    title: string;
    score: number;
    rank?: number;
    connections?: string[];
    reach?: number;
    influence?: number;
}

export interface KnowledgeStructureData {
    // Hierarchical domain structure for sunburst visualization (4 layers: Main Classes, Divisions, Sections, User Domains)
    domainHierarchy: HierarchicalDomain[];
    
    // Cross-domain connections
    domainConnections?: DomainConnection[];
    
    // Existing network analysis
    knowledgeNetwork: {
        bridges: NetworkNode[];
        foundations: NetworkNode[];
        authorities: NetworkNode[];
    };
    insights: Array<{
        title: string;
        content: string;
        keyPoints: string[];
    }>;
    gaps: string[];
}

export class KnowledgeStructureManager {
    private app: App;
    private settings: GraphAnalysisSettings;
    private container: HTMLElement;
    private data: KnowledgeStructureData | null = null;

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.settings = settings;
    }

    public async loadCachedStructureData(): Promise<KnowledgeStructureData | null> {
        try {
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/master-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const masterData = JSON.parse(content);
            
            if (masterData?.knowledgeStructure) {
                this.data = masterData.knowledgeStructure;
                return this.data;
            }
            return null;
        } catch (error) {
            console.warn('No cached knowledge structure data found:', error);
            return null;
        }
    }

    public async renderStructureAnalysis(container: HTMLElement): Promise<void> {
        this.container = container;
        this.container.empty();

        // Load data if not already loaded
        if (!this.data) {
            await this.loadCachedStructureData();
        }

        if (!this.data) {
            this.renderPlaceholder();
            return;
        }

        // Create the three main sections following Knowledge Evolution pattern
        await this.createKnowledgeDomainDistributionSection();
        await this.createKnowledgeNetworkAnalysisSection();
        await this.createKnowledgeGapSection();
    }

    private renderPlaceholder(): void {
        this.container.innerHTML = `
            <div class="structure-placeholder">
                <div class="placeholder-content">
                    <h3>📊 Knowledge Structure Analysis</h3>
                    <p>Generate vault analysis to see your knowledge structure insights.</p>
                    <div class="placeholder-features">
                        <div class="feature-item">
                            <span class="feature-icon">🎯</span>
                            <span>Domain Distribution</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">🌐</span>
                            <span>Knowledge Network</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">🔍</span>
                            <span>Knowledge Gaps</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Section 1: Knowledge Domain Distribution
     * Shows sunburst chart and domain distribution table
     */
    private async createKnowledgeDomainDistributionSection(): Promise<void> {
        const section = this.container.createEl('div', { 
            cls: 'vault-analysis-section' 
        });

        section.createEl('h3', {
            text: 'Knowledge Domain Distribution',
            cls: 'vault-analysis-section-title'
        });

        // Check if we have hierarchical data
        if (!this.data!.domainHierarchy || this.data!.domainHierarchy.length === 0) {
            const placeholder = section.createEl('div', { 
                cls: 'vault-analysis-placeholder' 
            });
            placeholder.createEl('p', {
                text: 'No DDC hierarchy data available. Please generate vault analysis with hierarchical domain structure.',
                cls: 'analysis-required'
            });
            return;
        }

        // Create chart container with proper sizing
        const chartContainer = section.createEl('div', { 
            cls: 'domain-chart-container' // Use the proper CSS class for domain charts
        });
        
        // Prepare data for the domain distribution component
        const domainDistributionData: DomainDistributionData = {
            domainHierarchy: this.data!.domainHierarchy,
            domainConnections: this.data!.domainConnections
        };
        
        // Create and render the domain distribution chart
        const domainChart = new DomainDistributionChart(
            this.app,
            this.settings,
            chartContainer,
            {
                chartType: 'sunburst',
                showTooltips: true,
                showLabels: true
            }
        );
        
        await domainChart.renderWithData(domainDistributionData);
    }

    /**
     * Section 2: Knowledge Network Analysis
     * Shows bridge notes, foundation notes, and authority notes
     */
    private async createKnowledgeNetworkAnalysisSection(): Promise<void> {
        const section = this.container.createEl('div', { 
            cls: 'vault-analysis-section' 
        });

        section.createEl('h3', {
            text: 'Knowledge Network Analysis',
            cls: 'vault-analysis-section-title'
        });

        const networkData = this.data!.knowledgeNetwork;

        // Bridge Notes
        if (networkData.bridges && networkData.bridges.length > 0) {
            this.createNetworkSubsection(section, '🌉 Bridge Notes', networkData.bridges, 
                'Notes that connect different knowledge domains');
        }

        // Foundation Notes
        if (networkData.foundations && networkData.foundations.length > 0) {
            this.createNetworkSubsection(section, '🏗️ Foundation Notes', networkData.foundations, 
                'Central notes that provide quick access to the broader network');
        }

        // Authority Notes
        if (networkData.authorities && networkData.authorities.length > 0) {
            this.createNetworkSubsection(section, '👑 Authority Notes', networkData.authorities, 
                'Influential notes connected to other highly connected notes');
        }

        // If no network data available
        if ((!networkData.bridges || networkData.bridges.length === 0) &&
            (!networkData.foundations || networkData.foundations.length === 0) &&
            (!networkData.authorities || networkData.authorities.length === 0)) {
            this.createEmptyNetworkState(section);
        }
    }

    /**
     * Section 3: Knowledge Gap Analysis
     * Shows identified gaps in knowledge coverage
     */
    private async createKnowledgeGapSection(): Promise<void> {
        const section = this.container.createEl('div', { 
            cls: 'vault-analysis-section' 
        });

        section.createEl('h3', {
            text: 'Knowledge Gap Analysis',
            cls: 'vault-analysis-section-title'
        });

        if (this.data!.gaps && this.data!.gaps.length > 0) {
            const gapsContainer = section.createEl('div', { 
                cls: 'ai-insights-container'
            });

            gapsContainer.createEl('h4', {
                text: '🎯 Identified Knowledge Gaps',
                cls: 'ai-insights-title'
            });

            const gapsList = gapsContainer.createEl('ul', { 
                cls: 'gaps-list' 
            });

            this.data!.gaps.slice(0, 8).forEach(gap => {
                gapsList.createEl('li', { text: gap });
            });
        } else {
            this.createEmptyGapsState(section);
        }
    }

    /**
     * Helper method to create network subsections
     */
    private createNetworkSubsection(parent: HTMLElement, title: string, nodes: NetworkNode[], description: string): void {
        const subsection = parent.createEl('div', { cls: 'network-category' });
        
        subsection.createEl('h4', { text: title });
        subsection.createEl('p', { 
            text: description,
            cls: 'network-description'
        });

        const nodesList = subsection.createEl('div', { cls: 'centrality-list' });

        nodes.slice(0, 10).forEach((node, index) => {
            const nodeItem = nodesList.createEl('div', { cls: 'centrality-item' });
            
            const noteTitle = nodeItem.createEl('div', { 
                cls: 'note-title',
                text: node.title
            });

            // Make title clickable
            noteTitle.style.cursor = 'pointer';
            noteTitle.style.color = 'var(--text-accent)';
            noteTitle.addEventListener('click', async () => {
                const file = this.app.vault.getAbstractFileByPath(node.title);
                if (file) {
                    await this.app.workspace.openLinkText(file.path, '');
                }
            });

            nodeItem.createEl('div', { 
                cls: 'centrality-score',
                text: `Score: ${node.score.toFixed(3)}${node.rank ? ` (Rank #${node.rank})` : ''}`
            });
        });
    }

    /**
     * Helper method for empty network state
     */
    private createEmptyNetworkState(section: HTMLElement): void {
        const emptyState = section.createEl('div', { 
            cls: 'vault-analysis-placeholder' 
        });
        
        emptyState.createEl('p', {
            text: 'Network analysis requires graph metrics to be calculated. Run centrality analysis first to see network insights.',
            cls: 'analysis-required'
        });
    }

    /**
     * Helper method for empty gaps state
     */
    private createEmptyGapsState(section: HTMLElement): void {
        const emptyState = section.createEl('div', { 
            cls: 'vault-analysis-placeholder' 
        });
        
        emptyState.createEl('p', {
            text: 'No knowledge gaps identified in the current analysis. Your knowledge coverage appears comprehensive!',
            cls: 'analysis-required'
        });
    }

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
    }

    public setData(data: KnowledgeStructureData): void {
        this.data = data;
    }

    public async renderWithData(container: HTMLElement, data: KnowledgeStructureData): Promise<void> {
        this.data = data;
        await this.renderStructureAnalysis(container);
    }
}