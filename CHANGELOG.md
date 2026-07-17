# Changelog

All notable changes to **okara** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each released version has a matching git tag `vX.Y.Z` and a
[GitHub Release](https://github.com/nrldcm/okara/releases) with the Windows
installer and portable `.exe` (plus `SHA256SUMS.txt`) attached.

## [Unreleased]

_Nothing yet._

## [0.2.0] - 2026-07-17

### Added

- **Android app (APK)** via Capacitor — install on a tablet and it behaves
  like the desktop app: full player, pitch scoring, and it **hosts the QR
  phone remote** through a native LAN HTTP + WebSocket server (an Android port
  of the Electron remote server, same one-time-token pairing).
- Android niceties: mic permission prompt on first launch (pitch scoring),
  screen stays awake while the app is open, branded launcher icons (adaptive)
  and splash screens generated from the shared icon SVGs.
- `okara-X.Y.Z.apk` is now attached to every GitHub Release next to the
  Windows `.exe` files, and is covered by `SHA256SUMS.txt`.

### Changed

- Unified CI into one **Build & Release** workflow (`release.yml`): Windows
  and Android build in parallel and everything is published on a single
  release in one step (releases are immutable — files can't be added after
  publishing). Replaces `build-windows.yml`.
- Android `versionName`/`versionCode` derive from `package.json`, keeping one
  source of truth for versioning.

### Fixed

- App icon: the mic stand was invisible in rendered icons (SVG gradient
  strokes on straight lines have a zero-area bounding box); the icon gradients
  now use `userSpaceOnUse` so the full microphone renders everywhere.

## [0.1.0] - 2026-07-17

First tagged release, with the Windows desktop build published to
[GitHub Releases](https://github.com/nrldcm/okara/releases).

### Added

- Nuxt 4 karaoke SPA with UltraStar player and real-time pitch scoring.
- Vocal effects (reverb/echo/EQ), low-latency monitoring, and quick mic modes.
- Import support for UltraStar `.txt`, karaoke video files, and audio.
- Number-pad phone remote over QR pairing, reserved-queue tab, light/dark theme.
- Windows `.exe` packaging via electron-builder + GitHub Actions (installer +
  portable), and Dokploy auto-deploy workflow.
- App icon: a multi-resolution `build/icon.ico` (16–256 px) generated from
  `build/icon.svg`. It is the `.exe` icon, the Windows installer/uninstaller
  icon, and the desktop window title-bar / taskbar icon. Regenerate with
  `npm run icons`.
- Windows build workflow **publishes a GitHub Release** (installer, portable
  `.exe`, and `SHA256SUMS.txt`) when a `vX.Y.Z` tag is pushed, and verifies the
  tag matches `package.json` version.
- Versioning docs: this `CHANGELOG.md` and `RELEASING.md`.

[Unreleased]: https://github.com/nrldcm/okara/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/nrldcm/okara/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/nrldcm/okara/releases/tag/v0.1.0
