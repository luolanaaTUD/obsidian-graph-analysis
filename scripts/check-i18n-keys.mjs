#!/usr/bin/env node
/**
 * Ensures en.json and zh-Hans.json have the same nested key paths.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'src', 'i18n', 'locales');

function flatten(obj, prefix = '') {
    const keys = [];
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            keys.push(...flatten(v, key));
        } else {
            keys.push(key);
        }
    }
    return keys;
}

const en = JSON.parse(fs.readFileSync(path.join(root, 'en.json'), 'utf8'));
const zh = JSON.parse(fs.readFileSync(path.join(root, 'zh-Hans.json'), 'utf8'));
const enKeys = new Set(flatten(en));
const zhKeys = new Set(flatten(zh));

const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));
const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));

if (missingInZh.length || missingInEn.length) {
    if (missingInZh.length) {
        console.error('Missing in zh-Hans.json:', missingInZh.join(', '));
    }
    if (missingInEn.length) {
        console.error('Missing in en.json:', missingInEn.join(', '));
    }
    process.exit(1);
}

console.log(`i18n keys OK (${enKeys.size} keys each)`);
