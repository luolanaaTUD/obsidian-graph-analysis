import { App } from 'obsidian';
import { GraphAnalysisSettings } from '../types/types';
import { VaultAnalysisData } from './KnowledgeEvolutionAnalysisManager';

export interface KnowledgeCluster {
    id: string;
    name: string;
    notes: string[];
    keywords: string[];
    centroid: string;
    size: number;
}

export interface ConnectionStrength {
    sourceNote: string;
    targetNote: string;
    strength: number;
    sharedKeywords: string[];
    sharedDomains: string[];
}

export interface KnowledgeGap {
    id: string;
    description: string;
    suggestedTopics: string[];
    relatedNotes: string[];
    priority: 'high' | 'medium' | 'low';
}

export interface TopicHierarchy {
    domain: string;
    subdomains: string[];
    relatedNotes: string[];
    depth: number;
}

export interface KnowledgeStructureData {
    generatedAt: string;
    sourceAnalysisId: string;
    clusters: KnowledgeCluster[];
    connections: ConnectionStrength[];
    gaps: KnowledgeGap[];
    hierarchies: TopicHierarchy[];
    metrics: {
        totalClusters: number;
        averageClusterSize: number;
        connectionDensity: number;
        knowledgeBreadth: number;
    };
}

/**
 * Manages AI-powered knowledge structure analysis.
 * Analyzes the relationships between notes, identifies clusters,
 * finds knowledge gaps, and maps topic hierarchies.
 */
export class KnowledgeStructureAnalysisManager {
    private app: App;
    private settings: GraphAnalysisSettings;

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.settings = settings;
    }

    public async generateKnowledgeStructureAnalysis(): Promise<KnowledgeStructureData> {
        // Load vault analysis data
        const vaultData = await this.loadVaultAnalysisData();
        if (!vaultData) {
            throw new Error('No vault analysis data found. Please generate vault analysis first.');
        }

        // TODO: Implement AI-powered structure analysis
        // This will analyze the semantic relationships between notes
        // and identify clusters, connections, gaps, and hierarchies

        const analysisData: KnowledgeStructureData = {
            generatedAt: new Date().toISOString(),
            sourceAnalysisId: `${vaultData.generatedAt}_${vaultData.totalFiles}`,
            clusters: [],
            connections: [],
            gaps: [],
            hierarchies: [],
            metrics: {
                totalClusters: 0,
                averageClusterSize: 0,
                connectionDensity: 0,
                knowledgeBreadth: 0
            }
        };

        // Cache the results
        await this.cacheKnowledgeStructure(analysisData);

        return analysisData;
    }

    public async loadCachedKnowledgeStructure(): Promise<KnowledgeStructureData | null> {
        try {
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/knowledge-structure.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const data = JSON.parse(content);
            
            // Validate that the cached analysis matches current semantic analysis
            const currentAnalysisData = await this.loadVaultAnalysisData();
            if (currentAnalysisData && data?.sourceAnalysisId !== `${currentAnalysisData.generatedAt}_${currentAnalysisData.totalFiles}`) {
                console.log('Cached structure analysis is outdated, will regenerate');
                return null;
            }
            
            return data;
        } catch (error) {
            return null;
        }
    }

    private async loadVaultAnalysisData(): Promise<VaultAnalysisData | null> {
        try {
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/vault-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            return JSON.parse(content);
        } catch (error) {
            return null;
        }
    }

    private async cacheKnowledgeStructure(data: KnowledgeStructureData): Promise<void> {
        try {
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/knowledge-structure.json`;
            
            // Ensure the plugin directory exists
            const pluginDir = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis`;
            try {
                await this.app.vault.adapter.mkdir(pluginDir);
            } catch {
                // Directory might already exist
            }
            
            await this.app.vault.adapter.write(filePath, JSON.stringify(data, null, 2));
            console.log('Knowledge structure analysis cached successfully');
        } catch (error) {
            console.error('Failed to cache knowledge structure analysis:', error);
        }
    }

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
    }
} 