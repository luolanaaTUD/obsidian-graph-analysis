import { App, Notice, Modal, requestUrl, TFile, Menu, setIcon } from 'obsidian';
import { GraphAnalysisSettings } from '../types/types';

export interface VaultAnalysisResult {
    id: string;
    title: string;
    summary: string;
    keywords: string;
    knowledgeDomain: string;
    created: string;
    modified: string;
    path: string;
    wordCount: number;
}

export class VaultAnalysisManager {
    private app: App;
    private settings: GraphAnalysisSettings;
    private statusBarItem: HTMLElement | null = null;

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.settings = settings;
    }

    public createStatusBarButton(statusBarContainer: HTMLElement): HTMLElement {
        // Create vault analysis button
        this.statusBarItem = statusBarContainer.createEl('div', {
            cls: 'status-bar-item plugin-graph-analysis-vault-analysis'
        });

        // Create icon container for vault analysis
        const vaultIconContainer = this.statusBarItem.createEl('span', {
            cls: 'status-bar-item-icon'
        });

        // Use brain icon for vault analysis
        setIcon(vaultIconContainer, 'sun');

        // Add text label for vault analysis
        this.statusBarItem.createEl('span', {
            text: 'Vault Analysis',
            cls: 'status-bar-item-text'
        });

        // Add click handler for vault analysis
        this.statusBarItem.addEventListener('click', (event) => {
            this.showVaultAnalysisMenu(event);
        });

        return this.statusBarItem;
    }

    public createGraphViewButton(container: HTMLElement): HTMLElement {
        // Create vault analysis button for graph view - positioned at right bottom
        const button = container.createDiv({ cls: 'vault-analysis-icon' });
        
        // Use brain icon for vault analysis
        setIcon(button, 'sun');
        
        // Create tooltip with description
        const tooltipEl = button.createDiv({ cls: 'vault-analysis-icon-tooltip' });
        
        // Add title
        tooltipEl.createDiv({ 
            cls: 'tooltip-title',
            text: 'Vault Analysis'
        });
        
        // Add description
        const description = tooltipEl.createDiv({ cls: 'tooltip-description' });
        description.setText('AI-powered analysis of your entire vault to extract summaries, keywords, and knowledge domains from all notes.');
        
        // Add click handler for vault analysis
        button.addEventListener('click', (event) => {
            this.showVaultAnalysisMenu(event);
        });

        return button;
    }

    private showVaultAnalysisMenu(event: Event): void {
        const menu = new Menu();
        
        menu.addItem((item) => {
            item.setTitle('Generate Vault Analysis')
                .setIcon('play-circle')
                .onClick(() => {
                    this.generateVaultAnalysis();
                });
        });
        
        menu.addItem((item) => {
            item.setTitle('View Results')
                .setIcon('file-text')
                .onClick(() => {
                    this.viewVaultAnalysisResults();
                });
        });
        
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle('About Vault Analysis')
                .setIcon('info')
                .onClick(() => {
                    this.showVaultAnalysisInfo();
                });
        });
        
        menu.showAtMouseEvent(event as MouseEvent);
    }

    public async generateVaultAnalysis(): Promise<void> {
        try {
            // Check if Gemini API key is configured
            if (!this.settings.geminiApiKey || this.settings.geminiApiKey.trim() === '') {
                new Notice('Please configure your Gemini API key in settings to use vault analysis.');
                return;
            }

            // Get all markdown files in the vault
            const allFiles = this.app.vault.getMarkdownFiles();
            
            // Filter out excluded files using the same logic as the main plugin
            const includedFiles = allFiles.filter(file => !this.isFileExcluded(file));
            
            if (includedFiles.length === 0) {
                new Notice('No files found for analysis after applying exclusion rules.');
                return;
            }

            // Show initial notice
            const progressNotice = new Notice(`Starting vault analysis for ${includedFiles.length} files...`, 0);
            
            const results: VaultAnalysisResult[] = [];
            let processed = 0;
            let failed = 0;

            // Process files in batches to avoid rate limiting
            const batchSize = 10; // 10 files per batch
            const delayBetweenBatches = 5000; // 5 seconds between batches for rate limiting
            const totalBatches = Math.ceil(includedFiles.length / batchSize);
            
            // Process batches sequentially
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                const startIndex = batchIndex * batchSize;
                const endIndex = Math.min(startIndex + batchSize, includedFiles.length);
                const batch = includedFiles.slice(startIndex, endIndex);
                
                // API response status flag
                let apiResponseStatus: number | null = null;
                let apiResponseReceived = false;
                
                // Update progress
                progressNotice.setMessage(`Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} files)... (${processed}/${includedFiles.length} completed, ${failed} failed)`);
                
                try {
                    // Process entire batch in a single API request
                    const batchResults = await this.analyzeBatch(batch);
                    
                    // Set flag when API response is successful
                    apiResponseStatus = 200;
                    apiResponseReceived = true;
                    
                    // Process batch results immediately after successful API response
                    for (let i = 0; i < batch.length; i++) {
                        const file = batch[i];
                        const result = batchResults[i];
                        
                        if (result && result.success && result.data) {
                            results.push(result.data);
                            processed++;
                        } else {
                            console.error(`Failed to analyze file ${file.path}:`, result?.error || 'Unknown error');
                            failed++;
                            processed++;
                        }
                    }
                    
                } catch (batchError) {
                    console.error(`Error processing batch ${batchIndex + 1}:`, batchError);
                    
                    // Set error flag
                    apiResponseReceived = true;
                    if (batchError instanceof Error && batchError.message.includes('429')) {
                        apiResponseStatus = 429;
                    } else {
                        apiResponseStatus = 500; // Generic error status
                    }
                    
                    // Check if it's a rate limit error (429) and retry with longer delay
                    if (batchError instanceof Error && batchError.message.includes('429')) {
                        console.log(`Rate limit hit, retrying batch ${batchIndex + 1} after longer delay...`);
                        progressNotice.setMessage(`Rate limit exceeded, waiting 10s before retry... (${processed}/${includedFiles.length} completed, ${failed} failed)`);
                        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay for rate limit retry
                        
                        // Retry the batch once
                        try {
                            const retryResults = await this.analyzeBatch(batch);
                            
                            // Update flag after successful retry
                            apiResponseStatus = 200;
                            apiResponseReceived = true;
                            
                            for (let i = 0; i < batch.length; i++) {
                                const file = batch[i];
                                const result = retryResults[i];
                                
                                if (result && result.success && result.data) {
                                    results.push(result.data);
                                    processed++;
                                } else {
                                    console.error(`Failed to analyze file ${file.path} on retry:`, result?.error || 'Unknown error');
                                    failed++;
                                    processed++;
                                }
                            }
                        } catch (retryError) {
                            console.error(`Retry failed for batch ${batchIndex + 1}:`, retryError);
                            // Mark all files in this batch as failed
                            failed += batch.length;
                            processed += batch.length;
                            apiResponseStatus = 500;
                        }
                    } else {
                        // Non-rate-limit error, mark all files in this batch as failed
                        failed += batch.length;
                        processed += batch.length;
                    }
                }
                
                // Rate limiting: always wait 5 seconds, then check API response flag
                if (batchIndex < totalBatches - 1) {
                    progressNotice.setMessage(`Rate limiting: waiting 5s... (${processed}/${includedFiles.length} completed, ${failed} failed)`);
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Always wait 5 seconds
                    
                    // After 5 seconds, check if we got a successful response
                    if (apiResponseReceived && apiResponseStatus === 200) {
                        progressNotice.setMessage(`API responded successfully, proceeding to next batch... (${processed}/${includedFiles.length} completed, ${failed} failed)`);
                    } else {
                        // Wait until we get a successful response or timeout
                        let waitTime = 0;
                        const maxWaitTime = 30000; // Maximum 30 seconds additional wait
                        const checkInterval = 1000; // Check every 1 second
                        
                        while (waitTime < maxWaitTime && (!apiResponseReceived || apiResponseStatus !== 200)) {
                            progressNotice.setMessage(`Waiting for successful API response... ${Math.ceil((maxWaitTime - waitTime)/1000)}s remaining (${processed}/${includedFiles.length} completed, ${failed} failed)`);
                            await new Promise(resolve => setTimeout(resolve, checkInterval));
                            waitTime += checkInterval;
                        }
                        
                        if (apiResponseStatus === 200) {
                            progressNotice.setMessage(`API response successful after additional wait, proceeding... (${processed}/${includedFiles.length} completed, ${failed} failed)`);
                        } else {
                            progressNotice.setMessage(`Proceeding despite API issues (status: ${apiResponseStatus})... (${processed}/${includedFiles.length} completed, ${failed} failed)`);
                        }
                    }
                }
            }

            // Hide progress notice
            progressNotice.hide();

            // Save results to JSON file
            await this.saveAnalysisResults(results);
            
            // Show completion notice with detailed stats
            if (failed === 0) {
                new Notice(`✅ Vault analysis completed successfully! Processed ${processed} files. Results saved to plugin data folder`);
            } else {
                new Notice(`⚠️ Vault analysis completed with some issues. Processed ${processed - failed} files successfully, ${failed} failed. Results saved to plugin data folder`);
            }
            
        } catch (error) {
            console.error('Failed to generate vault analysis:', error);
            new Notice(`❌ Failed to generate vault analysis: ${(error as Error).message}`);
        }
    }

    private async analyzeFile(file: TFile): Promise<VaultAnalysisResult | null> {
        try {
            // Get file content and metadata
            const content = await this.app.vault.read(file);
            const cleanedContent = this.cleanupContent(content);
            const wordCount = cleanedContent.split(/\s+/).filter(word => word.length > 0).length;
            
            // Skip files that are too short to be meaningful
            if (wordCount < 10) {
                return null;
            }

            // Get file stats
            const stat = await this.app.vault.adapter.stat(file.path);
            const created = stat?.ctime ? new Date(stat.ctime).toISOString() : '';
            const modified = stat?.mtime ? new Date(stat.mtime).toISOString() : '';

            // Generate AI analysis
            const aiAnalysis = await this.generateFileAnalysis(cleanedContent, file.basename);
            
            return {
                id: this.generateFileId(file),
                title: file.basename,
                summary: aiAnalysis.summary,
                keywords: aiAnalysis.keywords,
                knowledgeDomain: aiAnalysis.knowledgeDomain,
                created,
                modified,
                path: file.path,
                wordCount
            };
        } catch (error) {
            console.error(`Error analyzing file ${file.path}:`, error);
            throw error;
        }
    }

    private async analyzeBatch(files: TFile[]): Promise<Array<{ success: boolean; data?: VaultAnalysisResult; error?: string }>> {
        try {
            // Prepare file data for batch processing
            const fileData: Array<{
                file: TFile;
                content: string;
                wordCount: number;
                created: string;
                modified: string;
                isShort: boolean;
            }> = [];

            for (const file of files) {
                try {
                    const content = await this.app.vault.read(file);
                    const cleanedContent = this.cleanupContent(content);
                    const wordCount = cleanedContent.split(/\s+/).filter(word => word.length > 0).length;
                    
                    // Get file stats
                    const stat = await this.app.vault.adapter.stat(file.path);
                    const created = stat?.ctime ? new Date(stat.ctime).toISOString() : '';
                    const modified = stat?.mtime ? new Date(stat.mtime).toISOString() : '';

                    fileData.push({
                        file,
                        content: cleanedContent,
                        wordCount,
                        created,
                        modified,
                        isShort: wordCount < 10 // Mark files that are too short
                    });
                } catch (error) {
                    console.error(`Error reading file ${file.path}:`, error);
                    fileData.push({
                        file,
                        content: '',
                        wordCount: 0,
                        created: '',
                        modified: '',
                        isShort: true
                    });
                }
            }

            // Separate short files from files that need API analysis
            const shortFiles = fileData.filter(data => data.isShort);
            const apiFiles = fileData.filter(data => !data.isShort);
            
            const results: Array<{ success: boolean; data?: VaultAnalysisResult; error?: string }> = [];
            
            // Handle short files locally without API call
            shortFiles.forEach(data => {
                results.push({
                    success: true,
                    data: {
                        id: this.generateFileId(data.file),
                        title: data.file.basename,
                        summary: 'Note is empty or too short for semantic analysis',
                        keywords: '',
                        knowledgeDomain: '',
                        created: data.created,
                        modified: data.modified,
                        path: data.file.path,
                        wordCount: data.wordCount
                    }
                });
            });

            // Process API files if any exist
            if (apiFiles.length > 0) {
                try {
                    const batchAnalysis = await this.generateBatchAnalysis(apiFiles);
                    
                    // Process API results
                    for (let i = 0; i < apiFiles.length; i++) {
                        const data = apiFiles[i];
                        const analysis = batchAnalysis[i];
                        
                        if (analysis && analysis.summary) {
                            results.push({
                                success: true,
                                data: {
                                    id: this.generateFileId(data.file),
                                    title: data.file.basename,
                                    summary: analysis.summary,
                                    keywords: analysis.keywords,
                                    knowledgeDomain: analysis.knowledgeDomain,
                                    created: data.created,
                                    modified: data.modified,
                                    path: data.file.path,
                                    wordCount: data.wordCount
                                }
                            });
                        } else {
                            results.push({ success: false, error: 'Failed to generate analysis' });
                        }
                    }
                } catch (apiError) {
                    console.error('Error in API batch analysis:', apiError);
                    // Return error for all API files
                    apiFiles.forEach(() => {
                        results.push({ success: false, error: (apiError as Error).message });
                    });
                }
            }
            
            // Sort results to match original file order
            const sortedResults: Array<{ success: boolean; data?: VaultAnalysisResult; error?: string }> = [];
            for (const originalData of fileData) {
                const result = results.find(r => 
                    r.data && r.data.path === originalData.file.path
                ) || results.find(r => !r.success);
                
                if (result) {
                    sortedResults.push(result);
                    // Remove the result to avoid duplication
                    const index = results.indexOf(result);
                    if (index > -1) {
                        results.splice(index, 1);
                    }
                } else {
                    sortedResults.push({ success: false, error: 'Result not found' });
                }
            }
            
            return sortedResults;
        } catch (error) {
            console.error('Error in batch analysis:', error);
            // Return error for all files in batch
            return files.map(() => ({ success: false, error: (error as Error).message }));
        }
    }

    private generateFileId(file: TFile): string {
        // Generate a consistent ID based on file path
        // Obsidian doesn't provide a built-in unique ID, so we create one
        return file.path.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    }

    private cleanupContent(content: string): string {
        // Remove markdown syntax and clean up content
        let cleaned = content
            // Remove frontmatter
            .replace(/^---[\s\S]*?---\n?/m, '')
            // Remove empty lines
            .replace(/^\s*$/gm, '')
            // Remove multiple consecutive newlines
            .replace(/\n{3,}/g, '\n\n')
            // Remove markdown headers
            .replace(/^#{1,6}\s+/gm, '')
            // Remove markdown links but keep text
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // Remove markdown bold/italic
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            // Remove markdown code blocks
            .replace(/```[\s\S]*?```/g, '')
            // Remove inline code
            .replace(/`([^`]+)`/g, '$1')
            // Remove bullet points
            .replace(/^[\s]*[-*+]\s+/gm, '')
            // Remove numbered lists
            .replace(/^[\s]*\d+\.\s+/gm, '')
            // Clean up extra whitespace
            .replace(/\s+/g, ' ')
            .trim();

        // Limit to approximately 1000 words
        const words = cleaned.split(/\s+/);
        if (words.length > 1000) {
            cleaned = words.slice(0, 1000).join(' ') + '...';
        }

        return cleaned;
    }

    private async generateFileAnalysis(content: string, fileName: string): Promise<{
        summary: string;
        keywords: string;
        knowledgeDomain: string;
    }> {
        const apiKey = this.settings.geminiApiKey;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

        const prompt = `Analyze the following note titled "${fileName}" and provide:
1. A one-sentence summary of the main concept or purpose
2. 3-6 key terms or phrases (comma-separated)
3. 2-4 knowledge domains or fields this content belongs to (comma-separated)

Format your response as JSON:
{
  "summary": "One sentence summary",
  "keywords": "keyword1, keyword2, keyword3",
  "knowledgeDomain": "domain1, domain2, domain3"
}

Content:
${content}`;

        const requestBody = { 
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.2,
                topK: 20,
                topP: 0.8,
                maxOutputTokens: 200,
            }
        };

        try {
            const response = await requestUrl({
                url: url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (response.status !== 200) {
                throw new Error(`Gemini API returned status ${response.status}: ${response.text}`);
            }

            const data = response.json;
            
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Invalid response format from Gemini API');
            }

            const responseText = data.candidates[0].content.parts[0].text;
            
            // Try to parse as JSON, fallback to text parsing if needed
            try {
                const jsonResponse = JSON.parse(responseText);
                return {
                    summary: jsonResponse.summary || '',
                    keywords: jsonResponse.keywords || '',
                    knowledgeDomain: jsonResponse.knowledgeDomain || ''
                };
            } catch (parseError) {
                // Fallback: extract from text response
                return this.parseTextResponse(responseText);
            }
        } catch (error) {
            console.error('Gemini API error:', error);
            throw error;
        }
    }

    private parseTextResponse(text: string): {
        summary: string;
        keywords: string;
        knowledgeDomain: string;
    } {
        // Fallback parsing for non-JSON responses
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);
        
        let summary = '';
        let keywords = '';
        let knowledgeDomain = '';
        
        for (const line of lines) {
            if (line.toLowerCase().includes('summary')) {
                summary = line.replace(/.*?summary[^:]*:\s*/i, '');
            } else if (line.toLowerCase().includes('keyword')) {
                keywords = line.replace(/.*?keyword[^:]*:\s*/i, '');
            } else if (line.toLowerCase().includes('domain')) {
                knowledgeDomain = line.replace(/.*?domain[^:]*:\s*/i, '');
            }
        }
        
        return { summary, keywords, knowledgeDomain };
    }

    private async ensureVaultAnalysisFileExists(): Promise<void> {
        const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/vault-analysis.json`;
        try {
            await this.app.vault.adapter.read(filePath);
        } catch {
            // File doesn't exist, create it with empty structure
            const initialData = {
                generatedAt: new Date().toISOString(),
                totalFiles: 0,
                apiProvider: 'Google Gemini',
                results: []
            };
            // Ensure the plugin directory exists
            const pluginDir = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis`;
            try {
                await this.app.vault.adapter.mkdir(pluginDir);
            } catch {
                // Directory might already exist
            }
            await this.app.vault.adapter.write(filePath, JSON.stringify(initialData, null, 2));
            console.log('Created initial vault analysis file in plugin data folder');
        }
    }

    public async viewVaultAnalysisResults(): Promise<void> {
        try {
            // Ensure the file exists
            await this.ensureVaultAnalysisFileExists();
            
            // Try to read existing vault analysis results from plugin data folder
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/vault-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const analysisData = JSON.parse(content);
            
            if (!analysisData.results || analysisData.results.length === 0) {
                throw new Error('No vault analysis results found. Please run vault analysis first.');
            }
            
            // Display results in a modal
            const modal = new VaultAnalysisModal(this.app, analysisData);
            modal.open();
        } catch (error) {
            console.error('Failed to load vault analysis results:', error);
            new Notice(error instanceof Error ? error.message : 'Failed to load vault analysis results');
        }
    }

    private showVaultAnalysisInfo(): void {
        const modal = new VaultAnalysisInfoModal(this.app);
        modal.open();
    }

    private isFileExcluded(file: TFile): boolean {
        // Check folder exclusions
        if (this.settings.excludeFolders && this.settings.excludeFolders.length > 0) {
            for (const excludeFolder of this.settings.excludeFolders) {
                if (excludeFolder && file.path.toLowerCase().includes(excludeFolder.toLowerCase())) {
                    return true;
                }
            }
        }

        // Check tag exclusions
        if (this.settings.excludeTags && this.settings.excludeTags.length > 0) {
            const fileCache = this.app.metadataCache.getFileCache(file);
            if (fileCache) {
                // Check frontmatter tags
                const frontmatterTags = fileCache.frontmatter?.tags || [];
                // Check inline tags
                const inlineTags = fileCache.tags?.map(tag => tag.tag.replace('#', '')) || [];
                
                const allTags = [...frontmatterTags, ...inlineTags];
                
                for (const excludeTag of this.settings.excludeTags) {
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

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
    }

    public destroy(): void {
        if (this.statusBarItem) {
            this.statusBarItem.remove();
            this.statusBarItem = null;
        }
    }

    private async saveAnalysisResults(results: VaultAnalysisResult[]): Promise<void> {
        try {
            // Ensure the file exists
            await this.ensureVaultAnalysisFileExists();
            
            // Sort results by title for consistent ordering
            const sortedResults = results.sort((a, b) => a.title.localeCompare(b.title));
            
            // Create the output data with metadata
            const outputData = {
                generatedAt: new Date().toISOString(),
                totalFiles: sortedResults.length,
                apiProvider: 'Google Gemini',
                results: sortedResults
            };
            
            // Save to plugin data folder
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/vault-analysis.json`;
            
            // Write the file
            await this.app.vault.adapter.write(filePath, JSON.stringify(outputData, null, 2));
            
            console.log(`Vault analysis results saved to plugin data folder: ${filePath}`);
        } catch (error) {
            console.error('Failed to save analysis results:', error);
            throw new Error(`Failed to save results: ${(error as Error).message}`);
        }
    }

    private async generateBatchAnalysis(fileData: Array<{
        file: TFile;
        content: string;
        wordCount: number;
        created: string;
        modified: string;
        isShort: boolean;
    }>): Promise<Array<{
        summary: string;
        keywords: string;
        knowledgeDomain: string;
    }>> {
        const apiKey = this.settings.geminiApiKey;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

        // Filter out short files (they should already be filtered, but double-check)
        const meaningfulFiles = fileData.filter(data => !data.isShort && data.content.trim().length > 0);
        
        if (meaningfulFiles.length === 0) {
            return [];
        }

        // Build the batch prompt
        let prompt = `Analyze the following ${meaningfulFiles.length} notes and provide analysis for each one. For each note, provide:
1. A one-sentence summary of the main concept or purpose
2. 3-6 key terms or phrases (comma-separated)
3. 2-4 knowledge domains or fields this content belongs to (comma-separated)

Format your response as a JSON array with exactly ${meaningfulFiles.length} objects in this format:
[
  {
    "summary": "One sentence summary",
    "keywords": "keyword1, keyword2, keyword3",
    "knowledgeDomain": "domain1, domain2, domain3"
  },
  ...
]

Notes to analyze:

`;

        // Add each meaningful file to the prompt
        meaningfulFiles.forEach((data, index) => {
            prompt += `--- Note ${index + 1}: "${data.file.basename}" (${data.wordCount} words) ---\n${data.content}\n\n`;
        });

        const requestBody = { 
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.2,
                topK: 20,
                topP: 0.8,
                maxOutputTokens: meaningfulFiles.length * 100 + 200, // Dynamic token limit based on file count
            }
        };

        try {
            const response = await requestUrl({
                url: url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (response.status !== 200) {
                throw new Error(`Gemini API returned status ${response.status}: ${response.text}`);
            }

            const data = response.json;
            
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Invalid response format from Gemini API');
            }

            const responseText = data.candidates[0].content.parts[0].text;
            
            // Try to parse as JSON array
            try {
                // Clean the response text by removing markdown code blocks
                let cleanedResponse = responseText.trim();
                
                // Remove markdown code block markers if present
                if (cleanedResponse.startsWith('```json')) {
                    cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                } else if (cleanedResponse.startsWith('```')) {
                    cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
                }
                
                const jsonResponse = JSON.parse(cleanedResponse);
                if (Array.isArray(jsonResponse) && jsonResponse.length === meaningfulFiles.length) {
                    return jsonResponse.map(item => ({
                        summary: item.summary || '',
                        keywords: item.keywords || '',
                        knowledgeDomain: item.knowledgeDomain || ''
                    }));
                } else {
                    console.error('Response array length mismatch. Expected:', meaningfulFiles.length, 'Got:', jsonResponse.length);
                    // If length mismatch, pad with empty results or truncate
                    const paddedResults = [];
                    for (let i = 0; i < meaningfulFiles.length; i++) {
                        if (i < jsonResponse.length && jsonResponse[i]) {
                            paddedResults.push({
                                summary: jsonResponse[i].summary || 'Analysis incomplete',
                                keywords: jsonResponse[i].keywords || '',
                                knowledgeDomain: jsonResponse[i].knowledgeDomain || ''
                            });
                        } else {
                            paddedResults.push({
                                summary: 'Analysis incomplete',
                                keywords: '',
                                knowledgeDomain: ''
                            });
                        }
                    }
                    return paddedResults;
                }
            } catch (parseError) {
                console.error('Failed to parse batch response as JSON:', parseError);
                console.error('Raw response:', responseText);
                // Fallback: create default results for each file
                return meaningfulFiles.map((data) => ({
                    summary: `Analysis failed for ${data.file.basename}`,
                    keywords: '',
                    knowledgeDomain: ''
                }));
            }
        } catch (error) {
            console.error('Gemini API error in batch analysis:', error);
            throw error;
        }
    }
}

