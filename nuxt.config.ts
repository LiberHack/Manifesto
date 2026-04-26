import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: process.env.NODE_ENV !== "production" },

  vite: {
    plugins: [tailwindcss() as any],
  },
  css: ["./public/tailwind.css"],

  fonts: {
    throwOnError: true,
    devtools: true,
    experimental: {
      disableLocalFallbacks: true,
    },
    families: [
      {
        name: "3270",
        provider: "local",
        global: true,
        weights: [700, 700],
        src: "/3270_font/3270-Regular.otf",
      },
      {
        name: "cygrotesk",
        provider: "local",
        global: true,
        weights: [700, 700],
        src: "/CyGrotesk-GrandRegular.otf",
      },
    ],
  },

  modules: [
    "@nuxt/fonts",
    "@nuxt/hints",
    "@nuxt/icon",
    "@nuxt/image",
    "@nuxt/content",
    "@nuxtjs/supabase",
  ],

  supabase: {
    // Disable auto-redirect — we handle it via manual middleware
    redirectOptions: {
      login: "/ops/login",
      callback: "/confirm",
      exclude: ["/*"],
    },
  },

  runtimeConfig: {
    supabaseServiceKey: process.env.NUXT_SUPABASE_SERVICE_KEY ?? "",
    resendApiKey: process.env.NUXT_RESEND_API_KEY ?? "",
    resendFromEmail: process.env.NUXT_RESEND_FROM_EMAIL ?? "",
    siteUrl: "https://liberhack.org",
    public: {
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL ?? "",
      supabaseAnonKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      emailVerifiedUrl: "https://liberhack.org/ops/confirm",
    },
  },
});
