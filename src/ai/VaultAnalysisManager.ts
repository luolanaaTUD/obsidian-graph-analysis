import { App, Notice, Modal, requestUrl, TFile, Menu, setIcon } from 'obsidian';
import { GraphAnalysisSettings } from '../types/types';

export interface TokenUsage {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
}

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

export interface VaultAnalysisData {
    generatedAt: string;
    totalFiles: number;
    apiProvider: string;
    tokenUsage: TokenUsage;
    results: VaultAnalysisResult[];
}

export class VaultAnalysisManager {
    private app: App;
    private settings: GraphAnalysisSettings;
    private statusBarItem: HTMLElement | null = null;

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.settings = settings;
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
            let totalTokenUsage: TokenUsage = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };

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
                
                // Update progress with token usage
                const tokenInfo = totalTokenUsage.totalTokens > 0 ? ` (${totalTokenUsage.totalTokens} tokens used)` : '';
                progressNotice.setMessage(`Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} files)... (${processed}/${includedFiles.length} completed, ${failed} failed)${tokenInfo}`);
                
                try {
                    // Process entire batch in a single API request
                    const batchResult = await this.analyzeBatch(batch);
                    const batchResults = batchResult.results;
                    
                    // Accumulate token usage
                    totalTokenUsage.promptTokens += batchResult.tokenUsage.promptTokens;
                    totalTokenUsage.candidatesTokens += batchResult.tokenUsage.candidatesTokens;
                    totalTokenUsage.totalTokens += batchResult.tokenUsage.totalTokens;
                    
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
                        const tokenInfo = totalTokenUsage.totalTokens > 0 ? ` (${totalTokenUsage.totalTokens} tokens used)` : '';
                        progressNotice.setMessage(`Rate limit exceeded, waiting 10s before retry... (${processed}/${includedFiles.length} completed, ${failed} failed)${tokenInfo}`);
                        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay for rate limit retry
                        
                        // Retry the batch once
                        try {
                            const retryResult = await this.analyzeBatch(batch);
                            const retryResults = retryResult.results;
                            
                            // Accumulate token usage from retry
                            totalTokenUsage.promptTokens += retryResult.tokenUsage.promptTokens;
                            totalTokenUsage.candidatesTokens += retryResult.tokenUsage.candidatesTokens;
                            totalTokenUsage.totalTokens += retryResult.tokenUsage.totalTokens;
                            
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
                
                // Rate limiting: always wait between batches
                if (batchIndex < totalBatches - 1) {
                    // progressNotice.setMessage(`Rate limiting: waiting 5s... (${processed}/${includedFiles.length} completed, ${failed} failed)`);
                    await new Promise(resolve => setTimeout(resolve, delayBetweenBatches)); // Always wait between batches
                    
                    // After delay, check if we got a successful response
                    if (apiResponseReceived && apiResponseStatus === 200) {
                        const tokenInfo = totalTokenUsage.totalTokens > 0 ? ` (${totalTokenUsage.totalTokens} tokens used)` : '';
                        progressNotice.setMessage(`API responded successfully, proceeding to next batch... (${processed}/${includedFiles.length} completed, ${failed} failed)${tokenInfo}`);
                    } else {
                        // Wait until we get a successful response or timeout
                        let waitTime = 0;
                        const maxWaitTime = 30000; // Maximum 30 seconds additional wait
                        const checkInterval = 1000; // Check every 1 second
                        
                        while (waitTime < maxWaitTime && (!apiResponseReceived || apiResponseStatus !== 200)) {
                            const tokenInfo = totalTokenUsage.totalTokens > 0 ? ` (${totalTokenUsage.totalTokens} tokens used)` : '';
                            progressNotice.setMessage(`Waiting for successful API response... ${Math.ceil((maxWaitTime - waitTime)/1000)}s remaining (${processed}/${includedFiles.length} completed, ${failed} failed)${tokenInfo}`);
                            await new Promise(resolve => setTimeout(resolve, checkInterval));
                            waitTime += checkInterval;
                        }
                        
                        const tokenInfo = totalTokenUsage.totalTokens > 0 ? ` (${totalTokenUsage.totalTokens} tokens used)` : '';
                        if (apiResponseStatus === 200) {
                            progressNotice.setMessage(`API response successful after additional wait, proceeding... (${processed}/${includedFiles.length} completed, ${failed} failed)${tokenInfo}`);
                        } else {
                            progressNotice.setMessage(`Proceeding despite API issues (status: ${apiResponseStatus})... (${processed}/${includedFiles.length} completed, ${failed} failed)${tokenInfo}`);
                        }
                    }
                }
            }

            // Hide progress notice
            progressNotice.hide();

            // Save results to JSON file with token usage
            await this.saveAnalysisResults(results, totalTokenUsage);
            
            // Show completion notice with detailed stats including token usage
            if (failed === 0) {
                new Notice(`✅ Vault analysis completed successfully! Processed ${processed} files using ${totalTokenUsage.totalTokens} tokens. Results saved to plugin data folder`);
            } else {
                new Notice(`⚠️ Vault analysis completed with some issues. Processed ${processed - failed} files successfully, ${failed} failed, using ${totalTokenUsage.totalTokens} tokens. Results saved to plugin data folder`);
            }
            
        } catch (error) {
            console.error('Failed to generate vault analysis:', error);
            new Notice(`❌ Failed to generate vault analysis: ${(error as Error).message}`);
        }
    }

    private async analyzeBatch(files: TFile[]): Promise<{
        results: Array<{ success: boolean; data?: VaultAnalysisResult; error?: string }>;
        tokenUsage: TokenUsage;
    }> {
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
            let totalTokenUsage: TokenUsage = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };
            
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
                    const batchAnalysisResult = await this.generateBatchAnalysis(apiFiles);
                    
                    // Accumulate token usage
                    totalTokenUsage.promptTokens += batchAnalysisResult.tokenUsage.promptTokens;
                    totalTokenUsage.candidatesTokens += batchAnalysisResult.tokenUsage.candidatesTokens;
                    totalTokenUsage.totalTokens += batchAnalysisResult.tokenUsage.totalTokens;
                    
                    // Process API results
                    for (let i = 0; i < apiFiles.length; i++) {
                        const data = apiFiles[i];
                        const analysis = batchAnalysisResult.results[i];
                        
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
            
            return { results: sortedResults, tokenUsage: totalTokenUsage };
        } catch (error) {
            console.error('Error in batch analysis:', error);
            // Return error for all files in batch
            return {
                results: files.map(() => ({ success: false, error: (error as Error).message })),
                tokenUsage: { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 }
            };
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

    private async ensureVaultAnalysisFileExists(): Promise<void> {
        const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/vault-analysis.json`;
        try {
            await this.app.vault.adapter.read(filePath);
        } catch {
            // File doesn't exist, create it with empty structure
            const initialData: VaultAnalysisData = {
                generatedAt: new Date().toISOString(),
                totalFiles: 0,
                apiProvider: 'Google Gemini',
                tokenUsage: { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 },
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

    private async saveAnalysisResults(results: VaultAnalysisResult[], totalTokenUsage: TokenUsage): Promise<void> {
        try {
            // Ensure the file exists
            await this.ensureVaultAnalysisFileExists();
            
            // Sort results by title for consistent ordering
            const sortedResults = results.sort((a, b) => a.title.localeCompare(b.title));
            
            // Create the output data with metadata
            const outputData: VaultAnalysisData = {
                generatedAt: new Date().toISOString(),
                totalFiles: sortedResults.length,
                apiProvider: 'Google Gemini',
                tokenUsage: totalTokenUsage,
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
    }>): Promise<{
        results: Array<{
            summary: string;
            keywords: string;
            knowledgeDomain: string;
        }>;
        tokenUsage: TokenUsage;
    }> {
        const apiKey = this.settings.geminiApiKey;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

        // Filter out short files (they should already be filtered, but double-check)
        const meaningfulFiles = fileData.filter(data => !data.isShort && data.content.trim().length > 0);
        
        if (meaningfulFiles.length === 0) {
            return {
                results: [],
                tokenUsage: { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 }
            };
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

            // Extract token usage from the response
            const tokenUsage: TokenUsage = {
                promptTokens: data.usageMetadata?.promptTokenCount || 0,
                candidatesTokens: data.usageMetadata?.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata?.totalTokenCount || 0
            };

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
                    return {
                        results: jsonResponse.map(item => ({
                            summary: item.summary || '',
                            keywords: item.keywords || '',
                            knowledgeDomain: item.knowledgeDomain || ''
                        })),
                        tokenUsage
                    };
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
                    return { results: paddedResults, tokenUsage };
                }
            } catch (parseError) {
                console.error('Failed to parse batch response as JSON:', parseError);
                console.error('Raw response:', responseText);
                // Fallback: create default results for each file
                return {
                    results: meaningfulFiles.map((data) => ({
                        summary: `Analysis failed for ${data.file.basename}`,
                        keywords: '',
                        knowledgeDomain: ''
                    })),
                    tokenUsage
                };
            }
        } catch (error) {
            console.error('Gemini API error in batch analysis:', error);
            throw error;
        }
    }
}

class VaultAnalysisModal extends Modal {
    private analysisData: VaultAnalysisData;
    private currentView: string = 'semantic';
    private contentContainer: HTMLElement;

    constructor(app: App, analysisData: VaultAnalysisData) {
        super(app);
        this.analysisData = analysisData;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        
        // Set landscape layout dimensions
        modalEl.style.width = '90vw';
        modalEl.style.height = '80vh';
        modalEl.style.maxWidth = '900px';
        modalEl.style.maxHeight = '800px';
        
        // Create header with navigation
        this.createHeader(contentEl);
        
        // Create main content container
        this.contentContainer = contentEl.createEl('div', { 
            cls: 'vault-analysis-content-container' 
        });
        
        // Load initial view
        this.loadView('semantic');
    }

    private createHeader(container: HTMLElement): void {
        const headerContainer = container.createEl('div', { 
            cls: 'vault-analysis-header' 
        });
        
        // Title
        headerContainer.createEl('h2', { 
            text: 'Vault Analysis',
            cls: 'vault-analysis-main-title'
        });
        
        // Navigation tabs
        const navContainer = headerContainer.createEl('div', { 
            cls: 'vault-analysis-nav' 
        });
        
        const tabs = [
            { id: 'semantic', label: 'Semantic Analysis', icon: 'search' },
            { id: 'structure', label: 'Knowledge Structure', icon: 'git-branch' },
            { id: 'evolution', label: 'Knowledge Evolution', icon: 'trending-up' },
            { id: 'actions', label: 'Recommended Actions', icon: 'lightbulb' }
        ];
        
        tabs.forEach(tab => {
            const tabButton = navContainer.createEl('button', {
                cls: `vault-analysis-tab${this.currentView === tab.id ? ' active' : ''}`,
                text: tab.label
            });
            
            // Add icon
            const icon = tabButton.createEl('span', { cls: 'tab-icon' });
            setIcon(icon, tab.icon);
            tabButton.prepend(icon);
            
            tabButton.addEventListener('click', () => {
                this.switchView(tab.id);
            });
        });
    }

    private switchView(viewId: string): void {
        this.currentView = viewId;
        
        // Update active tab
        const tabs = this.contentEl.querySelectorAll('.vault-analysis-tab');
        tabs.forEach(tab => {
            tab.removeClass('active');
        });
        const activeTab = this.contentEl.querySelector(`.vault-analysis-tab:nth-child(${['semantic', 'structure', 'evolution', 'actions'].indexOf(viewId) + 1})`);
        if (activeTab) {
            activeTab.addClass('active');
        }
        
        // Load new view content
        this.loadView(viewId);
    }

    private loadView(viewId: string): void {
        this.contentContainer.empty();
        
        switch (viewId) {
            case 'semantic':
                this.loadSemanticAnalysisView();
                break;
            case 'structure':
                this.loadKnowledgeStructureView();
                break;
            case 'evolution':
                this.loadKnowledgeEvolutionView();
                break;
            case 'actions':
                this.loadRecommendedActionsView();
                break;
            default:
                this.loadSemanticAnalysisView();
        }
    }

    private loadSemanticAnalysisView(): void {
        // Summary section
        const summaryContainer = this.contentContainer.createEl('div', { 
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
        
        // Token usage information
        if (this.analysisData.tokenUsage && this.analysisData.tokenUsage.totalTokens > 0) {
            summaryContainer.createEl('p', {
                text: `Tokens used: ${this.analysisData.tokenUsage.totalTokens.toLocaleString()} (${this.analysisData.tokenUsage.promptTokens.toLocaleString()} input + ${this.analysisData.tokenUsage.candidatesTokens.toLocaleString()} output)`
            });
        }

        // Search functionality
        const searchContainer = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-search' 
        });
        
        const searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'Search notes by title, keywords, or domain...',
            cls: 'vault-analysis-search-input'
        });
        
        // Results container
        const resultsContainer = this.contentContainer.createEl('div', { 
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
                
                // Display dates (created and modified) on the same line
                const dateInfo = [];
                if (result.created) {
                    dateInfo.push(`Created: ${new Date(result.created).toLocaleDateString()}`);
                }
                if (result.modified) {
                    dateInfo.push(`Modified: ${new Date(result.modified).toLocaleDateString()}`);
                }
                if (dateInfo.length > 0) {
                    metaContainer.createEl('span', {
                        text: ` • ${dateInfo.join(' • ')}`,
                        cls: 'result-date'
                    });
                }
            });
        };
        
        // Initial display
        displayResults(this.analysisData.results);
        
        // Search functionality
        searchInput.addEventListener('input', (e: Event) => {
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
        const buttonContainer = this.contentContainer.createEl('div', { 
            cls: 'modal-button-container' 
        });
        
        const closeButton = buttonContainer.createEl('button', { 
            text: 'Close',
            cls: 'mod-cta'
        });
        closeButton.addEventListener('click', () => this.close());
    }

    private loadKnowledgeStructureView(): void {
        const placeholderContainer = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-placeholder' 
        });
        
        placeholderContainer.createEl('h3', {
            text: 'Knowledge Structure Analysis'
        });
        
        placeholderContainer.createEl('p', {
            text: 'This view will show the structural relationships between your notes, including:'
        });
        
        const featureList = placeholderContainer.createEl('ul');
        const features = [
            'Note clustering by knowledge domains',
            'Connection strength analysis',
            'Knowledge gaps identification',
            'Topic hierarchies and relationships'
        ];
        
        features.forEach(feature => {
            featureList.createEl('li', { text: feature });
        });
        
        placeholderContainer.createEl('p', {
            text: 'This feature is coming soon!',
            cls: 'coming-soon'
        });
    }

    private loadKnowledgeEvolutionView(): void {
        const placeholderContainer = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-placeholder' 
        });
        
        placeholderContainer.createEl('h3', {
            text: 'Knowledge Evolution Analysis'
        });
        
        placeholderContainer.createEl('p', {
            text: 'This view will track how your knowledge has evolved over time, including:'
        });
        
        const featureList = placeholderContainer.createEl('ul');
        const features = [
            'Timeline of knowledge development',
            'Topic emergence and decline patterns',
            'Note creation and modification trends',
            'Learning trajectory visualization'
        ];
        
        features.forEach(feature => {
            featureList.createEl('li', { text: feature });
        });
        
        placeholderContainer.createEl('p', {
            text: 'This feature is coming soon!',
            cls: 'coming-soon'
        });
    }

    private loadRecommendedActionsView(): void {
        const placeholderContainer = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-placeholder' 
        });
        
        placeholderContainer.createEl('h3', {
            text: 'Recommended Actions'
        });
        
        placeholderContainer.createEl('p', {
            text: 'This view will provide AI-powered recommendations for improving your vault, including:'
        });
        
        const featureList = placeholderContainer.createEl('ul');
        const features = [
            'Notes that could benefit from more connections',
            'Orphaned notes that need integration',
            'Similar notes that could be merged or linked',
            'Knowledge areas that need more development',
            'Suggested tags and organization improvements'
        ];
        
        features.forEach(feature => {
            featureList.createEl('li', { text: feature });
        });
        
        placeholderContainer.createEl('p', {
            text: 'This feature is coming soon!',
            cls: 'coming-soon'
        });
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