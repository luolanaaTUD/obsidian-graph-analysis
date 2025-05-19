use serde::{Deserialize, Serialize};

/// Represents the core graph data structure used for initialization.
/// This structure is kept simple to allow for easy serialization/deserialization
/// between JavaScript and Rust.
#[derive(Serialize, Deserialize, Debug)]
pub struct GraphData {
    pub nodes: Vec<String>,
    pub edges: Vec<(usize, usize)>,
}

/// Centrality scores for a node. 
/// Contains all supported centrality metrics in a single structure.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct CentralityScores {
    pub degree: Option<f64>,
    pub eigenvector: Option<f64>,
    pub betweenness: Option<f64>,
    pub closeness: Option<f64>,
}

/// Represents a node with all its properties including centrality scores.
/// Contains fundamental node properties and centrality metrics.
///
/// # Properties
/// * `node_id` - Unique identifier for the node, corresponds to its index in the graph
/// * `node_name` - Display name of the node, typically derived from the file name
/// * Centrality scores - Various centrality metrics stored as optional values
#[derive(Serialize, Deserialize, Debug)]
pub struct Node {
    pub node_id: usize,
    pub node_name: String,
    pub centrality: CentralityScores,
}

/// Result structure for neighbor queries, containing both the queried node
/// and its neighbors.
///
/// # Properties
/// * `node_id` - ID of the node whose neighbors were queried
/// * `node_name` - Name of the node whose neighbors were queried
/// * `neighbors` - List of neighboring nodes
#[derive(Serialize, Deserialize, Debug)]
pub struct GraphNeighborsResult {
    pub node_id: usize,
    pub node_name: String,
    pub neighbors: Vec<Node>,
}

/// Represents a note in the vault with its connections
/// Since link detection is handled by Obsidian, we only need the note identifier
#[derive(Serialize, Deserialize, Debug)]
pub struct VaultNote {
    pub id: String,
}

/// Data structure for transferring vault graph information from TypeScript to Rust
/// Contains both notes and their connections as detected by Obsidian
#[derive(Serialize, Deserialize, Debug)]
pub struct VaultData {
    pub notes: Vec<VaultNote>,
    pub links: Vec<(usize, usize)>,  // Pairs of note indices representing connections
}

// Error type for graph analysis operations
#[derive(Serialize, Deserialize, Debug)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GraphMetadata {
    pub node_count: usize,
    pub edge_count: usize,
    pub max_degree: usize,
    pub avg_degree: f64,
    pub is_directed: bool,
} 