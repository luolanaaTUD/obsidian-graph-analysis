# Technical Context

## Core Technologies
- TypeScript (Frontend/Plugin)
- Rust/WASM (Backend)
- Obsidian Plugin API
- rustworkx-core for graph operations
- D3.js for visualization

## Current Technical Stack
### TypeScript Configuration
- ESNext module syntax
- ES6 target compilation
- Strict type checking enabled
- Node.js module resolution
- Modern JavaScript features support
- Isolated module transpilation

### Backend (Rust/WASM)
- UnGraph from rustworkx-core for undirected graph processing
- Optimized centrality calculations for undirected graphs
- Efficient memory management with lazy_static
- Enhanced performance characteristics
- Mutex-based thread safety

### Frontend (TypeScript)
- GraphView component
- GraphDataBuilder utility
- D3.js visualization
- Efficient data handling

### Integration Layer
- Clean WASM bindings
- Optimized data transfer
- Efficient memory usage
- Type-safe operations

## Architecture Patterns
1. Graph Processing:
   ```rust
   use rustworkx_core::petgraph::graph::UnGraph;
   use lazy_static::lazy_static;
   
   // Undirected graph operations
   // Symmetric centrality calculations
   // Thread-safe memory management
   ```

2. Plugin Interface:
   ```typescript
   interface IGraphAnalysisPlugin {
       calculateCentrality(): Promise<CentralityResult>;
       processGraph(): Promise<GraphData>;
       // Other plugin operations
   }
   ```

3. Data Structures:
   ```typescript
   interface GraphAnalysisResult {
       graphData: GraphData;
       centrality: CentralityMetrics;
       isDirected: false; // Always false now
   }
   ```

## Technical Constraints
1. Graph Operations:
   - Undirected graph model
   - Symmetric relationships
   - Memory efficiency
   - Performance optimization
   - Calculation accuracy

2. TypeScript Compilation:
   - Strict type checking
   - Null safety
   - Module isolation
   - Modern JavaScript support

3. Integration:
   - WASM optimization
   - Memory management
   - Type safety
   - Error handling

4. Performance:
   - Calculation speed
   - Memory usage
   - Response time
   - Resource efficiency

## Development Standards
1. Code Organization:
   - Clean architecture
   - Efficient algorithms
   - Memory optimization
   - Performance focus
   - Thread safety

2. TypeScript Standards:
   - Strict type usage
   - Null safety
   - Modern syntax
   - Clean imports

3. Testing:
   - Symmetric graph validation
   - Calculation accuracy
   - Performance metrics
   - Memory profiling
   - Integration tests

4. Documentation:
   - Technical specs
   - API documentation
   - Performance guidelines
   - Usage examples