GOAL
> Using D3.js to visualize the graph data from your Rust WASM module
> Creating an interactive graph visualization in the Obsidian plugin
> Implementing features like zooming, panning, and node/edge interactions
> Styling the graph to match Obsidian's theme


1. Force Simulation:
- Using D3's forceSimulation() with similar parameters to Obsidian
- Implementing forceManyBody() for node repulsion
- Using forceLink() for edge connections
- Adding forceCenter() for centering the graph
- Matching Obsidian's force parameters for natural movement

2. Visual Style:
- Circular nodes with pulsing animations
- Curved edges with proper arrow markers
- Matching Obsidian's color scheme and opacity
- Implementing the glowing effect on hover
- Supporting both light and dark themes

3. Interactions:
- Smooth zoom and pan behavior
- Node dragging with force updates
- Node selection and highlighting
- Connected nodes emphasis
- Edge highlighting on hover

4. Performance Optimizations:
- Using D3's quadtree for efficient collision detection
- Optimizing force simulation parameters
- Using proper SVG rendering techniques
- Handling large graphs efficiently



##  Core Visual Elements & Layout

- **Canvas** 
	- when open plugin, pop up a canvas shows graph view like obsidian built-in function.
	- size: 80% of whole obsidian app
	- glass like semi-transparent panel with minimal and linear app style.
	- this canvas can be resized by dragging corner and moved by panning.
- **Canvas Layout**
	- initially, it has three icons at the top right corner which can be pressed.
	- 1. table view: show scores by table like we currently do
	- 2. settings: open setting panel
	- 3. refresh: reset graph layout in case user dragging node to mess it up
- **Graph view Layout**
	- mimic obsidian built-in graph view style
	- nodes should consist a circular shape
- **Force-Directed Layout**
	-  uses a force-directed graph layout algorithm
	-  The algorithm simulates nodes repelling each other and links pulling them together
	- The result is a visually balanced layout where related nodes cluster together.
- **Node Size**
	- Larger nodes often signify more "important" or central notes
	- using degree centrality score for node size, range from scale $[1,3]$
-  **Link Thickness**
	- Link thickness may be based on the strength of the relation
	- using Eigenvector Centrality Analysis for link thickness, range from $[1,6]$
	- Eigenvector Centrality will be developed later, right now using 1 as thickness for all the links.
- **Node and Link Color**
	- gradient color which can be choose from setting. Reference https://kepler.gl color and steps
	- using Betweenness Centrality score and Closeness Centrality score to map gradient color.
	- Betweenness Centrality and  Closeness Centrality will be developed later, right now we use degree score for testing UI.
	- Node and link using same color based on user choosing between Betweenness mode and Closeness mode. 
- **Minimalist Aesthetics:** The overall design is clean and uncluttered.



## Interactions

- Hover
	- highlight neighbour's nodes and animation for influenced nodes.
- Drag
	- move node and connected cluster
	- highlight neighbour's nodes and animation for influenced nodes.
- Click
	- single click: display note metadata and basic info at the right top of node.
	- double click: open note directly and close graph canvas.



## Optimization

1. Optimized Animation Frame Handling
Added double requestAnimationFrame technique for smoother rendering
Implemented proper animation frame cancellation to prevent memory leaks
Added throttling for drag updates to reduce CPU usage
2. Reduced Label Calculations During Interaction
Simplified label processing during high-motion interactions
Increased throttling time for expensive label calculations when dragging
3. Browser Rendering Optimizations
Added CSS performance optimizations with hardware acceleration hints
Used will-change property to help the browser optimize rendering
Disabled pointer events and transitions during drag operations
4. Optimized Force Simulation
Added adaptive force simulation parameters that change during interaction
Reduced simulation iterations during interactions with alphaDecay changes
Added batch processing for smoother frame rates
5. Improved DOM Updates
Changed to more selective DOM updates during dragging
Only update elements that need to change (dragged node and connected links)
Separated rendering logic into a dedicated method for better performance


## Obsidian built-in graph view default setting
- center force: 0.52
- repel force: 10
- link force: 1
- link distance: 250
- node size 1.2