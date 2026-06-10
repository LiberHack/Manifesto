export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  if (config.public.siteMode !== 'dormant') return

  // In dormant mode: no Supabase server is running.
  // Clear any stale tokens from the previous live season to avoid console errors.
  const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-') || k.startsWith('supabase'))
  keys.forEach(k => localStorage.removeItem(k))
})
