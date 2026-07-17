<script setup lang="ts">
import type { RuntimeSong } from '~/composables/useLibrary'

const props = defineProps<{ songs: RuntimeSong[] }>()
const emit = defineEmits<{ play: [RuntimeSong]; remove: [string] }>()

const query = ref('')
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.songs
  return props.songs.filter((s) =>
    `${s.title} ${s.artist} ${s.source}`.toLowerCase().includes(q))
})

const badge = (s: RuntimeSong) =>
  s.hasScoring ? 'Scoring' : s.kind === 'video' ? 'Video' : 'Audio'
</script>

<template>
  <section class="lib">
    <div class="lib__head">
      <h1>Library</h1>
      <input v-model="query" class="search" placeholder="Hanapin ang kanta o artist…" />
    </div>

    <p v-if="!filtered.length" class="empty">
      Walang kanta dito. Pumunta sa <strong>Import</strong> para magdagdag.
    </p>

    <div class="grid">
      <article v-for="s in filtered" :key="s.id" class="card" @click="emit('play', s)">
        <div class="thumb" :style="s.coverUrl ? { backgroundImage: `url(${s.coverUrl})` } : {}">
          <span v-if="!s.coverUrl" class="thumb__icon">{{ s.kind === 'video' ? '📺' : '🎤' }}</span>
          <span class="thumb__badge" :class="{ score: s.hasScoring }">{{ badge(s) }}</span>
          <button class="del" title="Tanggalin" @click.stop="emit('remove', s.id)">✕</button>
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
.lib { padding: 8px 4px 40px; }
.lib__head { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.lib__head h1 { margin: 0; font-size: 26px; }
.search { flex: 1; min-width: 200px; padding: 12px 16px; border-radius: 999px; border: 1px solid #2a2a44;
  background: #14142a; color: #fff; font-size: 15px; }
.empty { opacity: .6; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 18px; }
.card { cursor: pointer; }
.thumb { position: relative; aspect-ratio: 1; border-radius: 14px; background: linear-gradient(135deg, #2a2a55, #1a1a33);
  background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center;
  transition: transform .15s; }
.card:hover .thumb { transform: translateY(-3px); box-shadow: 0 10px 24px rgba(0,0,0,.4); }
.thumb__icon { font-size: 44px; }
.thumb__badge { position: absolute; top: 8px; left: 8px; font-size: 11px; padding: 3px 8px; border-radius: 999px;
  background: rgba(0,0,0,.5); }
.thumb__badge.score { background: #ff5da2; }
.del { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; border-radius: 50%; border: none;
  background: rgba(0,0,0,.5); color: #fff; cursor: pointer; opacity: 0; transition: opacity .15s; }
.card:hover .del { opacity: 1; }
.meta { padding: 10px 4px; display: flex; flex-direction: column; line-height: 1.3; }
.meta strong { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta span { font-size: 12px; opacity: .6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta .src { font-size: 10px; opacity: .4; font-style: normal; margin-top: 2px; }
</style>
