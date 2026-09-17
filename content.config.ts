import { defineContentConfig, defineCollection, z } from "@nuxt/content";

export default defineContentConfig({
  collections: {
    legal: defineCollection({
      type: "page",
      source: "legal/*.md",
    }),
    programme: defineCollection({
      type: "page",
      source: "programme.md",
    }),
    reglament: defineCollection({
      type: "page",
      source: "reglament.md",
      // Header fields the page renders outside the markdown body.
      schema: z.object({
        edition: z.string(),
        tagline: z.string(),
        updated: z.string(),
      }),
    }),
    order: defineCollection({
      type: "page",
      source: "order.md",
    }),
  },
});
