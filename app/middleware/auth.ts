import { isRegistrationExempt } from "~/utils/registrationGate";

export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSupabaseUser();
  if (!user.value) return navigateTo("/ops/login");
  if (!user.value.user_metadata?.email_verified)
    return navigateTo("/ops/verify-email");

  if (isRegistrationExempt(to.path)) return;

  // The redirect is UX only — the server enforces the gate with
  // 403 not_registered on every edition-scoped mutation.
  const { data: me } = await useMe();
  if (me.value && me.value.registration === null) {
    // Carry the intended destination so an invite link survives the detour.
    return navigateTo(
      `/ops/register-edition?next=${encodeURIComponent(to.fullPath)}`,
    );
  }
});
