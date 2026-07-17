# okara — open karaoke

An open karaoke app built with **Nuxt 4** (SPA) that can be wrapped in
**Electron** to run as a desktop videoke machine. It has an UltraStar player,
real-time **pitch scoring**, **vocal effects** (reverb/echo/EQ), and a
**number-pad phone remote**.

## Features

- 🎤 **UltraStar player** — parses `.txt` songs and shows synced lyrics and
  note bars on a canvas.
- 🎯 **Pitch scoring** — real-time mic pitch detection (Web Audio
  autocorrelation), 0–10000 points, stars, and feedback.
- 🎚️ **Vocal effects** — reverb, echo, bass/treble EQ, and mic volume, with
  live monitoring (hear your voice) and quick mic modes (Off / Clean / Karaoke /
  Pro). Low-latency audio path.
- 🎼 **Built-in demo** — "Bahay Kubo", a synth melody that works with no files.
- 📥 **Import** — drag-and-drop, or file / folder picker. Supports:
  - UltraStar `.txt` + audio → full scoring
  - karaoke video files (`.mp4 .avi .mpg .dat .vob …`) from DVDs
    (Magic Sing / Platinum / MegaVision / TJ Media) → playback with **voice
    on/off** (left/right channel switch)
  - audio files → simple playback
- 🔢 **Number-pad phone remote** — scan a QR to turn a phone into a karaoke
  remote: dial a song number to **Play** now or **Reserve** to a queue, plus
  play / pause / next / previous / stop / volume.
- 💾 **Persistent library** — stored in IndexedDB; each song gets a dial number.
- 🌗 **Light & dark themes** — lively accent, neutral surfaces; follows the
  system preference and is mobile-friendly.

## About DVD / chip data

A karaoke DVD (Magic Sing, Platinum, MegaVision, TJ Media) contains **video
files** with the lyrics burned in — those can be imported and played. The
**encrypted chip/cartridge data** (e.g. a Magic Sing cartridge) is proprietary
and cannot be extracted. Only use files you legally own.

## Download (Windows)

Grab the latest desktop build from the **Releases** page:

> **https://github.com/nrldcm/okara/releases/latest**

- `okara-X.Y.Z-setup.exe` — installer
- `okara-X.Y.Z-portable.exe` — portable, no install
- `SHA256SUMS.txt` — verify with `sha256sum -c SHA256SUMS.txt`

Releases are versioned ([SemVer](https://semver.org)) and every change is
recorded in [`CHANGELOG.md`](CHANGELOG.md). See [`RELEASING.md`](RELEASING.md)
for how builds are cut.

## Development

```bash
npm install
npm run dev          # http://localhost:3000
```

In web mode the phone remote works on the **same device** (a new tab at
`#/remote`) via BroadcastChannel — for demo/testing.

## Desktop (Electron) + secure phone remote

For real scan-from-phone remote control, use the desktop app:

```bash
npm i -D electron
npm run electron     # generates a static build and launches Electron
```

How the remote works:

- Electron runs a small **local HTTP + WebSocket server** on the LAN.
- The host screen (Settings → Phone remote) shows a **QR** with a random
  **pairing token**.
- Scanning the QR opens the remote page on the phone, which connects over
  WebSocket.

**Security:**

- The WebSocket only accepts connections with the **one-time token** from the
  QR — no token, no access.
- **LAN-only** — not exposed to the internet; both devices must be on the same
  Wi-Fi.
- A new token is generated on every app launch.

## Build a Windows `.exe`

**Easiest — no Windows machine needed:** GitHub Actions builds it for you
(`.github/workflows/build-windows.yml`, on a `windows-latest` runner).

- **Push a version tag** (`git tag v0.2.0 && git push --tags`) → builds **and
  publishes a [GitHub Release](https://github.com/nrldcm/okara/releases)** with
  the `.exe` files and `SHA256SUMS.txt` attached. Full steps in
  [`RELEASING.md`](RELEASING.md).
- **Actions → "Build Windows app" → Run workflow** → builds and uploads the
  `.exe` files as **workflow artifacts** only (for testing a build, no Release).

**Locally on Windows:**

```bash
npm ci
npm i -D electron electron-builder
npm run dist         # -> dist-electron/okara-<version>-setup.exe (+ portable)
```

Packaging config lives in `electron-builder.yml`. The app icon comes from
`build/icon.ico` (regenerate with `npm run icons` after editing
`build/icon.svg`). Note: cross-compiling a Windows installer from Linux/macOS
needs Wine — the GitHub Actions route avoids that.

## Build for the web

```bash
npm run build        # Node server output in .output/server
npm run start        # node .output/server/index.mjs (listens on PORT)
```

## Deploy (Dokploy)

The app builds via Nixpacks: `npm run build` → `npm run start`
(`node .output/server/index.mjs`, listening on `PORT`). Node 22 is pinned via
`nixpacks.toml`.

### Auto-deploy on push to `main`

A GitHub Actions workflow (`.github/workflows/deploy.yml`) triggers a Dokploy
redeploy on every push to `main` (or manually via "Run workflow").

One-time setup:

1. In Dokploy: open the app → **Deployments** → enable **Auto Deploy** and copy
   the **Webhook URL**.
2. In GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**
   - Name: `DOKPLOY_WEBHOOK_URL`
   - Value: the webhook URL from Dokploy
3. Set the Dokploy deploy branch to **`main`**.

**Alternative (no Actions):** paste the Dokploy Webhook URL directly into
**GitHub → Settings → Webhooks** (push event). This is Dokploy's native method —
pick one or the other.

## UltraStar format

UltraStar `.txt` (`#TITLE #ARTIST #BPM #GAP` plus note lines
`: start length pitch text`). Reference: <https://usdx.eu/format/>.
