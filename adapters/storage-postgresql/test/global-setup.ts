import type { TestProject } from "vitest/node";
import { acquire } from "./postgres.ts";

declare module "vitest" {
  interface ProvidedContext {
    amendsPostgresUrl: string | null;
  }
}

/** One cluster per test run; individual tests still own separate databases. */
export default async function setup(project: TestProject) {
  const server = await acquire();
  project.provide("amendsPostgresUrl", server?.url ?? null);
  return async () => server?.stop();
}
