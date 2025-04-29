mod common;

use approx::assert_relative_eq;
use graph_analysis_wasm::*;
use serde_json::Value;

#[test]
fn test_degree_centrality_basic() {
    common::create_test_graph_manager();
    
    let result = calculate_degree_centrality_cached();
    let result_value: Vec<CentralityResult> = serde_json::from_str(&result).unwrap();
    
    // Expected degree centralities for our test graph:
    // A: out=2, in=0, total=2 -> 2/(2*(4-1)) = 0.333
    // B: out=1, in=1, total=2 -> 2/(2*(4-1)) = 0.333
    // C: out=0, in=2, total=2 -> 2/(2*(4-1)) = 0.333
    // D: out=1, in=1, total=2 -> 2/(2*(4-1)) = 0.333
    
    for result in result_value {
        assert_relative_eq!(result.score, 0.333, epsilon = 0.001);
    }
}

#[test]
fn test_degree_centrality_single_node() {
    let (graph, node_names) = common::create_single_node_graph();
    let manager = GraphManager { graph, node_names };
    
    let mut graph_manager = GRAPH_MANAGER.lock().unwrap();
    *graph_manager = Some(manager);
    
    let result = calculate_degree_centrality_cached();
    let result_value: Vec<CentralityResult> = serde_json::from_str(&result).unwrap();
    
    assert_eq!(result_value.len(), 1);
    assert_eq!(result_value[0].score, 0.0);
}

#[test]
fn test_degree_centrality_empty_graph() {
    let (graph, node_names) = common::create_empty_graph();
    let manager = GraphManager { graph, node_names };
    
    let mut graph_manager = GRAPH_MANAGER.lock().unwrap();
    *graph_manager = Some(manager);
    
    let result = calculate_degree_centrality_cached();
    let result_value: Vec<CentralityResult> = serde_json::from_str(&result).unwrap();
    
    assert_eq!(result_value.len(), 0);
}

#[test]
fn test_degree_centrality_cycle() {
    let (graph, node_names) = common::create_cycle_graph();
    let manager = GraphManager { graph, node_names };
    
    let mut graph_manager = GRAPH_MANAGER.lock().unwrap();
    *graph_manager = Some(manager);
    
    let result = calculate_degree_centrality_cached();
    let result_value: Vec<CentralityResult> = serde_json::from_str(&result).unwrap();
    
    // In a cycle, all nodes should have the same centrality
    // Each node has in_degree=1, out_degree=1, total=2
    // Normalized score = 2/(2*(3-1)) = 0.5
    for result in result_value {
        assert_relative_eq!(result.score, 0.5, epsilon = 0.001);
    }
} 