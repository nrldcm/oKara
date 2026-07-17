export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2025-07-01',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'okara — open karaoke',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1' },
        { name: 'description', content: 'Open karaoke — UltraStar player, pitch scoring, phone remote.' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: 'favicon.svg' }],
      script: [
        {
          innerHTML:
            "(function(){try{var t=localStorage.getItem('okara-theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();",
          tagPosition: 'head',
        },
      ],
    },
  },
  router: {
    options: { hashMode: true },
  },
})
