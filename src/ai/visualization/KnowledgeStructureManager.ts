import { App, setIcon } from 'obsidian';
import { GraphAnalysisSettings, HierarchicalDomain, DomainConnection } from '../../types/types';
import { 
    DomainDistributionChart, 
    DomainDistributionData
} from '../../components/domain-distribution/DomainDistributionChart';
import { MasterAnalysisManager } from '../MasterAnalysisManager';
import { DDCHelper } from '../DDCHelper';


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

export class KnowledgeStructureManager {
    private app: App;
    private settings: GraphAnalysisSettings;
    private container: HTMLElement;
    private data: KnowledgeStructureData | null = null;
    private domainHierarchy: HierarchicalDomain[] | null = null;
    private domainConnections: DomainConnection[] | null = null;
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
        emptyState.style.textAlign = 'center';
        emptyState.style.padding = '40px 20px';
        emptyState.style.background = 'var(--background-secondary-alt)';
        emptyState.style.borderRadius = '12px';
        emptyState.style.border = '1px dashed var(--background-modifier-border)';
        container.appendChild(emptyState);
        
        const iconEl = document.createElement('div');
        iconEl.className = 'network-empty-state-icon';
        iconEl.style.marginBottom = '16px';
        iconEl.style.display = 'flex';
        iconEl.style.justifyContent = 'center';
        iconEl.style.alignItems = 'center';
        emptyState.appendChild(iconEl);
        
        // Add Lucide chart icon
        setIcon(iconEl, 'bar-chart-2');
        
