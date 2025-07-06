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
    { source: 'dist/DDC-template.json', dest: 'DDC-template.json', critical: true, validate: true },
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
            console.error(`This file is required for the plugin to function correctly`);
            
            // Exit with error for critical files
            if (file.source.includes('DDC-template.json')) {
                console.error(`❌ DDC template file is missing. Please ensure it exists in the src/ai directory and was properly built.`);
                process.exit(1);
            }
        } else {
            console.log(message);
        }
        return;
    }
    
    try {
        fs.copyFileSync(sourcePath, destPath);
        
        // Special handling for DDC template
        if (file.validate && file.source.includes('DDC-template.json')) {
            console.log(`✅ Copied DDC template from ${sourcePath} to ${destPath}`);
            
            // Verify the file was copied correctly
            try {
                const fileContent = fs.readFileSync(destPath, 'utf8');
                const jsonContent = JSON.parse(fileContent);
                if (jsonContent && jsonContent.ddc_23_summaries && jsonContent.ddc_23_summaries.classes) {
                    console.log(`✅ DDC template JSON is valid with ${jsonContent.ddc_23_summaries.classes.length} classes`);
                } else {
                    console.error(`❌ DDC template JSON structure is invalid. Expected ddc_23_summaries.classes array.`);
                }
            } catch (verifyError) {
                console.error(`❌ Error verifying DDC template: ${verifyError.message}`);
            }
        } else {
            console.log(`Copied ${file.source} to ${destPath}`);
        }
    } catch (error) {
        console.error(`Error copying ${file.source}: ${error.message}`);
    }
});

console.log('Plugin files copied to Obsidian vault.');

// Clean up master-analysis.json file if it exists
const masterAnalysisPath = path.join(pluginDir, 'master-analysis.json');
if (fs.existsSync(masterAnalysisPath)) {
    console.log(`Found deprecated master-analysis.json file at ${masterAnalysisPath}`);
    try {
        fs.unlinkSync(masterAnalysisPath);
        console.log('Successfully deleted deprecated master-analysis.json file.');
    } catch (error) {
        console.error(`Error deleting master-analysis.json: ${error.message}`);
    }
} else {
    console.log('No deprecated master-analysis.json file found. Nothing to clean up.');
}

console.log('Please restart Obsidian to load the updated plugin.'); 