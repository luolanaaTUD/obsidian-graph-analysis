# Publishing the Graph Analysis Plugin

This document outlines how to release new versions of the Obsidian Graph Analysis plugin.

## Prerequisites

- GitHub repository access
- npm installed locally
- Git installed locally
- GitHub Actions **Read and write permissions** enabled (Settings → Actions → General → Workflow permissions)

Before tagging a release, run Obsidian’s official ESLint rules locally:

```bash
npm run lint:submission
```

See [submit-to-obsidian.md](submit-to-obsidian.md#pre-submission-eslint-official-obsidian-plugin-guidelines) for details.

## Release Process

### 1. Bump Version and Create Tag

Use `npm version` via the release scripts. Tags must match the manifest version with **no `v` prefix** (Obsidian requirement). This is enforced by `tag-version-prefix=` in [`.npmrc`](../.npmrc) and `tagVersionPrefix` in `package.json`.

```bash
npm run release        # patch (0.6.1 → 0.6.2)
# or
npm run release:minor  # minor (0.6.1 → 0.7.0)
# or
npm run release:major  # major (0.6.1 → 1.0.0)
```

This bumps version, runs `version-bump.mjs` to update `manifest.json` and `versions.json`, commits, and creates a tag matching the manifest (e.g. `0.6.2` not `v0.6.2`).

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
3. Generate build provenance attestations for release assets
4. Create a **draft** GitHub release with these individual assets:
   - `main.js` (includes embedded WASM and knowledge-domain template)
   - `manifest.json`
   - `styles.css`

You can monitor the progress in the **Actions** tab of your GitHub repository.

### 4. Publish the Release

After the workflow succeeds:

1. Open **Releases** on GitHub
2. Verify assets are exactly: `main.js`, `manifest.json`, and `styles.css` (no zip, no extra files)
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
2. Uses `actions/checkout@v5` and `actions/setup-node@v5` (Node 24 action runtime)
3. Sets up Node.js 20 and Rust for the plugin build
4. Installs wasm-pack for WASM compilation
5. Builds the full plugin
6. Attests `main.js`, `styles.css`, and `manifest.json` with `actions/attest@v4`
7. Uploads `main.js`, `manifest.json`, and `styles.css` to a draft GitHub release

WASM and the knowledge-domain template are embedded in `main.js` at build time. The workflow uses `CARGO_LOCKED=true` and a committed `graph-analysis-wasm/Cargo.lock` for reproducible Rust builds.

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
