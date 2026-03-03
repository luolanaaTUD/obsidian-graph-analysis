# Submit Knowledge Graph Analysis to Obsidian Community Plugins

The plugin entry has been prepared in `obsidian-releases-fork/`. Follow these steps to open a PR.

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

## Step 3: Open a Pull Request

1. Go to https://github.com/luolanaaTUD/obsidian-releases
2. Click **Compare & pull request** for the pushed branch
3. **Important:** Use the PR template — switch to **Preview** and select **Community Plugin**
4. Fill in the checklist:

### PR Template Checklist

- [ ] I attest that I have done my best to deliver a high-quality plugin...
- [ ] **Repo URL:** https://github.com/luolanaaTUD/obsidian-graph-analysis
- [ ] Tested on Windows / macOS / Linux / Android / iOS
- [ ] GitHub release contains main.js, manifest.json, styles.css as individual files
- [ ] Release tag matches manifest version (no `v` prefix)
- [ ] manifest.json `id` matches community-plugins.json `id` (knowledge-graph-analysis)
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
