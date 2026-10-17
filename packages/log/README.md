# @amends-dev/log

Typed, append-only logs over storage you choose. A log holds values of one schema at positions of
its own; a commit appends to several logs at once, or to one alone without waiting for anything
else; an append can carry a key, so that a retry returns what the first attempt wrote; and readers
page a log's batches, select its entries by name or subject, or tail it as it grows. The package
depends only on Effect.

## Install

```sh
bun add @amends-dev/log effect
```

## Quick start

`Log.layer` gives typed logs over a `Store`, here `MemoryStore.layer`, which keeps them in process
memory.

```ts
import { Entry, Log, MemoryStore } from "@amends-dev/log"
import { Effect, Layer, Schema } from "effect"

const Step = Schema.Struct({ turn: Schema.String, text: Schema.String })

const program = Effect.gen(function* () {
  const logs = yield* Log.Log
  const steps = logs.open({ id: Entry.LogId.make("session-1"), schema: Step })

  // Outside a commit, an append is a commit of its own, waiting only for this log's writers.
  yield* steps.append({ turn: "turn-1", text: "Reading the notes." })

  // Inside one, appends to any log become visible together, or not at all.
  yield* logs.commit(steps.appendAll([{ turn: "turn-1", text: "Done." }]))

  // Each commit's entries are one batch, at the log's next position.
  const batches = yield* steps.read({ limit: 10 })
  return batches.map((batch) => [batch.position, batch.entries.map((entry) => entry.payload.text)])
})

Effect.runPromise(program.pipe(Effect.provide(Log.layer.pipe(Layer.provide(MemoryStore.layer)))))
// [[0, ["Reading the notes."]], [1, ["Done."]]]
```

`steps.tail({ limit: 100 })` streams the log's batches from the start, or after a position, and
then each batch as it commits, from any process over the same storage.

## The modules

| Module        | What it holds                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `Log`         | Typed handles on logs, `open`, and `commit`, which runs a program as one commit across them.        |
| `Store`       | The contract a storage adapter implements: appends, transactions, reads, and waiting for appends.   |
| `Transaction` | The coordinator that runs commits over a `Store` and joins nested ones, shared by everything on it. |
| `MemoryStore` | `Store` in process memory, over a `Binding` a host with memory storage of its own can provide.      |
| `Entry`       | Where an entry is: its ID, log, position, and index in its commit's batch.                          |
| `Commit`      | A commit's ID, entry count, and time.                                                               |
| `Codec`       | How values become stored bytes, in the binary format `SchemaBinary` derives from their schema.      |
| `StoreError`  | How every storage operation fails: `Failed`, `Rejected`, or `Contended`.                            |
| `StoreInput`  | How a store checks its inputs against their schemas before its driver sees them.                    |

## Positions, commits, and keys

A position is a batch cursor: every commit that touches a log writes one batch there, at the log's
next position, and its entries have consecutive indexes within the batch. An entry is located by
its log, position, and index, and each log's positions are its own.

`Log.commit(program)` runs `program` in one native transaction of the store, and nested commits
join it. Its appends, and whatever else the host's own stores write through `Store.Transaction`,
land together or not at all. Outside a commit, `append` is a commit of its own through
`Store.append`, which waits only for that log's other writers.

An append's `idempotencyKey` names it within its log: a retry with the same content returns the
original entries, and different content is rejected. `expectedAfter` makes an append conditional on
the log's current position, so a writer that fell behind fails with `Contended` instead of
writing past another.

## Names and subjects

An entry may carry a `name`, what kind of entry it is, and a `subject`, what it is about. Storage
indexes both, so `readEntries({ name?, subject?, after?, limit })` selects entries without reading
the whole log, and pages by an exclusive `{ position, index }` cursor that can fall inside a
commit. A log's own codec decides them: an ordinary log, `Codec.makeEntryCodec(schema)`, stores
the whole value as its bytes and gives neither, and refuses to decode an entry that has one.

## Storage adapters

An adapter implements `Store.Store` with a driver and returns `Store.make(driver)`, which checks
every input against its schema first. `MemoryStore` is the reference implementation, and
`@amends-dev/log/conformance` holds the suites every adapter runs against itself, with a fixture
that opens fresh storage for each test and connects to it as separate hosts would. They need
`@effect/vitest`, an optional peer dependency.

```ts
import * as Conformance from "@amends-dev/log/conformance"

Conformance.run(fixture)
```
