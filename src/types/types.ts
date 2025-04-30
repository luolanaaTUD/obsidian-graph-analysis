import { App, TFile } from 'obsidian';
import * as d3 from 'd3';

// Plugin interface
export interface IGraphAnalysisPlugin {
    ensureWasmLoaded(): Promise<void>;
    initializeGraphAndCalculateCentrality(): Promise<GraphInitializationResult>;
    getNodeNeighborsCached(nodeId: number): any;
    initializeGraphCache(graphData: string): any;
    clearGraphCache(): void;
}

// Plugin Settings
export interface GraphAnalysisSettings {
    excludeFolders: string[];
    excludeTags: string[];
    resultLimit: number;
}

export const DEFAULT_SETTINGS: GraphAnalysisSettings = {
    excludeFolders: [],
    excludeTags: [],
    resultLimit: 10
};

// Graph Types
export interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    name: string;
    path?: string;
    centralityScore?: number;
    degree?: number;
}

export interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
    source: string;
    target: string;
}

export interface GraphData {
    nodes: string[];
    edges: [number, number][];
}

export interface CentralityResult {
    node_id: number;
    node_name: string;
    score: number;
}

export interface GraphInitializationResult {
    graphData: GraphData;
    degreeCentrality: CentralityResult[];
}

// Extended Graph Types for D3 Simulation
export interface SimulationGraphNode extends d3.SimulationNodeDatum {
    id: string;
    name: string;
    path: string;
    degreeCentrality: number;
    highlighted?: boolean;
    dimmed?: boolean;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;
}

export interface SimulationGraphLink {
    source: string | SimulationGraphNode;
    target: string | SimulationGraphNode;
}

// Cache Types
export interface NodeNeighborsCache {
    nodeId: number;
    neighbors: Set<number>;
    timestamp?: number;
}