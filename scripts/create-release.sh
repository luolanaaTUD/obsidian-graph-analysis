#!/bin/bash

# Exit on any error
set -e

# Clean up any existing release directory
rm -rf release
mkdir -p release

# Navigate to project root (assuming script is in scripts/ directory)
cd "$(dirname "$0")/.."

# Build the project
echo "Building project..."
npm run build

# Create plugin directory inside release
cd release
mkdir knowledge-graph-analysis

# Copy all required files
echo "Copying files..."
cp ../dist/main.js knowledge-graph-analysis/
cp ../dist/graph_analysis_wasm_bg.wasm knowledge-graph-analysis/
cp ../dist/knowledge-domains.json knowledge-graph-analysis/
cp ../manifest.json knowledge-graph-analysis/
cp ../README.md knowledge-graph-analysis/
cp ../LICENSE knowledge-graph-analysis/

# Copy styles.css if it exists (won't fail if missing)
cp ../dist/styles.css knowledge-graph-analysis/ 2>/dev/null || true

# Create zip file
echo "Creating zip file..."
zip -r knowledge-graph-analysis.zip knowledge-graph-analysis/

echo "Release package created successfully in release/knowledge-graph-analysis.zip" 