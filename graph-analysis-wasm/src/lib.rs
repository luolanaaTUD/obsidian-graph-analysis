mod utils;

use wasm_bindgen::prelude::*;
use petgraph::graph::DiGraph;
use petgraph::visit::EdgeRef;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use lazy_static::lazy_static;
use std::sync::Mutex;

// Graph manager to store the graph in memory
struct GraphManager {
    graph: DiGraph<String, ()>,
    node_names: Vec<String>,
}

// Static mutex to store the graph manager
lazy_static! {
    static ref GRAPH_MANAGER: Mutex<Option<GraphManager>> = Mutex::new(None);
}

// Helper function to check if graph is initialized
fn check_graph_initialized() -> Result<(), String> {
    let graph_manager = GRAPH_MANAGER.lock().unwrap();
    if graph_manager.is_none() {
        return Err("Graph not initialized. Call initialize_graph first.".to_string());
    }
    Ok(())
}

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

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
#[derive(Serialize, Deserialize, Clone)]
pub struct BaseNode {
    node_id: usize,
    node_name: String,
}

/// Represents the core graph data structure used for initialization.
/// This structure is kept simple to allow for easy serialization/deserialization
/// between JavaScript and Rust.
#[derive(Serialize, Deserialize)]
pub struct GraphData {
    nodes: Vec<String>,
    edges: Vec<(usize, usize)>,
}

/// Represents the result of centrality calculations for a node.
/// Uses BaseNode for common properties and adds a score field.
///
/// # Properties
/// * `base` - Common node properties (id and name)
/// * `score` - The calculated centrality score for this node
#[derive(Serialize, Deserialize)]
pub struct CentralityResult {
    #[serde(flatten)]
    base: BaseNode,
    score: f64,
}

/// Information about a neighboring node in the graph.
/// Uses BaseNode to maintain consistency in node representation.
#[derive(Serialize)]
pub struct NeighborInfo {
    #[serde(flatten)]
    base: BaseNode,
}

/// Result structure for neighbor queries, containing both the queried node
/// and its neighbors.
///
/// # Properties
/// * `base` - Information about the node whose neighbors were queried
/// * `neighbors` - List of neighboring nodes
#[derive(Serialize)]
pub struct GraphNeighborsResult {
    #[serde(flatten)]
    base: BaseNode,
    neighbors: Vec<NeighborInfo>,
}

/// Represents a node in a path through the graph.
/// Used in path-finding results to maintain consistent node representation.
#[derive(Serialize)]
pub struct PathNode {
    #[serde(flatten)]
    base: BaseNode,
}

#[derive(Serialize, Deserialize)]
pub struct VaultFile {
    path: String,
    content: String,
}

#[derive(Serialize, Deserialize)]
pub struct VaultData {
    files: Vec<VaultFile>,
}

// Error type for graph analysis operations
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

// Helper function to build the graph from input data
fn build_graph(graph_data: &GraphData) -> DiGraph<String, ()> {
    let mut graph = DiGraph::<String, ()>::new();
    
    // Add nodes to the graph
    let mut node_indices = Vec::new();
    for node_name in &graph_data.nodes {
        let node_idx = graph.add_node(node_name.clone());
        node_indices.push(node_idx);
    }
    
    // Add edges to the graph
    for (source, target) in &graph_data.edges {
        if *source < node_indices.len() && *target < node_indices.len() {
            graph.add_edge(node_indices[*source], node_indices[*target], ());
        }
    }
    
    graph
}

// Helper function to sort and format results
fn format_results(results: Vec<CentralityResult>) -> String {
    // Sort results by score in descending order
    let mut sorted_results = results;
    sorted_results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    
    // Convert results to JSON
    match serde_json::to_string(&sorted_results) {
        Ok(json) => json,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to serialize results: {}", e) };
            serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string())
        }
    }
}

// Function to initialize the graph in memory
#[wasm_bindgen]
pub fn initialize_graph(graph_data_json: &str) -> String {
    utils::set_panic_hook();
    
    // Parse the input JSON
    let graph_data: GraphData = match serde_json::from_str(graph_data_json) {
        Ok(data) => data,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to parse graph data: {}", e) };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
        }
    };
    
    // Build the graph
    let graph = build_graph(&graph_data);
    
    // Store the graph and node names in the manager
    let manager = GraphManager {
        graph,
        node_names: graph_data.nodes.clone(),
    };
    
    // Store in global state
    let mut graph_manager = GRAPH_MANAGER.lock().unwrap();
    *graph_manager = Some(manager);
    
    // Return success message
    let result = serde_json::json!({
        "status": "success",
        "node_count": graph_data.nodes.len(),
        "edge_count": graph_data.edges.len()
    });
    
    serde_json::to_string(&result).unwrap_or_else(|_| r#"{"status":"error","message":"Failed to serialize status"}"#.to_string())
}

