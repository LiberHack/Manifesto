import { toTypedSchema } from "@vee-validate/zod";
import * as z from "zod";

export const teamCreateSchema = toTypedSchema(
  z.object({
    name: z.string().min(2, "Team name must be at least 2 characters").max(32),
    skills_wanted: z.string().min(2, "Please list at least one skill").max(200),
    description: z.string().max(200).optional(),
  }),
);
