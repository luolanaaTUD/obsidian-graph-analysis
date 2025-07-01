import { App } from 'obsidian';
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

export interface LearningVelocityAnalysis {
    trends: EvolutionInsight;
    metrics: Array<{
        period: string;
        notesCreated: number;
        wordsWritten: number;
        domainsExplored: number;
        avgComplexity: number;
        trendIndicator: 'up' | 'down' | 'stable';
    }>;
    optimization: {
        peakPeriods: string[];
        recommendations: string[];
        productivityScore: number;
    };
}

export interface KnowledgeEvolutionData {
    timeline: TimelineAnalysis;
    topicPatterns: TopicPatternsAnalysis;
    focusShift: FocusShiftAnalysis;
    learningVelocity: LearningVelocityAnalysis;
    insights: EvolutionInsight[];
}

export class KnowledgeEvolutionManager {
    private app: App;
    private settings: GraphAnalysisSettings;
    private container: HTMLElement;
    private data: KnowledgeEvolutionData | null = null;
    private calendarChart: KnowledgeCalendarChart | null = null;

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.settings = settings;
    }

    public async loadCachedEvolutionData(): Promise<KnowledgeEvolutionData | null> {
        try {
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/master-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const masterData = JSON.parse(content);
            
            if (masterData?.knowledgeEvolution) {
                this.data = masterData.knowledgeEvolution;
                return this.data;
            }
            return null;
        } catch (error) {
            console.warn('No cached knowledge evolution data found:', error);
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
            this.renderPlaceholder();
            return;
        }

        // Create main layout with calendar and AI insights
        this.createEvolutionLayout();
    }

    private renderPlaceholder(): void {
        this.container.innerHTML = `
            <div class="evolution-placeholder">
                <div class="placeholder-content">
                    <h3>📈 Knowledge Evolution Analysis</h3>
                    <p>Generate vault analysis to see your knowledge evolution insights.</p>
                    <div class="placeholder-features">
                        <div class="feature-item">
                            <span class="feature-icon">📅</span>
                            <span>Activity Calendar</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">🌊</span>
                            <span>Learning Trends</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">🎯</span>
                            <span>Focus Evolution</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Still show the calendar even without AI insights
        this.renderBasicCalendar();
    }

    private async renderBasicCalendar(): Promise<void> {
        const calendarSection = this.container.createEl('div', { cls: 'evolution-calendar-section' });
        calendarSection.innerHTML = '<h3>📅 Knowledge Activity Calendar</h3>';
        
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
        container.innerHTML = `
            <h3>🧠 Knowledge Evolution Insights</h3>
            <div class="evolution-insights-grid">
                ${this.data!.insights.map(insight => `
                    <div class="evolution-insight-card">
                        <h4>${insight.title}</h4>
                        <p>${insight.content}</p>
                        ${insight.keyPoints.length > 0 ? `
                            <ul class="insight-points">
                                ${insight.keyPoints.map(point => `<li>${point}</li>`).join('')}
                            </ul>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    private async createEnhancedCalendar(container: HTMLElement): Promise<void> {
        container.innerHTML = '<h3>📅 Knowledge Activity Timeline</h3>';
        
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
        
        phasesContainer.innerHTML = `
            <h4>📊 Knowledge Development Phases</h4>
            <div class="phases-timeline">
                ${this.data!.timeline.phases.map(phase => `
                    <div class="phase-item">
                        <div class="phase-period">${phase.period}</div>
                        <div class="phase-description">${phase.description}</div>
                        <div class="phase-domains">
                            ${phase.keyDomains.slice(0, 3).map(domain => 
                                `<span class="domain-tag">${domain}</span>`
                            ).join('')}
                        </div>
                        <div class="phase-metrics">
                            ${phase.metrics.noteCount} notes • ${phase.metrics.wordCount.toLocaleString()} words
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    private addVelocityOverlay(container: HTMLElement): void {
        const velocityContainer = container.createEl('div', { cls: 'velocity-overlay' });
        
        velocityContainer.innerHTML = `
            <h4>⚡ Learning Velocity Trends</h4>
            <div class="velocity-trends">
                <div class="trend-item">
                    <span class="trend-label">Productivity:</span>
                    <span class="trend-value ${this.data!.timeline.trends.productivity}">
                        ${this.getTrendIcon(this.data!.timeline.trends.productivity)} ${this.data!.timeline.trends.productivity}
                    </span>
                </div>
                <div class="trend-item">
                    <span class="trend-label">Diversity:</span>
                    <span class="trend-value ${this.data!.timeline.trends.diversity}">
                        ${this.getTrendIcon(this.data!.timeline.trends.diversity)} ${this.data!.timeline.trends.diversity}
                    </span>
                </div>
                <div class="trend-item">
                    <span class="trend-label">Depth:</span>
                    <span class="trend-value ${this.data!.timeline.trends.depth}">
                        ${this.getTrendIcon(this.data!.timeline.trends.depth)} ${this.data!.timeline.trends.depth}
                    </span>
                </div>
            </div>
        `;
    }

    private createDetailedAnalysis(container: HTMLElement): void {
        // Create tabbed interface for detailed analysis
        const tabsContainer = container.createEl('div', { cls: 'evolution-tabs' });
        
        // Tab headers
        const tabHeaders = tabsContainer.createEl('div', { cls: 'tab-headers' });
        const tabs = [
            { id: 'focus-shifts', label: '🎯 Focus Shifts', data: this.data!.focusShift },
            { id: 'topic-patterns', label: '🌱 Topic Patterns', data: this.data!.topicPatterns },
            { id: 'learning-velocity', label: '⚡ Learning Velocity', data: this.data!.learningVelocity }
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
                case 'learning-velocity':
                    this.renderLearningVelocityTab(contentArea);
                    break;
            }
        }
    }

    private renderFocusShiftsTab(container: HTMLElement): void {
        container.empty();
        container.innerHTML = `
            <div class="focus-shifts-content">
                <h4>${this.data!.focusShift.narrative.title}</h4>
                <p>${this.data!.focusShift.narrative.content}</p>
                
                <div class="shifts-timeline">
                    ${this.data!.focusShift.shifts.map(shift => `
                        <div class="shift-item ${shift.type}">
                            <div class="shift-period">${shift.period}</div>
                            <div class="shift-type">${shift.type.toUpperCase()} SHIFT</div>
                            <div class="shift-areas">
                                ${shift.newAreas.length > 0 ? `<div class="new-areas">🆕 ${shift.newAreas.join(', ')}</div>` : ''}
                                ${shift.increasedFocus.length > 0 ? `<div class="increased-focus">📈 ${shift.increasedFocus.join(', ')}</div>` : ''}
                                ${shift.decreasedFocus.length > 0 ? `<div class="decreased-focus">📉 ${shift.decreasedFocus.join(', ')}</div>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    private renderTopicPatternsTab(container: HTMLElement): void {
        container.empty();
        container.innerHTML = `
            <div class="topic-patterns-content">
                <h4>${this.data!.topicPatterns.exploration.title}</h4>
                <p>${this.data!.topicPatterns.exploration.content}</p>
                
                <div class="patterns-analysis">
                    <div class="strategy-info">
                        <h5>Learning Strategy</h5>
                        <div class="strategy-details">
                            <span class="strategy-style">Style: ${this.data!.topicPatterns.strategy.style}</span>
                            <span class="strategy-consistency">Consistency: ${this.data!.topicPatterns.strategy.consistency}</span>
                        </div>
                    </div>
                    
                    <div class="introduction-timeline">
                        <h5>Topic Introduction Timeline</h5>
                        ${this.data!.topicPatterns.introductionTimeline.map(period => `
                            <div class="introduction-period">
                                <div class="period-header">
                                    <span class="period-name">${period.period}</span>
                                    <span class="acquisition-pattern ${period.acquisitionPattern}">${period.acquisitionPattern}</span>
                                </div>
                                ${period.newDomains.length > 0 ? `
                                    <div class="new-domains">
                                        ${period.newDomains.map(domain => `<span class="domain-tag">${domain}</span>`).join('')}
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    private renderLearningVelocityTab(container: HTMLElement): void {
        container.empty();
        container.innerHTML = `
            <div class="learning-velocity-content">
                <h4>${this.data!.learningVelocity.trends.title}</h4>
                <p>${this.data!.learningVelocity.trends.content}</p>
                
                <div class="velocity-metrics">
                    <div class="optimization-panel">
                        <h5>🎯 Productivity Optimization</h5>
                        <div class="productivity-score">
                            Score: ${this.data!.learningVelocity.optimization.productivityScore}/10
                        </div>
                        <div class="peak-periods">
                            <strong>Peak Periods:</strong> ${this.data!.learningVelocity.optimization.peakPeriods.join(', ')}
                        </div>
                        <div class="recommendations">
                            ${this.data!.learningVelocity.optimization.recommendations.map(rec => 
                                `<div class="recommendation">💡 ${rec}</div>`
                            ).join('')}
                        </div>
                    </div>
                    
                    <div class="metrics-table">
                        <h5>📊 Period Metrics</h5>
                        <table class="velocity-table">
                            <thead>
                                <tr>
                                    <th>Period</th>
                                    <th>Notes</th>
                                    <th>Words</th>
                                    <th>Domains</th>
                                    <th>Trend</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.data!.learningVelocity.metrics.map(metric => `
                                    <tr>
                                        <td>${metric.period}</td>
                                        <td>${metric.notesCreated}</td>
                                        <td>${metric.wordsWritten.toLocaleString()}</td>
                                        <td>${metric.domainsExplored}</td>
                                        <td class="trend-${metric.trendIndicator}">
                                            ${this.getTrendIcon(metric.trendIndicator)}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
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