// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2026-03-01",
  devtools: { enabled: true },

  typescript: {
    strict: true,
  },

  // Cloudflare 認証情報は .env から読み込む
  // 例: NUXT_PUBLIC_CF_APP_ID=xxx  NUXT_PUBLIC_CF_TOKEN=yyy
  runtimeConfig: {
    public: {
      cfAppId: process.env.NUXT_PUBLIC_CF_APP_ID || "",
      cfToken: process.env.NUXT_PUBLIC_CF_TOKEN || "",
    },
  },

  // ページ自動インポート
  pages: true,
});
