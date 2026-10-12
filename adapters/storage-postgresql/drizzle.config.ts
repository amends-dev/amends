import { defineConfig } from "drizzle-kit";

/** Migrations are generated from the schema into ./drizzle and applied by the database layer. */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/internal/schema.ts",
  out: "./drizzle",
});
