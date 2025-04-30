use serde::{Deserialize, Serialize};

/// BaseNode represents the fundamental properties shared by all node types in the graph.
/// This follows the Object-Oriented principle of inheritance/composition where common
/// properties are extracted into a base structure.
///
/// # Properties
/// * `node_id` - Unique identifier for the node, corresponds to its index in the graph
/// * `node_name` - Display name of the node, typically derived from the file name
///
/// # Usage
/// This struct is used as a base for other node-related structures through composition.
/// The `#[serde(flatten)]` attribute is used to maintain a flat JSON structure while
/// allowing for better code organization.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BaseNode {
    pub node_id: usize,
    pub node_name: String,
}

/// Represents the core graph data structure used for initialization.
/// This structure is kept simple to allow for easy serialization/deserialization
/// between JavaScript and Rust.
#[derive(Serialize, Deserialize, Debug)]
pub struct GraphData {
    pub nodes: Vec<String>,
    pub edges: Vec<(usize, usize)>,
}

/// Represents the result of centrality calculations for a node.
/// Uses BaseNode for common properties and adds a score field.
///
/// # Properties
/// * `base` - Common node properties (id and name)
/// * `score` - The calculated centrality score for this node
#[derive(Serialize, Deserialize, Debug)]
pub struct CentralityResult {
    #[serde(flatten)]
    pub base: BaseNode,
    pub score: f64,
}

/// Information about a neighboring node in the graph.
/// Uses BaseNode to maintain consistency in node representation.
#[derive(Serialize, Deserialize, Debug)]
pub struct NeighborInfo {
    #[serde(flatten)]
    pub base: BaseNode,
}

/// Result structure for neighbor queries, containing both the queried node
/// and its neighbors.
///
/// # Properties
/// * `base` - Information about the node whose neighbors were queried
/// * `neighbors` - List of neighboring nodes
#[derive(Serialize, Deserialize, Debug)]
pub struct GraphNeighborsResult {
    #[serde(flatten)]
    pub base: BaseNode,
    pub neighbors: Vec<NeighborInfo>,
}

/// Represents a node in a path through the graph.
/// Used in path-finding results to maintain consistent node representation.
#[derive(Serialize, Deserialize, Debug)]
pub struct PathNode {
    #[serde(flatten)]
    pub base: BaseNode,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct VaultFile {
    pub path: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct VaultData {
    pub files: Vec<VaultFile>,
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