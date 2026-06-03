import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Configuration
const pluginId = 'knowledge-graph-analysis';
const pluginName = 'Knowledge Graph Analysis';

let vaultPath;

// Check for OBSIDIAN_VAULT_PATH in environment variables first
if (process.env.OBSIDIAN_VAULT_PATH) {
    vaultPath = process.env.OBSIDIAN_VAULT_PATH;
    console.log(`Using vault path from environment: ${vaultPath}`);
} else {
    // Detect OS and set the vault path accordingly
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const isLinux = process.platform === 'linux';

    if (isMac) {
        // macOS path - update this to your actual vault path
        const homeDir = process.env.HOME;
        // vaultPath = path.join(homeDir, 'Obsidian', 'Devs');
        vaultPath = path.join(homeDir, 'Obsidian', 'ObsidianSync');
        
    } else if (isWindows) {
        // Windows path
        const appData = process.env.APPDATA;
        vaultPath = path.join(appData, 'Obsidian', 'Vault');
    } else if (isLinux) {
        // Linux path
        const homeDir = process.env.HOME;
        vaultPath = path.join(homeDir, '.obsidian', 'vault');
    }
}

// Prompt for vault path if not found
if (!vaultPath || !fs.existsSync(vaultPath)) {
    console.error('Obsidian vault not found at the default location.');
    console.log('Please either:');
    console.log('  1. Set OBSIDIAN_VAULT_PATH environment variable');
    console.log('  2. Update the default path in this script');
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
    { source: 'README.md', dest: 'README.md' },
    { source: 'LICENSE', dest: 'LICENSE' }
];

// Copy each file
filesToCopy.forEach(file => {
    const sourcePath = path.join(rootDir, file.source);
    const destPath = path.join(pluginDir, file.dest);
    
    // Check if source file exists
    if (!fs.existsSync(sourcePath)) {
        const message = `Skipping ${file.source} (not found)`;
        if (file.critical) {
            console.error(`❌ CRITICAL FILE MISSING: ${message}`);
            process.exit(1);
        } else {
            console.log(message);
        }
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