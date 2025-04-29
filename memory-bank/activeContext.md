# Active Context

## Current Focus
Migration from petgraph to rustnetworkx-core for graph calculations

## Active Tasks
1. Implementation of centrality metrics using rustnetworkx-core:
   - Degree centrality
   - Eigenvector centrality
   - Betweenness centrality
   - Closeness centrality

2. Verification of calculation accuracy
3. Performance testing with new implementation
4. Removal of petgraph dependency

## Recent Changes
- Decision to migrate from petgraph to rustnetworkx-core
- Identification of core metrics to maintain

## Next Steps
1. Analyze current petgraph implementation
2. Create parallel implementations using rustnetworkx-core
3. Verify calculation accuracy
4. Performance testing
5. Remove petgraph dependency

## Active Decisions
1. Focus on core centrality metrics only
2. Complete migration before adding new features
3. Maintain existing API interfaces where possible

## Considerations
1. Ensure no regression in calculation accuracy
2. Maintain or improve performance
3. Clean removal of petgraph dependency
4. Minimal disruption to existing functionality