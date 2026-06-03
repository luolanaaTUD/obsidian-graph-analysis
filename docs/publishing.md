# Publishing the Graph Analysis Plugin

This document outlines how to release new versions of the Obsidian Graph Analysis plugin.

## Prerequisites

- GitHub repository access
- npm installed locally
- Git installed locally
- GitHub Actions **Read and write permissions** enabled (Settings → Actions → General → Workflow permissions)

## Release Process

### 1. Bump Version and Create Tag

Use `npm version` via the release scripts. Tags must match the manifest version with **no `v` prefix** (Obsidian requirement). This is enforced by `tag-version-prefix=` in [`.npmrc`](../.npmrc) and `tagVersionPrefix` in `package.json`.

```bash
npm run release        # patch (0.6.0 → 0.6.1)
# or
npm run release:minor  # minor (0.6.0 → 0.7.0)
# or
npm run release:major  # major (0.6.0 → 1.0.0)
```

This bumps version, runs `version-bump.mjs` to update `manifest.json` and `versions.json`, commits, and creates a tag matching the manifest (e.g. `0.6.1` not `v0.6.1`).

### 2. Push Commit and Tag

`npm version` does **not** push. You must push both the commit and the tag:

```bash
git push && git push origin <version>
```

Or use `--follow-tags`:

```bash
git push --follow-tags
```

**Important:** `git push` alone does **not** push tags.

### 3. GitHub Actions Automation

Once you push a tag, GitHub Actions will automatically:

1. Build the Rust WASM component
2. Build the TypeScript/JavaScript plugin
3. Create a **draft** GitHub release with `main.js`, `manifest.json`, and `styles.css` as individual assets

You can monitor the progress in the **Actions** tab of your GitHub repository.

### 4. Publish the Release

After the workflow succeeds:

1. Open **Releases** on GitHub
2. Verify assets are exactly: `main.js`, `manifest.json`, `styles.css` (no zip or other files)
3. Add release notes if needed and **Publish release**

### 5. Submit to Obsidian Community Plugins

For the initial submission to the Obsidian Community Plugins repository:

1. Fork the [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) repository
2. Add your plugin to the `community-plugins.json` file
3. Create a pull request

For updates to an existing plugin, no additional action is needed as users will be notified of the update within Obsidian.

## GitHub Action Details

The release process is automated using `.github/workflows/release.yml`. This workflow:

1. Runs when a new tag is pushed
2. Sets up Node.js and Rust environments
3. Installs wasm-pack for WASM compilation
4. Builds the full plugin
5. Uploads `main.js`, `manifest.json`, and `styles.css` directly to a draft GitHub release

WASM is embedded in `main.js` at build time; no separate `.wasm` asset is required for community distribution.

## Troubleshooting

### Release workflow did not trigger

1. **Tags are not pushed by `git push`** — Run `git push origin <tag>` or `git push --follow-tags` after pushing commits.
2. **Check Actions** — Ensure GitHub Actions are enabled (Settings → Actions → General).

### If the GitHub Action fails

1. Check the action logs for errors
2. Ensure that the Rust code compiles correctly
3. Verify that all required files are included in the repository
4. Confirm workflow permissions are set to **Read and write**
5. Try running the build process locally to identify any issues
