// Knowledge Domain Helper module for all knowledge domain-related logic and types
// Modern 2-level taxonomy for knowledge domain classification

import { App } from 'obsidian';

// Knowledge Domain Template interfaces - 2-level hierarchy
export interface KnowledgeSubdivision {
    id: string;  // e.g., "1-1"
    name: string;
}

export interface KnowledgeDomain {
    id: string;  // e.g., "1"
    name: string;
    subdivisions: KnowledgeSubdivision[];
}

export interface KnowledgeDomainTemplate {
    knowledge_domains: {
        title: string;
        version: string;
        domains: KnowledgeDomain[];
    };
}

export type KnowledgeSubdivisionListItem = { 
    id: string; 
    name: string; 
    domain: string; 
    domainId: string;
};

export class KnowledgeDomainHelper {
    private static instance: KnowledgeDomainHelper | null = null;
    private domainTemplate: KnowledgeDomainTemplate | null = null;
    private domains: { [key: string]: string } = {};
    private subdivisions: { [key: string]: string } = {};
    private subdivisionsList: KnowledgeSubdivisionListItem[] = [];
    private app: App;

    private constructor(app: App) {
        this.app = app;
    }

    public static getInstance(app: App): KnowledgeDomainHelper {
        if (!KnowledgeDomainHelper.instance) {
            KnowledgeDomainHelper.instance = new KnowledgeDomainHelper(app);
        }
        return KnowledgeDomainHelper.instance;
    }

    public getAllSubdivisions(): KnowledgeSubdivisionListItem[] {
        return this.subdivisionsList;
    }

    public async loadDomainTemplate(): Promise<void> {
        if (this.domainTemplate) return;
        try {
            const templatePath = `${this.app.vault.configDir}/plugins/knowledge-graph-analysis/knowledge-domains.json`;
            let templateContent: string | null = null;
            try {
                templateContent = await this.app.vault.adapter.read(templatePath);
            } catch {
                throw new Error('Knowledge domains template not found in the plugin directory. Please ensure the knowledge-domains.json file is properly copied to the plugin directory during installation.');
            }
            if (templateContent === null) {
                throw new Error('Knowledge domains template file is empty.');
            }
            try {
                const parsed = JSON.parse(templateContent) as unknown;
                if (!parsed || typeof parsed !== 'object' || !('knowledge_domains' in parsed)) {
                    throw new Error('Knowledge domains template has invalid structure. Expected knowledge_domains.');
                }
                this.domainTemplate = parsed as KnowledgeDomainTemplate;
            } catch (parseError) {
                const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
                throw new Error(`Failed to parse knowledge domains template JSON: ${errorMessage}`);
            }
            this.domains = {};
            this.subdivisions = {};
            this.subdivisionsList = [];
            if (this.domainTemplate?.knowledge_domains?.domains) {
                this.domainTemplate.knowledge_domains.domains.forEach(domain => {
                    this.domains[domain.id] = domain.name;
                    domain.subdivisions.forEach(subdivision => {
                        this.subdivisions[subdivision.id] = subdivision.name;
                        this.subdivisionsList.push({
                            id: subdivision.id,
                            name: subdivision.name,
                            domain: domain.name,
                            domainId: domain.id
                        });
                    });
                });
            } else {
                throw new Error('Knowledge domains template has invalid structure. Expected knowledge_domains.domains array.');
            }
        } catch (error) {
            this.domainTemplate = null;
            this.domains = {};
            this.subdivisions = {};
            this.subdivisionsList = [];
            throw error;
        }
    }

    public async ensureDomainTemplateLoaded(): Promise<boolean> {
        try {
            await this.loadDomainTemplate();
            return true;
        } catch {
            // console.error('Failed to load knowledge domains template');
            return false;
        }
    }

    public getDomainTemplate(): KnowledgeDomainTemplate | null {
        return this.domainTemplate;
    }

    public isValidSubdivisionId(subdivisionId: string): boolean {
        if (this.subdivisions[subdivisionId]) return true;
        // Support format like "1-1" or just validate the pattern
        const parts = subdivisionId.split('-');
        if (parts.length === 2) {
            const domainId = parts[0];
            const subId = parts[1];
            const constructed = `${domainId}-${subId}`;
            if (this.subdivisions[constructed]) return true;
        }
        return false;
    }

    public getSubdivisionInfo(subdivisionId: string): KnowledgeSubdivisionListItem | null {
        return this.subdivisionsList.find(subdivision => subdivision.id === subdivisionId) || null;
    }

    public getSubdivisionsInDomain(domainId: string): KnowledgeSubdivisionListItem[] {
        return this.subdivisionsList.filter(subdivision => subdivision.domainId === domainId);
    }

    public getDomainCodeToNameMap(): Map<string, string> {
        const map = new Map<string, string>();
        this.subdivisionsList.forEach(subdivision => {
            map.set(subdivision.id, subdivision.name);
        });
        if (this.domainTemplate && this.domainTemplate.knowledge_domains && this.domainTemplate.knowledge_domains.domains) {
            this.domainTemplate.knowledge_domains.domains.forEach(domain => {
                map.set(domain.id, domain.name);
            });
        }
        Object.entries(this.domains).forEach(([code, name]) => {
            map.set(code, name);
        });
        Object.entries(this.subdivisions).forEach(([code, name]) => {
            map.set(code, name);
        });
        return map;
    }

    public getDomainIdFromSubdivision(subdivisionId: string): string {
        return subdivisionId.split('-')[0];
    }
}
