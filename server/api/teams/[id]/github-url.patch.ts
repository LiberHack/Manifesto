import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";

const MAX_URL_LENGTH = 500;

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const teamId = getRouterParam(event, "id");
  const supabase = useSupabaseAdmin();

  const { data: participant } = await supabase
    .from("participants")
    .select("team_id")
    .eq("id", user.sub)
    .single();

  if (!participant || participant.team_id !== teamId) {
    throw createError({ statusCode: 403, message: "You are not a member of this team" });
  }

  const body = await readBody<{ github_url?: unknown }>(event);

  let github_url: string | null = null;
  if (body.github_url !== undefined && body.github_url !== null && body.github_url !== "") {
    if (typeof body.github_url !== "string") {
      throw createError({ statusCode: 400, message: "github_url must be a string" });
    }
    if (body.github_url.length > MAX_URL_LENGTH) {
      throw createError({ statusCode: 400, message: `github_url must be ${MAX_URL_LENGTH} characters or fewer` });
    }
    try {
      const parsed = new URL(body.github_url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("scheme");
      }
      github_url = parsed.toString();
    } catch {
      throw createError({ statusCode: 400, message: "github_url must be a valid http(s) URL" });
    }
  }

  const { data, error } = await supabase
    .from("teams")
    .update({ github_url })
    .eq("id", teamId!)
    .select()
    .single();

  if (error) throw createError({ statusCode: 500, message: "Internal server error" });
  return data;
});