// Function to clear the graph from memory
#[wasm_bindgen]
pub fn clear_graph() -> String {
    let mut graph_manager = GRAPH_MANAGER.lock().unwrap();
    *graph_manager = None;
    
    let result = serde_json::json!({
        "status": "success",
        "message": "Graph cleared from memory"
    });
    
    serde_json::to_string(&result).unwrap_or_else(|_| r#"{"status":"error","message":"Failed to serialize status"}"#.to_string())
}

#[derive(Serialize)]
pub struct GraphMetadata {
    node_count: usize,
    edge_count: usize,
    max_degree: usize,
    avg_degree: f64,
    is_directed: bool,
}

// Function to get node neighbors from the cached graph
#[wasm_bindgen]
pub fn get_node_neighbors_cached(node_id: usize) -> String {
    utils::set_panic_hook();
    
    // Check if graph is initialized
    if let Err(error_msg) = check_graph_initialized() {
        let error = ErrorResponse { error: error_msg };
        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
    }
    
    // Get access to the graph
    let graph_manager = GRAPH_MANAGER.lock().unwrap();
    let manager = graph_manager.as_ref().unwrap();
    
    // Error handling for invalid node ID
    if node_id >= manager.graph.node_count() {
        let error = ErrorResponse { error: format!("Invalid node ID: {}", node_id) };
        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
    }
    
    // Get node index
    let node_idx = manager.graph.node_indices().nth(node_id).unwrap();
    
    let mut neighbors = Vec::new();
    
    // Add outgoing neighbors
    for edge in manager.graph.edges_directed(node_idx, petgraph::Direction::Outgoing) {
        let target_idx = manager.graph.node_indices().position(|id| id == edge.target()).unwrap();
        neighbors.push(target_idx);
    }
    
    // Add incoming neighbors
    for edge in manager.graph.edges_directed(node_idx, petgraph::Direction::Incoming) {
        let source_idx = manager.graph.node_indices().position(|id| id == edge.source()).unwrap();
        neighbors.push(source_idx);
    }
    
    // Remove duplicates
    neighbors.sort();
    neighbors.dedup();
    
    // Create base node for current node
    let base = BaseNode {
        node_id,
        node_name: manager.node_names[node_id].clone(),
    };
    
    // Convert neighbor indices to neighbor info objects
    let neighbor_infos: Vec<NeighborInfo> = neighbors.iter()
        .map(|&idx| NeighborInfo {
            base: BaseNode {
                node_id: idx,
                node_name: manager.node_names[idx].clone(),
            }
        })
        .collect();
    
    // Create result
    let result = GraphNeighborsResult {
        base,
        neighbors: neighbor_infos,
    };
    
    // Serialize
    match serde_json::to_string(&result) {
        Ok(json) => json,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to serialize neighbors: {}", e) };
            serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string())
        }
    }
}

// Function to calculate degree centrality using the cached graph
#[wasm_bindgen]
pub fn calculate_degree_centrality_cached() -> String {
    utils::set_panic_hook();
    
    // Check if graph is initialized
    if let Err(error_msg) = check_graph_initialized() {
        let error = ErrorResponse { error: error_msg };
        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
    }
    
    // Get access to the graph
    let graph_manager = GRAPH_MANAGER.lock().unwrap();
    let manager = graph_manager.as_ref().unwrap();
    
    // Calculate degree centrality using the stored graph
    let mut results = Vec::with_capacity(manager.node_names.len());
    let node_count = manager.node_names.len();
    let normalization_factor = if node_count > 1 { (node_count - 1) as f64 } else { 1.0 };
    
    for (i, node_name) in manager.node_names.iter().enumerate() {
        let node_idx = manager.graph.node_indices().nth(i).unwrap();
        
        // Count outgoing edges (out-degree)
        let out_degree = manager.graph.edges_directed(node_idx, petgraph::Direction::Outgoing).count() as f64;
        
        // Count incoming edges (in-degree)
        let in_degree = manager.graph.edges_directed(node_idx, petgraph::Direction::Incoming).count() as f64;
        
        // Total degree (sum of in-degree and out-degree)
        let total_degree = out_degree + in_degree;
        
        // Normalize by the maximum possible degree
        let normalized_degree = total_degree / normalization_factor;
        
        results.push(CentralityResult {
            base: BaseNode {
                node_id: i,
                node_name: node_name.clone(),
            },
            score: normalized_degree,
        });
    }
    
    format_results(results)
}

