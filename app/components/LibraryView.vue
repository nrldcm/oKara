<script setup lang="ts">
import type { RuntimeSong } from '~/composables/useLibrary'

const props = defineProps<{ songs: RuntimeSong[] }>()
const emit = defineEmits<{ play: [RuntimeSong]; reserve: [RuntimeSong]; remove: [string]; renumber: [string, number]; mapCues: [RuntimeSong]; editMeta: [{ id: string; number: number; title: string; artist: string }] }>()

const query = ref('')
// Songbook-style list (default) vs. thumbnail grid.
const mode = useState<'list' | 'grid'>('okara-lib-mode', () => 'list')
type Field = 'all' | 'number' | 'title' | 'artist'
const field = ref<Field>('all')
const FIELDS: { value: Field; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'number', label: 'No.' },
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
]

// A merged big video that has been mapped into clips is hidden — its clips are
// the real, searchable songs.
const visible = computed(() => props.songs.filter((s) => !s.clipParent))

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return visible.value
  return visible.value.filter((s) => {
    if (field.value === 'number') return String(s.number).includes(q)
    if (field.value === 'title') return s.title.toLowerCase().includes(q)
    if (field.value === 'artist') return s.artist.toLowerCase().includes(q)
    return `${s.number} ${s.title} ${s.artist} ${s.source}`.toLowerCase().includes(q)
  })
})

const badge = (s: RuntimeSong) =>
  s.hasScoring ? 'Scoring' : s.kind === 'video' ? 'Video' : 'Audio'

// Song numbers are editable so the library can match a DVD songbook.
function editNumber(s: RuntimeSong) {
  const raw = window.prompt(`New number for "${s.title}" (1-99999999):`, String(s.number))
  if (raw == null) return
  const n = Number(raw.trim())
  if (!Number.isInteger(n) || n < 1 || n > 99999999) return
  emit('renumber', s.id, n)
}

// Label a song from the songbook: number/code, title, artist.
function editDetails(s: RuntimeSong) {
  const numStr = window.prompt('Number / code (from your songbook):', String(s.number))
  if (numStr == null) return
  const title = window.prompt('Song title:', s.title)
  if (title == null) return
  const artist = window.prompt('Artist:', s.artist)
  if (artist == null) return
  const number = parseInt(numStr.trim(), 10)
  emit('editMeta', { id: s.id, number: Number.isFinite(number) ? number : s.number, title, artist })
}
</script>

<template>
  <section class="lib">
    <div class="lib__head">
      <h1>Library</h1>
      <input
        v-model="query" class="search"
        :placeholder="field === 'number' ? 'Search by number…' : field === 'artist' ? 'Search by artist…' : field === 'title' ? 'Search by title…' : 'Search number, title, or artist…'"
      />
    </div>
    <div class="filters">
      <button
        v-for="f in FIELDS" :key="f.value"
        class="filter" :class="{ active: field === f.value }"
        @click="field = f.value"
      >{{ f.label }}</button>
      <span class="filters__count">{{ filtered.length }} song{{ filtered.length === 1 ? '' : 's' }}</span>
      <div class="view-toggle">
        <button :class="{ active: mode === 'list' }" title="List" @click="mode = 'list'"><i class="bi bi-list-ul" /></button>
        <button :class="{ active: mode === 'grid' }" title="Grid" @click="mode = 'grid'"><i class="bi bi-grid-3x3-gap-fill" /></button>
      </div>
    </div>

    <p v-if="!filtered.length" class="empty">
      No songs yet. Go to <strong>Settings → Import</strong> to add some.
    </p>

    <!-- Songbook list: # code | Title | Artist | actions -->
    <div v-else-if="mode === 'list'" class="songlist">
      <div class="songlist__head">
        <span class="c-no">No.</span><span class="c-title">Title</span>
        <span class="c-artist">Artist</span><span class="c-act">Actions</span>
      </div>
      <div v-for="s in filtered" :key="s.id" class="songrow" @dblclick="emit('play', s)">
        <span class="c-no">{{ s.number }}</span>
        <span class="c-title" :title="s.title">{{ s.title }}</span>
        <span class="c-artist" :title="s.artist">{{ s.artist }}</span>
        <span class="c-act">
          <button class="act play" title="Play now" @click="emit('play', s)"><i class="bi bi-play-fill" /></button>
          <button class="act" title="Add to queue" @click="emit('reserve', s)"><i class="bi bi-plus-lg" /></button>
          <button class="act" title="Edit number / title / artist" @click="editDetails(s)"><i class="bi bi-pencil-fill" /></button>
          <button v-if="s.kind === 'video' && !s.clip && s.videoPath" class="act" title="Map songs inside this video" @click="emit('mapCues', s)"><i class="bi bi-scissors" /></button>
          <button class="act danger" title="Remove" @click="emit('remove', s.id)"><i class="bi bi-x-lg" /></button>
        </span>
      </div>
    </div>

    <div v-else class="grid">
      <article v-for="s in filtered" :key="s.id" class="card" @click="emit('play', s)">
        <div class="thumb" :style="s.coverUrl ? { backgroundImage: `url(${s.coverUrl})` } : {}">
          <i v-if="!s.coverUrl" class="thumb__icon bi" :class="s.kind === 'video' ? 'bi-tv-fill' : 'bi-mic-fill'" />
          <span class="thumb__badge" :class="{ score: s.hasScoring }">{{ badge(s) }}</span>
          <button class="thumb__num" title="Edit song number" @click.stop="editNumber(s)">#{{ s.number }} <i class="bi bi-pencil-fill" /></button>
          <button v-if="s.kind === 'video' && !s.clip && s.videoPath" class="map" title="Map songs inside this video" @click.stop="emit('mapCues', s)"><i class="bi bi-scissors" /></button>
          <button class="edit" title="Edit number / title / artist" @click.stop="editDetails(s)"><i class="bi bi-pencil-fill" /></button>
          <button class="del" title="Remove" @click.stop="emit('remove', s.id)"><i class="bi bi-x-lg" /></button>
        </div>
        <div class="meta">
          <strong :title="s.title">{{ s.title }}</strong>
          <span>{{ s.artist }}</span>
          <em class="src">{{ s.source }}</em>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.lib { padding: 4px 2px 40px; }
