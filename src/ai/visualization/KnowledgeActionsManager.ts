import { App } from 'obsidian';
import { GraphAnalysisSettings } from '../../types/types';

// Interfaces for Knowledge Actions data
export interface MaintenanceAction {
    noteId: string;
    title: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    action: string;
}

export interface ConnectionSuggestion {
    sourceId: string;
    targetId: string;
    reason: string;
    confidence: number;
}

export interface LearningPath {
    title: string;
    description: string;
    noteIds: string[];
    rationale: string;
}

export interface OrganizationSuggestion {
    type: 'tag' | 'folder' | 'structure';
    suggestion: string;
    affectedNotes: string[];
}

export interface KnowledgeActionsData {
    maintenance: MaintenanceAction[];
    connections: ConnectionSuggestion[];
    learningPaths: LearningPath[];
    organization: OrganizationSuggestion[];
}

export class KnowledgeActionsManager {
    private app: App;
    private settings: GraphAnalysisSettings;
    private container: HTMLElement;
    private data: KnowledgeActionsData | null = null;

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.settings = settings;
    }

    public async loadCachedActionsData(): Promise<KnowledgeActionsData | null> {
        try {
            // Use the tab-specific analysis file instead of master-analysis.json
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/responses/actions-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const data = JSON.parse(content);
            
            if (data?.recommendedActions) {
                this.data = data.recommendedActions;
                return this.data;
            }
            return null;
        } catch (error) {
            console.warn('No cached knowledge actions data found:', error);
            return null;
        }
    }

    public async renderActionsAnalysis(container: HTMLElement): Promise<void> {
        this.container = container;
        this.container.empty();

        // Load data if not already loaded
        if (!this.data) {
            await this.loadCachedActionsData();
        }

        if (!this.data) {
            this.renderPlaceholder();
            return;
        }

        // Create main layout with action categories
        this.createActionsLayout();
    }

    private renderPlaceholder(): void {
        this.container.innerHTML = `
            <div class="actions-placeholder">
                <div class="placeholder-content">
                    <h3>🎯 Recommended Actions</h3>
                    <p>Generate vault analysis to see personalized action recommendations.</p>
                    <div class="placeholder-features">
                        <div class="feature-item">
                            <span class="feature-icon">🔧</span>
                            <span>Knowledge Maintenance</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">🔗</span>
                            <span>Connection Opportunities</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">🗺️</span>
                            <span>Learning Paths</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">📁</span>
                            <span>Organization Tips</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private createActionsLayout(): void {
        // Create summary dashboard
        this.createActionsSummary(this.container);

        // Create action grid
        const actionsGrid = this.container.createEl('div', { cls: 'actions-grid' });
        
        // Four quadrants for different action types
        this.createMaintenanceSection(actionsGrid);
        this.createConnectionsSection(actionsGrid);
        this.createLearningPathsSection(actionsGrid);
        this.createOrganizationSection(actionsGrid);
    }

    private createActionsSummary(container: HTMLElement): void {
        const summaryContainer = container.createEl('div', { cls: 'actions-summary' });
        
        const totalActions = this.getTotalActionCount();
        const priorityBreakdown = this.getPriorityBreakdown();
        
        summaryContainer.innerHTML = `
            <h3>📊 Action Summary</h3>
            <div class="summary-stats">
                <div class="summary-stat">
                    <span class="stat-number">${totalActions}</span>
                    <span class="stat-label">Total Actions</span>
                </div>
                <div class="summary-stat priority-high">
                    <span class="stat-number">${priorityBreakdown.high}</span>
                    <span class="stat-label">High Priority</span>
                </div>
                <div class="summary-stat priority-medium">
                    <span class="stat-number">${priorityBreakdown.medium}</span>
                    <span class="stat-label">Medium Priority</span>
                </div>
                <div class="summary-stat priority-low">
                    <span class="stat-number">${priorityBreakdown.low}</span>
                    <span class="stat-label">Low Priority</span>
                </div>
            </div>
        `;
    }

    private createMaintenanceSection(container: HTMLElement): void {
        const section = container.createEl('div', { cls: 'actions-section maintenance-section' });
        
        section.innerHTML = `
            <h4>🔧 Knowledge Maintenance</h4>
            <p class="section-description">Notes that need review, updates, or improvements</p>
            <div class="actions-list">
                ${this.data!.maintenance.slice(0, 10).map(action => `
                    <div class="action-item priority-${action.priority}" data-note-id="${action.noteId}">
                        <div class="action-header">
                            <span class="action-title">${action.title}</span>
                            <span class="action-priority priority-${action.priority}">${action.priority.toUpperCase()}</span>
                        </div>
                        <div class="action-reason">${action.reason}</div>
                        <div class="action-content">${action.action}</div>
                        <div class="action-buttons">
                            <button class="action-btn primary" onclick="this.closest('.action-item').openNote()">
                                📝 Open Note
                            </button>
                            <button class="action-btn secondary" onclick="this.closest('.action-item').dismissAction()">
                                ✓ Mark Done
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
            ${this.data!.maintenance.length > 10 ? `
                <div class="show-more">
                    <button class="show-more-btn">Show ${this.data!.maintenance.length - 10} More Actions</button>
                </div>
            ` : ''}
        `;

        this.attachMaintenanceHandlers(section);
    }

    private createConnectionsSection(container: HTMLElement): void {
        const section = container.createEl('div', { cls: 'actions-section connections-section' });
        
        section.innerHTML = `
            <h4>🔗 Connection Opportunities</h4>
            <p class="section-description">Suggested links between your notes</p>
            <div class="connections-list">
                ${this.data!.connections.slice(0, 8).map(connection => `
                    <div class="connection-item" data-source="${connection.sourceId}" data-target="${connection.targetId}">
                        <div class="connection-header">
                            <div class="connection-flow">
                                <span class="source-note">${this.getNoteTitleById(connection.sourceId)}</span>
                                <span class="connection-arrow">→</span>
                                <span class="target-note">${this.getNoteTitleById(connection.targetId)}</span>
                            </div>
                            <span class="confidence-score">
                                ${Math.round(connection.confidence * 100)}% confidence
                            </span>
                        </div>
                        <div class="connection-reason">${connection.reason}</div>
                        <div class="connection-buttons">
                            <button class="action-btn primary" onclick="this.closest('.connection-item').createLink()">
                                🔗 Create Link
                            </button>
                            <button class="action-btn secondary" onclick="this.closest('.connection-item').previewConnection()">
                                👁️ Preview
                            </button>
                            <button class="action-btn tertiary" onclick="this.closest('.connection-item').dismissConnection()">
                                ✗ Dismiss
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        this.attachConnectionHandlers(section);
    }

    private createLearningPathsSection(container: HTMLElement): void {
        const section = container.createEl('div', { cls: 'actions-section learning-paths-section' });
        
        section.innerHTML = `
            <h4>🗺️ Learning Paths</h4>
            <p class="section-description">Recommended sequences for learning and exploration</p>
            <div class="learning-paths-list">
                ${this.data!.learningPaths.map(path => `
                    <div class="learning-path-item">
                        <div class="path-header">
                            <h5 class="path-title">${path.title}</h5>
                            <span class="path-length">${path.noteIds.length} notes</span>
                        </div>
                        <div class="path-description">${path.description}</div>
                        <div class="path-rationale">${path.rationale}</div>
                        <div class="path-sequence">
                            ${path.noteIds.map((noteId, index) => `
                                <div class="path-step">
                                    <span class="step-number">${index + 1}</span>
                                    <span class="step-note">${this.getNoteTitleById(noteId)}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="path-buttons">
                            <button class="action-btn primary" onclick="this.closest('.learning-path-item').startLearningPath()">
                                🚀 Start Path
                            </button>
                            <button class="action-btn secondary" onclick="this.closest('.learning-path-item').bookmarkPath()">
                                📌 Bookmark
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        this.attachLearningPathHandlers(section);
    }

    private createOrganizationSection(container: HTMLElement): void {
        const section = container.createEl('div', { cls: 'actions-section organization-section' });
        
        // Group suggestions by type
        const groupedSuggestions = this.groupOrganizationSuggestions();
        
        section.innerHTML = `
            <h4>📁 Organization Suggestions</h4>
            <p class="section-description">Improvements for your knowledge structure</p>
            <div class="organization-tabs">
                <div class="tab-headers">
                    <button class="org-tab-header active" data-type="tag">🏷️ Tags</button>
                    <button class="org-tab-header" data-type="folder">📁 Folders</button>
                    <button class="org-tab-header" data-type="structure">🏗️ Structure</button>
                </div>
                <div class="tab-content">
                    ${this.renderOrganizationTab('tag', groupedSuggestions.tag)}
                </div>
            </div>
        `;

        this.attachOrganizationHandlers(section, groupedSuggestions);
    }

    private renderOrganizationTab(type: string, suggestions: OrganizationSuggestion[]): string {
        const icons = { tag: '🏷️', folder: '📁', structure: '🏗️' };
        
        return `
            <div class="organization-suggestions" data-type="${type}">
                ${suggestions.map(suggestion => `
                    <div class="organization-item">
                        <div class="suggestion-header">
                            <span class="suggestion-icon">${icons[type as keyof typeof icons]}</span>
                            <span class="suggestion-text">${suggestion.suggestion}</span>
                        </div>
                        <div class="affected-notes">
                            <span class="affected-count">${suggestion.affectedNotes.length} notes affected</span>
                            <div class="affected-list">
                                ${suggestion.affectedNotes.slice(0, 3).map(noteId => 
                                    `<span class="affected-note">${this.getNoteTitleById(noteId)}</span>`
                                ).join('')}
                                ${suggestion.affectedNotes.length > 3 ? `<span class="more-notes">+${suggestion.affectedNotes.length - 3} more</span>` : ''}
                            </div>
                        </div>
                        <div class="suggestion-buttons">
                            <button class="action-btn primary" onclick="this.closest('.organization-item').applySuggestion()">
                                ✓ Apply
                            </button>
                            <button class="action-btn secondary" onclick="this.closest('.organization-item').previewSuggestion()">
                                👁️ Preview
                            </button>
                            <button class="action-btn tertiary" onclick="this.closest('.organization-item').dismissSuggestion()">
                                ✗ Dismiss
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Helper methods
    private getTotalActionCount(): number {
        if (!this.data) return 0;
        return this.data.maintenance.length + 
               this.data.connections.length + 
               this.data.learningPaths.length + 
               this.data.organization.length;
    }

    private getPriorityBreakdown(): { high: number; medium: number; low: number } {
        if (!this.data) return { high: 0, medium: 0, low: 0 };
        
        const counts = { high: 0, medium: 0, low: 0 };
        this.data.maintenance.forEach(action => {
            counts[action.priority]++;
        });
        return counts;
    }

    private groupOrganizationSuggestions(): Record<string, OrganizationSuggestion[]> {
        const grouped: Record<string, OrganizationSuggestion[]> = {
            tag: [],
            folder: [],
            structure: []
        };

        this.data!.organization.forEach(suggestion => {
            grouped[suggestion.type].push(suggestion);
        });

        return grouped;
    }

    private getNoteTitleById(noteId: string): string {
        // Try to find the note by ID and return its title
        // For now, return the ID as placeholder
        const file = this.app.vault.getAbstractFileByPath(noteId);
        if (file && file.name) {
            return file.name.replace('.md', '');
        }
        return noteId.split('/').pop()?.replace('.md', '') || noteId;
    }

    // Event handlers
    private attachMaintenanceHandlers(section: HTMLElement): void {
        // Attach event listeners for maintenance actions
        section.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('action-btn')) {
                const actionItem = target.closest('.action-item') as HTMLElement;
                const noteId = actionItem.dataset.noteId;
                
                if (target.textContent?.includes('Open Note')) {
                    this.openNote(noteId || '');
                } else if (target.textContent?.includes('Mark Done')) {
                    this.dismissAction(actionItem);
                }
            }
        });
    }

    private attachConnectionHandlers(section: HTMLElement): void {
        // Attach event listeners for connection suggestions
        section.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('action-btn')) {
                const connectionItem = target.closest('.connection-item') as HTMLElement;
                
                if (target.textContent?.includes('Create Link')) {
                    this.createConnection(connectionItem);
                } else if (target.textContent?.includes('Preview')) {
                    this.previewConnection(connectionItem);
                } else if (target.textContent?.includes('Dismiss')) {
                    this.dismissConnection(connectionItem);
                }
            }
        });
    }

    private attachLearningPathHandlers(section: HTMLElement): void {
        // Attach event listeners for learning paths
        section.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('action-btn')) {
                const pathItem = target.closest('.learning-path-item') as HTMLElement;
                
                if (target.textContent?.includes('Start Path')) {
                    this.startLearningPath(pathItem);
                } else if (target.textContent?.includes('Bookmark')) {
                    this.bookmarkPath(pathItem);
                }
            }
        });
    }

    private attachOrganizationHandlers(section: HTMLElement, groupedSuggestions: Record<string, OrganizationSuggestion[]>): void {
        // Tab switching
        section.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('org-tab-header')) {
                const type = target.dataset.type;
                if (type) {
                    // Update active tab
                    section.querySelectorAll('.org-tab-header').forEach(tab => tab.removeClass('active'));
                    target.addClass('active');
                    
                    // Update content
                    const tabContent = section.querySelector('.tab-content');
                    if (tabContent) {
                        tabContent.innerHTML = this.renderOrganizationTab(type, groupedSuggestions[type]);
                    }
                }
            }
        });
    }

    // Action implementations
    private async openNote(noteId: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(noteId);
        if (file) {
            await this.app.workspace.openLinkText(file.path, '', false);
        }
    }

    private dismissAction(actionItem: HTMLElement): void {
        actionItem.style.opacity = '0.5';
        actionItem.style.pointerEvents = 'none';
        // Could save dismissed actions to prevent them from reappearing
    }

    private createConnection(connectionItem: HTMLElement): void {
        // Implementation for creating links between notes
        console.log('Creating connection:', connectionItem.dataset);
    }

    private previewConnection(connectionItem: HTMLElement): void {
        // Implementation for previewing the connection
        console.log('Previewing connection:', connectionItem.dataset);
    }

    private dismissConnection(connectionItem: HTMLElement): void {
        connectionItem.style.opacity = '0.5';
        connectionItem.style.pointerEvents = 'none';
    }

    private startLearningPath(pathItem: HTMLElement): void {
        // Implementation for starting a learning path
        console.log('Starting learning path:', pathItem);
    }

    private bookmarkPath(pathItem: HTMLElement): void {
        // Implementation for bookmarking a path
        console.log('Bookmarking path:', pathItem);
    }

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
    }
}