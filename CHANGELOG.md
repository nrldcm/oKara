# Changelog

All notable changes to **okara** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each released version has a matching git tag `vX.Y.Z` and a
[GitHub Release](https://github.com/nrldcm/okara/releases) with the Windows
installer and portable `.exe` (plus `SHA256SUMS.txt`) attached.

## [Unreleased]

### Added

- App icon: a multi-resolution `build/icon.ico` (16–256 px) generated from
  `build/icon.svg`. It is now the `.exe` icon, the Windows installer/uninstaller
  icon, and the desktop window title-bar / taskbar icon.
- `npm run icons` script to regenerate the `.ico` and PNG variants from the SVG.
- Windows build workflow now **publishes a GitHub Release** (with the installer,
  portable `.exe`, and `SHA256SUMS.txt`) when a `vX.Y.Z` tag is pushed, and
  verifies the tag matches `package.json` version.
- `RELEASING.md` documenting the versioned build-and-release process.
- This `CHANGELOG.md`.

## [0.1.0] - 2026-07-17

### Added

- Initial okara release: Nuxt 4 karaoke SPA with UltraStar player and real-time
  pitch scoring.
- Vocal effects (reverb/echo/EQ), low-latency monitoring, and quick mic modes.
- Import support for UltraStar `.txt`, karaoke video files, and audio.
- Number-pad phone remote over QR pairing, reserved-queue tab, light/dark theme.
- Windows `.exe` packaging via electron-builder + GitHub Actions (installer +
  portable), and Dokploy auto-deploy workflow.

[Unreleased]: https://github.com/nrldcm/okara/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nrldcm/okara/releases/tag/v0.1.0
