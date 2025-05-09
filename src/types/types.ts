import * as d3 from 'd3';

// Plugin interface
export interface IGraphAnalysisPlugin {
    ensureWasmLoaded(): Promise<void>;
    buildGraphFromVault(): Promise<GraphData>;
    getNodeNeighborsCached(nodeId: number): GraphNeighborsResult;
    calculateDegreeCentralityCached(): Node[];
    calculateEigenvectorCentralityCached(): Node[];
    calculateBetweennessCentralityCached(): Node[];
    calculateClosenessCentralityCached(): Node[];
    getGraphMetadata(): GraphMetadata;
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
    resultLimit: 30
};

// Core Graph Data structure (matches Rust GraphData)
export interface GraphData {
    nodes: string[];
    edges: [number, number][];
}

// Centrality scores for a node (matches Rust CentralityScores)
export interface CentralityScores {
    degree?: number;
    eigenvector?: number;
    betweenness?: number;
    closeness?: number;
}

// Node with all properties (matches Rust Node)
export interface Node {
    node_id: number;
    node_name: string;
    centrality: CentralityScores;
}

// Neighbor query result (matches Rust GraphNeighborsResult)
export interface GraphNeighborsResult {
    node_id: number;
    node_name: string;
    neighbors: Node[];
}

// Graph metadata (matches Rust GraphMetadata)
export interface GraphMetadata {
    node_count: number;
    edge_count: number;
    max_degree: number;
    avg_degree: number;
    is_directed: boolean;
}

// D3 graph node (for visualization components)
export interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    name: string;
    path?: string;
    centralityScore?: number;
}

// D3 graph link (for visualization components)
export interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
    source: string;
    target: string;
}

// Extended D3 Node for simulation with additional visualization properties
export interface SimulationGraphNode extends GraphNode {
    path: string; // Required in simulation (optional in base GraphNode)
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

