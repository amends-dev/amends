import type { Harness } from "@amends/storage-conformance";
import { BunCrypto } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { layer, MemoryDatabase } from "../src/index.ts";

/** New memory storage for each test; each connection is another host over it. */
export const harness: Harness = {
  name: "memory",
  available: true,
  crypto: BunCrypto.layer,
  withStorage: (use) =>
    Effect.scoped(
      Effect.gen(function* () {
        const database = yield* MemoryDatabase.make();
        return yield* use({
          connect: () =>
            Layer.build(layer).pipe(Effect.provideService(MemoryDatabase.Service, database)),
          discardProjections: Effect.sync(() => {
            for (const space of database.spaces.values())
              for (const name of MemoryDatabase.projections) space.records[name].clear();
          }),
          footprint: Effect.sync(() => {
            let total = 0;
            for (const space of database.spaces.values()) {
              total += space.commits.size + space.appends.size;
              total +=
                space.threadPositions.size +
                space.groupTimes.size +
                space.notificationsSeen.size +
                space.connectionV2Credentials.size +
                space.sessionStates.size;
              for (const batches of space.logs.values())
                for (const batch of batches) total += 1 + batch.entries.length;
              for (const name of MemoryDatabase.projections) total += space.records[name].size;
            }
            for (const log of database.sessionLogs.values()) total += log.length;
            return total;
          }),
        });
      }),
    ),
};
