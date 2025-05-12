use graph_analysis_wasm::models::{VaultNote, VaultData};
use graph_analysis_wasm::{build_graph_from_vault, clear_graph};
use serde_json;

/// Creates a test graph from vault data with the following structure:
/// ```text
/// note1 --- note2
///   |         |
///   |         |
/// note3 -------
/// ```
pub fn create_test_graph_from_vault() -> VaultData {
    VaultData {
        notes: vec![
            VaultNote { id: "note1.md".to_string() },
            VaultNote { id: "note2.md".to_string() },
            VaultNote { id: "note3.md".to_string() }
        ],
        links: vec![(0, 1), (0, 2), (1, 2)]  // note1->note2, note1->note3, note2->note3
    }
}


/// Helper function to initialize the graph from vault data
pub fn initialize_test_graph() {
    // Ensure we start with a clean state
    clear_graph();
    
    // create vault data from test graph
    let vault_data = create_test_graph_from_vault();
    // convert vault data to json
    let vault_json = serde_json::to_string(&vault_data).unwrap();
    
    // build graph from vault data using api
    build_graph_from_vault(&vault_json);
} 