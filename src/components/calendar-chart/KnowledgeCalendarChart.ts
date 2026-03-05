import { App, TFile } from 'obsidian';
import * as d3 from 'd3';

export interface CalendarData {
    date: Date;
    value: number; // Activity score (0-1)
    wordCount: number;
    fileCount: number;
}

export interface CalendarChartOptions {
    width?: number;
    height?: number;
    cellSize?: number;
    yearRange?: number;
    colorScheme?: string[];
}

export class KnowledgeCalendarChart {
    private static cachedCalendarData: CalendarData[] | null = null;

    private app: App;
    private container: HTMLElement;
    private options: CalendarChartOptions;
    private data: CalendarData[] = [];
    private excludedFolders: string[];
    private excludedTags: string[];

    constructor(
        app: App, 
        container: HTMLElement, 
        options: Partial<CalendarChartOptions> = {},
        excludedFolders: string[] = [],
        excludedTags: string[] = []
    ) {
        this.app = app;
        this.container = container;
        this.excludedFolders = excludedFolders;
        this.excludedTags = excludedTags;
        
        this.options = {
            cellSize: 11,
            yearRange: 1,
            ...options
        };
    }

    async generateCalendarData(): Promise<CalendarData[]> {
        if (KnowledgeCalendarChart.cachedCalendarData) {
            this.data = KnowledgeCalendarChart.cachedCalendarData;
            return this.data;
        }

        const allFiles = this.app.vault.getMarkdownFiles();
        const dailyActivity = new Map<string, CalendarData>();
        
        // console.log(`Processing ${allFiles.length} files for calendar chart...`);
        
        // Filter excluded files first to reduce processing
        const files = allFiles.filter(file => !this.isFileExcluded(file));
        
        // Process files in parallel batches to improve performance
        const BATCH_SIZE = 10;
        const batches: TFile[][] = [];
        for (let i = 0; i < files.length; i += BATCH_SIZE) {
            batches.push(files.slice(i, i + BATCH_SIZE));
        }
        
        // Process batches in parallel
        await Promise.all(batches.map(async (batch) => {
            await Promise.all(batch.map(async (file) => {
                try {
                    const content = await this.app.vault.read(file);
                    const wordCount = this.calculateWordCount(content);
                    
                    const modifiedDate = new Date(file.stat.mtime);
                    const dateKey = modifiedDate.toISOString().split('T')[0];
                    
                    // Use Map's get-or-create pattern more efficiently
                    let dayData = dailyActivity.get(dateKey);
                    if (!dayData) {
                        dayData = {
                            date: new Date(dateKey),
                            value: 0,
                            wordCount: 0,
                            fileCount: 0
                        };
                        dailyActivity.set(dateKey, dayData);
                    }
                    
                    dayData.wordCount += wordCount;
                    dayData.fileCount++;
                    // Set value directly during processing to avoid extra iteration
                    dayData.value = dayData.wordCount;
                    
                } catch {
                    // Could not read file - skip
                }
            }));
        }));
        
        // Convert to sorted array - single pass with value already set
        const dailyActivities = Array.from(dailyActivity.values());
        dailyActivities.sort((a, b) => a.date.getTime() - b.date.getTime());
        
        this.data = dailyActivities;
        KnowledgeCalendarChart.cachedCalendarData = this.data;
        // console.log(`Generated calendar data for ${dailyActivities.length} active days`);

        return this.data;
    }

