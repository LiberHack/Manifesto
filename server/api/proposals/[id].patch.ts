import { requireRegistration } from "#server/utils/requireRegistration";
import { membershipError } from "#server/utils/joinRequests";

const PROPOSAL_ERRORS: Record<string, [number, string]> = {
  proposal_not_found: [404, "Proposal not found"],
  proposal_closed: [409, "This proposal is no longer open"],
  not_proposed_member: [403, "You are not part of this proposal, or already answered"],
};

/**
 * Accept or decline an organizer's team proposal. The team forms only when
 * the last member accepts; any decline cancels it.
 */
export default defineEventHandler(async (event) => {
  const { registration, supabase } = await requireRegistration(event);
  const proposalId = getRouterParam(event, "id")!;
  const body = (await readBody<{ accept?: unknown }>(event)) ?? {};
  if (typeof body.accept !== "boolean") {
    throw createError({ statusCode: 400, message: "accept must be true or false" });
  }

  const { data, error } = await supabase.rpc("respond_to_proposal", {
    p_proposal: proposalId,
    p_registration: registration.id,
    p_accept: body.accept,
  });

  if (error) {
    const match = Object.entries(PROPOSAL_ERRORS).find(([code]) => error.message?.includes(code));
    if (match) throw createError({ statusCode: match[1][0], message: match[1][1] });
    // Formation re-checks membership: someone may have joined a team meanwhile.
    membershipError(error, "proposals.patch");
  }
  return data;
});
