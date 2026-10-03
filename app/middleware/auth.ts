import {
  isOpsClosedExempt,
  isRegistrationExempt,
} from "~/utils/registrationGate";

export default defineNuxtRouteMiddleware(async (to) => {
  // Closed for everyone but the admin panel and the auth flows: an admin has to
  // sign in to open it. The redirect is UX only — the server answers
  // 403 ops_closed on every edition-scoped route regardless.
  if (!isOpsClosedExempt(to.path)) {
    const { data: edition, error } = await useCurrentEdition();
    // A rate-limited lookup with nothing cached is not "closed": don't throw the
    // user out of /ops over it. The server still answers 403 ops_closed.
    if (!edition.value?.ops_open && error.value?.statusCode !== 429) return navigateTo("/");
  }

  const user = useSupabaseUser();
  if (!user.value)
    return navigateTo(`/ops/login?next=${encodeURIComponent(to.fullPath)}`);
  if (!user.value.user_metadata?.email_verified)
    return navigateTo("/ops/verify-email");

  if (isRegistrationExempt(to.path)) return;

  // The redirect is UX only — the server enforces the gate with
  // 403 not_registered on every edition-scoped mutation.
  const { data: me, refresh } = await useMe();
  // The cached /api/me may predate this session (fetched signed out before an
  // email-confirmation login), and a null there would skip the gate. A stale
  // one (past its TTL, or invalidated by a write such as a new edition going
  // live) is refreshed before deciding; "defer" joins a revalidation in flight.
  if (me.value?.id !== user.value.sub || useMeIsStale()) await refresh({ dedupe: "defer" });
  if (me.value && me.value.registration === null) {
    // Carry the intended destination so an invite link survives the detour.
    return navigateTo(
      `/ops/register-edition?next=${encodeURIComponent(to.fullPath)}`,
    );
  }
});
