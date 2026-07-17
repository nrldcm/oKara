# Changelog

All notable changes to **okara** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each released version has a matching git tag `vX.Y.Z` and a
[GitHub Release](https://github.com/nrldcm/okara/releases) with the Windows
installer and portable `.exe` (plus `SHA256SUMS.txt`) attached.

## [Unreleased]

_Nothing yet._

## [0.4.0] - 2026-07-17

### Added

- **Works without Wi-Fi (Android)** — the remote's pairing screen now detects
  when there's no network and walks you through the fix: turn on Wi-Fi, or
  enable the device's **Hotspot** and connect the phone to it (no router or
  internet needed — direct tablet↔phone). The QR auto-refreshes when the
  network changes (live callback for Wi-Fi, background re-check for hotspot),
  plus a manual "Check again" button.
- **Bluetooth microphone support (Android)** — new Settings toggle routes the
  mic input to a paired Bluetooth headset / karaoke mic (native audio routing:
  `setCommunicationDevice` on Android 12+, Bluetooth SCO below). Note:
  Bluetooth mics use the voice link, so capture is call-grade — fine for
  scoring and vocal FX.

## [0.3.0] - 2026-07-17

### Added

- **Mic tab on the phone remote** — switch the mic mode right from the phone
  (Off / Clean / Karaoke / Pro; Off kills the mic so there's no accidental
  speaker feedback) plus the full soundboard: live-monitor toggle, FX presets,
  and reverb / echo / echo-time / bass / treble / mic-volume sliders. All
  controls are two-way synced with the host's Vocal effects panel, so there's
  no need to walk to the host screen to configure the mic.
- **Library folder** — imports are now copied into one on-disk folder so the
  whole collection is merged in one place and survives reinstalls:
  - Desktop: defaults to `Music/okara-library`, customizable in Settings
    (native imports are copied in; drag-and-drop too).
  - Android: fixed app-external `library` folder (visible over USB; back it up
    before uninstalling).
  - Bulk-copying files straight into the folder works — they're picked up and
    numbered on the next launch. Deleting a song in the app deletes its files
    from the folder (the folder is the source of truth).
  - Songs play directly from disk (no more duplicate blob storage for new
    imports); existing IndexedDB-stored songs keep working.

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

[Unreleased]: https://github.com/nrldcm/okara/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/nrldcm/okara/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/nrldcm/okara/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/nrldcm/okara/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/nrldcm/okara/releases/tag/v0.1.0
