#!/usr/bin/env node
/**
 * Release script: bumps version and creates tag without v prefix (Obsidian requirement).
 * Usage: node scripts/release.mjs [patch|minor|major]
 * Default: patch
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const bump = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error('Usage: node scripts/release.mjs [patch|minor|major]');
  process.exit(1);
}

// Run npm version (creates commit + tag; tag may have v prefix)
execSync(`npm version ${bump}`, { stdio: 'inherit' });

// Get version from manifest (source of truth)
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const version = manifest.version;

// Fix tag: npm may create v0.5.3; Obsidian needs 0.5.3
try {
  execSync(`git tag -d v${version}`, { stdio: 'pipe' });
} catch {
  // v-prefixed tag may not exist; continue
}

try {
  execSync(`git tag -d ${version}`, { stdio: 'pipe' });
} catch {
  // May already have correct tag; continue
}

execSync(`git tag -a ${version} -m "${version}"`, { stdio: 'inherit' });

console.log('\n=== Next steps ===');
console.log('git push');
console.log(`git push origin ${version}`);
