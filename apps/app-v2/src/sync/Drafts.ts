/**
 * The person's drafts in one store: what they have written and not sent, a reply in a thread or a
 * new thread in a group, kept in an IndexedDB database of the store's own, so a draft outlasts a
 * reload and waits offline. Drafts stay in the browser: no other device and no server sees them,
 * and signing out deletes them with the person's stores.
 */

import { GroupId } from "@amends-dev/core/group"
import { ThreadId } from "@amends-dev/core/thread"
import type * as IndexedDb from "@effect/platform-browser/IndexedDb"
import * as IndexedDbDatabase from "@effect/platform-browser/IndexedDbDatabase"
import type * as IndexedDbQueryBuilder from "@effect/platform-browser/IndexedDbQueryBuilder"
import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import * as IndexedDbVersion from "@effect/platform-browser/IndexedDbVersion"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Semaphore from "effect/Semaphore"

/** Where a draft is written: as a reply in a thread, or as a new thread in a group. */
export const Place = Schema.TaggedUnion({
  Reply: { threadId: ThreadId.ThreadId },
  Thread: { groupId: GroupId.GroupId }
})
export type Place = typeof Place.Type

/** The draft at a place, as its text. */
const Row = Schema.Struct({ key: Schema.String, text: Schema.String })

class Rows extends IndexedDbTable.make({ name: "drafts", schema: Row, keyPath: "key" }) {}

class Version1 extends IndexedDbVersion.make(Rows) {}

class Database extends IndexedDbDatabase.make(
  Version1,
  Effect.fnUntraced(function* (api) {
    yield* api.createObjectStore("drafts")
  })
) {}

const keyText = Schema.encodeSync(Schema.fromJsonString(Place))

type QueryError = IndexedDbQueryBuilder.IndexedDbQueryError

/** One store's drafts, open for as long as the scope that opened them. */
export class Drafts extends Context.Service<
  Drafts,
  {
    /** The draft at `place`, or nothing written there. */
    readonly get: (place: Place) => Effect.Effect<string, QueryError>
    /** Keep `text` as the draft at `place`; no text is no draft. Saves keep the order they were asked in. */
    readonly save: (place: Place, text: string) => Effect.Effect<void, QueryError>
  }
>()("@amends-dev/app-v2/sync/Drafts") {}

const make = Effect.gen(function* () {
  const drafts = (yield* Database.getQueryBuilder).from("drafts")
  // One save at a time, so a later keystroke's draft is never overwritten by an earlier one's.
  const saving = yield* Semaphore.make(1)
  return Drafts.of({
    get: (place) => Effect.map(drafts.select().equals(keyText(place)), ([row]) => row?.text ?? ""),
    save: (place, text) =>
      saving.withPermit(
        text === "" ? drafts.delete().equals(keyText(place)) : drafts.upsert({ key: keyText(place), text })
      )
  })
})

/**
 * Open the drafts in the IndexedDB database `name`, creating it empty the first time.
 *
 * @category layers
 */
export const layer = (
  name: string
): Layer.Layer<Drafts, IndexedDbDatabase.IndexedDbDatabaseError, IndexedDb.IndexedDb> =>
  Layer.effect(Drafts, make).pipe(Layer.provide(Database.layer(name)))