.lib__head { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.lib__head h1 { margin: 0; font-size: 26px; }
.search { flex: 1; min-width: 180px; padding: 12px 16px; border-radius: 999px; border: 1px solid var(--border);
  background: var(--surface); color: var(--text); font-size: 15px; }
.search::placeholder { color: var(--text-faint); }
.filters { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; flex-wrap: wrap; }
.filter { padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface);
  color: var(--text-muted); cursor: pointer; font-size: 13px; }
.filter.active { background: var(--accent); color: var(--on-accent); border-color: var(--accent); font-weight: 600; }
.filters__count { margin-left: auto; font-size: 12px; color: var(--text-faint); }
.view-toggle { display: inline-flex; gap: 2px; background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 3px; }
.view-toggle button { border: none; background: none; color: var(--text-muted); width: 30px; height: 26px; border-radius: 999px; cursor: pointer; }
.view-toggle button.active { background: var(--accent-grad); color: #fff; }

/* Songbook list */
.songlist { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
.songlist__head, .songrow { display: grid; grid-template-columns: 90px 1fr 1fr auto; gap: 12px; align-items: center; padding: 10px 16px; }
.songlist__head { background: var(--surface-2); font-size: 12px; color: var(--text-faint); text-transform: uppercase; letter-spacing: .04em; }
.songrow { border-top: 1px solid var(--border); background: var(--surface); cursor: default; }
.songrow:hover { background: var(--surface-2); }
.c-no { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--accent); }
.c-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-artist { color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-act { display: flex; gap: 6px; justify-content: flex-end; }
.act { border: none; background: var(--surface-2); color: var(--text-muted); width: 30px; height: 30px; border-radius: 8px; cursor: pointer; font-size: 13px; }
.act:hover { color: var(--text); }
.act.play { background: var(--accent-grad); color: #fff; }
.act.danger:hover { color: var(--danger); }
@media (max-width: 600px) {
  .songlist__head, .songrow { grid-template-columns: 54px 1fr auto; }
  .songlist__head .c-artist, .songrow .c-artist { display: none; }
}
.empty { opacity: .6; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 18px; }
.card { cursor: pointer; }
.thumb { position: relative; aspect-ratio: 1; border-radius: 14px;
  background: linear-gradient(135deg, var(--surface-2), var(--surface));
  background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); transition: transform .15s, box-shadow .15s; }
.card:hover .thumb { transform: translateY(-3px); box-shadow: var(--shadow); }
.thumb__icon { font-size: 44px; }
.thumb__badge { position: absolute; top: 8px; left: 8px; font-size: 11px; padding: 3px 8px; border-radius: 999px;
  background: rgba(0, 0, 0, .55); color: #fff; }
.thumb__badge.score { background: var(--accent); }
.thumb__num { position: absolute; bottom: 8px; left: 8px; font-size: 12px; font-weight: 700;
  font-variant-numeric: tabular-nums; padding: 2px 8px; border-radius: 8px; background: rgba(0, 0, 0, .55);
  color: #fff; border: none; cursor: pointer; }
.thumb__num .bi { font-size: 9px; opacity: .7; }
.del { position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; border-radius: 50%; border: none;
  background: rgba(0, 0, 0, .55); color: #fff; cursor: pointer; opacity: 0; transition: opacity .15s; }
.card:hover .del { opacity: 1; }
.map { position: absolute; top: 6px; right: 38px; width: 26px; height: 26px; border-radius: 50%; border: none;
  background: rgba(0, 0, 0, .55); color: #fff; cursor: pointer; opacity: 0; transition: opacity .15s; font-size: 12px; }
.card:hover .map { opacity: 1; }
.edit { position: absolute; top: 6px; left: 6px; width: 26px; height: 26px; border-radius: 50%; border: none;
  background: rgba(0, 0, 0, .55); color: #fff; cursor: pointer; opacity: 0; transition: opacity .15s; font-size: 11px; }
.card:hover .edit { opacity: 1; }
.meta { padding: 10px 4px; display: flex; flex-direction: column; line-height: 1.3; }
.meta strong { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta span { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta .src { font-size: 10px; color: var(--text-faint); font-style: normal; margin-top: 2px; }

@media (max-width: 560px) {
  .lib__head h1 { font-size: 22px; }
  .grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; }
  .thumb__icon { font-size: 34px; }
  .del, .map, .edit { opacity: 1; }
}
</style>
