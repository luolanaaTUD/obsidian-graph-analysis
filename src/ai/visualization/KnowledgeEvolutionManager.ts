import { App, setIcon, MarkdownRenderer, Component } from 'obsidian';
import { GraphAnalysisSettings } from '../../types/types';
import { KnowledgeCalendarChart } from '../../components/calendar-chart/KnowledgeCalendarChart';

// Interfaces for Knowledge Evolution data (imported from existing manager for compatibility)
export interface EvolutionInsight {
    title: string;
    content: string;
    keyPoints: string[];
    recommendations?: string[];
}

export interface TimelineAnalysis {
    narrative: EvolutionInsight;
    phases: Array<{
        period: string;
        description: string;
        keyDomains: string[];
        metrics: {
            noteCount: number;
            wordCount: number;
            avgWordsPerNote: number;
        };
    }>;
    trends: {
        productivity: 'increasing' | 'decreasing' | 'stable';
        diversity: 'expanding' | 'narrowing' | 'stable';
        depth: 'increasing' | 'decreasing' | 'stable';
    };
}

export interface TopicPatternsAnalysis {
    exploration: EvolutionInsight;
    introductionTimeline: Array<{
        period: string;
        newDomains: string[];
        acquisitionPattern: 'burst' | 'gradual' | 'project-based';
    }>;
    strategy: {
        style: 'depth-first' | 'breadth-first' | 'balanced';
        consistency: 'focused' | 'exploratory' | 'mixed';
    };
}

export interface FocusShiftAnalysis {
    narrative: EvolutionInsight;
    shifts: Array<{
        period: string;
        type: 'major' | 'minor' | 'gradual';
        newAreas: string[];
        increasedFocus: string[];
        decreasedFocus: string[];
        consistentAreas: string[];
        trigger?: string;
    }>;
    patterns: {
        frequency: 'frequent' | 'occasional' | 'rare';
        direction: 'expanding' | 'pivoting' | 'deepening';
    };
}

export interface KnowledgeEvolutionData {
    timeline: TimelineAnalysis;
    topicPatterns: TopicPatternsAnalysis;
    focusShift: FocusShiftAnalysis;
    insights: EvolutionInsight[];
}

export class KnowledgeEvolutionManager {
    private app: App;
    private container!: HTMLElement;
    private settings: GraphAnalysisSettings;
    private data: KnowledgeEvolutionData | null = null;
    private calendarChart: KnowledgeCalendarChart | null = null;
    private createEmptyStateFn: (container: HTMLElement, message: string) => void;

    private get markdownComponent(): Component {
        const plugins = (this.app as { plugins?: { plugins?: Record<string, Component> } }).plugins?.plugins;
        const plugin = plugins?.['knowledge-graph-analysis'];
        if (!plugin || !(plugin instanceof Component)) {
            throw new Error('Plugin not found - cannot render markdown safely');
        }
        return plugin;
    }

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

