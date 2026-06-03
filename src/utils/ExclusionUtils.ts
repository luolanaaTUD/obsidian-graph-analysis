import { TFile, App, normalizePath } from 'obsidian';
import { GraphAnalysisSettings } from '../types/types';

export class ExclusionUtils {
    private app: App;
    private settings: GraphAnalysisSettings;

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.settings = settings;
    }

    /**
     * Update settings reference when settings change
     */
    updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
    }

    /**
     * Check if a file should be excluded from analysis based on folder and tag exclusion rules
     */
    isFileExcluded(file: TFile): boolean {
        // Check folder exclusions
        if (this.isFileInExcludedFolder(file)) {
            return true;
        }

        // Check tag exclusions
        if (this.hasExcludedTags(file)) {
            return true;
        }

        return false;
    }

    /**
     * Check if a file is in an excluded folder
     */
    private isFileInExcludedFolder(file: TFile): boolean {
        if (!this.settings.excludeFolders || this.settings.excludeFolders.length === 0) {
            return false;
        }

        const filePath = file.path;
        
        for (const folder of this.settings.excludeFolders) {
            if (!folder || folder.trim() === '') continue;
            
            const normalizedFolder = this.normalizeFolderPath(folder.trim());
            
            // Check if file path starts with the excluded folder path
            if (filePath.startsWith(normalizedFolder)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if a file has any excluded tags
     */
    private hasExcludedTags(file: TFile): boolean {
        if (!this.settings.excludeTags || this.settings.excludeTags.length === 0) {
            return false;
        }

        const fileTags = this.getFileTags(file);
        if (fileTags.length === 0) {
            return false;
        }

        // Check if any file tag matches any excluded tag
        for (const excludedTag of this.settings.excludeTags) {
            if (!excludedTag || excludedTag.trim() === '') continue;
            
            const normalizedExcludedTag = this.normalizeTag(excludedTag.trim());
            
            for (const fileTag of fileTags) {
                const normalizedFileTag = this.normalizeTag(fileTag);
                
                if (normalizedFileTag === normalizedExcludedTag) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Get all tags from a file (both frontmatter and inline tags)
     */
    private getFileTags(file: TFile): string[] {
        const tags: string[] = [];
        const fileCache = this.app.metadataCache.getFileCache(file);
        
        if (!fileCache) {
            return tags;
        }

        // Get tags from frontmatter
        if (fileCache.frontmatter && fileCache.frontmatter.tags) {
            const frontmatterTags = Array.isArray(fileCache.frontmatter.tags) 
                ? fileCache.frontmatter.tags 
                : [fileCache.frontmatter.tags];
            
            tags.push(...frontmatterTags.map(tag => String(tag)));
        }

        // Get inline tags from the file
        if (fileCache.tags) {
            for (const tagCache of fileCache.tags) {
                tags.push(tagCache.tag);
            }
        }

        return tags;
    }

    /**
     * Normalize folder path for consistent comparison using Obsidian's normalizePath
     */
    private normalizeFolderPath(folder: string): string {
        // Use Obsidian's normalizePath for user-defined paths (handles ., .., slashes)
        let normalized = normalizePath(folder.trim());
        // Remove leading/trailing slashes and ensure it ends with a slash for proper prefix matching
        normalized = normalized.replace(/^\/+|\/+$/g, '');
        if (normalized && !normalized.endsWith('/')) {
            normalized += '/';
        }
        return normalized;
    }

    /**
     * Normalize tag for consistent comparison
     */
    private normalizeTag(tag: string): string {
        // Remove leading # if present and convert to lowercase for case-insensitive comparison
        return tag.replace(/^#+/, '').toLowerCase().trim();
    }

    /**
     * Get a list of all excluded file paths for debugging/logging
     */
    getExcludedFiles(allFiles?: TFile[]): string[] {
        const excludedFiles: string[] = [];
        const files = allFiles ?? this.app.vault.getMarkdownFiles();

        for (const file of files) {
            if (this.isFileExcluded(file)) {
                excludedFiles.push(file.path);
            }
        }

        return excludedFiles;
    }

    /**
     * Get exclusion statistics for debugging
     */
    getExclusionStats(allFiles?: TFile[]): {
        totalFiles: number;
        excludedByFolder: number;
        excludedByTag: number;
        totalExcluded: number;
        includedFiles: number;
    } {
        const files = allFiles ?? this.app.vault.getMarkdownFiles();
        let excludedByFolder = 0;
        let excludedByTag = 0;
        let totalExcluded = 0;

        for (const file of files) {
            const isExcludedByFolder = this.isFileInExcludedFolder(file);
            const isExcludedByTag = this.hasExcludedTags(file);
            
            if (isExcludedByFolder) excludedByFolder++;
            if (isExcludedByTag) excludedByTag++;
            if (isExcludedByFolder || isExcludedByTag) totalExcluded++;
        }

        return {
            totalFiles: files.length,
            excludedByFolder,
            excludedByTag,
            totalExcluded,
            includedFiles: files.length - totalExcluded
        };
    }
} 