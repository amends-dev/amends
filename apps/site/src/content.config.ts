import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

// The written pages and the generated ones (scripts/generate-docs.ts) share one collection.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
