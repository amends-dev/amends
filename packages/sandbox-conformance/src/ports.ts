import { describe, expect, it } from "@effect/vitest";
import { Effect, Schedule } from "effect";
import { HttpClient } from "effect/http";
import type { Harness } from "./harness.ts";
import { acquire, bytes } from "./support.ts";

export const ports = (harness: Harness) =>
  describe.skipIf(!harness.available)(`${harness.name}: ports`, () => {
    it.live(
      "exposes a port a process listens on, reachable with the returned headers",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          const { sandbox } = yield* acquire(harness, provider);
          const port = yield* harness.port;
          yield* sandbox.writeFile("site/hello.txt", bytes("hello from inside"));
          yield* sandbox.spawn({
            argv: ["python3", "-m", "http.server", String(port), "--bind", "0.0.0.0"],
            cwd: "site",
          });
          const exposure = yield* sandbox.expose(port);
          const client = HttpClient.filterStatusOk(yield* HttpClient.HttpClient);
          const body = yield* client
            .get(`${exposure.url.replace(/\/$/, "")}/hello.txt`, { headers: exposure.headers })
            .pipe(
              Effect.flatMap((response) => response.text),
              Effect.retry({ schedule: Schedule.spaced("250 millis"), times: 120 }),
            );
          expect(body).toBe("hello from inside");
        }).pipe(Effect.provide(harness.http)),
      harness.timeout,
    );
  });
