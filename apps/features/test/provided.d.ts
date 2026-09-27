// The workshop host that scripts/testing/features-setup.ts starts for these suites.
declare module "vitest" {
  interface ProvidedContext {
    workshopUrl: string;
  }
}

export {};
