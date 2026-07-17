# okara — open karaoke

Open karaoke app na gawa sa **Nuxt 4** (SPA), na pwedeng i-wrap sa **Electron** para maging desktop videoke machine. May UltraStar player, real-time **pitch scoring**, at **QR phone remote**.

## Features

- 🎤 **UltraStar player** — nagpaparse ng `.txt` na kanta, synced lyrics + note bars sa canvas.
- 🎯 **Pitch scoring** — real-time mic pitch detection (Web Audio autocorrelation), 0–10000 points, stars, at feedback.
- 🎼 **Built-in demo** — "Bahay Kubo", synth melody, gumagana kahit walang files (walang i-download).
- 📥 **Import** — drag-and-drop / file / folder picker. Tinatanggap:
  - UltraStar `.txt` + audio → full scoring
  - video karaoke files (`.mp4 .avi .mpg .dat .vob …`) mula sa DVD (Magic Sing / Platinum / MegaVision) → playback na may **voice on/off** (L/R channel switch)
  - audio files → simpleng playback
- 📱 **QR phone remote** — i-scan ang QR, gawing remote ang phone: play / pause / next / prev / stop / volume.
- 💾 **Persistent library** — naka-save sa IndexedDB, hindi nawawala pag-restart.

## Tungkol sa DVD / chip data

Ang laman ng karaoke DVD (Magic Sing, Platinum, MegaVision) ay **video files** na naka-burn ang lyrics — ma-import at ma-play ito. Ang **encrypted chip/cartridge data** (hal. Magic Sing cartridge) ay proprietary at hindi ma-extract. Gamitin lang ang mga file na legal mong pag-aari.

## Development

```bash
npm install
npm run dev          # http://localhost:3000
```

Web mode: gumagana ang phone remote sa **same device** (bagong tab, `#/remote`) via BroadcastChannel — para sa demo/testing.

## Desktop (Electron) + secure phone remote

Para sa tunay na scan-from-phone remote, gamitin ang desktop app. Kailangan ng Electron:

```bash
npm i -D electron ws
npm run electron     # nag-generate ng static build + nag-launch ng Electron
```

Paano gumagana ang remote:

- Nagpapatakbo ang Electron ng maliit na **local HTTP + WebSocket server** sa LAN.
- Ang host screen (Settings → Phone remote) ay nagpapakita ng **QR** na may random **pairing token**.
- I-scan ng phone → bubukas ang remote page → kokonekta via WebSocket.

**Security:**

- Kailangan ng **one-time token** (mula sa QR) para tumanggap ang WebSocket ng koneksyon — walang token, walang access.
- **LAN-only** — hindi exposed sa internet; nasa parehong Wi-Fi lang.
- Bagong token kada launch ng app.

## Build para sa web

```bash
npm run generate     # static site sa .output/public
```

## Format

UltraStar `.txt` (`#TITLE #ARTIST #BPM #GAP` + note lines `: start length pitch text`). Reference: <https://usdx.eu/format/>.
