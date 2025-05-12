use graph_analysis_wasm::graph_manager::{GraphManager, GRAPH_MANAGER};

/// Creates a test graph with the following structure:
/// ```text
/// A --- B --- C
/// |           |
/// |           |
/// D -----------
/// ```
pub fn create_test_graph_manager() {
    let mut manager = GraphManager::with_capacity(4, 4);
    
    // Add nodes
    let a = manager.add_node("A".to_string());
    let b = manager.add_node("B".to_string());
    let c = manager.add_node("C".to_string());
    let d = manager.add_node("D".to_string());
    
    // Add edges (using unwrap since we know the indices are valid)
    manager.add_edge(a, b).unwrap(); // A - B
    manager.add_edge(b, c).unwrap(); // B - C
    manager.add_edge(a, d).unwrap(); // A - D
    manager.add_edge(d, c).unwrap(); // D - C
    
    // Store in global state
    let mut graph_manager = GRAPH_MANAGER.lock().unwrap();
    *graph_manager = Some(manager);
} 