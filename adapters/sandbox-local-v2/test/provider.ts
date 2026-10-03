import { LocalSandboxProvider } from "@amends/sandbox-local-v2";
import { Effect, FileSystem } from "effect";

/**
 * A local provider over a temporary directory, which is removed with every sandbox in it when the
 * test's scope closes. Tests that hold for any provider take their provider only from here.
 */
export const makeProvider = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* LocalSandboxProvider.make({ directory: yield* fs.makeTempDirectoryScoped() });
});
