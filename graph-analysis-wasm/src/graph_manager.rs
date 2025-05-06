use rustworkx_core::petgraph::graph::DiGraph;
use lazy_static::lazy_static;
use std::sync::Mutex;
use std::collections::HashMap;
use regex;

use crate::models::{GraphData, VaultFile};

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

impl GraphManager {
    /// Create a new empty graph manager
    pub fn new() -> Self {
        Self {
            graph: DiGraph::<String, ()>::new(),
            node_names: Vec::new(),
        }
    }

    /// Create a graph manager with pre-allocated capacity
    pub fn with_capacity(node_capacity: usize, edge_capacity: usize) -> Self {
        Self {
            graph: DiGraph::<String, ()>::with_capacity(node_capacity, edge_capacity),
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
        
        // Add all edges
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
    
    /// Create a graph manager from vault files
    pub fn from_vault_files(files: &[VaultFile]) -> Result<Self, String> {
        let mut manager = Self::with_capacity(files.len(), files.len() * 2);
        let mut node_map = HashMap::with_capacity(files.len());
        
        // Add all nodes first and build the node map
        for file in files {
            let index = manager.add_node(file.path.clone());
            node_map.insert(file.path.clone(), index);
        }
        
        // Extract links and add edges
        match regex::Regex::new(r"\[\[([^]]+?)]]") {
            Ok(link_regex) => {
                for file in files {
                    if let Some(&source_id) = node_map.get(&file.path) {
                        for capture in link_regex.captures_iter(&file.content) {
                            if let Some(link_match) = capture.get(1) {
                                let mut link_path = link_match.as_str().to_string();
                                
                                // Handle aliases in links
                                if link_path.contains('|') {
                                    link_path = link_path.split('|').next().unwrap().to_string();
                                }
                                
                                // Try to resolve the link to a file
                                if let Some(&target_id) = node_map.get(&link_path) {
                                    let _ = manager.add_edge(source_id, target_id);
                                } 
                                // Try with .md extension
                                else if let Some(&target_id) = node_map.get(&format!("{}.md", link_path)) {
                                    let _ = manager.add_edge(source_id, target_id);
                                }
                            }
                        }
                    }
                }
                Ok(manager)
            },
            Err(e) => Err(format!("Failed to compile link regex: {}", e))
        }
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
                        Some((s, t))
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
        
        // Get node index in DiGraph
        let node_idx = match self.graph.node_indices().nth(index) {
            Some(idx) => idx,
            None => return Err(format!("Node index {} not found in graph", index))
        };
        
        // Remove from DiGraph
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
        
        // Get DiGraph indices
        let source_idx = match self.graph.node_indices().nth(source) {
            Some(idx) => idx,
            None => return Err(format!("Source node index {} not found in graph", source))
        };
        
        let target_idx = match self.graph.node_indices().nth(target) {
            Some(idx) => idx,
            None => return Err(format!("Target node index {} not found in graph", target))
        };
        
        // Add edge to DiGraph
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
        
        // Get DiGraph indices
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
}

// Helper function to check if graph is initialized
pub fn check_graph_initialized() -> Result<(), String> {
    let graph_manager = GRAPH_MANAGER.lock().unwrap();
    if graph_manager.is_none() {
        return Err("Graph not initialized. Call initialize_graph first.".to_string());
    }
    Ok(())
}

// Initialize the global graph manager from GraphData
pub fn initialize_graph(graph_data: &GraphData) -> Result<(), String> {
    let manager = GraphManager::from_graph_data(graph_data);
    
    let mut graph_manager = GRAPH_MANAGER.lock().unwrap();
    *graph_manager = Some(manager);
    
    Ok(())
}

// Initialize from vault files and return the resulting GraphData
pub fn initialize_from_vault(files: &[VaultFile]) -> Result<GraphData, String> {
    let manager = GraphManager::from_vault_files(files)?;
    
    // Get GraphData for returning to JS
    let graph_data = manager.to_graph_data();
    
    // Update global manager
    let mut graph_manager = GRAPH_MANAGER.lock().unwrap();
    *graph_manager = Some(manager);
    
    Ok(graph_data)
} 