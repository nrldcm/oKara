# Changelog

All notable changes to **okara** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each released version has a matching git tag `vX.Y.Z` and a
[GitHub Release](https://github.com/nrldcm/okara/releases) with the Windows
installer and portable `.exe` (plus `SHA256SUMS.txt`) attached.

## [Unreleased]

_Nothing yet._

## [0.9.0] - 2026-07-18

### Added

- **Import DVD/VCD disc images (.iso) — desktop** — okara now reads a karaoke
  disc image directly: it extracts each video track from the ISO (a built-in
  ISO9660 reader, no external tools) and **transcodes it to MP4 (H.264/AAC,
  stereo preserved for voice-on/off)** with a bundled ffmpeg, dropping the
  results straight into your library folder. Raw **VOB/DAT** video files can be
  imported and converted the same way. A progress bar shows each track as it
  converts. This finally makes those old MPEG-2/MPEG-1 discs — which browsers
  can't play natively — playable here and on the tablet (copy the converted
  MP4s over). Conversion runs once per disc.

## [0.8.2] - 2026-07-18

### Changed

- **Lower phone-as-mic latency** — smaller capture buffer on the phone (512),
  an interactive-latency host playback context, a 20 ms jitter cushion, and a
  resync guard so latency can't creep up with network jitter. This meaningfully
  cuts the phone-mic delay, but note it is a **wireless mic over Wi-Fi** and can
  never be truly near-zero: for lowest latency (~10-25 ms) plug a mic into the
  host (tablet/laptop) and use "Hear my voice" (the native Oboe engine),
  instead of the phone.

## [0.8.1] - 2026-07-18

### Fixed

- **Phone-mic feedback on the phone** — the phone no longer plays any audio
  when used as the mic. It is now a **pure microphone**: it captures and
  streams your voice, and all sound (music + your voice) comes out of the
  **host (laptop/tablet) speakers**, so the phone can't feed back on itself.
  Mic capture also enables echo cancellation / noise suppression. The host
  "Mic volume" now controls the relayed phone-voice level.

## [0.8.0] - 2026-07-18

### Added

- **Phone as microphone** — the remote can now use the **phone itself as the
  karaoke mic**. Tap **Sing** on the remote: the singer hears their own voice
  **locally from the phone** (near-zero latency, never crosses the network),
  while the host scores the performance and plays the relayed voice through the
  main speakers for the room. The host **stops using its own built-in mic**
  entirely while a phone mic is active, so there is no feedback/echo.
- The remote is now served over **HTTPS with a self-signed certificate**
  (required for the phone mic's secure context) on both the desktop and Android
  hosts. Phones show a one-time "not secure — proceed" warning to accept.
- **Remote QR modal** — the topbar **Remote** button now opens the pairing QR
  in a modal, in addition to appearing in Settings.
- **About / disclaimer** in Settings and the README — authorship, copyright,
  MIT licence, and a clear disclaimer that okara ships no content and does not
  condone piracy (it plays media you already own).

### Fixed

- **Queue didn't auto-play the next song** — reserved/queued songs now
  auto-start the moment they come up (karaoke-machine behavior), instead of
  waiting on a manual Play.
- Turning on "Hear my voice" while using the phone mic no longer routes the
  host's own microphone (which caused painful echo/static); the host mic is
  never monitored when the phone is the mic.

## [0.7.0] - 2026-07-18

### Added

- **Songbook on the phone remote** — a new **Songs** tab that receives the full
  library from the host and lets singers **search by number, title, or artist**
  and tap **Play** or **Reserve** — no more typing dial numbers or needing a
  paper songbook. Works on the LAN remote (desktop + Android hosts) and the web
  remote; the list stays in sync as the library changes.
- **Library search by number** on the host, plus **editable song numbers**
  (tap the # on a song) so the library can match a DVD/karaoke songbook. The
  dial pad now accepts up to **8 digits**.
- **Volume label on import** — tag an import (e.g. "MegaVision Vol 3") to
  prefix its song titles, keeping generic DVD track names (AVSEQ01…)
  identifiable per volume.
- **Theme setting: Day / Night / System** in Settings, defaulting to **Day**.
  (Was dark-only by default.)
- **Advanced settings** modal with a **configurable remote-server port**
  (Auto or a fixed port like 3000); changing it restarts the remote server in
  place and refreshes the pairing QR.

### Changed

- Settings and Import pages are now centered on wide screens.

## [0.6.1] - 2026-07-17

### Changed

- **Mic volume can now boost up to 200%** (was capped at 100%) on the host
  panel and the phone remote's Mic tab — like real karaoke machines, the mic
  can be amplified above unity, not just attenuated. The native monitor soft-
  clips (tanh) so a hot mic limits gracefully instead of distorting harshly.
- The remote's music slider is now labeled **Music** so it's clear it controls
  the song volume, separate from **Mic volume** in the Mic tab.

## [0.6.0] - 2026-07-17

### Changed

- **Mic monitor latency pushed to the hardware floor (Android)** — the native
  monitor now runs on an **Oboe/AAudio engine** (LowLatency performance mode +
  Exclusive sharing, which enables the MMAP no-IRQ path on supported devices):
  typically **10-25 ms** mic-to-speaker, the minimum Android hardware allows.
  All FX are computed inside the audio callback in C++ — shelf EQ (bass/
  treble), echo (ring-buffer delay), and a Freeverb-style reverb — so nothing
  adds buffering. Falls back to the v0.5.0 Java loop on devices where the
  native engine can't start.
- True 0 ms is physically impossible (even hardware karaoke machines are a
  few ms, and sound itself travels ~1 ms per 34 cm) — but 10-25 ms is below
  what human hearing can perceive as an echo. For best results use a wired or
  aux speaker: a **Bluetooth speaker adds 100-200 ms of its own** and will
  always feel delayed, no matter the app.

## [0.5.0] - 2026-07-17

### Fixed

- **Mic monitor delay on Android** — hearing your own voice was delayed by the
  WebView's audio output path (150–300 ms, unrelated to Wi-Fi). The monitor now
  runs as a **native mic→speaker passthrough** (dedicated audio thread, native
  buffer size, `PERFORMANCE_MODE_LOW_LATENCY`) at roughly 20–50 ms, with echo
  done natively (ring-buffer delay) and reverb / bass / treble via Android's
  built-in audio effects on the output session. The soundboard controls
  (host + phone remote) drive the native path live. Pitch scoring still runs
  in the web layer and is unaffected.
- Web/desktop mic path tuned further: `latency: 0` capture hint and a
  zero-latency `AudioContext` hint.

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

[Unreleased]: https://github.com/nrldcm/okara/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/nrldcm/okara/compare/v0.8.2...v0.9.0
[0.8.2]: https://github.com/nrldcm/okara/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/nrldcm/okara/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/nrldcm/okara/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/nrldcm/okara/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/nrldcm/okara/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/nrldcm/okara/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/nrldcm/okara/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/nrldcm/okara/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/nrldcm/okara/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/nrldcm/okara/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/nrldcm/okara/releases/tag/v0.1.0
