# Publishing the Graph Analysis Plugin

This document outlines how to release new versions of the Obsidian Graph Analysis plugin.

## Prerequisites

- GitHub repository access
- npm installed locally
- Git installed locally

## Release Process

### 1. Update Version Numbers

1. Update the version in `package.json`:

   ```bash
   npm version patch # For bug fixes
   # or
   npm version minor # For new features
   # or
   npm version major # For breaking changes
   ```

   This will automatically:
   - Update the version in `package.json`
   - Update `manifest.json` via the version-bump script
   - Update `versions.json` with the new version
   - Create a git commit with the version change

### 2. Push Changes and Create a Tag

1. Push the changes to GitHub:

   ```bash
   git push
   ```

2. Create and push a tag:

   ```bash
   git tag -a 1.0.0 -m "Release v1.0.0"
   git push origin 1.0.0
   ```

   Replace `1.0.0` with your actual version number.

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

If the GitHub Action fails:

1. Check the action logs for errors
2. Ensure that the Rust code compiles correctly
3. Verify that all required files are included in the repository
4. Make sure the GitHub repository has the necessary secrets configured
5. Try running the build process locally to identify any issues 