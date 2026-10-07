import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Redacted } from "effect";
import { LocalHost } from "../src/host.ts";
import { setup } from "./database.ts";

const { available, withDatabase } = setup();

// TODO: Check that a turn job request is stored with the commit that makes it, reaches the
// worker, and reaches another process over sockets at once, once the host runs turn jobs again.
describe.skipIf(!available)("jobs on the local host", () => {
  it.effect("a process refuses to start at a runner address another process holds", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const at = (port: number) =>
          LocalHost.layerDatabase(Redacted.make(url), {
            runnerAddress: { host: "localhost", port },
          });
        yield* Layer.build(at(34461));
        expect(yield* Effect.flip(Effect.scoped(Layer.build(at(34461))))).toMatchObject({
          _tag: "PostgresClusterStorage.AddressTaken",
          address: "localhost:34461",
        });
        // A process at its own address runs beside it.
        yield* Effect.scoped(Layer.build(at(34462)));
      }).pipe(Effect.scoped),
    ),
  );
});
