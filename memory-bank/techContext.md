# Technical Context

## Core Technologies
- TypeScript (Frontend/Plugin)
- Rust/WASM (Backend)
- Obsidian Plugin API
- D3.js for visualization

## Current Technical Stack
### Service Layer (New)
- PluginService pattern
- IGraphAnalysisPlugin interface
- Type-safe operations
- Centralized error handling

### Frontend (TypeScript)
- GraphView component
- GraphDataBuilder utility
- D3.js visualization
- Service integration

### Backend (Rust/WASM)
- Graph processing
- Centrality calculations
- Cache management
- Memory optimization

## Architecture Patterns
1. Service Layer:
   ```typescript
   class PluginService {
       private plugin: IGraphAnalysisPlugin;
       
       // Type-safe plugin access
       // Centralized error handling
       // Unified WASM integration
   }
   ```

2. Plugin Interface:
   ```typescript
   interface IGraphAnalysisPlugin {
       ensureWasmLoaded(): Promise<void>;
       initializeGraphAndCalculateCentrality(): Promise<GraphInitializationResult>;
       // Other plugin operations
   }
   ```

3. Graph Operations:
   ```typescript
   interface GraphInitializationResult {
       graphData: GraphData;
       degreeCentrality: CentralityResult[];
   }
   ```

## Technical Constraints
1. Service Layer:
   - Type safety requirements
   - Error handling standards
   - Performance considerations
   - Cache management

2. Graph Operations:
   - Combined initialization
   - On-demand calculations
   - Memory efficiency
   - Performance optimization

3. Integration:
   - Service pattern adoption
   - Component updates
   - Cache coordination
   - Error propagation

## Development Standards
1. Code Organization:
   - Service-based architecture
   - Clear interfaces
   - Type safety
   - Error handling

2. Testing:
   - Service layer tests
   - Component integration
   - Performance metrics
   - Error scenarios

3. Documentation:
   - Service documentation
   - Interface definitions
   - Architecture updates
   - Pattern guidelines