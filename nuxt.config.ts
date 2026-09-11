import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: process.env.NODE_ENV !== "production" },

  nitro: {
    preset: "cloudflare_module",
    cloudflare: { nodeCompat: true },
  },

  // Markdown content is served from a D1 database in production (see wrangler.jsonc).
  // In dev/build Nuxt Content still uses a local SQLite file under .data/.
  content: {
    database: { type: "d1", bindingName: "DB" },
  },

  // Workers cannot run sharp/ipx, so <NuxtImg> renders plain <img> tags.
  // Switch to provider "cloudflare" after enabling Images > Transformations on the zone.
  image: {
    provider: "none",
  },

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
    supabaseSecretKey: process.env.NUXT_SUPABASE_SECRET_KEY ?? "",
    resendApiKey: process.env.NUXT_RESEND_API_KEY ?? "",
    resendFromEmail: process.env.NUXT_RESEND_FROM_EMAIL ?? "",
    siteUrl: "https://liberhack.org",
    public: {
      // "production" | "staging" | "development" — anything but production is noindex.
      appEnv: process.env.NUXT_PUBLIC_APP_ENV ?? "development",
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL ?? "",
      supabasePublishableKey: process.env.NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    },
  },
});
