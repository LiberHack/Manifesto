import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

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
        name: "CY Grotesk Grand",
        provider: "local",
        global: true,
        weights: [400, 700],
        src: "~/cy-grotesk-grand.woff2",
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
      login: "/login",
      callback: "/confirm",
      exclude: ["/*"],
    },
  },

  runtimeConfig: {
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    public: {
      supabaseUrl: process.env.SUPABASE_URL ?? "",
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
    },
  },
});
