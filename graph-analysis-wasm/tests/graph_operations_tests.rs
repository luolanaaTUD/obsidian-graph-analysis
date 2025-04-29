mod common;

use graph_analysis_wasm::*;

#[test]
fn test_graph_metadata() {
    common::create_test_graph_manager();
    
    let result = get_graph_metadata();
    let metadata: GraphMetadata = serde_json::from_str(&result).unwrap();
    
    assert_eq!(metadata.node_count, 4);
    assert_eq!(metadata.edge_count, 4);
    assert_eq!(metadata.max_degree, 2);
    assert_eq!(metadata.avg_degree, 2.0);
    assert!(metadata.is_directed);
}

#[test]
fn test_neighbors() {
    common::create_test_graph_manager();
    
    // Test A's neighbors (should be B and D)
    let result = get_node_neighbors_cached(0);
    let neighbors: GraphNeighborsResult = serde_json::from_str(&result).unwrap();
    
    assert_eq!(neighbors.base.node_name, "A");
    assert_eq!(neighbors.neighbors.len(), 2);
    
    let neighbor_names: Vec<String> = neighbors.neighbors
        .iter()
        .map(|n| n.base.node_name.clone())
        .collect();
    assert!(neighbor_names.contains(&"B".to_string()));
    assert!(neighbor_names.contains(&"D".to_string()));
    
    // Test C's neighbors (should have no outgoing, B and D incoming)
    let result = get_node_neighbors_cached(2);
    let neighbors: GraphNeighborsResult = serde_json::from_str(&result).unwrap();
    
    assert_eq!(neighbors.base.node_name, "C");
    assert_eq!(neighbors.neighbors.len(), 2);
    
    let neighbor_names: Vec<String> = neighbors.neighbors
        .iter()
        .map(|n| n.base.node_name.clone())
        .collect();
    assert!(neighbor_names.contains(&"B".to_string()));
    assert!(neighbor_names.contains(&"D".to_string()));
}

#[test]
fn test_shortest_path() {
    common::create_test_graph_manager();
    
    // Test path A -> C (should be A -> B -> C)
    let result = find_shortest_path_cached(0, 2);
    let path: Vec<PathNode> = serde_json::from_str(&result).unwrap();
    
    assert_eq!(path.len(), 3);
    assert_eq!(path[0].base.node_name, "A");
    assert_eq!(path[1].base.node_name, "B");
    assert_eq!(path[2].base.node_name, "C");
    
    // Test path A -> D (should be A -> D)
    let result = find_shortest_path_cached(0, 3);
    let path: Vec<PathNode> = serde_json::from_str(&result).unwrap();
    
    assert_eq!(path.len(), 2);
    assert_eq!(path[0].base.node_name, "A");
    assert_eq!(path[1].base.node_name, "D");
}

#[test]
fn test_graph_initialization() {
    let (graph, node_names) = common::create_test_graph();
    
    let graph_data = GraphData {
        nodes: node_names,
        edges: vec![(0, 1), (1, 2), (0, 3), (3, 2)],
    };
    
    let result = initialize_graph(&serde_json::to_string(&graph_data).unwrap());
    let status: serde_json::Value = serde_json::from_str(&result).unwrap();
    
    assert_eq!(status["status"], "success");
    assert_eq!(status["node_count"], 4);
    assert_eq!(status["edge_count"], 4);
}

#[test]
fn test_graph_clear() {
    common::create_test_graph_manager();
    
    let result = clear_graph();
    let status: serde_json::Value = serde_json::from_str(&result).unwrap();
    
    assert_eq!(status["status"], "success");
    
    // Verify graph is cleared by trying to get metadata
    let result = get_graph_metadata();
    assert!(result.contains("Graph not initialized"));
} 