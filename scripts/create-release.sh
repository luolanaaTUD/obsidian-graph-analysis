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
npm run full-build

# Create plugin directory inside release
cd release
mkdir obsidian-graph-analysis

# Copy all required files
echo "Copying files..."
cp ../dist/main.js obsidian-graph-analysis/
cp ../dist/graph_analysis_wasm_bg.wasm obsidian-graph-analysis/
cp ../manifest.json obsidian-graph-analysis/
cp ../README.md obsidian-graph-analysis/
cp ../LICENSE obsidian-graph-analysis/

# Copy styles.css if it exists (won't fail if missing)
cp ../dist/styles.css obsidian-graph-analysis/ 2>/dev/null || true

# Create zip file
echo "Creating zip file..."
zip -r obsidian-graph-analysis.zip obsidian-graph-analysis/

echo "Release package created successfully in release/obsidian-graph-analysis.zip" 