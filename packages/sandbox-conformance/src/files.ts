import { SandboxErrors } from "@amends/sandbox";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Harness } from "./harness.ts";
import { acquire, bytes } from "./support.ts";

export const files = (harness: Harness) =>
  describe.skipIf(!harness.available)(`${harness.name}: files`, () => {
    it.live(
      "writes and reads back any bytes, creating directories and replacing earlier content",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          const { sandbox } = yield* acquire(harness, provider);
          const binary = new Uint8Array([0, 255, 128, 10, 13, 0xc3]);
          yield* sandbox.writeFile("deep/in/here.bin", binary);
          expect(yield* sandbox.readFile("deep/in/here.bin")).toEqual(binary);
          yield* sandbox.writeFile("deep/in/here.bin", bytes("replaced"));
          expect(yield* sandbox.readFile("deep/in/here.bin")).toEqual(bytes("replaced"));
          expect(yield* sandbox.readFile(`${sandbox.workdir}/deep/in/here.bin`)).toEqual(
            bytes("replaced"),
          );
        }),
      harness.timeout,
    );

    it.live(
      "reports a missing file as not found",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          const { sandbox } = yield* acquire(harness, provider);
          expect(yield* sandbox.readFile("missing.txt").pipe(Effect.flip)).toEqual(
            new SandboxErrors.FileNotFound({ path: "missing.txt" }),
          );
        }),
      harness.timeout,
    );
  });
