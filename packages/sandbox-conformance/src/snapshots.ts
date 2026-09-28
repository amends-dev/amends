import { SandboxErrors } from "@amends/sandbox";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Harness } from "./harness.ts";
import { acquire, bytes, text } from "./support.ts";

export const snapshots = (harness: Harness) =>
  describe.skipIf(!harness.available)(`${harness.name}: snapshots`, () => {
    it.live(
      "starts a new sandbox from the files as they were when captured",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          const original = yield* acquire(harness, provider);
          yield* original.sandbox.writeFile("state.txt", bytes("captured"));
          if (provider.capabilities.snapshots === "none") {
            expect(yield* original.sandbox.snapshot.pipe(Effect.flip)).toBeInstanceOf(
              SandboxErrors.Unsupported,
            );
            return;
          }
          const reference = yield* Effect.acquireRelease(original.sandbox.snapshot, (taken) =>
            Effect.ignore(provider.deleteSnapshot(taken)),
          );
          expect(reference.provider).toBe(provider.name);
          yield* original.sandbox.writeFile("state.txt", bytes("changed afterwards"));

          const restored = yield* acquire(harness, provider, { snapshot: reference });
          expect(restored.filesystem).toBe("restored");
          expect(restored.sandbox.id).not.toBe(original.sandbox.id);
          expect(text(yield* restored.sandbox.readFile("state.txt"))).toBe("captured");
          expect(text(yield* original.sandbox.readFile("state.txt"))).toBe("changed afterwards");
        }),
      harness.timeout,
    );

    it.live(
      "cannot start from a snapshot once it is deleted",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          if (provider.capabilities.snapshots === "none") return;
          const { sandbox } = yield* acquire(harness, provider);
          const reference = yield* sandbox.snapshot;
          yield* provider.deleteSnapshot(reference);
          yield* provider.deleteSnapshot(reference);
          const refused = yield* provider
            .acquire({ ...harness.options, snapshot: reference })
            .pipe(Effect.flip);
          expect(refused).toBeInstanceOf(SandboxErrors.SnapshotUnavailable);
        }),
      harness.timeout,
    );

    it.live(
      "refuses a snapshot another provider took",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          const refused = yield* provider
            .acquire({ ...harness.options, snapshot: { provider: "elsewhere", id: "s1" } })
            .pipe(Effect.flip);
          expect(refused).toBeInstanceOf(SandboxErrors.SnapshotUnavailable);
        }),
      harness.timeout,
    );
  });