// Function to get metadata about the cached graph
#[wasm_bindgen]
pub fn get_graph_metadata() -> String {
    utils::set_panic_hook();
    
    // Check if graph is initialized
    if let Err(error_msg) = check_graph_initialized() {
        let error = ErrorResponse { error: error_msg };
        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
    }
    
    // Get graph info
    let graph_manager = GRAPH_MANAGER.lock().unwrap();
    let manager = graph_manager.as_ref().unwrap();
    
    let node_count = manager.graph.node_count();
    let edge_count = manager.graph.edge_count();
    
    // Calculate basic stats
    let mut max_degree = 0;
    let mut total_degree = 0;
    
    for node_idx in manager.graph.node_indices() {
        let out_degree = manager.graph.edges_directed(node_idx, petgraph::Direction::Outgoing).count();
        let in_degree = manager.graph.edges_directed(node_idx, petgraph::Direction::Incoming).count();
        let degree = out_degree + in_degree;
        
        max_degree = std::cmp::max(max_degree, degree);
        total_degree += degree;
    }
    
    let avg_degree = if node_count > 0 { total_degree as f64 / node_count as f64 } else { 0.0 };
    
    // Create metadata object
    
    let metadata = GraphMetadata {
        node_count,
        edge_count,
        max_degree,
        avg_degree,
        is_directed: true, // DiGraph is always directed
    };
    
    // Serialize
    match serde_json::to_string(&metadata) {
        Ok(json) => json,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to serialize metadata: {}", e) };
            serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string())
        }
    }
}

// Function to find shortest path between two nodes using the cached graph
#[wasm_bindgen]
pub fn find_shortest_path_cached(source_id: usize, target_id: usize) -> String {
    utils::set_panic_hook();
    
    // Check if graph is initialized
    if let Err(error_msg) = check_graph_initialized() {
        let error = ErrorResponse { error: error_msg };
        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
    }
    
    // Get access to the graph
    let graph_manager = GRAPH_MANAGER.lock().unwrap();
    let manager = graph_manager.as_ref().unwrap();
    
    // Error handling for invalid node IDs
    if source_id >= manager.graph.node_count() || target_id >= manager.graph.node_count() {
        let error = ErrorResponse { error: format!("Invalid node ID(s): source={}, target={}", source_id, target_id) };
        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
    }
    
    // Get node indices
    let source_idx = manager.graph.node_indices().nth(source_id).unwrap();
    let target_idx = manager.graph.node_indices().nth(target_id).unwrap();
    
    // BFS to find shortest path
    let mut queue = std::collections::VecDeque::new();
    let mut visited = std::collections::HashMap::new();
    
    // Initialize with source node
    queue.push_back(source_idx);
    visited.insert(source_idx, None); // No predecessor for source
    
    let mut found_path = false;
    
    // BFS loop
    while let Some(current) = queue.pop_front() {
        // Check if we reached the target
        if current == target_idx {
            found_path = true;
            break;
        }
        
        // Check all neighbors
        for edge in manager.graph.edges_directed(current, petgraph::Direction::Outgoing) {
            let neighbor = edge.target();
            if !visited.contains_key(&neighbor) {
                visited.insert(neighbor, Some(current));
                queue.push_back(neighbor);
            }
        }
        
        // For incoming edges (treating the graph as undirected for path finding)
        for edge in manager.graph.edges_directed(current, petgraph::Direction::Incoming) {
            let neighbor = edge.source();
            if !visited.contains_key(&neighbor) {
                visited.insert(neighbor, Some(current));
                queue.push_back(neighbor);
            }
        }
    }
    
    // Reconstruct path if found
    if !found_path {
        return serde_json::to_string(&Vec::<usize>::new()).unwrap_or_else(|_| "[]".to_string());
    }
    
    // Backtrack from target to source
    let mut path = Vec::new();
    let mut current = target_idx;
    
    // Convert node indices to node IDs for the result
    let node_id_map: std::collections::HashMap<_, _> = manager.graph.node_indices()
        .enumerate()
        .map(|(id, idx)| (idx, id))
        .collect();
    
    // Add target to path
    path.push(node_id_map[&current]);
    
    // Follow predecessors back to source
    while let Some(pred) = visited[&current] {
        current = pred;
        path.push(node_id_map[&current]);
        if current == source_idx {
            break;
        }
    }
    
    // Reverse path to get source -> target order
    path.reverse();
    
    // Create a more informative result with node names
    let path_with_names: Vec<PathNode> = path.iter()
        .map(|&id| PathNode {
            base: BaseNode {
                node_id: id,
                node_name: manager.node_names[id].clone(),
            },
        })
        .collect();
    
    // Serialize the result
    match serde_json::to_string(&path_with_names) {
        Ok(json) => json,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to serialize path: {}", e) };
            serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string())
        }
    }
}

