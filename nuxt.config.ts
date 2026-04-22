// https://nuxt.com/docs/api/configuration/nuxt-config
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
  ],
});
