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
  play / pause / next / previous / stop / volume — and a **Mic tab** with mic
  modes (Off / Clean / Karaoke / Pro) and the full soundboard (reverb, echo,
  EQ, mic volume), synced live with the host.
- 💾 **Persistent library** — on desktop/Android, imports are merged into one
  on-disk **library folder** (customizable on desktop) that survives
  reinstalls; bulk-copy files into it and they're picked up on launch. Each
  song gets a dial number. (Pure web mode stores songs in IndexedDB.)
- 🌗 **Light & dark themes** — lively accent, neutral surfaces; follows the
  system preference and is mobile-friendly.

## About DVD / chip data

A karaoke DVD (Magic Sing, Platinum, MegaVision, TJ Media) contains **video
files** with the lyrics burned in. On the **desktop app** you can import a disc
image (`.iso`) or raw `VOB`/`DAT` files directly — okara extracts the tracks and
**converts them to MP4** (bundled ffmpeg) into your library folder, so those old
MPEG-2/MPEG-1 discs (which browsers can't play natively) become playable here
and on the tablet. Conversion runs once per disc. The **encrypted
chip/cartridge data** (e.g. a Magic Sing cartridge) is proprietary and cannot be
extracted. Only use files you legally own.

## Disclaimer

okara was made so you can keep enjoying karaoke discs (CDs/VCDs/DVDs) you
**already own** but can no longer play on aging physical players. It plays your
own media files and **does not include, host, or distribute** any songs,
lyrics, or karaoke content.

okara does **not** promote or encourage piracy. If you obtain or import
copyrighted material without a licence, that is **solely your responsibility** —
the developer neither provides such content nor endorses it. Only use files you
legally own. The software is provided **"as is"**, without warranty of any kind;
the author is not liable for how the software is used or for any content users
add to it.

© 2026 nrldcm · MIT License.

## Download (Windows & Android)

Grab the latest builds from the **Releases** page:

> **https://github.com/nrldcm/okara/releases/latest**

- `okara-X.Y.Z-setup.exe` — Windows installer
- `okara-X.Y.Z-portable.exe` — Windows portable, no install
- `okara-X.Y.Z.apk` — Android app (tablet/phone as karaoke host), Android 7+
- `SHA256SUMS.txt` — verify with `sha256sum -c SHA256SUMS.txt`

**Android install:** copy the `.apk` to the device and open it (allow
"install from unknown sources" when prompted). The app asks for mic access on
first launch — that's what powers pitch scoring. The tablet hosts the same QR
phone remote as the desktop app: open Settings → Phone remote and scan the QR
with any phone on the same Wi-Fi. Updates install over the old version (same
signing key).

**No Wi-Fi?** Turn on the tablet's **Hotspot**, connect the phone to it, and
the remote works with no router or internet at all. A paired **Bluetooth
mic** (headset / karaoke mic) can be used via Settings → Bluetooth microphone.

**Phone as microphone:** the remote can use the **phone itself as the mic**.
The phone is a **pure mic** — it captures your voice and streams it to the
host, and plays **no audio itself** (so it can't feed back). All sound — the
music and your voice — comes out of the **host (laptop/tablet) speakers**, and
the host scores the performance. This needs a secure page, so the remote is
served over **HTTPS with a self-signed certificate**; your phone shows a
one-time *"Not secure — proceed"* warning to accept (it's your own device on
your own LAN). Tap **Sing — use this phone as mic** on the remote.

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
(`.github/workflows/release.yml` builds Windows **and** Android in parallel).

- **Push a version tag** (`git tag v0.3.0 && git push --tags`) → builds **and
  publishes a [GitHub Release](https://github.com/nrldcm/okara/releases)** with
  the `.exe` files, the `.apk`, and `SHA256SUMS.txt` attached. Full steps in
  [`RELEASING.md`](RELEASING.md).
- **Actions → "Build & Release" → Run workflow** → same by default: builds
  and publishes a Release, creating the `v<version>` tag from `package.json`.
  Untick **publish** for a test build (workflow artifacts only, no Release).

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

## Build the Android app

The Android app is a Capacitor wrapper (`android/`) around the same SPA, plus
a native LAN remote server (`RemoteServer.java`, an Android port of
`electron/server.cjs`) so a tablet can host the QR phone remote. To build
locally (needs JDK 21 + Android SDK):

```bash
npm ci
NUXT_APP_BASE_URL=./ npx nuxt generate
npx cap sync android
cd android && ./gradlew assembleRelease
# -> android/app/build/outputs/apk/release/app-release.apk
```

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