// ----- The legacy API functions below are kept for backward compatibility -----

#[wasm_bindgen]
pub fn calculate_degree_centrality(graph_data_json: &str) -> String {
    utils::set_panic_hook();
    
    // Parse the input JSON
    let graph_data: GraphData = match serde_json::from_str(graph_data_json) {
        Ok(data) => data,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to parse graph data: {}", e) };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
        }
    };
    
    // Try to initialize the cached graph first
    if initialize_graph(graph_data_json).contains("success") {
        return calculate_degree_centrality_cached();
    }
    
    // Fallback to old implementation if caching fails
    let graph = build_graph(&graph_data);
    
    // Calculate degree centrality
    let mut results = Vec::with_capacity(graph_data.nodes.len());
    let node_count = graph_data.nodes.len();
    let normalization_factor = if node_count > 1 { (node_count - 1) as f64 } else { 1.0 };
    
    for (i, node_name) in graph_data.nodes.iter().enumerate() {
        let node_idx = graph.node_indices().nth(i).unwrap();
        
        // Count outgoing edges (out-degree)
        let out_degree = graph.edges_directed(node_idx, petgraph::Direction::Outgoing).count() as f64;
        
        // Count incoming edges (in-degree)
        let in_degree = graph.edges_directed(node_idx, petgraph::Direction::Incoming).count() as f64;
        
        // Total degree (sum of in-degree and out-degree)
        let total_degree = out_degree + in_degree;
        
        // Normalize by the maximum possible degree (n-1 where n is the number of nodes)
        let normalized_degree = total_degree / normalization_factor;
        
        results.push(CentralityResult {
            base: BaseNode {
                node_id: i,
                node_name: node_name.clone(),
            },
            score: normalized_degree,
        });
    }
    
    format_results(results)
}

// Build a graph from vault data (files and their content)
#[wasm_bindgen]
pub fn build_graph_from_vault(vault_data_json: &str) -> String {
    utils::set_panic_hook();
    
    // Parse the input JSON
    let vault_data: VaultData = match serde_json::from_str(vault_data_json) {
        Ok(data) => data,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to parse vault data: {}", e) };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
        }
    };
    
    // Extract files and create nodes
    let files = &vault_data.files;
    let mut nodes: Vec<String> = Vec::with_capacity(files.len());
    let mut node_map: HashMap<String, usize> = HashMap::with_capacity(files.len());
    let mut edges: Vec<(usize, usize)> = Vec::new();
    
    // Create nodes
    for file in files {
        let node_id = nodes.len();
        nodes.push(file.path.clone());
        node_map.insert(file.path.clone(), node_id);
    }
    
    // Extract links and create edges
    for file in files {
        let source_id = *node_map.get(&file.path).unwrap();
        
        // Use regex to extract Obsidian links [[...]]
        let link_regex = regex::Regex::new(r"\[\[([^\]]+?)\]\]").unwrap();
        
        for capture in link_regex.captures_iter(&file.content) {
            let mut link_path = capture.get(1).unwrap().as_str().to_string();
            
            // Handle aliases in links
            if link_path.contains('|') {
                link_path = link_path.split('|').next().unwrap().to_string();
            }
            
            // Try to resolve the link to a file
            // This is simplified - in the real implementation we'd need to
            // resolve paths fully like Obsidian does
            
            // Try exact path match
            if node_map.contains_key(&link_path) {
                let target_id = *node_map.get(&link_path).unwrap();
                edges.push((source_id, target_id));
            } 
            // Try with .md extension
            else if node_map.contains_key(&format!("{}.md", link_path)) {
                let target_id = *node_map.get(&format!("{}.md", link_path)).unwrap();
                edges.push((source_id, target_id));
            }
            // Try other path resolution approaches here
        }
    }
    
    // Create the graph data structure
    let graph_data = GraphData { nodes, edges };
    
    // Initialize the cached graph with this data
    initialize_graph(&serde_json::to_string(&graph_data).unwrap_or_default());
    
    // Convert to JSON
    match serde_json::to_string(&graph_data) {
        Ok(json) => json,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to serialize graph data: {}", e) };
            serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string())
        }
    }
}

#[wasm_bindgen]
pub fn greet() {
    alert("Hello, graph-analysis-wasm!");
}

// External function to show alerts (for debugging)
#[wasm_bindgen]
extern {
    fn alert(s: &str);
}
