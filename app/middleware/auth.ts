import {
  isOpsClosedExempt,
  isRegistrationExempt,
} from "~/utils/registrationGate";

export default defineNuxtRouteMiddleware(async (to) => {
  // Closed for everyone but the admin panel and the auth flows: an admin has to
  // sign in to open it. The redirect is UX only — the server answers
  // 403 ops_closed on every edition-scoped route regardless.
  if (!isOpsClosedExempt(to.path)) {
    const { data: edition } = await useCurrentEdition();
    if (!edition.value?.ops_open) return navigateTo("/");
  }

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
