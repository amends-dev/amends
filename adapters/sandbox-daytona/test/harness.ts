import type { Harness } from "@amends/sandbox-conformance";
import { BunServices } from "@effect/platform-bun";
import { Effect } from "effect";
import { FetchHttpClient } from "effect/http";
import { DaytonaSandbox } from "../src/index.ts";

/**
 * Real Daytona sandboxes, when `AMENDS_TEST_DAYTONA=1` asks for them and `DAYTONA_API_KEY` is set;
 * they take minutes and cost money, so an ordinary run skips them. Each test deletes what it
 * creates; Daytona stops and later deletes any a failed run leaves behind, labelled `amends`.
 */
export const harness: Harness = {
  name: "daytona",
  available:
    process.env["AMENDS_TEST_DAYTONA"] === "1" && (process.env["DAYTONA_API_KEY"] ?? "") !== "",
  provider: DaytonaSandbox.make({ autoStopInterval: 15, autoDeleteInterval: 60 }).pipe(
    Effect.provide(BunServices.layer),
    Effect.orDie,
  ),
  options: { labels: { amends: "conformance" } },
  port: Effect.succeed(8080),
  timeout: 900_000,
  http: FetchHttpClient.layer,
};
