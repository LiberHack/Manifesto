export default defineNuxtRouteMiddleware(() => {
  const user = useSupabaseUser();
  if (!user.value) return navigateTo("/ops/login");
  if (!user.value.email_confirmed_at) return navigateTo("/ops/verify-email");
});