    private calculateWordCount(content: string): number {
        const contentWithoutFrontmatter = content.replace(/^---[\s\S]*?---\n/m, '');
        
        const cleanContent = contentWithoutFrontmatter
            .replace(/!\[\[.*?\]\]/g, '')
            .replace(/\[\[.*?\]\]/g, '')
            .replace(/\[.*?\]\(.*?\)/g, '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`.*?`/g, '')
            .replace(/#{1,6}\s/g, '')
            .replace(/[*_~`]/g, '')
            .replace(/\n+/g, ' ')
            .trim();
        
        const words = cleanContent.split(/\s+/).filter(word => word.length > 0);
        return words.length;
    }

    private isFileExcluded(file: TFile): boolean {
        if (this.excludedFolders && this.excludedFolders.length > 0) {
            for (const excludeFolder of this.excludedFolders) {
                if (excludeFolder && file.path.toLowerCase().includes(excludeFolder.toLowerCase())) {
                    return true;
                }
            }
        }

        if (this.excludedTags && this.excludedTags.length > 0) {
            const fileCache = this.app.metadataCache.getFileCache(file);
            if (fileCache) {
                const rawTags = fileCache.frontmatter?.tags as string | string[] | undefined;
                const frontmatterTags: string[] = Array.isArray(rawTags) ? rawTags : (rawTags != null ? [String(rawTags)] : []);
                const inlineTags: string[] = fileCache.tags?.map((tag: { tag: string }) => tag.tag.replace('#', '')) ?? [];
                
                const allTags = [...frontmatterTags, ...inlineTags];
                
                for (const excludeTag of this.excludedTags) {
                    if (excludeTag && allTags.some(tag => 
                        tag.toLowerCase().includes(excludeTag.toLowerCase())
                    )) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    async render(): Promise<void> {
        this.container.empty();
        
        if (this.data.length === 0) {
            await this.generateCalendarData();
        }
        
        // Add summary indicators at the top
        this.createSummarySection();
        
        const chartContainer = this.container.createEl('div', { cls: 'calendar-chart-container' });
        
        this.createCalendarChart(chartContainer);
    }

    private createSummarySection(): void {
        const summaryContainer = this.container.createEl('div', { cls: 'calendar-summary' });
        
        // Calculate summary statistics
        const allFiles = this.app.vault.getMarkdownFiles().filter(file => !this.isFileExcluded(file));
        const totalNotes = allFiles.length;
        
        // Calculate total words from the data
        const totalWords = this.data.reduce((sum, day) => sum + day.wordCount, 0);
        
        // Calculate vault duration (from first note creation to today)
        let vaultDuration = 'Unknown';
        if (allFiles.length > 0) {
            const creationDates = allFiles.map(file => file.stat.ctime);
            const firstNoteDate = new Date(Math.min(...creationDates));
            const today = new Date();
            const timeDiff = today.getTime() - firstNoteDate.getTime();
            const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
            
            // Always display in days
            vaultDuration = `${daysDiff.toLocaleString()} days`;
        }
        
        const stats = summaryContainer.createEl('div', { cls: 'calendar-summary-stats' });
        [
            { label: 'Vault Duration', value: vaultDuration },
            { label: 'Total Notes', value: totalNotes.toLocaleString() },
            { label: 'Total Words', value: totalWords.toLocaleString() }
        ].forEach(({ label, value }) => {
            const stat = stats.createEl('div', { cls: 'summary-stat' });
            stat.createEl('span', { cls: 'stat-label', text: label });
            stat.createEl('span', { cls: 'stat-value', text: value });
        });
    }

    private createCalendarChart(container: HTMLElement): void {
        const cellSize = this.options.cellSize!;
        const containerWidth = container.clientWidth || 800;
        
        // Use margins with enough left space for full year labels
        const margin = { 
            top: 30, 
            right: 20, 
            bottom: 0, 
            left: 50 
        };
        const contentWidth = containerWidth - margin.left - margin.right;
        
        // Get the actual min and max values from the data
        const nonZeroValues = this.data.filter(d => d.value > 0).map(d => d.value);
        const minValue = nonZeroValues.length > 0 ? Math.min(...nonZeroValues) : 0;
        const maxValue = nonZeroValues.length > 0 ? Math.max(...nonZeroValues) : 1;
        
        
        // Auto-detect date range from actual data
        const dataWithDates = this.data.filter(d => d.value > 0);
        let startDate: Date;
        let endDate: Date;
        
        if (dataWithDates.length === 0) {
            // No data, show current year
            const now = new Date();
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31);
        } else {
            // Use actual data range
            const allDates = dataWithDates.map(d => d.date);
            const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
            const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
            
            // Extend to full years
            startDate = new Date(minDate.getFullYear(), 0, 1);
            endDate = new Date(maxDate.getFullYear(), 11, 31);
        }
        
        // Calculate all years to display
        const startYear = startDate.getFullYear();
        const endYear = endDate.getFullYear();
        const years = [];
        for (let year = startYear; year <= endYear; year++) {
            years.push(year);
        }
        
        // Calculate optimal calendar dimensions
        const maxWeeksInYear = 53; // Maximum weeks in any year
        const optimalWeekWidth = cellSize + 2;
        const calendarWidth = Math.min(contentWidth, maxWeeksInYear * optimalWeekWidth);
        
        // Center the calendar within the available content area
        const calendarOffsetX = (contentWidth - calendarWidth) / 2;
        
        // Calculate height based on number of years
        const yearHeight = cellSize * 7 + 40; // 7 days + spacing
        const height = yearHeight * years.length + margin.top + margin.bottom;
        
        // Create data map for quick lookup
        const dataMap = new Map<string, CalendarData>();
        this.data.forEach(d => {
            const dateKey = d.date.toISOString().split('T')[0];
            dataMap.set(dateKey, d);
        });
        
        // D3 Selection append omitted in @types/d3 when parent is HTMLElement
         
        const svg = (d3.select(container) as unknown as d3.Selection<HTMLElement, unknown, null, undefined>).append('svg')
            .attr('width', containerWidth)
            .attr('height', height)
            .attr('class', 'calendar-chart')
            .style('font', '10px sans-serif');
        const g = svg.append('g')
            .attr('transform', `translate(${margin.left + calendarOffsetX}, ${margin.top})`);
        
        // Render each year
        years.forEach((year, yearIndex) => {
            const yearStartDate = new Date(year, 0, 1);
            const yearEndDate = new Date(year, 11, 31);
            const yearGroup = g.append('g')
                .attr('transform', `translate(0, ${yearIndex * yearHeight})`);
            
            // Calculate weeks for this specific year
            const totalDays = Math.ceil((yearEndDate.getTime() - yearStartDate.getTime()) / (24 * 60 * 60 * 1000));
            const totalWeeks = Math.ceil(totalDays / 7);
            const weekWidth = Math.min(optimalWeekWidth, calendarWidth / totalWeeks);
            
            // Add year label
            yearGroup.append('text')
                .attr('x', -5)
                .attr('y', -10)
                .attr('font-weight', 'bold')
                .attr('text-anchor', 'end')
                .style('fill', 'var(--text-normal)')
                .style('font-size', '14px')
                .text(year);
            
            // Add day labels - Monday to Sunday (M T W T F S S) - only for first year
            if (yearIndex === 0) {
                const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
                yearGroup.selectAll('.day-label')
                    .data(dayLabels)
                    .enter()
                    .append('text')
                    .attr('class', 'day-label')
                    .attr('x', -5)
                    .attr('y', (_d: string, i: number) => (i + 0.5) * (cellSize + 1))
                    .attr('dy', '0.31em')
                    .attr('text-anchor', 'end')
                    .style('fill', 'var(--text-muted)')
                    .style('font-size', '9px')
                    .text((d: string) => d);
            }
            
            // Generate all dates for this year
            const yearDates: Date[] = [];
            for (let d = new Date(yearStartDate); d <= yearEndDate; d.setDate(d.getDate() + 1)) {
                yearDates.push(new Date(d));
            }
            
            // Calculate week number for positioning within the year (Monday-first weeks)
            const getWeekNumber = (date: Date): number => {
                const yearStart = new Date(date.getFullYear(), 0, 1);
                
                // Get the Monday of the first week of the year
                const firstMonday = new Date(yearStart);
                const yearStartDay = getMondayFirstDay(yearStart);
                if (yearStartDay !== 0) {
                    // If year doesn't start on Monday, go back to the previous Monday
                    firstMonday.setDate(yearStart.getDate() - yearStartDay);
                }
                
                // Calculate days from the first Monday
                const daysDiff = Math.floor((date.getTime() - firstMonday.getTime()) / (24 * 60 * 60 * 1000));
                return Math.floor(daysDiff / 7);
            };
            
            // Convert JavaScript day (0=Sunday) to Monday-first week (0=Monday)
            const getMondayFirstDay = (date: Date): number => {
                const jsDay = date.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
                return jsDay === 0 ? 6 : jsDay - 1; // Convert to 0=Monday, 1=Tuesday, ..., 6=Sunday
            };
            
            // Create day cells for this year
            yearGroup.selectAll('.day-cell')
                .data(yearDates)
                .enter()
                .append('rect')
                .attr('class', 'day-cell')
                .attr('width', cellSize)
                .attr('height', cellSize)
                .attr('x', (d: Date) => getWeekNumber(d) * weekWidth)
                .attr('y', (d: Date) => getMondayFirstDay(d) * (cellSize + 1))
                .attr('fill', (d: Date) => {
                    const dateKey = d.toISOString().split('T')[0];
                    const dayData = dataMap.get(dateKey);
                    // Use consistent empty cell color
                    return dayData ? this.getObsidianAccentColor(dayData.value, minValue, maxValue) : 'var(--background-modifier-border)';
                })
                .attr('rx', 2)
                .attr('ry', 2)
                .style('cursor', 'pointer')
                .on('mouseover', (event: MouseEvent, d: Date) => {
                    const dateKey = d.toISOString().split('T')[0];
                    const dayData = dataMap.get(dateKey);
                    this.showTooltip(event, d, dayData);
                })
                .on('mouseout', () => {
                    this.hideTooltip();
                });
            
            // Add current week indicator for this year
            const currentDate = new Date();
            if (currentDate.getFullYear() === year) {
                const currentWeekNum = getWeekNumber(currentDate);
                const lineX = currentWeekNum * weekWidth + (weekWidth / 2);
                
                // Add vertical line for current week
                yearGroup.append('line')
                    .attr('class', 'current-week-indicator')
                    .attr('x1', lineX)
                    .attr('y1', -15)
                    .attr('x2', lineX)
                    .attr('y2', cellSize * 7 + 15)
                    .attr('stroke', 'var(--text-accent)')
                    .attr('stroke-width', 2)
                    .attr('stroke-dasharray', '4,3')
                    .attr('opacity', 0.7)
                    .style('pointer-events', 'none');
            }
            
            // Add month labels for this year
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            months.forEach((month, i) => {
                const monthDate = new Date(year, i, 1);
                const weekNum = getWeekNumber(monthDate);
                
                // Only show month label if it fits
                if (weekNum * weekWidth < calendarWidth - 30) {
                    yearGroup.append('text')
                        .attr('x', weekNum * weekWidth + 2)
                        .attr('y', -5)
                        .style('fill', 'var(--text-muted)')
                        .style('font-size', '10px')
                        .text(month);
                }
            });
        });
         
    }

    private getObsidianAccentColor(value: number, minValue: number, maxValue: number): string {
        // Empty cells use a subtle visible grey
        if (value === 0) {
            return 'var(--background-modifier-border)';
        }
        
        // Base color for mixing (subtle grey that works in both themes)
        const baseColor = 'var(--background-secondary-alt)';
        
        if (maxValue === minValue) {
            // If all non-zero values are the same, use full accent color
            return 'var(--text-accent)';
        }
        
        // Linear interpolation from min to max value
        // minValue gets lighter tint (mix with base), maxValue gets full accent color
        const normalizedValue = (value - minValue) / (maxValue - minValue);
        // Percentage of accent color: 30% for min activity, 100% for max activity
        const accentPercentage = 30 + normalizedValue * 70; // From 30% to 100%
        
        // Mix accent color with base color (solid, no transparency)
        return `color-mix(in srgb, var(--text-accent) ${Math.round(accentPercentage)}%, ${baseColor})`;
    }

    private showTooltip(event: MouseEvent, date: Date, dayData: CalendarData | undefined): void {
        this.hideTooltip();
        
        const tooltip = document.createElement('div');
        tooltip.className = 'calendar-tooltip';
        
        const dateStr = date.toLocaleDateString('en-US', { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
        const wordCount = dayData?.wordCount || 0;
        const fileCount = dayData?.fileCount || 0;
        
        tooltip.createEl('div', { cls: 'tooltip-date', text: dateStr });
        const stats = tooltip.createEl('div', { cls: 'tooltip-stats' });
        stats.createEl('div', { text: `${wordCount.toLocaleString()} words written` });
        stats.createEl('div', { text: fileCount > 0 ? `${fileCount} file${fileCount !== 1 ? 's' : ''} modified` : 'No activity' });
        
        document.body.appendChild(tooltip);
        
        const rect = tooltip.getBoundingClientRect();
        tooltip.style.left = (event.pageX - rect.width / 2) + 'px';
        tooltip.style.top = (event.pageY - rect.height - 10) + 'px';
    }

    private hideTooltip(): void {
        const tooltip = document.querySelector('.calendar-tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }

    public async refresh(): Promise<void> {
        KnowledgeCalendarChart.cachedCalendarData = null;
        this.data = [];
        await this.render();
    }
} 