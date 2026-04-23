// UI-only guard: redirects non-admins before the page renders.
// Security is enforced server-side by requireAdmin() in every /api/admin/* handler.
// Any future admin action MUST include a server-side requireAdmin() call — this
// middleware alone is not sufficient and can be bypassed by JS manipulation.
export default defineNuxtRouteMiddleware(async () => {
  const user = useSupabaseUser();
  if (!user.value) return navigateTo("/ops/login");

  const { data } = await useFetch<{ role: string }>("/api/me");
  if (data.value?.role !== "admin") return navigateTo("/ops/dashboard");
});
