import type { TestProject } from "vitest/node";
import { startWorkshop } from "./features-server.ts";

export default async function setup(project: TestProject) {
  const workshop = await startWorkshop();
  project.provide("workshopUrl", workshop.base);
  return workshop.stop;
}

declare module "vitest" {
  interface ProvidedContext {
    workshopUrl: string;
  }
}
