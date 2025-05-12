use rustworkx_core::petgraph::graph::UnGraph;
use once_cell::sync::Lazy;
use std::sync::Mutex;
// use std::sync::Mutex;
// use std::collections::HashMap;

use crate::models::{GraphData, VaultData};

// Graph manager to store the graph in memory
#[derive(Debug)]
pub struct GraphManager {
    pub graph: UnGraph<String, ()>,
    pub node_names: Vec<String>,
}

// Static reference to store the graph manager
pub static GRAPH_MANAGER: Lazy<Mutex<Option<GraphManager>>> = Lazy::new(|| Mutex::new(None));

impl GraphManager {
    /// Create a new empty graph manager
    pub fn new() -> Self {
        Self {
            graph: UnGraph::<String, ()>::new_undirected(),
            node_names: Vec::new(),
        }
    }

    /// Create a graph manager with pre-allocated capacity
    fn with_capacity(node_capacity: usize, edge_capacity: usize) -> Self {
        Self {
            graph: UnGraph::<String, ()>::with_capacity(node_capacity, edge_capacity),
            node_names: Vec::with_capacity(node_capacity),
        }
    }

    /// Create a graph manager from GraphData
    pub fn from_graph_data(data: &GraphData) -> Self {
        let mut manager = Self::with_capacity(data.nodes.len(), data.edges.len());
        
        // Add all nodes first
        for node_name in &data.nodes {
            manager.add_node(node_name.clone());
        }
        
        // Add all edges - edges are already deduplicated in TypeScript
        for (source, target) in &data.edges {
            if *source < manager.node_names.len() && *target < manager.node_names.len() {
                // Using unwrap is safe here because we just checked the indices
                if let Err(e) = manager.add_edge(*source, *target) {
                    // Log the error but continue
                    eprintln!("Error adding edge ({}, {}): {}", source, target, e);
                }
            }
        }
        
        manager
    }
    
    /// Create a graph manager from vault data
    fn from_vault_files(vault_data: &VaultData) -> Result<Self, String> {
        let mut manager = Self::with_capacity(vault_data.notes.len(), vault_data.links.len());
        
        // Add all nodes first
        for note in &vault_data.notes {
            manager.add_node(note.id.clone());
        }
        
        // Add all edges
        for (source, target) in &vault_data.links {
            if let Err(e) = manager.add_edge(*source, *target) {
                // Log the error but continue processing other edges
                eprintln!("Error adding edge ({}, {}): {}", source, target, e);
            }
        }
        
        Ok(manager)
    }

    /// Convert manager back to GraphData for serialization
    pub fn to_graph_data(&self) -> GraphData {
        let edges = self.graph.edge_indices()
            .filter_map(|edge_idx| {
                if let Some((source, target)) = self.graph.edge_endpoints(edge_idx) {
                    // Convert NodeIndex to our linear indices
                    let source_pos = self.graph.node_indices().position(|idx| idx == source);
                    let target_pos = self.graph.node_indices().position(|idx| idx == target);
                    
                    if let (Some(s), Some(t)) = (source_pos, target_pos) {
                        // For undirected graph, always return edge with smaller index first
                        if s <= t {
                            Some((s, t))
                        } else {
                            Some((t, s))
                        }
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect();
            
        GraphData {
            nodes: self.node_names.clone(),
            edges,
        }
    }

    // Graph manipulation functions
    
    /// Add a node to the graph and return its index
    pub fn add_node(&mut self, name: String) -> usize {
        self.graph.add_node(name.clone());
        let index = self.node_names.len();
        self.node_names.push(name);
        index
    }
    
    /// Remove a node by its index
    pub fn remove_node(&mut self, index: usize) -> Result<(), String> {
        if index >= self.node_names.len() {
            return Err(format!("Invalid node index: {}", index));
        }
        
        // Get node index in graph
        let node_idx = match self.graph.node_indices().nth(index) {
            Some(idx) => idx,
            None => return Err(format!("Node index {} not found in graph", index))
        };
        
        // Remove from graph
        self.graph.remove_node(node_idx);
        
        // Remove from node_names
        self.node_names.remove(index);
        
        Ok(())
    }
    
    /// Add an edge between two nodes by their indices
    pub fn add_edge(&mut self, source: usize, target: usize) -> Result<(), String> {
        if source >= self.node_names.len() {
            return Err(format!("Invalid source index: {}", source));
        }
        if target >= self.node_names.len() {
            return Err(format!("Invalid target index: {}", target));
        }
        
        // Get graph indices
        let source_idx = match self.graph.node_indices().nth(source) {
            Some(idx) => idx,
            None => return Err(format!("Source node index {} not found in graph", source))
        };
        
        let target_idx = match self.graph.node_indices().nth(target) {
            Some(idx) => idx,
            None => return Err(format!("Target node index {} not found in graph", target))
        };
        
        // Add edge to graph
        self.graph.add_edge(source_idx, target_idx, ());
        
        Ok(())
    }
    
    /// Remove an edge between two nodes by their indices
    pub fn remove_edge(&mut self, source: usize, target: usize) -> Result<(), String> {
        if source >= self.node_names.len() {
            return Err(format!("Invalid source index: {}", source));
        }
        if target >= self.node_names.len() {
            return Err(format!("Invalid target index: {}", target));
        }
        
        // Get graph indices
        let source_idx = match self.graph.node_indices().nth(source) {
            Some(idx) => idx,
            None => return Err(format!("Source node index {} not found in graph", source))
        };
        
        let target_idx = match self.graph.node_indices().nth(target) {
            Some(idx) => idx,
            None => return Err(format!("Target node index {} not found in graph", target))
        };
        
        // Find and remove the edge
        if let Some(edge_idx) = self.graph.find_edge(source_idx, target_idx) {
            self.graph.remove_edge(edge_idx);
            Ok(())
        } else {
            Err(format!("No edge found between nodes {} and {}", source, target))
        }
    }

    /// Get a clone of the internal graph
    pub fn get_graph(&self) -> UnGraph<String, ()> {
        self.graph.clone()
    }
    
    /// Helper method to check if global graph is initialized
    fn check_initialized() -> Result<(), String> {
        if GRAPH_MANAGER.lock().unwrap().is_none() {
            return Err("Graph not initialized. Call initialize_graph first.".to_string());
        }
        Ok(())
    }
    
    /// Initialize the global graph from vault data
    fn initialize_from_vault(vault_data: &VaultData) -> Result<(), String> {
        let manager = Self::from_vault_files(vault_data)?;
        
        // Update global manager
        *GRAPH_MANAGER.lock().unwrap() = Some(manager);
        
        Ok(())
    }
    
    /// Clear the global graph instance
    fn clear() {
        let mut graph_manager = GRAPH_MANAGER.lock().unwrap();
        *graph_manager = None;
    }
}

// Helper function to check if graph is initialized
pub fn check_graph_initialized() -> Result<(), String> {
    GraphManager::check_initialized()
}

// Initialize the graph from vault data
pub fn initialize_from_vault(vault_data: &VaultData) -> Result<(), String> {
    GraphManager::initialize_from_vault(vault_data)
}

// Clear the global graph instance
pub fn clear() {
    GraphManager::clear();
} 

