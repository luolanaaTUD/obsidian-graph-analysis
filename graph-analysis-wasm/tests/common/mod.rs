use graph_analysis_wasm::{GraphManager, GRAPH_MANAGER};
use rustworkx_core::petgraph::graph::DiGraph;

/// Creates a test graph with the following structure:
/// ```text
/// A -> B -> C
/// |         ^
/// v         |
/// D ------->|
/// ```
pub fn create_test_graph() -> (DiGraph<String, ()>, Vec<String>) {
    let mut graph = DiGraph::<String, ()>::new();
    
    // Add nodes
    let node_names = vec!["A".to_string(), "B".to_string(), "C".to_string(), "D".to_string()];
    let a = graph.add_node(node_names[0].clone());
    let b = graph.add_node(node_names[1].clone());
    let c = graph.add_node(node_names[2].clone());
    let d = graph.add_node(node_names[3].clone());
    
    // Add edges
    graph.add_edge(a, b, ()); // A -> B
    graph.add_edge(b, c, ()); // B -> C
    graph.add_edge(a, d, ()); // A -> D
    graph.add_edge(d, c, ()); // D -> C
    
    (graph, node_names)
}

/// Creates a test graph manager with the standard test graph
pub fn create_test_graph_manager() {
    let (graph, node_names) = create_test_graph();
    let manager = GraphManager { graph, node_names };
    
    // Store in global state
    let mut graph_manager = GRAPH_MANAGER.lock().unwrap();
    *graph_manager = Some(manager);
}

/// Creates an empty graph for testing edge cases
pub fn create_empty_graph() -> (DiGraph<String, ()>, Vec<String>) {
    (DiGraph::<String, ()>::new(), Vec::new())
}

/// Creates a single-node graph for testing edge cases
pub fn create_single_node_graph() -> (DiGraph<String, ()>, Vec<String>) {
    let mut graph = DiGraph::<String, ()>::new();
    let node_names = vec!["A".to_string()];
    graph.add_node(node_names[0].clone());
    (graph, node_names)
}

/// Creates a cycle graph for testing special cases
/// ```text
/// A -> B -> C -> A
/// ```
pub fn create_cycle_graph() -> (DiGraph<String, ()>, Vec<String>) {
    let mut graph = DiGraph::<String, ()>::new();
    
    let node_names = vec!["A".to_string(), "B".to_string(), "C".to_string()];
    let a = graph.add_node(node_names[0].clone());
    let b = graph.add_node(node_names[1].clone());
    let c = graph.add_node(node_names[2].clone());
    
    graph.add_edge(a, b, ());
    graph.add_edge(b, c, ());
    graph.add_edge(c, a, ());
    
    (graph, node_names)
} 