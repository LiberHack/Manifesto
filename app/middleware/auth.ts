export default defineNuxtRouteMiddleware(() => {
  const user = useSupabaseUser();
  if (!user.value) return navigateTo("/ops/login");
  if (!user.value.user_metadata?.email_verified)
    return navigateTo("/ops/verify-email");
});
