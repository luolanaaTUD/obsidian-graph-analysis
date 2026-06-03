# Submit Knowledge Graph Analysis to Obsidian Community Plugins

The plugin entry has been prepared in `obsidian-releases-fork/`. Follow these steps to open a PR.

## Pre-submission: ESLint (official Obsidian plugin guidelines)

This repo uses [eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin) with the `recommended` ruleset. Run the same checks locally before opening your community-plugins PR:

```bash
npm ci
npm run lint:submission
```

- `npm run lint` — full report (includes UI sentence-case **warnings** you can fix with `npm run lint:fix`)
- `npm run lint:submission` — **errors only** (manifest validation, API usage, vault rules, etc.)
- `npm run lint:fix` — auto-fix where the plugin supports it (sentence case, some Obsidian patterns)

Configuration lives in [`eslint.config.mjs`](../eslint.config.mjs). Type-aware rules use [`tsconfig.eslint.json`](../tsconfig.eslint.json) (includes `src/**/*.ts` and `manifest.json`).

## Step 1: Fork obsidian-releases

1. Go to https://github.com/obsidianmd/obsidian-releases
2. Click **Fork** (top right)
3. This creates `https://github.com/luolanaaTUD/obsidian-releases`

## Step 2: Push the branch to your fork

From the project root:

```bash
cd obsidian-releases-fork
git remote add fork https://github.com/luolanaaTUD/obsidian-releases.git   # skip if already added
git add community-plugins.json
git commit -m "Add Knowledge Graph Analysis plugin"   # or amend if branch already has a commit
git push fork add-obsidian-graph-analysis
```

```bash
cd obsidian-releases-fork
git push fork add-obsidian-graph-analysis --force-with-lease
```

## Step 3: Open a Pull Request

1. Go to https://github.com/luolanaaTUD/obsidian-releases
2. Click **Compare & pull request** for the pushed branch
3. **Important:** Use the PR template — switch to **Preview** and select **Community Plugin**
4. Fill in the checklist:

### PR Template Checklist

- [ ] I attest that I have done my best to deliver a high-quality plugin...
- [ ] **Repo URL:** https://github.com/luolanaaTUD/obsidian-graph-analysis
- [ ] Tested on Windows / macOS / Linux / Android / iOS
- [ ] GitHub release contains only main.js, manifest.json, and styles.css as individual files (with artifact attestations)
- [ ] Release tag matches manifest version (no `v` prefix)
- [ ] manifest.json `id` matches community-plugins.json `id` (knowledge-graph-analysis)
- [ ] Ran `npm run lint:submission` with no errors
- [ ] README describes purpose and usage
- [ ] Read developer policies and plugin guidelines
- [ ] LICENSE file added
- [ ] Proper attribution for any reused code

## Repo typo note

If the validator flags a typo in `luolanaaTUD/obsidian-graph-analysis`, verify your GitHub username and repo name at https://github.com/luolanaaTUD/obsidian-graph-analysis. Update the `repo` field if different.

## Plugin entry

```json
{
  "id": "knowledge-graph-analysis",
  "name": "Knowledge Graph Analysis",
  "author": "wluo",
  "description": "Analyze your vault using graph algorithms with Rust WASM for high-performance insights into note structure and relationships.",
  "repo": "luolanaaTUD/obsidian-graph-analysis"
}
```
