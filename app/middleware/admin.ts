// UI-only guard: redirects non-admins before the page renders.
// Security is enforced server-side by requireAdmin() in every /api/admin/* handler.
// Any future admin action MUST include a server-side requireAdmin() call — this
// middleware alone is not sufficient and can be bypassed by JS manipulation.
//
// Deliberately does not run the registration gate: an admin has to reach this
// panel to create and promote the next edition before anyone can register for it.
export default defineNuxtRouteMiddleware(async () => {
  const user = useSupabaseUser();
  if (!user.value) return navigateTo("/ops/login");
  const { data: me } = await useMe();
  if (me.value?.role !== "admin") return navigateTo("/ops/dashboard");
});
