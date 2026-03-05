import { App, setIcon } from 'obsidian';
import { GraphAnalysisSettings, HierarchicalDomain, DomainConnection } from '../../types/types';
import { 
    DomainDistributionChart, 
    DomainDistributionData
} from '../../components/domain-distribution/DomainDistributionChart';
// import { MasterAnalysisManager } from '../MasterAnalysisManager';
import { KnowledgeDomainHelper } from '../KnowledgeDomainHelper';
import { KDECalculationService, StructuredCentralityStats } from '../../utils/KDECalculationService';
import { CentralityKDEChart } from '../../components/kde-chart/CentralityKDEChart';
import { VaultAnalysisData, VaultAnalysisResult } from '../MasterAnalysisManager';
import type { KnowledgeDomain } from '../KnowledgeDomainHelper';


export interface NetworkNode {
    domain: string;
    domainCode?: string; // Optional since it might not be in the schema
    explanation: string;
    averageScore?: number; // Optional since it might not be in the schema
    noteCount?: number; // Optional since it might not be in the schema
    topNotes: Array<{
        title: string;
        score?: number; // Optional since schema only has rank
        rank?: number; // Optional but likely present
        path: string;
    }>;
    connections?: string[];
    coverage?: string[]; // For foundations
    influence?: string[]; // For authorities
    reach?: number;
    insights?: string;
}

export interface KnowledgeStructureData {
    // Network analysis
    knowledgeNetwork: {
        bridges: NetworkNode[];
        foundations: NetworkNode[];
        authorities: NetworkNode[];
    };
    
    // Knowledge gaps
    gaps: string[];
}

/* eslint-disable obsidianmd/no-static-styles-assignment -- Domain card layout uses dynamic structure; styles in styles.css */
export class KnowledgeStructureManager {
    private app: App;
    private container!: HTMLElement;
    private settings: GraphAnalysisSettings;
    private domainHierarchy: HierarchicalDomain[] = [];
    private domainConnections: DomainConnection[] = [];
    private data: KnowledgeStructureData | null = null;
    private createEmptyStateFn: (container: HTMLElement, message: string) => void;

    constructor(app: App, settings: GraphAnalysisSettings, createEmptyStateFn?: (container: HTMLElement, message: string) => void) {
        this.app = app;
        this.settings = settings;
        this.createEmptyStateFn = createEmptyStateFn || this.defaultCreateEmptyState.bind(this);
    }

    /**
     * Default empty state implementation for when no callback is provided
     */
    private defaultCreateEmptyState(container: HTMLElement, message: string): void {
        const emptyState = document.createElement('div');
        emptyState.className = 'network-empty-state';
        container.appendChild(emptyState);

        const iconEl = document.createElement('div');
        iconEl.className = 'network-empty-state-icon';
        emptyState.appendChild(iconEl);
        setIcon(iconEl, 'bar-chart-2');

        const textEl = document.createElement('p');
        textEl.className = 'network-empty-state-text';
        textEl.textContent = message;
        emptyState.appendChild(textEl);
    }

