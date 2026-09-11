// Keep staging and PR previews out of search engines. Production is the only
// deployment with NUXT_PUBLIC_APP_ENV=production (see wrangler.jsonc `vars`).
export default defineEventHandler((event) => {
  if (useRuntimeConfig(event).public.appEnv !== "production") {
    setHeader(event, "X-Robots-Tag", "noindex, nofollow");
  }
});
