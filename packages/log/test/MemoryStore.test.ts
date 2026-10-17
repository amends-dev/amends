import { MemoryStore } from "@amends-dev/log"
import * as Conformance from "@amends-dev/log/conformance"
import { Effect } from "effect"

// Each connection is another host over the same database, as the suites expect.
Conformance.run({
  name: "memory",
  available: true,
  withStorage: (use) =>
    Effect.scoped(
      Effect.flatMap(MemoryStore.makeDatabase, (database) =>
        use({
          connect: () => Effect.provideServiceEffect(MemoryStore.make, MemoryStore.Binding, MemoryStore.bind(database))
        })
      )
    )
})
