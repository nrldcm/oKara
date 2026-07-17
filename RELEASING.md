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

| File                            | What it is                                            |
| ------------------------------- | ----------------------------------------------------- |
| `okara-X.Y.Z-setup.exe`         | Windows installer (NSIS) — installs, adds Start menu  |
| `okara-X.Y.Z-portable.exe`      | Windows portable — run directly, no install           |
| `okara-X.Y.Z.apk`               | Android app (tablet/phone as karaoke host), Android 7+ |
| `SHA256SUMS.txt`                | SHA-256 checksums to verify the downloads             |

> A **manual** workflow run (Actions → *Build & Release* → *Run workflow*)
> also publishes a Release by default: it builds from the chosen branch and
> creates the tag `v<package.json version>` itself. Untick the **publish**
> input to get a test build instead — files uploaded only as
> **workflow artifacts** (Actions run → *Artifacts*), no Release.
>
> Releases are **immutable**: all files (exe + apk + checksums) are published
> together in one step by the `publish` job. Files can never be added to an
> already-published release — to fix a release, bump the patch version and cut
> a new one.

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

5. Pushing the tag triggers **`.github/workflows/release.yml`**, which:
   - verifies the tag matches `package.json`,
   - builds the Windows installer + portable `.exe` and the Android `.apk`
     in parallel,
   - generates `SHA256SUMS.txt` over all of them,
   - publishes a GitHub Release with auto-generated notes and all files
     attached in a single step.

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

## Android signing

The APK is signed with the committed self-signed keystore
(`android/okara-release.keystore`) so the signature stays stable and updates
install over previous versions. The Android `versionName`/`versionCode` are
derived from `package.json` at build time — nothing to bump separately. If the
app is ever published to a store, replace the keystore with a private one kept
out of the repository.

## Regenerating the app icons

Icons are generated from `build/icon.svg` (full tile) and
`build/icon-foreground.svg` (glyph only, for Android adaptive icons):

```bash
npm install         # sharp + png-to-ico are devDependencies
npm run icons       # rewrites build/icon.ico, Android mipmaps, and splash screens
```
