mod utils;
pub mod models;
pub mod graph_manager;
mod api;

// Re-export all public items from api module
pub use api::*;

// Re-export needed items from models for convenience
pub use models::{GraphData, VaultData, GraphNeighborsResult, GraphMetadata};

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;
