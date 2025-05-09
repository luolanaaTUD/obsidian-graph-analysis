# Product Context

## Purpose
To provide advanced graph analysis capabilities for Obsidian notes, helping users understand relationships and importance of different notes in their knowledge base.

## Problem Solution
- Calculates various centrality metrics to identify important nodes in the note network
- Provides insights into note relationships and knowledge structure
- Helps users identify key documents and connections in their knowledge base

## Core Functionality
1. Graph Analysis
   - Calculate degree centrality for basic connection analysis
   - Calculate eigenvector centrality for influence analysis
   - Calculate betweenness centrality for bridge document identification
   - Calculate closeness centrality for accessibility analysis

2. Integration
   - Seamless integration with Obsidian's existing graph visualization
   - Efficient processing of note relationships
   - Clear presentation of metrics

## User Experience Goals
1. Fast and efficient calculation of metrics
2. Reliable and accurate results
3. Minimal resource usage
4. Seamless integration with existing Obsidian workflow

## Current Focus
Improving technical foundation by migrating to rustnetworkx-core while maintaining all core functionality