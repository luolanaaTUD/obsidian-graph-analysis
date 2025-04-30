use rustworkx_core::petgraph::graph::DiGraph;
use lazy_static::lazy_static;
use std::sync::Mutex;
use crate::models::GraphData;

// Graph manager to store the graph in memory
#[derive(Debug)]
pub struct GraphManager {
    pub graph: DiGraph<String, ()>,
    pub node_names: Vec<String>,
}

// Static mutex to store the graph manager
lazy_static! {
    pub static ref GRAPH_MANAGER: Mutex<Option<GraphManager>> = Mutex::new(None);
}

// Helper function to check if graph is initialized
pub fn check_graph_initialized() -> Result<(), String> {
    let graph_manager = GRAPH_MANAGER.lock().unwrap();
    if graph_manager.is_none() {
        return Err("Graph not initialized. Call initialize_graph first.".to_string());
    }
    Ok(())
}

// Helper function to build the graph from input data
pub fn build_graph(graph_data: &GraphData) -> DiGraph<String, ()> {
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