    public async loadCachedStructureData(): Promise<KnowledgeStructureData | null> {
        try {
            const filePath = `${this.app.vault.configDir}/plugins/knowledge-graph-analysis/responses/structure-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const data = JSON.parse(content) as { knowledgeStructure?: KnowledgeStructureData };
            if (data?.knowledgeStructure) {
                this.data = data.knowledgeStructure;
                return this.data;
            }
            return null;
        } catch {
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

        // Always create the three main sections - they will handle their own empty states
        await this.createKnowledgeDomainDistributionSection();
        await this.createKnowledgeNetworkAnalysisSection();
        await this.createKnowledgeGapSection();
    }



    /**
     * Section 1: Knowledge Domain Distribution
     */
    private async createKnowledgeDomainDistributionSection(): Promise<void> {
        const section = this.container.createEl('div', { 
            cls: 'vault-analysis-section' 
        });

        section.createEl('h3', {
            text: 'Knowledge domain distribution',
            cls: 'vault-analysis-section-title'
        });

        // Create the domain distribution chart using vault analysis data
        await this.createDomainDistributionChart(section);
    }

    /**
     * Create domain distribution chart - centralized method
     * Uses vault analysis data directly without relying on cached structure files
     * @param preloadedData - Optional vault analysis data to avoid re-reading from disk
     */
    public async createDomainDistributionChart(container: HTMLElement, preloadedData?: VaultAnalysisData): Promise<void> {
        try {
            // Try to build hierarchy from vault analysis data
            const domainData = await this.buildDomainHierarchyFromVaultAnalysis(preloadedData);
            
            if (!domainData || !domainData.domainHierarchy || domainData.domainHierarchy.length === 0) {
                this.createEmptyStateFn(container, 'Generate vault analysis to see your knowledge domain distribution.');
                return;
            }

            // Create chart container with proper sizing
            const chartContainer = container.createEl('div', { 
                cls: 'domain-chart-container'
            });
            
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
            
            await domainChart.renderWithData(domainData);
        } catch (err) {
            const errorMsg = container.createEl('div', { cls: 'error-message' });
            const errorMessage = err instanceof Error ? err.message : String(err);
            errorMsg.createEl('p', {
                text: `Failed to create domain chart: ${errorMessage}`,
                cls: 'error-text'
            });
        }
    }

    /**
     * Get the path to vault-analysis.json in the responses folder
     */
    private getVaultAnalysisFilePath(): string {
        return `${this.app.vault.configDir}/plugins/knowledge-graph-analysis/responses/vault-analysis.json`;
    }

    /**
     * Build domain hierarchy from vault analysis data
     * This is now centralized in KnowledgeStructureManager
     * @param preloadedData - Optional vault analysis data to avoid re-reading from disk
     */
    private async buildDomainHierarchyFromVaultAnalysis(preloadedData?: VaultAnalysisData): Promise<DomainDistributionData | null> {
        interface DomainMapNode {
            ddcCode: string;
            name: string;
            noteCount: number;
            level: number;
            children?: DomainMapNode[];
            parent?: string;
            keywords?: string[];
        }
        try {
            const raw = preloadedData ?? (JSON.parse(await this.app.vault.adapter.read(this.getVaultAnalysisFilePath())) as VaultAnalysisData);
            const analysisData = raw;
            if (!analysisData?.results || analysisData.results.length === 0) {
                return null;
            }

            const domainHelper = KnowledgeDomainHelper.getInstance(this.app);
            await domainHelper.ensureDomainTemplateLoaded();

            const domainMap = new Map<string, DomainMapNode>();
            const subdivisionMap = new Map<string, DomainMapNode>();
            const subdivisionCounts = new Map<string, number>();
            const subdivisionNotes = new Map<string, VaultAnalysisResult[]>();
            const nameToCodeMap = new Map<string, string>();
            const codeToNameMap = domainHelper.getDomainCodeToNameMap();
            const domainTemplate = domainHelper.getDomainTemplate();
            if (domainTemplate?.knowledge_domains?.domains) {
                domainTemplate.knowledge_domains.domains.forEach((domain: KnowledgeDomain) => {
                    codeToNameMap.set(domain.id, domain.name);
                });
            }
            codeToNameMap.forEach((name: string, code: string) => {
                nameToCodeMap.set(name, code);
            });
            analysisData.results.forEach((note: VaultAnalysisResult) => {
                if (note.knowledgeDomains && note.knowledgeDomains.length > 0) {
                    note.knowledgeDomains.forEach((domain: string) => {
                        let subdivisionId = '';
                        if (domainHelper.isValidSubdivisionId(domain)) {
                            subdivisionId = domain;
                        } else if (nameToCodeMap.has(domain)) {
                            subdivisionId = nameToCodeMap.get(domain) || '';
                        } else {
                            return;
                        }
                        if (!subdivisionId) return;
                        const domainId = domainHelper.getDomainIdFromSubdivision(subdivisionId);
                        subdivisionCounts.set(subdivisionId, (subdivisionCounts.get(subdivisionId) || 0) + 1);
                        if (!subdivisionNotes.has(subdivisionId)) {
                            subdivisionNotes.set(subdivisionId, []);
                        }
                        subdivisionNotes.get(subdivisionId)?.push(note);
                        if (!domainMap.has(domainId)) {
                            const domainName = codeToNameMap.get(domainId) || domainId;
                            domainMap.set(domainId, {
                                ddcCode: domainId,
                                name: domainName,
                                noteCount: 0,
                                level: 1,
                                children: []
                            });
                        }
                        if (!subdivisionMap.has(subdivisionId)) {
                            const subdivisionNode: DomainMapNode = {
                                ddcCode: subdivisionId,
                                name: codeToNameMap.get(subdivisionId) || subdivisionId,
                                noteCount: 0,
                                level: 2,
                                parent: domainMap.get(domainId)?.ddcCode
                            };
                            subdivisionMap.set(subdivisionId, subdivisionNode);
                            domainMap.get(domainId)?.children?.push(subdivisionNode);
                        }
                        const subdivision = subdivisionMap.get(subdivisionId);
                        if (subdivision) {
                            subdivision.noteCount += 1;
                        }
                        const domainNode = domainMap.get(domainId);
                        if (domainNode) {
                            domainNode.noteCount += 1;
                        }
                    });
                }
            });
            subdivisionMap.forEach((subdivision, subdivisionId) => {
                const notes = subdivisionNotes.get(subdivisionId) || [];
                const keywords = new Set<string>();
                notes.forEach((note) => {
                    if (note.keywords) {
                        note.keywords.split(',').forEach((keyword: string) => {
                            const trimmed = keyword.trim();
                            if (trimmed) keywords.add(trimmed);
                        });
                    }
                });
                subdivision.keywords = Array.from(keywords);
            });
            const domainHierarchy = Array.from(domainMap.values())
                .filter((d) => d.noteCount > 0)
                .sort((a, b) => b.noteCount - a.noteCount) as HierarchicalDomain[];
            return {
                domainHierarchy,
                domainConnections: []
            };
        } catch {
            return null;
        }
    }

    /**
     * Section 2: Knowledge Network Analysis
     */
    private async createKnowledgeNetworkAnalysisSection(customContainer?: HTMLElement): Promise<void> {
        const targetContainer = customContainer || this.container;
        
        // Check if KDE chart already exists in container (rendered independently)
        const hasKDEChart = targetContainer.querySelector('.kde-chart-container') !== null;
        
        // Only create new section if KDE chart doesn't exist
        // If KDE chart exists, we'll append network cards directly to the container
        let section: HTMLElement;
        if (hasKDEChart) {
            // KDE chart already rendered, use existing container
            section = targetContainer;
        } else {
            // Create new section
            section = targetContainer.createEl('div', { 
                cls: 'vault-analysis-section' 
            });

            section.createEl('h3', {
                text: 'Knowledge network analysis',
                cls: 'vault-analysis-section-title'
            });

            // Render KDE distribution chart first (independent of AI analysis, like DDC chart)
            await this.renderKDEDistributionChart(section);
        }

        const networkData = this.data?.knowledgeNetwork;

         // Check if we have any network data
        if (!networkData || (!networkData.bridges?.length && !networkData.foundations?.length && !networkData.authorities?.length)) {
            // Only show empty state if we didn't already show it (i.e., if KDE chart exists, don't show duplicate message)
            if (!hasKDEChart) {
                this.createEmptyStateFn(section, 'Generate AI analysis to identify knowledge bridges, foundations, and authorities in your vault\'s network structure.');
            }
            return;
        }

        // Create card layout for network analysis (will append below KDE chart if it exists)
        this.renderNetworkCards(section, networkData);
    }

    /**
     * Render KDE distribution chart for centrality scores
     * This method fetches data directly from vault-analysis.json and displays independently of AI analysis
     * @param preloadedData - Optional vault analysis data to avoid re-reading from disk
     */
    public async renderKDEDistributionChart(section: HTMLElement, preloadedData?: VaultAnalysisData): Promise<void> {
        try {
            const analysisData: VaultAnalysisData = preloadedData ?? (JSON.parse(await this.app.vault.adapter.read(this.getVaultAnalysisFilePath())) as VaultAnalysisData);
            
            // Calculate histogram distributions
            const kdeService = new KDECalculationService();
            const histogramResults = kdeService.calculateHistogramDistributions(analysisData);
            
            // Check if we have any data to display
            const hasData = histogramResults.totals.betweenness > 0 || 
                           histogramResults.totals.closeness > 0 || 
                           histogramResults.totals.eigenvector > 0;
            
            if (!hasData) {
                return; // Skip chart if no data
            }
            
            // Create chart container
            const chartContainer = section.createEl('div', { cls: 'kde-chart-container' });
            
            // Create title container with icon
            const titleContainer = chartContainer.createEl('div', { cls: 'kde-chart-title-container' });
            const iconEl = titleContainer.createEl('div', { cls: 'kde-chart-icon' });
            setIcon(iconEl, 'bar-chart-2');
            titleContainer.createEl('h4', {
                text: 'Centrality score distributions',
                cls: 'kde-chart-title'
            });
            
            // Create inner container for SVG
            const svgContainer = chartContainer.createEl('div', { cls: 'kde-chart-svg-container' });
            
            // Render histogram chart
            const chart = new CentralityKDEChart(svgContainer, histogramResults, {
                width: 800,
                height: 400
            });
            chart.render();

            // Add insights panel with statistics
            const structuredStats = kdeService.getStructuredStats(analysisData);
            this.renderInsightsPanel(chartContainer, structuredStats);
        } catch {
            // console.error('Failed to render centrality distribution chart:', error);
            // Silently fail - don't break the UI if chart fails
        }
    }

    /**
     * Render insights panel with statistical information below the chart
     */
    private renderInsightsPanel(container: HTMLElement, stats: StructuredCentralityStats): void {
        // Create insights container
        const insightsContainer = container.createEl('div', { cls: 'kde-chart-insights' });

        // Define centrality types with their icons
        const centralityTypes = [
            { key: 'betweenness' as const, name: 'Betweenness Centrality', icon: 'git-branch' },
            { key: 'closeness' as const, name: 'Closeness Centrality', icon: 'target' },
            { key: 'eigenvector' as const, name: 'Eigenvector Centrality', icon: 'star' }
        ];

        // Render insight card for each centrality type
        centralityTypes.forEach(({ key, name, icon }) => {
            const stat = stats[key];
            if (!stat) return; // Skip if no data

            // Create insight card
            const card = insightsContainer.createEl('div', { cls: 'kde-chart-insight-card' });
            const header = card.createEl('div', { cls: 'kde-chart-insight-header' });
            const iconEl = header.createEl('div', { cls: 'kde-chart-insight-icon' });
            setIcon(iconEl, icon);
            const titleEl = header.createEl('span', { cls: 'kde-chart-insight-title' });
            titleEl.textContent = name;

            const statsLine = card.createEl('div', { cls: 'kde-chart-insight-stats' });
            const statsParts = [
                `N=${stat.count}`,
                `Mean: ${stat.mean.toFixed(3)}`,
                `Range: ${stat.range.min.toFixed(2)}-${stat.range.max.toFixed(2)}`,
                stat.distribution
            ];
            statsParts.forEach((part) => {
                const span = statsLine.createEl('span');
                span.textContent = part;
            });

            const interpretationEl = card.createEl('div', { cls: 'kde-chart-insight-interpretation' });
            interpretationEl.textContent = stat.interpretation;
        });
    }

    /**
     * Render network analysis in tabbed card-based layout
     */
    private renderNetworkCards(section: HTMLElement, networkData: KnowledgeStructureData['knowledgeNetwork']): void {
        const tabs = [
            {
                id: 'bridges',
                label: 'Knowledge Bridges',
                icon: 'route',
                description: 'Domains that connect different areas of knowledge',
                data: networkData.bridges || []
            },
            {
                id: 'foundations',
                label: 'Knowledge Foundations',
                icon: 'star',
                description: 'Core domains that serve as central access points',
                data: networkData.foundations || []
            },
            {
                id: 'authorities',
                label: 'Knowledge Authorities',
                icon: 'orbit',
                description: 'Influential domains with high connectivity',
                data: networkData.authorities || []
            }
        ];

        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'knowledge-network-tabs-container';
        section.appendChild(tabsContainer);

        const tabBar = document.createElement('div');
        tabBar.className = 'knowledge-network-tab-bar';
        tabsContainer.appendChild(tabBar);

        const contentContainer = document.createElement('div');
        contentContainer.className = 'knowledge-network-tab-content';
        tabsContainer.appendChild(contentContainer);

        // Cache references for tab buttons and panels
        const tabButtons = new Map<string, HTMLElement>();
        const tabPanels = new Map<string, HTMLElement>();

        // Determine initial active tab
        const activeTabId = tabs.find(tab => tab.data.length > 0)?.id || tabs[0].id;

        // Create tab buttons
        tabs.forEach(tab => {
            const tabButton = this.createTabButton(tab, tab.id === activeTabId);
            tabBar.appendChild(tabButton);
            tabButtons.set(tab.id, tabButton);

            const tabPanel = document.createElement('div');
            tabPanel.className = `knowledge-network-tab-panel ${tab.id}${tab.id === activeTabId ? ' active' : ''}`;
            contentContainer.appendChild(tabPanel);
            tabPanels.set(tab.id, tabPanel);

            // Add click handler
            tabButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.switchNetworkTab(tab.id, tabs, tabButtons, tabPanels);
            });
        });

        // Render content for each tab
        tabs.forEach(tab => {
            const panel = tabPanels.get(tab.id);
            if (!panel) return;

            if (tab.data.length > 0) {
                const cardsContainer = document.createElement('div');
                cardsContainer.className = 'knowledge-network-cards-container network-cards-container';
                panel.appendChild(cardsContainer);

                // Create individual cards for each domain
                tab.data.forEach((node: NetworkNode) => {
                    this.createDomainCard(cardsContainer, tab.id, node);
                });
            } else {
                const emptyState = document.createElement('div');
                emptyState.className = 'network-empty-state';
                const iconEl = document.createElement('div');
                iconEl.className = 'network-empty-state-icon';
                setIcon(iconEl, tab.icon);
                emptyState.appendChild(iconEl);
                const textEl = document.createElement('p');
                textEl.className = 'network-empty-state-text';
                textEl.textContent = `No ${tab.label.toLowerCase()} found.`;
                emptyState.appendChild(textEl);
                panel.appendChild(emptyState);
            }
        });
    }

    /**
     * Create a tab button element
     */
    private createTabButton(tab: { id: string; label: string; icon: string }, isActive: boolean): HTMLElement {
        const tabButton = document.createElement('button');
        tabButton.className = `knowledge-network-tab ${isActive ? 'active' : ''}`;
        tabButton.setAttribute('data-tab-id', tab.id);

        const iconEl = document.createElement('span');
        setIcon(iconEl, tab.icon);
        tabButton.appendChild(iconEl);

        const labelEl = document.createElement('span');
        labelEl.textContent = tab.label;
        tabButton.appendChild(labelEl);

        return tabButton;
    }

    /**
     * Switch to a different tab
     */
    private switchNetworkTab(
        tabId: string,
        tabs: Array<{ id: string; label: string; icon: string; description: string; data: unknown[] }>,
        tabButtons: Map<string, HTMLElement>,
        tabPanels: Map<string, HTMLElement>
    ): void {
        tabs.forEach(tab => {
            const btn = tabButtons.get(tab.id);
            const panel = tabPanels.get(tab.id);
            if (!btn || !panel) return;

            const isActive = tab.id === tabId;
            btn.classList.toggle('active', isActive);
            panel.classList.toggle('active', isActive);
        });
    }

    /**
     * Create a card for a specific network category
     */
    private createNetworkCard(parent: HTMLElement, type: string, title: string, description: string, nodes: NetworkNode[]): void {
        const card = document.createElement('div');
        card.className = 'network-card';
        parent.appendChild(card);

        const header = document.createElement('div');
        header.className = 'network-card-header';
        card.appendChild(header);

        const iconEl = document.createElement('div');
        iconEl.className = 'network-card-icon';
        header.appendChild(iconEl);
        
        // Set Lucide icon based on type
        if (type === 'bridges') {
            setIcon(iconEl, 'route');
        } else if (type === 'foundations') {
            setIcon(iconEl, 'star');
        } else if (type === 'authorities') {
            setIcon(iconEl, 'orbit');
        }
        
        const titleContainer = document.createElement('div');
        titleContainer.className = 'network-card-title-container';
        header.appendChild(titleContainer);

        const titleEl = document.createElement('h4');
        titleEl.className = 'network-card-title';
        titleEl.textContent = title;
        titleContainer.appendChild(titleEl);

        const metaContainer = document.createElement('div');
        metaContainer.className = 'network-card-meta';
        titleContainer.appendChild(metaContainer);

        const countEl = document.createElement('span');
        countEl.className = 'network-card-count';
        countEl.textContent = `${nodes.length} domain${nodes.length !== 1 ? 's' : ''}`;
        metaContainer.appendChild(countEl);

        const descEl = document.createElement('span');
        descEl.className = 'network-card-description';
        descEl.textContent = description;
        metaContainer.appendChild(descEl);

        const content = document.createElement('div');
        content.className = 'network-card-content';
        card.appendChild(content);

        // Show top domains (take top 3)
        nodes.slice(0, 3).forEach((node, index) => {
            const domainItem = document.createElement('div');
            domainItem.className = 'network-domain-item';
            domainItem.style.padding = '20px';
            // Add subtle separator line between items
            if (index > 0) {
                domainItem.style.borderTop = '1px solid var(--background-modifier-border)';
            }
            content.appendChild(domainItem);
            
            // Domain header
            const domainHeader = document.createElement('div');
            domainHeader.className = 'network-domain-header';
            domainHeader.style.display = 'flex';
            domainHeader.style.justifyContent = 'space-between';
            domainHeader.style.alignItems = 'center';
            domainHeader.style.marginBottom = '12px';
            domainItem.appendChild(domainHeader);
            
            const domainName = document.createElement('strong');
            domainName.className = 'network-domain-name';
            domainName.textContent = node.domain;
            domainName.style.fontSize = '16px';
            domainName.style.fontWeight = '600';
            domainName.style.color = 'var(--text-accent)';
            domainHeader.appendChild(domainName);
            


            // Domain explanation
            const explanation = document.createElement('p');
            explanation.className = 'network-domain-explanation';
            explanation.textContent = node.explanation;
            explanation.style.fontSize = '14px';
            explanation.style.color = 'var(--text-normal)';
            explanation.style.marginBottom = '14px';
            explanation.style.lineHeight = '1.6';
            domainItem.appendChild(explanation);

            // Top notes section (restructured to match Connections/Insights pattern)
            if (node.topNotes && node.topNotes.length > 0) {
                const notesSection = document.createElement('div');
                notesSection.className = 'network-notes-section';
                notesSection.style.marginBottom = '14px'; // Consistent spacing with Connections/Insights
                notesSection.style.padding = '12px';
                notesSection.style.background = 'var(--background-secondary-alt)';
                notesSection.style.borderRadius = '8px';
                domainItem.appendChild(notesSection);

                // Header inside container
                const notesHeader = document.createElement('div');
                notesHeader.className = 'network-notes-header';
                notesHeader.style.fontSize = '14px';
                notesHeader.style.fontWeight = '600';
                notesHeader.style.color = 'var(--text-muted)';
                notesHeader.style.marginBottom = '8px';
                notesHeader.style.display = 'flex';
                notesHeader.style.alignItems = 'center';
                notesHeader.style.gap = '6px';
                notesSection.appendChild(notesHeader);

                // Add icon (similar style to Connections)
                const notesIcon = document.createElement('span');
                notesIcon.style.display = 'inline-flex';
                notesIcon.style.alignItems = 'center';
                notesHeader.appendChild(notesIcon);
                setIcon(notesIcon, 'file-text');

                const notesText = document.createElement('span');
                notesText.textContent = 'Top notes';
                notesHeader.appendChild(notesText);

                // Notes list inside container (no background/border since container provides it)
                const notesList = document.createElement('ul');
                notesList.className = 'network-notes-list';
                notesList.style.listStyle = 'none';
                notesList.style.padding = '0';
                notesList.style.margin = '0';
                notesList.style.background = 'transparent'; // Remove dark background
                notesSection.appendChild(notesList);
                
                node.topNotes.slice(0, 3).forEach((note, noteIndex) => {
                    const noteItem = document.createElement('li');
                    noteItem.className = 'network-note-item';
                    noteItem.style.fontSize = '13px';
                    noteItem.style.padding = '6px 0';
                    // Add subtle separators between notes
                    if (noteIndex > 0) {
                        noteItem.style.borderTop = '1px dashed var(--background-modifier-border)';
                        noteItem.style.paddingTop = '6px';
                    }
                    noteItem.style.color = 'var(--text-normal)';
                    noteItem.style.display = 'flex';
                    noteItem.style.alignItems = 'center';
                    notesList.appendChild(noteItem);
                    
                    // Note link
                    const noteLink = document.createElement('span');
                    noteLink.className = 'network-note-link';
                    noteLink.textContent = note.title;
                    noteLink.style.color = 'var(--text-accent)';
                    noteLink.style.textDecoration = 'none';
                    noteLink.style.cursor = 'pointer';
                    noteLink.style.flex = '1';
                    noteLink.style.whiteSpace = 'nowrap';
                    noteLink.style.overflow = 'hidden';
                    noteLink.style.textOverflow = 'ellipsis';
                    noteLink.style.transition = 'color 0.2s ease, opacity 0.2s ease';
                    noteLink.style.borderRadius = '4px';
                    noteLink.style.padding = '2px 4px';
                    noteItem.appendChild(noteLink);

                    // Add hover effects
                    noteLink.addEventListener('mouseenter', () => {
                        noteLink.style.color = 'var(--text-accent-hover)';
                        noteLink.style.background = 'var(--background-modifier-hover)';
                        noteLink.style.textDecoration = 'underline';
                    });

                    noteLink.addEventListener('mouseleave', () => {
                        noteLink.style.color = 'var(--text-accent)';
                        noteLink.style.background = 'transparent';
                        noteLink.style.textDecoration = 'none';
                    });

                    // Make note clickable
                    noteLink.addEventListener('click', () => {
                        void (async () => {
                            try {
                                const tFile = this.app.vault.getFileByPath(note.path);
                                if (tFile) {
                                    const leaf = this.app.workspace.getLeaf(false);
                                    await leaf.openFile(tFile);
                                } else {
                                    await this.app.workspace.openLinkText(note.title, '');
                                }
                            } catch {
                                try {
                                    await this.app.workspace.openLinkText(note.path, '');
                                } catch {
                                    // Fallback also failed
                                }
                            }
                        })();
                    });
                });
            }

            // Connections section (for bridges)
            if (node.connections && node.connections.length > 0) {
                const connectionsSection = document.createElement('div');
                connectionsSection.className = 'network-connections-section';
                connectionsSection.style.marginBottom = '14px';
                connectionsSection.style.padding = '12px';
                connectionsSection.style.background = 'var(--background-secondary-alt)';
                connectionsSection.style.borderRadius = '8px';
                domainItem.appendChild(connectionsSection);

                const connectionsHeader = document.createElement('div');
                connectionsHeader.className = 'network-connections-header';
                connectionsHeader.style.fontSize = '14px';
                connectionsHeader.style.fontWeight = '600';
                connectionsHeader.style.color = 'var(--text-muted)';
                connectionsHeader.style.marginBottom = '8px';
                connectionsHeader.style.display = 'flex';
                connectionsHeader.style.alignItems = 'center';
                connectionsHeader.style.gap = '6px';
                connectionsSection.appendChild(connectionsHeader);

                const connectionsIcon = document.createElement('span');
                connectionsIcon.style.display = 'inline-flex';
                connectionsIcon.style.alignItems = 'center';
                connectionsHeader.appendChild(connectionsIcon);
                setIcon(connectionsIcon, 'link');

                const connectionsText = document.createElement('span');
                connectionsText.textContent = 'Connections';
                connectionsHeader.appendChild(connectionsText);

                const connectionsList = document.createElement('div');
                connectionsList.className = 'network-connections-list';
                connectionsList.style.fontSize = '13px';
                connectionsList.style.color = 'var(--text-normal)';
                connectionsList.style.lineHeight = '1.5';
                connectionsSection.appendChild(connectionsList);

                node.connections.forEach((connection, connIndex) => {
                    const connectionItem = document.createElement('span');
                    connectionItem.textContent = connection;
                    connectionItem.style.display = 'inline-block';
                    connectionItem.style.margin = '2px 4px 2px 0';
                    connectionItem.style.padding = '2px 6px';
                    connectionItem.style.background = 'var(--background-primary)';
                    connectionItem.style.borderRadius = '4px';
                    connectionItem.style.fontSize = '12px';
                    connectionItem.style.border = '1px solid var(--background-modifier-border)';
                    connectionsList.appendChild(connectionItem);
                });
            }

            // Coverage section (for foundations)
            if (node.coverage && node.coverage.length > 0) {
                const coverageSection = document.createElement('div');
                coverageSection.className = 'network-coverage-section';
                coverageSection.style.marginBottom = '14px';
                coverageSection.style.padding = '12px';
                coverageSection.style.background = 'var(--background-secondary-alt)';
                coverageSection.style.borderRadius = '8px';
                domainItem.appendChild(coverageSection);

                const coverageHeader = document.createElement('div');
                coverageHeader.className = 'network-coverage-header';
                coverageHeader.style.fontSize = '14px';
                coverageHeader.style.fontWeight = '600';
                coverageHeader.style.color = 'var(--text-muted)';
                coverageHeader.style.marginBottom = '8px';
                coverageHeader.style.display = 'flex';
                coverageHeader.style.alignItems = 'center';
                coverageHeader.style.gap = '6px';
                coverageSection.appendChild(coverageHeader);

                const coverageIcon = document.createElement('span');
                coverageIcon.style.display = 'inline-flex';
                coverageIcon.style.alignItems = 'center';
                coverageHeader.appendChild(coverageIcon);
                setIcon(coverageIcon, 'layers');

                const coverageText = document.createElement('span');
                coverageText.textContent = 'Coverage';
                coverageHeader.appendChild(coverageText);

                const coverageList = document.createElement('div');
                coverageList.className = 'network-coverage-list';
                coverageList.style.fontSize = '13px';
                coverageList.style.color = 'var(--text-normal)';
                coverageList.style.lineHeight = '1.5';
                coverageSection.appendChild(coverageList);

                node.coverage.forEach((coverage, covIndex) => {
                    const coverageItem = document.createElement('span');
                    coverageItem.textContent = coverage;
                    coverageItem.style.display = 'inline-block';
                    coverageItem.style.margin = '2px 4px 2px 0';
                    coverageItem.style.padding = '2px 6px';
                    coverageItem.style.background = 'var(--background-primary)';
                    coverageItem.style.borderRadius = '4px';
                    coverageItem.style.fontSize = '12px';
                    coverageItem.style.border = '1px solid var(--background-modifier-border)';
                    coverageList.appendChild(coverageItem);
                });
            }

            // Influence section (for authorities)
            if (node.influence && node.influence.length > 0) {
                const influenceSection = document.createElement('div');
                influenceSection.className = 'network-influence-section';
                influenceSection.style.marginBottom = '14px';
                influenceSection.style.padding = '12px';
                influenceSection.style.background = 'var(--background-secondary-alt)';
                influenceSection.style.borderRadius = '8px';
                domainItem.appendChild(influenceSection);

                const influenceHeader = document.createElement('div');
                influenceHeader.className = 'network-influence-header';
                influenceHeader.style.fontSize = '14px';
                influenceHeader.style.fontWeight = '600';
                influenceHeader.style.color = 'var(--text-muted)';
                influenceHeader.style.marginBottom = '8px';
                influenceHeader.style.display = 'flex';
                influenceHeader.style.alignItems = 'center';
                influenceHeader.style.gap = '6px';
                influenceSection.appendChild(influenceHeader);

                const influenceIcon = document.createElement('span');
                influenceIcon.style.display = 'inline-flex';
                influenceIcon.style.alignItems = 'center';
                influenceHeader.appendChild(influenceIcon);
                setIcon(influenceIcon, 'zap');

                const influenceText = document.createElement('span');
                influenceText.textContent = 'Influence';
                influenceHeader.appendChild(influenceText);

                const influenceList = document.createElement('div');
                influenceList.className = 'network-influence-list';
                influenceList.style.fontSize = '13px';
                influenceList.style.color = 'var(--text-normal)';
                influenceList.style.lineHeight = '1.5';
                influenceSection.appendChild(influenceList);

                node.influence.forEach((influence, infIndex) => {
                    const influenceItem = document.createElement('span');
                    influenceItem.textContent = influence;
                    influenceItem.style.display = 'inline-block';
                    influenceItem.style.margin = '2px 4px 2px 0';
                    influenceItem.style.padding = '2px 6px';
                    influenceItem.style.background = 'var(--background-primary)';
                    influenceItem.style.borderRadius = '4px';
                    influenceItem.style.fontSize = '12px';
                    influenceItem.style.border = '1px solid var(--background-modifier-border)';
                    influenceList.appendChild(influenceItem);
                });
            }

            // Insights section
            if (node.insights) {
                const insightsSection = document.createElement('div');
                insightsSection.className = 'network-insights-section';
                insightsSection.style.marginBottom = '14px';
                insightsSection.style.padding = '12px';
                insightsSection.style.background = 'var(--background-secondary-alt)';
                insightsSection.style.borderRadius = '8px';
                domainItem.appendChild(insightsSection);

                const insightsHeader = document.createElement('div');
                insightsHeader.className = 'network-insights-header';
                insightsHeader.style.fontSize = '14px';
                insightsHeader.style.fontWeight = '600';
                insightsHeader.style.color = 'var(--text-muted)';
                insightsHeader.style.marginBottom = '8px';
                insightsHeader.style.display = 'flex';
                insightsHeader.style.alignItems = 'center';
                insightsHeader.style.gap = '6px';
                insightsSection.appendChild(insightsHeader);

                const insightsIcon = document.createElement('span');
                insightsIcon.style.display = 'inline-flex';
                insightsIcon.style.alignItems = 'center';
                insightsHeader.appendChild(insightsIcon);
                setIcon(insightsIcon, 'lightbulb');

                const insightsText = document.createElement('span');
                insightsText.textContent = 'Insights';
                insightsHeader.appendChild(insightsText);

                const insightsContent = document.createElement('p');
                insightsContent.className = 'network-insights-content';
                insightsContent.textContent = node.insights;
                insightsContent.style.fontSize = '13px';
                insightsContent.style.color = 'var(--text-normal)';
                insightsContent.style.lineHeight = '1.5';
                insightsContent.style.margin = '0';
                insightsSection.appendChild(insightsContent);
            }
        });
    }



    /**
     * Section 3: Knowledge Gap Analysis
     */
    private async createKnowledgeGapSection(): Promise<void> {
        const section = this.container.createEl('div', { 
            cls: 'vault-analysis-section' 
        });

        section.createEl('h3', {
            text: 'Knowledge gap analysis',
            cls: 'vault-analysis-section-title'
        });

        if (this.data?.gaps && this.data.gaps.length > 0) {
            const gapsContainer = section.createEl('div', { 
                cls: 'ai-insights-container'
            });

            const titleEl = gapsContainer.createEl('h4', {
                cls: 'ai-insights-title'
            });
            const iconEl = titleEl.createEl('span', { cls: 'ai-insights-icon' });
            setIcon(iconEl, 'target');
            titleEl.createEl('span', { text: 'Identified knowledge gaps' });

            const gapsList = gapsContainer.createEl('ul', { 
                cls: 'gaps-list' 
            });

            this.data.gaps.slice(0, 8).forEach(gap => {
                gapsList.createEl('li', { text: gap });
            });
        } else {
            this.createEmptyStateFn(section, 'Generate AI analysis to identify potential knowledge gaps and areas for expansion in your vault.');
        }
    }

    /**
     * Create a card for a single domain node (used in tabbed view)
     */
    private createDomainCard(parent: HTMLElement, type: string, node: NetworkNode): void {
        // Reuse the domain item rendering logic from createNetworkCard
        // Create a simplified card wrapper
        const card = document.createElement('div');
        card.className = 'network-card';
        card.style.width = '100%';
        card.style.background = 'var(--background-primary)';
        card.style.borderRadius = '12px';
        card.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
        card.style.padding = '0';
        card.style.overflow = 'hidden';
        card.style.border = '1px solid var(--background-modifier-border)';
        card.style.margin = '0';
        card.style.boxSizing = 'border-box';
        parent.appendChild(card);

        // Create a temporary container to reuse existing logic
        const tempContainer = document.createElement('div');
        card.appendChild(tempContainer);

        // Create a single-item array to reuse createNetworkCard logic
        // We'll extract just the domain item part
        const content = document.createElement('div');
        content.className = 'network-card-content';
        content.style.padding = '20px';
        tempContainer.appendChild(content);

        // Domain header
        const domainHeader = document.createElement('div');
        domainHeader.className = 'network-domain-header';
        domainHeader.style.display = 'flex';
        domainHeader.style.justifyContent = 'space-between';
        domainHeader.style.alignItems = 'center';
        domainHeader.style.marginBottom = '12px';
        content.appendChild(domainHeader);

        const domainName = document.createElement('strong');
        domainName.className = 'network-domain-name';
        domainName.textContent = node.domain;
        domainName.style.fontSize = '16px';
        domainName.style.fontWeight = '600';
        domainName.style.color = 'var(--text-accent)';
        domainHeader.appendChild(domainName);

        // Domain explanation
        const explanation = document.createElement('p');
        explanation.className = 'network-domain-explanation';
        explanation.textContent = node.explanation;
        explanation.style.fontSize = '14px';
        explanation.style.color = 'var(--text-normal)';
        explanation.style.marginBottom = '14px';
        explanation.style.lineHeight = '1.6';
        content.appendChild(explanation);

        // Top notes section (restructured to match Connections/Insights pattern)
        if (node.topNotes && node.topNotes.length > 0) {
            const notesSection = document.createElement('div');
            notesSection.className = 'network-notes-section';
            notesSection.style.marginBottom = '14px'; // Consistent spacing with Connections/Insights
            notesSection.style.padding = '12px';
            notesSection.style.background = 'var(--background-secondary-alt)';
            notesSection.style.borderRadius = '8px';
            content.appendChild(notesSection);

            // Header inside container
            const notesHeader = document.createElement('div');
            notesHeader.className = 'network-notes-header';
            notesHeader.style.fontSize = '14px';
            notesHeader.style.fontWeight = '600';
            notesHeader.style.color = 'var(--text-muted)';
            notesHeader.style.marginBottom = '8px';
            notesHeader.style.display = 'flex';
            notesHeader.style.alignItems = 'center';
            notesHeader.style.gap = '6px';
            notesSection.appendChild(notesHeader);

            // Add icon (similar style to Connections)
            const notesIcon = document.createElement('span');
            notesIcon.style.display = 'inline-flex';
            notesIcon.style.alignItems = 'center';
            notesHeader.appendChild(notesIcon);
            setIcon(notesIcon, 'file-text');

            const notesText = document.createElement('span');
            notesText.textContent = 'Top notes';
            notesHeader.appendChild(notesText);

            // Notes list inside container (no background/border since container provides it)
            const notesList = document.createElement('ul');
            notesList.className = 'network-notes-list';
            notesList.style.listStyle = 'none';
            notesList.style.padding = '0';
            notesList.style.margin = '0';
            notesList.style.background = 'transparent'; // Remove dark background
            notesSection.appendChild(notesList);

            node.topNotes.slice(0, 3).forEach((note, noteIndex) => {
                const noteItem = document.createElement('li');
                noteItem.className = 'network-note-item';
                noteItem.style.fontSize = '13px';
                noteItem.style.padding = '6px 0';
                if (noteIndex > 0) {
                    noteItem.style.borderTop = '1px dashed var(--background-modifier-border)';
                    noteItem.style.paddingTop = '6px';
                }
                noteItem.style.color = 'var(--text-normal)';
                noteItem.style.display = 'flex';
                noteItem.style.alignItems = 'center';
                notesList.appendChild(noteItem);

                // Note link
                const noteLink = document.createElement('span');
                noteLink.className = 'network-note-link';
                noteLink.textContent = note.title;
                noteLink.style.color = 'var(--text-accent)';
                noteLink.style.cursor = 'pointer';
                noteLink.style.flex = '1';
                noteLink.style.whiteSpace = 'nowrap';
                noteLink.style.overflow = 'hidden';
                noteLink.style.textOverflow = 'ellipsis';
                noteItem.appendChild(noteLink);

                noteLink.addEventListener('mouseenter', () => {
                    noteLink.style.textDecoration = 'underline';
                });
                noteLink.addEventListener('mouseleave', () => {
                    noteLink.style.textDecoration = 'none';
                });

                noteLink.addEventListener('click', () => {
                    void (async () => {
                        try {
                            const tFile = this.app.vault.getFileByPath(note.path);
                            if (tFile) {
                                const leaf = this.app.workspace.getLeaf(false);
                                await leaf.openFile(tFile);
                            } else {
                                await this.app.workspace.openLinkText(note.title, '');
                            }
                        } catch {
                            // Failed to open note
                        }
                    })();
                });
            });
        }

        // Add other sections (connections, coverage, influence, insights) similarly
        // For brevity, I'll add a helper to render these sections
        this.addNodeSections(content, node);
    }

    private addNodeSections(container: HTMLElement, node: NetworkNode): void {
        // Connections section (for bridges)
        if (node.connections && node.connections.length > 0) {
            this.addSection(container, 'Connections', 'link', node.connections);
        }

        // Coverage section (for foundations)
        if (node.coverage && node.coverage.length > 0) {
            this.addSection(container, 'Coverage', 'layers', node.coverage);
        }

        // Influence section (for authorities)
        if (node.influence && node.influence.length > 0) {
            this.addSection(container, 'Influence', 'zap', node.influence);
        }

        // Insights section
        if (node.insights) {
            const insightsSection = document.createElement('div');
            insightsSection.style.marginBottom = '14px';
            insightsSection.style.padding = '12px';
            insightsSection.style.background = 'var(--background-secondary-alt)';
            insightsSection.style.borderRadius = '8px';
            container.appendChild(insightsSection);

            const insightsHeader = document.createElement('div');
            insightsHeader.style.display = 'flex';
            insightsHeader.style.alignItems = 'center';
            insightsHeader.style.gap = '6px';
            insightsHeader.style.marginBottom = '8px';
            insightsSection.appendChild(insightsHeader);

            const insightsIcon = document.createElement('span');
            insightsIcon.style.display = 'inline-flex';
            insightsIcon.style.alignItems = 'center';
            insightsHeader.appendChild(insightsIcon);
            setIcon(insightsIcon, 'lightbulb');

            const insightsText = document.createElement('span');
            insightsText.textContent = 'Insights';
            insightsText.style.fontSize = '14px';
            insightsText.style.fontWeight = '600';
            insightsText.style.color = 'var(--text-muted)';
            insightsHeader.appendChild(insightsText);

            const insightsContent = document.createElement('div');
            insightsContent.style.fontSize = '13px';
            insightsContent.style.color = 'var(--text-normal)';
            insightsContent.style.lineHeight = '1.5';
            insightsContent.textContent = node.insights;
            insightsSection.appendChild(insightsContent);
        }
    }

    private addSection(container: HTMLElement, title: string, iconName: string, items: string[]): void {
        const section = document.createElement('div');
        section.style.marginBottom = '14px';
        section.style.padding = '12px';
        section.style.background = 'var(--background-secondary-alt)';
        section.style.borderRadius = '8px';
        container.appendChild(section);

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.gap = '6px';
        header.style.marginBottom = '8px';
        section.appendChild(header);

        const icon = document.createElement('span');
        icon.style.display = 'inline-flex';
        icon.style.alignItems = 'center';
        header.appendChild(icon);
        setIcon(icon, iconName);

        const text = document.createElement('span');
        text.textContent = title;
        text.style.fontSize = '14px';
        text.style.fontWeight = '600';
        text.style.color = 'var(--text-muted)';
        header.appendChild(text);

        const list = document.createElement('div');
        list.style.fontSize = '13px';
        list.style.color = 'var(--text-normal)';
        list.style.lineHeight = '1.5';
        section.appendChild(list);

        items.forEach((item) => {
            const itemEl = document.createElement('span');
            itemEl.textContent = item;
            itemEl.style.display = 'inline-block';
            itemEl.style.margin = '2px 4px 2px 0';
            itemEl.style.padding = '2px 6px';
            itemEl.style.background = 'var(--background-primary)';
            itemEl.style.borderRadius = '4px';
            itemEl.style.fontSize = '12px';
            itemEl.style.border = '1px solid var(--background-modifier-border)';
            list.appendChild(itemEl);
        });
    }

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
    }

    public setData(data: KnowledgeStructureData): void {
        this.data = data;
    }

    public setDomainHierarchy(hierarchy: HierarchicalDomain[]): void {
        this.domainHierarchy = hierarchy;
    }

    public setDomainConnections(connections: DomainConnection[]): void {
        this.domainConnections = connections;
    }

    public async renderWithData(container: HTMLElement, data: KnowledgeStructureData, domainHierarchy?: HierarchicalDomain[]): Promise<void> {
        this.data = data;
        if (domainHierarchy) {
            this.domainHierarchy = domainHierarchy;
        }
        await this.renderStructureAnalysis(container);
    }

    /**
     * Public method to render just the network analysis section
     */
    public async renderNetworkAnalysis(container: HTMLElement, data?: KnowledgeStructureData): Promise<void> {
        // Set data if provided
        if (data) {
            this.data = data;
        }
        
        // Load data if not already available
        if (!this.data) {
            await this.loadCachedStructureData();
        }

        // Check if KDE chart already exists (rendered independently)
        const hasKDEChart = container.querySelector('.kde-chart-container') !== null;
        
        // Only clear container if it doesn't have KDE chart
        // If KDE chart exists, we'll append network cards below it
        if (!hasKDEChart) {
            container.empty();
        }
        
        if (!this.data) {
            if (!hasKDEChart) {
                this.createEmptyStateFn(container, 'Generate AI analysis to identify knowledge bridges, foundations, and authorities in your vault\'s network structure.');
            }
            return;
        }
        
        // Render the network analysis section (will append if KDE chart exists)
        await this.createKnowledgeNetworkAnalysisSection(container);
    }
}