    public async loadCachedEvolutionData(): Promise<KnowledgeEvolutionData | null> {
        try {
            // Use the tab-specific analysis file (evolution-analysis.json)
            // The file structure is: { knowledgeEvolution: KnowledgeEvolutionData, ... }
            const filePath = `${this.app.vault.configDir}/plugins/knowledge-graph-analysis/responses/evolution-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const data = JSON.parse(content) as unknown;
            
            if (data && typeof data === 'object' && 'knowledgeEvolution' in data) {
                const evo = (data as { knowledgeEvolution: KnowledgeEvolutionData }).knowledgeEvolution;
                if (evo && typeof evo === 'object') {
                    this.data = evo;
                    return this.data;
                }
            }
            // Fallback: if the file structure is different, try direct access
            if (data && typeof data === 'object' && 'timeline' in data && 'topicPatterns' in data && 'focusShift' in data) {
                this.data = data as KnowledgeEvolutionData;
                return this.data;
            }
            return null;
        } catch {
            // console.warn('No cached knowledge evolution data found:', error);
            return null;
        }
    }

    public async renderEvolutionAnalysis(container: HTMLElement): Promise<void> {
        this.container = container;
        this.container.empty();

        // Load data if not already loaded
        if (!this.data) {
            await this.loadCachedEvolutionData();
        }

        if (!this.data) {
            this.createEmptyStateFn(this.container, 'Generate AI analysis to see your knowledge evolution insights and patterns over time.');
            return;
        }

        // Create main layout with calendar and AI insights
        await this.createEvolutionLayout();
    }

    private renderPlaceholder(): void {
        const placeholder = this.container.createEl('div', { cls: 'evolution-placeholder' });
        const content = placeholder.createEl('div', { cls: 'placeholder-content' });
        content.createEl('h3', { text: '📈 knowledge evolution analysis' });
        content.createEl('p', { text: 'Generate vault analysis to see your knowledge evolution insights.' });
        const features = content.createEl('div', { cls: 'placeholder-features' });
        const items = [
            { icon: '📅', text: 'Activity Calendar' },
            { icon: '🌊', text: 'Learning Trends' },
            { icon: '🎯', text: 'Focus Evolution' }
        ];
        items.forEach(({ icon, text }) => {
            const item = features.createEl('div', { cls: 'feature-item' });
            item.createEl('span', { cls: 'feature-icon', text: icon });
            item.createEl('span', { text });
        });

        // Still show the calendar even without AI insights
        void this.renderBasicCalendar();
    }

    private async renderBasicCalendar(): Promise<void> {
        const calendarSection = this.container.createEl('div', { cls: 'evolution-calendar-section' });
        calendarSection.createEl('h3', { text: '📅 knowledge activity calendar' });
        
        const calendarContainer = calendarSection.createEl('div', { cls: 'calendar-container' });
        
        // Create calendar chart
        this.calendarChart = new KnowledgeCalendarChart(
            this.app,
            calendarContainer,
            { cellSize: 11, yearRange: 1 },
            this.settings.excludeFolders || [],
            this.settings.excludeTags || []
        );

        await this.calendarChart.render();
    }

    private async createEvolutionLayout(): Promise<void> {
        // AI Insights Section (Top)
        const insightsSection = this.container.createEl('div', { cls: 'evolution-insights-section' });
        this.createInsightsOverview(insightsSection);

        // Calendar Section (Middle)
        const calendarSection = this.container.createEl('div', { cls: 'evolution-calendar-section' });
        await this.createEnhancedCalendar(calendarSection);

        // Detailed Analysis Sections (Bottom)
        const analysisSection = this.container.createEl('div', { cls: 'evolution-analysis-section' });
        this.createDetailedAnalysis(analysisSection);
    }

    private createInsightsOverview(container: HTMLElement): void {
        container.createEl('h3', { text: '🧠 knowledge evolution insights' });
        const grid = container.createEl('div', { cls: 'evolution-insights-grid' });
        this.data!.insights.forEach(insight => {
            const card = grid.createEl('div', { cls: 'evolution-insight-card' });
            card.createEl('h4', { text: insight.title });
            const contentEl = card.createEl('p');
            void MarkdownRenderer.render(this.app, insight.content, contentEl, '', this.markdownComponent);
            if (insight.keyPoints.length > 0) {
                const ul = card.createEl('ul', { cls: 'insight-points' });
                insight.keyPoints.forEach(point => {
                    const li = ul.createEl('li');
                    void MarkdownRenderer.render(this.app, point, li, '', this.markdownComponent);
                });
            }
        });
    }

    private async createEnhancedCalendar(container: HTMLElement): Promise<void> {
        container.createEl('h3', { text: '📅 knowledge activity timeline' });
        
        // Add timeline phases overview above calendar
        this.createTimelinePhases(container);
        
        // Create calendar container
        const calendarContainer = container.createEl('div', { cls: 'calendar-container-enhanced' });
        
        // Create calendar chart with enhanced tooltips
        this.calendarChart = new KnowledgeCalendarChart(
            this.app,
            calendarContainer,
            { cellSize: 11, yearRange: 1 },
            this.settings.excludeFolders || [],
            this.settings.excludeTags || []
        );

        await this.calendarChart.render();
        
        // Add learning velocity overlay
        this.addVelocityOverlay(container);
    }

    private createTimelinePhases(container: HTMLElement): void {
        const phasesContainer = container.createEl('div', { cls: 'timeline-phases' });
        phasesContainer.createEl('h4', { text: '📊 knowledge development phases' });
        const timeline = phasesContainer.createEl('div', { cls: 'phases-timeline' });
        this.data!.timeline.phases.forEach(phase => {
            const item = timeline.createEl('div', { cls: 'phase-item' });
            item.createEl('div', { cls: 'phase-period', text: phase.period });
            item.createEl('div', { cls: 'phase-description', text: phase.description });
            const domainsEl = item.createEl('div', { cls: 'phase-domains' });
            phase.keyDomains.slice(0, 3).forEach(domain => {
                const domainParts = domain.match(/^(.+?)\s*\((.+)\)$/) || [null, domain, ''];
                const userDomain = domainParts[1] || domain;
                const hierarchy = domainParts[2] || '';
                const tag = domainsEl.createEl('span', { cls: 'domain-tag' });
                tag.setAttribute('title', hierarchy ? `${userDomain} (${hierarchy})` : userDomain);
                tag.setText(userDomain);
            });
            const metrics = item.createEl('div', { cls: 'phase-metrics' });
            metrics.setText(`${phase.metrics.noteCount} notes • ${phase.metrics.wordCount.toLocaleString()} words`);
        });
    }

    private addVelocityOverlay(container: HTMLElement): void {
        const velocityContainer = container.createEl('div', { cls: 'velocity-overlay' });
        velocityContainer.createEl('h4', { text: '⚡ learning velocity trends' });
        const trends = velocityContainer.createEl('div', { cls: 'velocity-trends' });
        const trendData = [
            { label: 'Productivity', value: this.data!.timeline.trends.productivity },
            { label: 'Diversity', value: this.data!.timeline.trends.diversity },
            { label: 'Depth', value: this.data!.timeline.trends.depth }
        ] as const;
        trendData.forEach(({ label, value }) => {
            const item = trends.createEl('div', { cls: 'trend-item' });
            item.createEl('span', { cls: 'trend-label', text: `${label}:` });
            const valueEl = item.createEl('span', { cls: `trend-value ${value}` });
            valueEl.setText(`${this.getTrendIcon(value)} ${value}`);
        });
    }

    private createDetailedAnalysis(container: HTMLElement): void {
        // Create tabbed interface for detailed analysis
        const tabsContainer = container.createEl('div', { cls: 'evolution-tabs' });
        
        // Tab headers
        const tabHeaders = tabsContainer.createEl('div', { cls: 'tab-headers' });
        const tabs = [
            { id: 'focus-shifts', label: '🎯 Focus Shifts', data: this.data!.focusShift },
            { id: 'topic-patterns', label: '🌱 Topic Patterns', data: this.data!.topicPatterns }
        ];

        tabs.forEach((tab, index) => {
            const header = tabHeaders.createEl('button', { 
                cls: `tab-header ${index === 0 ? 'active' : ''}`,
                text: tab.label
            });
            header.addEventListener('click', () => this.switchTab(tab.id, tabsContainer));
        });

        // Tab content
        const tabContent = tabsContainer.createEl('div', { cls: 'tab-content' });
        
        // Default to first tab
        this.renderFocusShiftsTab(tabContent);
    }

    private switchTab(tabId: string, container: HTMLElement): void {
        // Update active header
        container.querySelectorAll('.tab-header').forEach(header => {
            header.removeClass('active');
        });
        container.querySelector(`[data-tab="${tabId}"]`)?.addClass('active');

        // Update content
        const contentArea = container.querySelector('.tab-content') as HTMLElement;
        if (contentArea) {
            switch (tabId) {
                case 'focus-shifts':
                    this.renderFocusShiftsTab(contentArea);
                    break;
                case 'topic-patterns':
                    this.renderTopicPatternsTab(contentArea);
                    break;
            }
        }
    }

    private renderFocusShiftsTab(container: HTMLElement): void {
        container.empty();
        const content = container.createEl('div', { cls: 'focus-shifts-content' });
        content.createEl('h4', { text: this.data!.focusShift.narrative.title });
        const narrativeEl = content.createEl('p');
                void MarkdownRenderer.render(this.app, this.data!.focusShift.narrative.content, narrativeEl, '', this.markdownComponent);
        const timeline = content.createEl('div', { cls: 'shifts-timeline' });
        this.data!.focusShift.shifts.forEach(shift => {
            const item = timeline.createEl('div', { cls: `shift-item ${shift.type}` });
            item.createEl('div', { cls: 'shift-period', text: shift.period });
            item.createEl('div', { cls: 'shift-type', text: `${shift.type.toUpperCase()} SHIFT` });
            const areas = item.createEl('div', { cls: 'shift-areas' });
            if (shift.newAreas.length > 0) {
                areas.createEl('div', { cls: 'new-areas', text: `🆕 ${shift.newAreas.join(', ')}` });
            }
            if (shift.increasedFocus.length > 0) {
                areas.createEl('div', { cls: 'increased-focus', text: `📈 ${shift.increasedFocus.join(', ')}` });
            }
            if (shift.decreasedFocus.length > 0) {
                areas.createEl('div', { cls: 'decreased-focus', text: `📉 ${shift.decreasedFocus.join(', ')}` });
            }
        });
    }

    private renderTopicPatternsTab(container: HTMLElement): void {
        container.empty();
        const content = container.createEl('div', { cls: 'topic-patterns-content' });
        content.createEl('h4', { text: this.data!.topicPatterns.exploration.title });
        const explorationEl = content.createEl('p');
        void MarkdownRenderer.render(this.app, this.data!.topicPatterns.exploration.content, explorationEl, '', this.markdownComponent);
        const patterns = content.createEl('div', { cls: 'patterns-analysis' });
        const strategyInfo = patterns.createEl('div', { cls: 'strategy-info' });
        strategyInfo.createEl('h5', { text: 'Learning strategy' });
        const details = strategyInfo.createEl('div', { cls: 'strategy-details' });
        details.createEl('span', { cls: 'strategy-style', text: `Style: ${this.data!.topicPatterns.strategy.style}` });
        details.createEl('span', { cls: 'strategy-consistency', text: `Consistency: ${this.data!.topicPatterns.strategy.consistency}` });
        const introTimeline = patterns.createEl('div', { cls: 'introduction-timeline' });
        introTimeline.createEl('h5', { text: 'Topic introduction timeline' });
        const timelineContainer = introTimeline.createEl('div', { cls: 'introduction-timeline-items' });
        this.data!.topicPatterns.introductionTimeline.forEach(period => {
            const periodEl = timelineContainer.createEl('div', { cls: 'introduction-period' });
            const header = periodEl.createEl('div', { cls: 'period-header' });
            header.createEl('span', { cls: 'period-name', text: period.period });
            header.createEl('span', { cls: `acquisition-pattern ${period.acquisitionPattern}`, text: period.acquisitionPattern });
            if (period.newDomains.length > 0) {
                const domainsEl = periodEl.createEl('div', { cls: 'new-domains' });
                period.newDomains.forEach(domain => {
                    const domainParts = domain.match(/^(.+?)\s*\((.+)\)$/) || [null, domain, ''];
                    const userDomain = domainParts[1] || domain;
                    const hierarchy = domainParts[2] || '';
                    const tag = domainsEl.createEl('span', { cls: 'domain-tag' });
                    tag.setAttribute('title', hierarchy ? `${userDomain} (${hierarchy})` : userDomain);
                    tag.setText(userDomain);
                });
            }
        });
    }


    private getTrendIcon(trend: string): string {
        switch (trend) {
            case 'increasing':
            case 'up':
            case 'expanding':
                return '📈';
            case 'decreasing':
            case 'down':
            case 'narrowing':
                return '📉';
            default:
                return '➡️';
        }
    }

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
        // Update calendar if it exists
        if (this.calendarChart) {
            // Recreate calendar with new settings if needed
        }
    }

    public async refresh(): Promise<void> {
        if (this.calendarChart) {
            await this.calendarChart.refresh();
        }
    }
}