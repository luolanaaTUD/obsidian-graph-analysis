# Publishing the Graph Analysis Plugin

This document outlines how to release new versions of the Obsidian Graph Analysis plugin.

## Prerequisites

- GitHub repository access
- npm installed locally
- Git installed locally

## Release Process

### 1. Bump Version and Create Tag

Use the release script (handles tag format for Obsidian — no `v` prefix):

```bash
npm run release        # patch (0.5.0 → 0.5.1)
# or
npm run release:minor  # minor (0.5.0 → 0.6.0)
# or
npm run release:major  # major (0.5.0 → 1.0.0)
```

This bumps version, updates manifest/versions.json, commits, and creates a tag matching the manifest (e.g. `0.5.1` not `v0.5.1`). Obsidian requires this format.

### 2. Push Commit and Tag

`npm version` does **not** push. You must push both the commit and the tag:

```bash
git push
git push --follow-tags
```

Or push the tag explicitly (replace with your actual version):

```bash
git push
git push origin 0.5.1
```

**Important:** `git push` does **not** push tags. You must run `git push --follow-tags` or `git push origin <tag>` separately.

### 3. GitHub Actions Automation

Once you push a tag, GitHub Actions will automatically:

1. Build the Rust WASM component
2. Build the TypeScript/JavaScript plugin
3. Package the plugin into a zip file
4. Create a GitHub release with the appropriate assets

You can monitor the progress in the "Actions" tab of your GitHub repository.

### 4. Submit to Obsidian Community Plugins

For the initial submission to the Obsidian Community Plugins repository:

1. Fork the [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) repository
2. Add your plugin to the `community-plugins.json` file
3. Create a pull request

For updates to an existing plugin, no additional action is needed as users will be notified of the update within Obsidian.

## GitHub Action Details

The release process is automated using a GitHub Action workflow defined in `.github/workflows/release.yml`. This workflow:

1. Runs when a new tag is pushed
2. Sets up Node.js and Rust environments
3. Installs wasm-pack for WASM compilation
4. Builds the Rust WASM component
5. Builds the full plugin
6. Packages everything into a zip file
7. Creates a GitHub release with the zip file and required manifest files

## Troubleshooting

### Release workflow did not trigger

1. **Tags are not pushed by `git push`** — Run `git push origin <tag>` or `git push --follow-tags` after pushing commits.
2. **Check Actions** — Ensure GitHub Actions are enabled (Settings → Actions → General).

### If the GitHub Action fails:

1. Check the action logs for errors
2. Ensure that the Rust code compiles correctly
3. Verify that all required files are included in the repository
4. Make sure the GitHub repository has the necessary secrets configured
5. Try running the build process locally to identify any issues 