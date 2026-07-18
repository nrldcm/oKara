export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2025-07-01',
  devtools: { enabled: false },
  css: ['bootstrap-icons/font/bootstrap-icons.css', '~/assets/css/main.css'],
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
            "(function(){try{var m=localStorage.getItem('okara-theme-mode');var t;if(m==='night'){t='dark';}else if(m==='system'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}else{t='light';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();",
          tagPosition: 'head',
        },
      ],
    },
  },
  router: {
    options: { hashMode: true },
  },
})
