import type { TestProject } from "vitest/node"
import { acquire } from "./postgres.ts"

declare module "vitest" {
  interface ProvidedContext {
    amendsPostgresUrl: string | null
  }
}

/** One cluster per test run; individual tests still own separate databases. */
export default async function setup(project: TestProject) {
  const server = await acquire()
  // CI requires PostgreSQL, so a runner without it fails instead of skipping the database suites.
  if (server === undefined && process.env.AMENDS_POSTGRES_REQUIRED === "true")
    throw new Error("AMENDS_POSTGRES_REQUIRED is set, but no PostgreSQL server or installation was found")
  project.provide("amendsPostgresUrl", server?.url ?? null)
  return async () => server?.stop()
}
