# Technical Context

## Core Technologies
- Rust (Backend)
- rustnetworkx-core (Graph Processing Library)
- Obsidian Plugin API

## Current Technical Stack
### Backend (Rust)
- Graph Processing: Transitioning from petgraph to rustnetworkx-core
- Core Calculations:
  - Degree centrality
  - Eigenvector centrality
  - Betweenness centrality
  - Closeness centrality

### Dependencies
#### Current
- petgraph (to be removed)
- Other existing dependencies (TBD based on codebase analysis)

#### Target
- rustnetworkx-core (primary graph processing library)

## Technical Constraints
1. Must maintain compatibility with Obsidian's plugin system
2. Need to ensure equivalent or better performance with rustnetworkx-core
3. All graph calculations must remain accurate during and after migration