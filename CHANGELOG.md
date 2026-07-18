# Changelog

All notable changes to **okara** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each released version has a matching git tag `vX.Y.Z` and a
[GitHub Release](https://github.com/nrldcm/okara/releases) with the Windows
installer and portable `.exe` (plus `SHA256SUMS.txt`) attached.

## [Unreleased]

_Nothing yet._

## [0.9.20] - 2026-07-18

### Added

- **Single instance** — only one okara runs at a time. Launching it again just
  focuses the window that's already open, instead of starting a second copy
  that would fight over the phone-remote port, disc conversions, and the library
  folder.
- **Startup splash screen** — a brief okara splash (logo + version) on launch.

### Changed

- **Redesigned Settings** — everything now lives in **collapsible panels**
  (closed by default), so the page is tidy and you expand only what you need.
- **Import moved into Settings** — it's now the first panel ("Import songs")
  instead of a separate tab.
- **Settings is a gear icon** in the top-right (next to the day/night toggle);
  the center tabs are gone — the okara logo takes you back to the Library.
- **Scrollbar sits at the window's edge** now (the whole page scrolls), instead
  of an inset scrollbar in the middle of the content.
- **Gradient styling to match the logo** — buttons, the toggle switches, and
  form accents use the pink→orange brand gradient.

### Developer

- The **error log** is now hidden by default and toggled with
  **Ctrl+Shift+Alt+F12** (it's a developer aid).

## [0.9.19] - 2026-07-18

### Fixed

- **"Conversion failed: pathToFileURL is not a function"** — imported songs
  never appeared in the Library even though the conversion succeeded. The
  desktop bridge built file URLs with a Node function that isn't available in
  Electron's sandboxed preload, so adding a file-backed song threw. File URLs
  are now built directly (Windows and POSIX paths), so imports show up
  correctly. **Already-converted files sitting in your library folder will be
  picked up automatically** on next launch — no need to re-convert.

## [0.9.18] - 2026-07-18

### Added

- **Cancel button while importing a disc** — a running `.iso` / VOB import can
  now be stopped. Cancelling kills the running conversions immediately; any
  tracks already fully converted are kept.

### Changed

- **Clear library now deletes everything** — every song's database record **and
  every file in the library folder** (not only tracked files), so nothing is
  left behind. The confirmation now says so plainly.
- **Removed the "Play now" disc section** (Scan inserted disc / Play from .iso /
  Play from disc folder). Direct disc/ISO playback was unreliable; use **Import
  .iso image** to convert a disc into your library, then map/search/play from
  there.

## [0.9.17] - 2026-07-18

### Added

- **Map songs inside one big video (cue points)** — for a karaoke video that
  holds **many songs in one file**, you can now split it into individual,
  searchable songs, like a karaoke machine. On a video in the Library, click the
  **scissors** button to open the mapper: play the video, click **Mark song
  start** each time a song begins, then type the **number, title, and artist**
  from your songbook. Saved cues become normal library songs — searchable by
  number/title/artist and queueable from the phone remote — and each **plays
  from its start time and stops when the next song begins**. The original
  whole-video entry is hidden once mapped (its songs are the real entries).

## [0.9.16] - 2026-07-18

### Fixed

- **Import appearing to stall (tracks stuck at "100%", no progress)** — three
  causes, all fixed:
  - **Too many tracks at once** thrashed the disk (every track both extracts a
    large VOB and runs ffmpeg). The parallel pool is now capped at **4**, which
    still gives a real speedup but keeps the disk from gridlocking.
  - **The final `+faststart` remux** rewrote the whole file at the end, so big
    tracks sat at "100%" while finalizing. It's **removed** — playback never
    needed it (files play complete, locally or with range requests), so a track
    now finishes the instant encoding ends.
  - The per-track bar could show **"100%" while still finalizing**; it now caps
    at 99% until the track is truly done.

## [0.9.15] - 2026-07-18

### Fixed

- **App freezing (unresponsive) while importing a disc** — extracting each ISO
  track from the image used **blocking** file I/O on the main process, so the
  whole window froze during extraction (worse with several tracks at once).
  Extraction is now **fully asynchronous (streamed)**, so the app stays
  responsive — you can browse, search, and play while a disc converts in the
  background. Output is byte-for-byte identical, and extraction is faster too.

## [0.9.14] - 2026-07-18

### Changed

- **Choosing a library location now uses one base folder** — pick a directory
  and okara creates a **`Library`** folder (your songs) and a hidden
  **`.okara-tmp`** folder (temporary files) inside it, both on the same drive.
  The temp folder is hidden (and marked hidden on Windows) and is **never
  scanned or read as part of your library**, so it stays out of your song list.
  Existing library folders keep working unchanged.

## [0.9.13] - 2026-07-18

### Fixed

- **Import filling up the C: drive (out-of-space failures)** — ISO tracks were
  extracted to the system temp folder on **C:** before converting, even when the
  library lived on another drive (e.g. **D:**). On a full C: drive this failed
  with "no space left on device". Extraction now happens in a hidden
  `.okara-tmp` folder **on the same drive as your library**, so the system drive
  no longer bloats. Leftover scratch files are cleared on startup.
- A disk-space failure now shows a **clear message** ("Not enough disk space on
  your library drive…") instead of a confusing "nothing convertible found".

## [0.9.12] - 2026-07-18

### Added

- **Error log** — the app now writes errors (failed conversions, unexpected
  problems) to a log file, and **Settings → Error log** has **Open log file**
  and **Copy log** buttons so you can grab the exact error and send it in.

### Changed

- A failed import now shows the **real error message** ("Conversion failed:
  …") instead of a generic "Conversion failed.", and the same detail is written
  to the log with the full ffmpeg command and output.

### Fixed

- **"Conversion failed" during Import .iso** — the parallel importer sent
  progress updates to the window very frequently; if the window had been closed
  or reloaded, that send threw and rejected the **whole** import. All messages
  to the window are now guarded, so a stale window can never fail a conversion.
- **Import failing on a moved/again-missing library folder** — if the saved
  library folder is no longer writable (e.g. a removed drive letter), okara now
  **falls back to the default folder** instead of failing every import.

## [0.9.11] - 2026-07-18

### Added

- **Per-track progress bars during Import .iso** — since tracks now convert in
  parallel, the import shows a **live sub-bar for each track being converted at
  once** (with its name and %), under the overall progress bar. Previously the
  single overall bar could look "stuck" on one number while several tracks were
  actually progressing behind it.

### Note

- Switching tabs (or playing a song) does **not** stop or pause an import — the
  conversion runs in the app's background process and keeps going regardless of
  which screen you're on.

## [0.9.10] - 2026-07-18

### Changed

- **Import .iso is much faster still** — the transcoder now uses **all your CPU
  cores**: it runs one parallel encode per core (previously capped at a few) and
  shares the cores fairly between them, and each track encodes with a faster
  x264 preset (`superfast`). A single track still gets every core. A multi-track
  disc now finishes in roughly `tracks ÷ cores` of the old one-at-a-time time.

## [0.9.9] - 2026-07-18

### Added

- **App version is now shown** — in the window title (`okara 0.9.9 — open
  karaoke`) and at the very bottom of **Settings** (`okara version 0.9.9`), so
  you can always tell which build you're running.
- **"Play from .iso" now adds the tracks to your Library** — the moment you
  open an ISO its tracks appear in the Library (searchable by number/title) and
  in the phone remote's songbook, so you can dial or queue them like any song.
  They stay lazy: each track converts to MP4 only the first time it's played,
  and that converted file is saved permanently in your library folder (survives
  restart, never re-converts). Re-opening the same ISO won't create duplicates.
- **Queue restore point** — the reserved queue is saved continuously, so if the
  app is closed or crashes it comes back on next launch. No need to re-add
  everything you had lined up.

### Changed

- **Import .iso is much faster** — tracks now transcode **in parallel** (a
  bounded pool sized to your CPU) instead of one at a time, so a multi-track
  disc finishes far sooner. Progress reflects the whole batch.
- Pressing **Play** on a disc/ISO track on an out-of-date build now shows a
  clear "update to v0.9.8+" message instead of silently doing nothing, and the
  "Play now" hint reflects the prepare-then-play flow (v0.9.8).

### Fixed

- The desktop app no longer hard-crashes on an unexpected background error
  (a bad track, a dropped socket) — such errors are logged and the app (and
  your queue) keep running.
- A failed disc/ISO conversion no longer leaves a broken, half-written file
  behind in the library folder.

## [0.9.8] - 2026-07-18

### Fixed

- **Disc/ISO playback looked datamoshed (vertical smearing / broken frames)** —
  the picture dissolved into dragging blocks and torn frames, like a corrupt
  video. The cause was **live-streaming a half-formed fragmented MP4** straight
  into the player: frames arrived without their keyframes, so `<video>` had
  nothing clean to draw from and smeared the previous frame instead. Playing
  from a disc/ISO now **transcodes the track to a complete temp MP4 first**
  (proper keyframes + `moov` + deinterlaced) and plays that file through a
  local, seekable media server — the same reliable path as an imported song. A
  short **"Preparing…"** overlay shows the convert progress, then it plays
  clean and fully seekable. (Importing still works too; this just makes
  press-play-from-disc reliable.)

### Fixed

- **DVD/VCD playback looked like a scratched disc (combing/tearing)** — even
  from a clean `.iso`. DVD/VCD video is **interlaced**, and it was being encoded
  as progressive, so the interlacing showed up as combing artifacts that look
  like disc damage. Both the import transcode and the live disc/ISO stream now
  **deinterlace** (`bwdif`), giving a clean, smooth picture. Re-import an ISO
  that was imported before this fix to get the deinterlaced version.

## [0.9.6] - 2026-07-18

### Fixed

- **Disc playback breaking up / glitching** — the live disc/ISO transcode and
  the import transcode now read DVD/VCD program streams robustly: a larger probe
  for VOB streams, and they **skip corrupt / out-of-order packets** and ignore
  read errors so a scratched or hard-to-read disc plays through the damage
  instead of stuttering (like a hardware player skipping a scratch). The live
  encoder switched from ultrafast/zerolatency to veryfast for a cleaner picture
  while still staying ahead of playback. For a badly scratched or slow disc,
  **importing** (full one-time convert to MP4) still gives the most reliable,
  glitch-free result.

## [0.9.5] - 2026-07-18

### Added

- **Insert-and-play, like a hardware DVD player (desktop)** — okara now
  auto-detects an inserted DVD/VCD in the optical/removable drive (polls for a
  VIDEO_TS or MPEGAV volume). A banner pops up — **"DVD inserted — Play"** — and
  one tap plays it directly via the live streaming transcode, no import needed.
  A **Scan inserted disc** button on the Import tab does the same on demand.

## [0.9.4] - 2026-07-18

### Added

- **Direct play from a disc / ISO (desktop)** — a **Play now** section on the
  Import tab plays a DVD/VCD track straight from an `.iso` image or a disc
  folder (VIDEO_TS / MPEGAV) **without importing**. A local streaming server
  live-transcodes the MPEG-2/MPEG-1 track to fragmented MP4 on the fly (reading
  ISO sectors straight into ffmpeg — no full extraction), so the browser player
  starts playing after a short buffer. Full player features (remote control,
  phone-as-mic) work on the streamed track. Use the existing "Import .iso"
  buttons instead when you want to keep the converted MP4 in your library.

## [0.9.3] - 2026-07-18

### Added

- **Advanced search fields** — the host Library and the remote's Songs tab now
  have **All / No. / Title / Artist** filter chips next to the search box, so you
  can search by a specific field (e.g. artist only) instead of just the combined
  match. Converted DVD/VCD tracks are searchable and numbered like any song.

## [0.9.2] - 2026-07-18

### Changed

- **Disc conversion now survives a page refresh** — the convert job runs in the
  Electron main process (the ffmpeg child keeps going regardless of the
  renderer), and the main process is now the source of truth for job status. A
  reloaded renderer queries it and restores the "Converting X%" indicator, and
  when a job finishes the library folder is re-scanned so the new MP4s appear
  without needing another restart. Combined with refresh being disabled, an
  in-progress import can no longer be lost.

## [0.9.1] - 2026-07-18

### Fixed

- **Disc conversion no longer lost on tab switch** — the DVD/VCD convert
  progress now lives in shared state and keeps running (and stays visible) when
  you change tabs or play a song. A "Converting X%" indicator shows in the top
  bar from anywhere while a conversion is in progress.
- **Page refresh disabled in the desktop app** — F5, Ctrl/Cmd+R, Ctrl+Shift+R,
  Ctrl+F5, and the menu Reload are all blocked so a refresh can't restart the
  app and abort an in-progress conversion.

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

[Unreleased]: https://github.com/nrldcm/okara/compare/v0.9.20...HEAD
[0.9.20]: https://github.com/nrldcm/okara/compare/v0.9.19...v0.9.20
[0.9.19]: https://github.com/nrldcm/okara/compare/v0.9.18...v0.9.19
[0.9.18]: https://github.com/nrldcm/okara/compare/v0.9.17...v0.9.18
[0.9.17]: https://github.com/nrldcm/okara/compare/v0.9.16...v0.9.17
[0.9.16]: https://github.com/nrldcm/okara/compare/v0.9.15...v0.9.16
[0.9.15]: https://github.com/nrldcm/okara/compare/v0.9.14...v0.9.15
[0.9.14]: https://github.com/nrldcm/okara/compare/v0.9.13...v0.9.14
[0.9.13]: https://github.com/nrldcm/okara/compare/v0.9.12...v0.9.13
[0.9.12]: https://github.com/nrldcm/okara/compare/v0.9.11...v0.9.12
[0.9.11]: https://github.com/nrldcm/okara/compare/v0.9.10...v0.9.11
[0.9.10]: https://github.com/nrldcm/okara/compare/v0.9.9...v0.9.10
[0.9.9]: https://github.com/nrldcm/okara/compare/v0.9.8...v0.9.9
[0.9.8]: https://github.com/nrldcm/okara/compare/v0.9.7...v0.9.8
[0.9.7]: https://github.com/nrldcm/okara/compare/v0.9.6...v0.9.7
[0.9.6]: https://github.com/nrldcm/okara/compare/v0.9.5...v0.9.6
[0.9.5]: https://github.com/nrldcm/okara/compare/v0.9.4...v0.9.5
[0.9.4]: https://github.com/nrldcm/okara/compare/v0.9.3...v0.9.4
[0.9.3]: https://github.com/nrldcm/okara/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/nrldcm/okara/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/nrldcm/okara/compare/v0.9.0...v0.9.1
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
