export default defineNuxtRouteMiddleware(async () => {
  const user = useSupabaseUser();
  if (!user.value) return navigateTo("/ops/login");

  const { data } = await useFetch<{ role: string }>("/api/me");
  if (data.value?.role !== "admin") return navigateTo("/dashboard");
});