class VaultAnalysisModal extends Modal {
    private analysisData: {
        generatedAt: string;
        totalFiles: number;
        apiProvider: string;
        results: VaultAnalysisResult[];
    };

    constructor(app: App, analysisData: any) {
        super(app);
        this.analysisData = analysisData;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { 
            text: 'Vault Analysis Results',
            cls: 'modal-title'
        });
        
        // Summary section
        const summaryContainer = contentEl.createEl('div', { 
            cls: 'vault-analysis-summary' 
        });
        
        summaryContainer.createEl('p', {
            text: `Total files analyzed: ${this.analysisData.totalFiles}`
        });
        
        summaryContainer.createEl('p', {
            text: `Generated: ${new Date(this.analysisData.generatedAt).toLocaleString()}`
        });
        
        summaryContainer.createEl('p', {
            text: `API Provider: ${this.analysisData.apiProvider}`
        });
        
        // Search functionality
        const searchContainer = contentEl.createEl('div', { 
            cls: 'vault-analysis-search' 
        });
        
        const searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'Search notes by title, keywords, or domain...',
            cls: 'vault-analysis-search-input'
        });
        
        // Results container
        const resultsContainer = contentEl.createEl('div', { 
            cls: 'vault-analysis-results' 
        });
        
        // Display results function
        const displayResults = (filteredResults: VaultAnalysisResult[]) => {
            resultsContainer.empty();
            
            if (filteredResults.length === 0) {
                resultsContainer.createEl('p', {
                    text: 'No results found matching your search.',
                    cls: 'no-results'
                });
                return;
            }
            
            filteredResults.forEach(result => {
                const resultItem = resultsContainer.createEl('div', { 
                    cls: 'vault-analysis-result-item' 
                });
                
                const titleEl = resultItem.createEl('h3', {
                    text: result.title,
                    cls: 'result-title'
                });
                
                // Make title clickable to open the note
                titleEl.style.cursor = 'pointer';
                titleEl.style.color = 'var(--text-accent)';
                titleEl.addEventListener('click', async () => {
                    const file = this.app.vault.getAbstractFileByPath(result.path);
                    if (file) {
                        await this.app.workspace.openLinkText(file.path, '');
                        this.close();
                    }
                });
                
                resultItem.createEl('p', {
                    text: result.summary,
                    cls: 'result-summary'
                });
                
                resultItem.createEl('p', {
                    text: `Keywords: ${result.keywords}`,
                    cls: 'result-keywords'
                });
                
                resultItem.createEl('p', {
                    text: `Knowledge Domain: ${result.knowledgeDomain}`,
                    cls: 'result-domain'
                });
                
                const metaContainer = resultItem.createEl('div', {
                    cls: 'result-meta'
                });
                
                metaContainer.createEl('span', {
                    text: `${result.wordCount} words`,
                    cls: 'result-word-count'
                });
                
                if (result.modified) {
                    metaContainer.createEl('span', {
                        text: ` • Modified: ${new Date(result.modified).toLocaleDateString()}`,
                        cls: 'result-date'
                    });
                }
            });
        };
        
        // Initial display
        displayResults(this.analysisData.results);
        
        // Search functionality
        searchInput.addEventListener('input', (e) => {
            const searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
            
            if (!searchTerm) {
                displayResults(this.analysisData.results);
                return;
            }
            
            const filteredResults = this.analysisData.results.filter(result => 
                result.title.toLowerCase().includes(searchTerm) ||
                result.summary.toLowerCase().includes(searchTerm) ||
                result.keywords.toLowerCase().includes(searchTerm) ||
                result.knowledgeDomain.toLowerCase().includes(searchTerm)
            );
            
            displayResults(filteredResults);
        });
        
        // Close button
        const buttonContainer = contentEl.createEl('div', { 
            cls: 'modal-button-container' 
        });
        
        const closeButton = buttonContainer.createEl('button', { 
            text: 'Close',
            cls: 'mod-cta'
        });
        closeButton.addEventListener('click', () => this.close());
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class VaultAnalysisInfoModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { 
            text: 'About Vault Analysis',
            cls: 'modal-title'
        });
        
        const infoContainer = contentEl.createEl('div', { 
            cls: 'vault-analysis-info' 
        });
        
        infoContainer.createEl('p', {
            text: 'Vault Analysis uses AI to analyze your entire Obsidian vault and provides:'
        });
        
        const featureList = infoContainer.createEl('ul');
        
        const features = [
            'One-sentence summaries for each note',
            'Key terms and phrases extraction',
            'Knowledge domain classification',
            'Metadata including word count and dates',
            'Search and filtering capabilities'
        ];
        
        features.forEach(feature => {
            featureList.createEl('li', { text: feature });
        });
        
        infoContainer.createEl('h3', { text: 'Requirements' });
        infoContainer.createEl('p', {
            text: '• Google Gemini API key (configured in plugin settings)'
        });
        infoContainer.createEl('p', {
            text: '• Internet connection for AI processing'
        });
        
        infoContainer.createEl('h3', { text: 'Exclusions' });
        infoContainer.createEl('p', {
            text: 'The analysis respects your exclusion settings for folders and tags, ensuring only relevant notes are processed.'
        });
        
        infoContainer.createEl('h3', { text: 'Rate Limiting' });
        infoContainer.createEl('p', {
            text: 'Processing is done in batches with delays to respect API rate limits. Large vaults may take several minutes to complete.'
        });
        
        const buttonContainer = contentEl.createEl('div', { 
            cls: 'modal-button-container' 
        });
        
        const closeButton = buttonContainer.createEl('button', { 
            text: 'Close',
            cls: 'mod-cta'
        });
        closeButton.addEventListener('click', () => this.close());
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 