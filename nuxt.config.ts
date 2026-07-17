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
    },
  },
  router: {
    options: { hashMode: true },
  },
})
