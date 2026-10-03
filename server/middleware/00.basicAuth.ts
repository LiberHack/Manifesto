import { isBasicAuthorized } from "#server/utils/basicAuth";

// Keep staging and PR previews (versions of the staging Worker, which share its
// secrets) away from anyone without the password: they hold a real dataset.
// Active only when NUXT_STAGING_BASIC_AUTH ("user:password") is set, and never
// on production. Static build assets are served before the Worker runs and
// stay public; every page and /api response passes through here.
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event);
  const expected = config.stagingBasicAuth as string;
  if (!expected || config.public.appEnv === "production") return;

  if (isBasicAuthorized(getHeader(event, "authorization"), expected)) return;

  setHeader(event, "WWW-Authenticate", 'Basic realm="LiberHack staging", charset="UTF-8"');
  setHeader(event, "X-Robots-Tag", "noindex, nofollow");
  throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
});
