import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Configuration
const pluginId = 'obsidian-graph-analysis';
const pluginName = 'Graph Analysis';

// Detect OS and set the vault path accordingly
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

let vaultPath;

if (isMac) {
    // macOS path - update this to your actual vault path
    const homeDir = process.env.HOME;
    vaultPath = path.join(homeDir, 'Obsidian', 'Devs');
} else if (isWindows) {
    // Windows path
    const appData = process.env.APPDATA;
    vaultPath = path.join(appData, 'Obsidian', 'Vault');
} else if (isLinux) {
    // Linux path
    const homeDir = process.env.HOME;
    vaultPath = path.join(homeDir, '.obsidian', 'vault');
}

// Prompt for vault path if not found
if (!vaultPath || !fs.existsSync(vaultPath)) {
    console.error('Obsidian vault not found at the default location.');
    console.log('Please specify your Obsidian vault path in this script.');
    process.exit(1);
}

// Plugin directory in the vault
const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', pluginId);

// Create plugin directory if it doesn't exist
if (!fs.existsSync(pluginDir)) {
    fs.mkdirSync(pluginDir, { recursive: true });
    console.log(`Created plugin directory: ${pluginDir}`);
}

// Files to copy with their source locations
const filesToCopy = [
    { source: 'dist/main.js', dest: 'main.js' },
    { source: 'manifest.json', dest: 'manifest.json' },
    { source: 'dist/styles.css', dest: 'styles.css' },
    { source: 'dist/graph_analysis_wasm_bg.wasm', dest: 'graph_analysis_wasm_bg.wasm' },
    { source: 'README.md', dest: 'README.md' },
    { source: 'LICENSE', dest: 'LICENSE' }
];

// Copy each file
filesToCopy.forEach(file => {
    const sourcePath = path.join(rootDir, file.source);
    const destPath = path.join(pluginDir, file.dest);
    
    // Skip if source file doesn't exist
    if (!fs.existsSync(sourcePath)) {
        console.log(`Skipping ${file.source} (not found)`);
        return;
    }
    
    try {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`Copied ${file.source} to ${destPath}`);
    } catch (error) {
        console.error(`Error copying ${file.source}: ${error.message}`);
    }
});

console.log('Plugin files copied to Obsidian vault.');
console.log('Please restart Obsidian to load the updated plugin.'); 