# Releasing okara

okara uses **[Semantic Versioning](https://semver.org)** (`MAJOR.MINOR.PATCH`)
with one source of truth for the version: the `version` field in
`package.json`. Every release is a git tag `vX.Y.Z` and a
[GitHub Release](https://github.com/nrldcm/okara/releases) with the built
Windows `.exe` files attached.

## Where are the downloads?

The built `.exe` files live on the **Releases** page:

> **https://github.com/nrldcm/okara/releases**

Each release contains:

| File                            | What it is                                          |
| ------------------------------- | --------------------------------------------------- |
| `okara-X.Y.Z-setup.exe`         | Installer (NSIS) — installs and adds Start-menu entry |
| `okara-X.Y.Z-portable.exe`      | Portable — run directly, no install                 |
| `SHA256SUMS.txt`                | SHA-256 checksums to verify the downloads           |

> A **manual** workflow run (Actions → *Build Windows app* → *Run workflow*)
> does **not** create a Release. It only uploads the `.exe` files as
> **workflow artifacts** (Actions run → *Artifacts*), for testing a build.

## Cut a release

1. **Update the version** in `package.json` (e.g. `0.1.0` → `0.2.0`).

   ```bash
   npm version 0.2.0 --no-git-tag-version
   ```

2. **Update `CHANGELOG.md`**: move the `Unreleased` notes under a new
   `## [0.2.0] - YYYY-MM-DD` heading and refresh the compare links at the bottom.

3. **Commit** the version bump and changelog.

   ```bash
   git commit -am "Release v0.2.0"
   ```

4. **Tag and push.** The tag must match `package.json` (`v` + version), or the
   workflow fails the version-check step on purpose.

   ```bash
   git tag v0.2.0
   git push origin main --tags
   ```

5. Pushing the tag triggers **`.github/workflows/build-windows.yml`**, which:
   - verifies the tag matches `package.json`,
   - builds the installer + portable `.exe`,
   - generates `SHA256SUMS.txt`,
   - publishes a GitHub Release with auto-generated notes and the files
     attached.

6. Once the workflow is green, edit the Release notes on GitHub if you want to
   lead with the highlights from `CHANGELOG.md`.

## Verify a download

```bash
sha256sum -c SHA256SUMS.txt   # run in the folder with the .exe files
```

## Which version bump?

- **PATCH** (`0.1.0` → `0.1.1`) — bug fixes only.
- **MINOR** (`0.1.0` → `0.2.0`) — new features, backward compatible.
- **MAJOR** (`0.1.0` → `1.0.0`) — breaking changes.

## Regenerating the app icon

The icon is committed as `build/icon.ico`. To change it, edit `build/icon.svg`
and regenerate:

```bash
npm install         # sharp + png-to-ico are devDependencies
npm run icons       # rewrites build/icon.ico and build/icons/*.png
```