        const textEl = document.createElement('p');
        textEl.className = 'network-empty-state-text';
        textEl.textContent = message;
        textEl.style.color = 'var(--text-muted)';
        textEl.style.fontSize = '14px';
        textEl.style.lineHeight = '1.5';
        emptyState.appendChild(textEl);
    }

    public async loadCachedStructureData(): Promise<KnowledgeStructureData | null> {
        try {
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/responses/structure-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const data = JSON.parse(content);
            
            if (data?.knowledgeStructure) {
                this.data = data.knowledgeStructure;
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
            text: 'Knowledge Domain Distribution',
            cls: 'vault-analysis-section-title'
        });

        // Create the domain distribution chart using vault analysis data
        await this.createDomainDistributionChart(section);
    }

    /**
     * Create domain distribution chart - centralized method
     * Uses vault analysis data directly without relying on cached structure files
     */
    public async createDomainDistributionChart(container: HTMLElement): Promise<void> {
        try {
            // Try to build hierarchy from vault analysis data
            const domainData = await this.buildDomainHierarchyFromVaultAnalysis();
            
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
        } catch (error) {
            console.error('Error creating domain distribution chart:', error);
            const errorMsg = container.createEl('div', { cls: 'error-message' });
            errorMsg.createEl('p', {
                text: `Failed to create domain chart: ${error.message}`,
                cls: 'error-text'
            });
        }
    }

    /**
     * Build domain hierarchy from vault analysis data
     * This is now centralized in KnowledgeStructureManager
     */
    private async buildDomainHierarchyFromVaultAnalysis(): Promise<DomainDistributionData | null> {
        try {
            // Load vault analysis data
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/vault-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const analysisData = JSON.parse(content);

            if (!analysisData?.results || analysisData.results.length === 0) {
                return null;
            }

            // Ensure DDC template is loaded using DDCHelper singleton
            const ddcHelper = DDCHelper.getInstance(this.app);
            await ddcHelper.ensureDDCTemplateLoaded();

            // Build hierarchy logic (moved from MasterAnalysisManager)
            // Create maps for DDC hierarchy - we'll only use class and section now
            const classMap = new Map<string, any>();
            const sectionMap = new Map<string, any>();
            // Count notes per DDC section
            const sectionCounts = new Map<string, number>();
            const sectionNotes = new Map<string, any[]>();
            // Get DDC name to code mapping for reverse lookup
            const nameToCodeMap = new Map<string, string>();
            const codeToNameMap = ddcHelper.getDDCCodeToNameMap();
            // Add main class names to the code-to-name map
            const ddcTemplate = ddcHelper.getDDCTemplate();
            if (ddcTemplate && ddcTemplate.ddc_23_summaries && ddcTemplate.ddc_23_summaries.classes) {
                ddcTemplate.ddc_23_summaries.classes.forEach((cls: any) => {
                    codeToNameMap.set(cls.id, cls.name);
                });
            }
            // Build reverse lookup map
            codeToNameMap.forEach((name: string, code: string) => {
                nameToCodeMap.set(name, code);
            });
            // Process each note to extract its DDC codes or names
            analysisData.results.forEach((note: any) => {
                if (note.knowledgeDomains && note.knowledgeDomains.length > 0) {
                    note.knowledgeDomains.forEach((domain: string) => {
                        let sectionId = '';
                        if (ddcHelper.isValidDDCSectionId(domain)) {
                            sectionId = domain;
                        } else if (nameToCodeMap.has(domain)) {
                            sectionId = nameToCodeMap.get(domain) || '';
                        } else {
                            return;
                        }
                        if (!sectionId) return;
                        const classId = ddcHelper.getClassIdFromSection(sectionId);
                        sectionCounts.set(sectionId, (sectionCounts.get(sectionId) || 0) + 1);
                        if (!sectionNotes.has(sectionId)) {
                            sectionNotes.set(sectionId, []);
                        }
                        sectionNotes.get(sectionId)?.push(note);
                        if (!classMap.has(classId)) {
                            const className = codeToNameMap.get(classId) || classId;
                            classMap.set(classId, {
                                ddcCode: classId,
                                name: className,
                                noteCount: 0,
                                level: 1,
                                children: []
                            });
                        }
                        if (!sectionMap.has(sectionId)) {
                            const sectionNode: any = {
                                ddcCode: sectionId,
                                name: codeToNameMap.get(sectionId) || sectionId,
                                noteCount: 0,
                                level: 2,
                                parent: classMap.get(classId)?.ddcCode
                            };
                            sectionMap.set(sectionId, sectionNode);
                            classMap.get(classId)?.children?.push(sectionNode);
                        }
                        if (sectionMap.has(sectionId)) {
                            const section = sectionMap.get(sectionId);
                            if (section) {
                                section.noteCount = (section.noteCount || 0) + 1;
                            }
                        }
                        if (classMap.has(classId)) {
                            const classNode = classMap.get(classId);
                            if (classNode) {
                                classNode.noteCount = (classNode.noteCount || 0) + 1;
                            }
                        }
                    });
                }
            });
            // Extract keywords for each section
            sectionMap.forEach((section, sectionId) => {
                const notes = sectionNotes.get(sectionId) || [];
                const keywords = new Set<string>();
                notes.forEach(note => {
                    if (note.keywords) {
                        note.keywords.split(',').forEach((keyword: string) => {
                            const trimmed = keyword.trim();
                            if (trimmed) {
                                keywords.add(trimmed);
                            }
                        });
                    }
                });
                section.keywords = Array.from(keywords);
            });
            // Convert class map to array and sort by note count
            const domainHierarchy = Array.from(classMap.values())
                .filter((cls: any) => cls.noteCount && cls.noteCount > 0)
                .sort((a: any, b: any) => (b.noteCount || 0) - (a.noteCount || 0));
            return {
                domainHierarchy,
                domainConnections: []
            };
        } catch (error) {
            console.error('Failed to build domain hierarchy from vault analysis:', error);
            return null;
        }
    }

    /**
     * Section 2: Knowledge Network Analysis
     */
    private async createKnowledgeNetworkAnalysisSection(customContainer?: HTMLElement): Promise<void> {
        const targetContainer = customContainer || this.container;
        
        const section = targetContainer.createEl('div', { 
            cls: 'vault-analysis-section' 
        });

        section.createEl('h3', {
            text: 'Knowledge Network Analysis',
            cls: 'vault-analysis-section-title'
        });

        const networkData = this.data?.knowledgeNetwork;

         // Check if we have any network data
        if (!networkData || (!networkData.bridges?.length && !networkData.foundations?.length && !networkData.authorities?.length)) {
            this.createEmptyStateFn(section, 'Generate AI analysis to identify knowledge bridges, foundations, and authorities in your vault\'s network structure.');
            return;
        }

        // Create card layout for network analysis
        this.renderNetworkCards(section, networkData);
    }

    /**
     * Render network analysis in card-based layout
     */
    private renderNetworkCards(section: HTMLElement, networkData: any): void {
        // Create card container for vertical layout
        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'knowledge-network-cards-container network-cards-container';
        cardsContainer.style.display = 'flex';
        cardsContainer.style.flexDirection = 'column';
        cardsContainer.style.gap = '20px';
        cardsContainer.style.marginBottom = '30px';
        cardsContainer.style.width = '100%';
        cardsContainer.style.padding = '20px 0';
        cardsContainer.style.boxSizing = 'border-box';
        section.appendChild(cardsContainer);

        // Create cards for each category
        if (networkData.bridges && networkData.bridges.length > 0) {
            this.createNetworkCard(cardsContainer, 'bridges', 'Knowledge Bridges', 
                'Domains that connect different areas of knowledge', networkData.bridges);
        }

        if (networkData.foundations && networkData.foundations.length > 0) {
            this.createNetworkCard(cardsContainer, 'foundations', 'Knowledge Foundations', 
                'Core domains that serve as central access points', networkData.foundations);
        }

        if (networkData.authorities && networkData.authorities.length > 0) {
            this.createNetworkCard(cardsContainer, 'authorities', 'Knowledge Authorities', 
                'Influential domains with high connectivity', networkData.authorities);
        }
    }

    /**
     * Create a card for a specific network category
     */
    private createNetworkCard(parent: HTMLElement, type: string, title: string, description: string, nodes: NetworkNode[]): void {
        // Create card container
        const card = document.createElement('div');
        card.className = 'network-card';
        card.style.width = '100%';
        card.style.background = 'var(--background-primary)';
        card.style.borderRadius = '12px';
        card.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
        card.style.padding = '0';
        card.style.overflow = 'hidden';
        card.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
        card.style.border = '1px solid var(--background-modifier-border)';
        card.style.margin = '0';
        card.style.position = 'relative';
        card.style.zIndex = '1';
        card.style.boxSizing = 'border-box';
        parent.appendChild(card);
        
        // Card header
        const header = document.createElement('div');
        header.className = 'network-card-header';
        header.style.padding = '16px 20px';
        header.style.background = 'var(--background-secondary)';
        header.style.borderBottom = '1px solid var(--background-modifier-border)';
        header.style.display = 'flex';
        header.style.alignItems = 'flex-start';
        header.style.gap = '12px';
        card.appendChild(header);
        
        // Lucide icon
        const iconEl = document.createElement('div');
        iconEl.className = 'network-card-icon';
        iconEl.style.display = 'flex';
        iconEl.style.alignItems = 'center';
        iconEl.style.justifyContent = 'center';
        iconEl.style.width = '24px';
        iconEl.style.height = '24px';
        iconEl.style.color = 'var(--text-accent)';
        iconEl.style.flexShrink = '0';
        header.appendChild(iconEl);
        
        // Set Lucide icon based on type
        if (type === 'bridges') {
            setIcon(iconEl, 'route');
        } else if (type === 'foundations') {
            setIcon(iconEl, 'star');
        } else if (type === 'authorities') {
            setIcon(iconEl, 'orbit');
        }
        
        // Title container
        const titleContainer = document.createElement('div');
        titleContainer.className = 'network-card-title-container';
        titleContainer.style.flex = '1';
        header.appendChild(titleContainer);
        
        const titleEl = document.createElement('h4');
        titleEl.className = 'network-card-title';
        titleEl.textContent = title;
        titleEl.style.fontSize = '18px';
        titleEl.style.fontWeight = '600';
        titleEl.style.color = 'var(--text-normal)';
        titleEl.style.margin = '0';
        titleEl.style.lineHeight = '1.3';
        titleContainer.appendChild(titleEl);
        
        // Count and description in the header
        const metaContainer = document.createElement('div');
        metaContainer.style.display = 'flex';
        metaContainer.style.flexDirection = 'column';
        metaContainer.style.gap = '4px';
        titleContainer.appendChild(metaContainer);
        
        const countEl = document.createElement('span');
        countEl.className = 'network-card-count';
        countEl.textContent = `${nodes.length} domain${nodes.length !== 1 ? 's' : ''}`;
        countEl.style.fontSize = '14px';
        countEl.style.color = 'var(--text-muted)';
        countEl.style.fontWeight = '500';
        metaContainer.appendChild(countEl);
        
        // Description in header
        const descEl = document.createElement('span');
        descEl.className = 'network-card-description';
        descEl.textContent = description;
        descEl.style.fontSize = '13px';
        descEl.style.color = 'var(--text-muted)';
        descEl.style.fontStyle = 'italic';
        metaContainer.appendChild(descEl);

        // Content container
        const content = document.createElement('div');
        content.className = 'network-card-content';
        content.style.padding = '0';
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

            // Top notes
            if (node.topNotes && node.topNotes.length > 0) {
                const notesHeader = document.createElement('div');
                notesHeader.className = 'network-notes-header';
                notesHeader.style.fontSize = '14px';
                notesHeader.style.fontWeight = '600';
                notesHeader.style.color = 'var(--text-muted)';
                notesHeader.style.marginBottom = '10px';
                notesHeader.style.display = 'flex';
                notesHeader.style.alignItems = 'center';
                notesHeader.style.gap = '6px';
                domainItem.appendChild(notesHeader);
                
                // Add a small Lucide icon for the notes section
                const notesIcon = document.createElement('span');
                notesIcon.style.display = 'inline-flex';
                notesIcon.style.alignItems = 'center';
                notesHeader.appendChild(notesIcon);
                
                setIcon(notesIcon, 'file');
                
                const notesText = document.createElement('span');
                notesText.textContent = 'Top Notes';
                notesHeader.appendChild(notesText);
                
                const notesList = document.createElement('ul');
                notesList.className = 'network-notes-list';
                notesList.style.listStyle = 'none';
                notesList.style.padding = '12px 16px';
                notesList.style.margin = '0';
                notesList.style.background = 'var(--background-primary)';
                notesList.style.borderRadius = '8px';
                notesList.style.border = '1px solid var(--background-modifier-border)';
                domainItem.appendChild(notesList);
                
                node.topNotes.slice(0, 3).forEach((note, noteIndex) => {
                    const noteItem = document.createElement('li');
                    noteItem.className = 'network-note-item';
                    noteItem.style.fontSize = '13px';
                    noteItem.style.padding = '6px 0';
                    // Add subtle separators between notes
                    if (noteIndex > 0) {
                        noteItem.style.borderTop = '1px dashed var(--background-modifier-border)';
                    }
                    noteItem.style.color = 'var(--text-normal)';
                    noteItem.style.display = 'flex';
                    noteItem.style.alignItems = 'center';
                    noteItem.style.justifyContent = 'space-between';
                    notesList.appendChild(noteItem);
                    
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

                    const noteScore = document.createElement('span');
                    noteScore.className = 'network-note-score';
                    // Handle missing score property, use rank as fallback
                    const scoreText = note.score !== undefined ? note.score.toFixed(3) : 
                                     (note.rank !== undefined ? `#${note.rank}` : 'N/A');
                    noteScore.textContent = scoreText;
                    noteScore.style.color = 'var(--text-muted)';
                    noteScore.style.fontWeight = '500';
                    noteScore.style.marginLeft = '8px';
                    noteItem.appendChild(noteScore);

                    // Make note clickable
                    noteLink.addEventListener('click', async () => {
                        try {
                            // Try to get the file using getFileByPath which returns TFile or null
                            const tFile = this.app.vault.getFileByPath(note.path);
                            if (tFile) {
                                // Open the file in the active leaf
                                const leaf = this.app.workspace.getLeaf(false);
                                await leaf.openFile(tFile);
                            } else {
                                // Fallback: try to open by link text using title
                                await this.app.workspace.openLinkText(note.title, '');
                            }
                        } catch (error) {
                            console.error('Failed to open note:', error);
                            // Additional fallback: try to open by path directly
                            try {
                                await this.app.workspace.openLinkText(note.path, '');
                            } catch (fallbackError) {
                                console.error('Fallback also failed:', fallbackError);
                            }
                        }
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
            text: 'Knowledge Gap Analysis',
            cls: 'vault-analysis-section-title'
        });

        if (this.data?.gaps && this.data.gaps.length > 0) {
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

            this.data.gaps.slice(0, 8).forEach(gap => {
                gapsList.createEl('li', { text: gap });
            });
        } else {
            this.createEmptyStateFn(section, 'Generate AI analysis to identify potential knowledge gaps and areas for expansion in your vault.');
        }
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

        // Clear container and render network analysis
        container.empty();
        
        if (!this.data) {
            this.createEmptyStateFn(container, 'Generate AI analysis to identify knowledge bridges, foundations, and authorities in your vault\'s network structure.');
            return;
        }

        await this.createKnowledgeNetworkAnalysisSection(container);
    }
}