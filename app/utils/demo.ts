import type { StoredSong } from './db'

export const DEMO_TXT = `#TITLE:Bahay Kubo (Demo)
#ARTIST:Folk / okara synth
#BPM:120
#GAP:1000
: 0 3 0 Ba
: 4 3 4 hay
: 8 3 7  ku
: 12 3 12 bo
: 16 3 9  ku
: 20 3 7 bong
: 24 3 4  mun
: 28 6 0 ti
- 36
: 40 3 7 ka
: 44 3 7 hit
: 48 3 9  mun
: 52 3 7 ti
: 56 3 4  ang
: 60 3 4  ha
: 64 3 2 la
* 68 6 0 man
E`

export function demoSong(): StoredSong {
  return {
    id: 'demo-bahay-kubo',
    title: 'Bahay Kubo (Demo)',
    artist: 'Folk / okara synth',
    kind: 'ultrastar',
    source: 'Demo',
    hasScoring: true,
    createdAt: 0,
    txt: DEMO_TXT,
  }
}
