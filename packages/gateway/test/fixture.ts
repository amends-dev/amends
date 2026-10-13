import { MemoryDatabase } from "@amends-dev/core/journal"
import type { Fixture } from "@amends-dev/gateway/conformance"
import { Crypto, Effect, Layer } from "effect"
import * as Accounts from "../src/Accounts.ts"
import * as SignInStorage from "../src/SignInStorage.ts"
import * as WorkspaceDirectory from "../src/WorkspaceDirectory.ts"
import * as WorkspaceStorage from "../src/WorkspaceStorage.ts"

/** The runtime's Web Crypto, for new human IDs. */
export const webCrypto = Crypto.make({
  randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
  digest: (algorithm, data) => Effect.promise(async () => new Uint8Array(await crypto.subtle.digest(algorithm, data)))
})

/**
 * Every contract a host implements for the gateway in process memory, over one new connection to
 * the `MemoryDatabase` beneath: each build over the same database is another host.
 */
const layerMemoryStorage = Layer.mergeAll(
  WorkspaceStorage.layerMemory,
  WorkspaceDirectory.layerMemory,
  Accounts.layerMemory,
  SignInStorage.layerMemory
).pipe(Layer.provide(MemoryDatabase.layerConnection))

/** New memory storage for each test; each connection is another host over it. */
export const fixture: Fixture = {
  name: "memory",
  available: true,
  withStorage: (use) =>
    Effect.scoped(
      Effect.gen(function* () {
        const database = yield* MemoryDatabase.make
        return yield* use({
          connect: () =>
            Layer.build(layerMemoryStorage.pipe(Layer.provideMerge(Layer.succeed(Crypto.Crypto, webCrypto)))).pipe(
              Effect.provideService(MemoryDatabase.MemoryDatabase, database)
            ),
          discardProjections: Effect.sync(() => {
            for (const space of database.spaces.values()) for (const table of space.records) table.clear()
          }),
          footprint: Effect.sync(() => {
            let total = 0
            for (const space of database.spaces.values()) {
              total += space.commits.size + space.appends.size
              total +=
                space.threadPositions.size +
                space.groupTimes.size +
                space.notificationsSeen.size +
                space.connectionCredentials.size +
                space.sessionStates.size
              for (const batches of space.logs.values()) for (const batch of batches) total += 1 + batch.entries.length
              for (const table of space.records) total += table.size
            }
            for (const log of database.sessionLogs.values()) total += log.length
            for (const table of database.tables.values()) total += table.size
            return total
          })
        })
      })
    )
}

/** Run one test over fresh memory storage. */
export const withStorage = fixture.withStorage
