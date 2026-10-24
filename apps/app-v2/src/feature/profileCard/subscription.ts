/** The member whose card is open, read from the person's store as the workspace changes. */

import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Store from "../../store/Store.ts"
import * as Stores from "../../store/Stores.ts"
import { Card, Message, ProfileCardDefinition } from "./definition.ts"
import { readProfile } from "./profile.ts"

/** The card that is open, with the trigger that opened it, none while it is closed. */
const Opened = Schema.Struct({ subject: Schema.String, triggerId: Schema.String })

/**
 * The member `subject` as `store` holds the workspace, each time the members, the agents, or the turns and groups that
 * say what an agent is doing change.
 */
export const readSubject = (store: Store.Store["Service"], subject: string, self: MemberId.MemberId) =>
  Stream.zipLatestAll(
    store.members,
    store.list("Agent", Store.workspacePlace),
    store.every("Turn"),
    store.list("Group", Store.workspacePlace)
  ).pipe(
    Stream.map(([members, agents, turns, groups]) =>
      Message.ReceivedProfile({
        profile: readProfile(subject, self, {
          members,
          agents: agents.map(({ record, pending }) => ({ agent: record.value, pending })),
          turns: turns.map(({ record }) => record.value),
          groups: groups.map(({ record }) => record.value)
        })
      })
    )
  )

export const subscriptions = ProfileCardDefinition.makeSubscriptions((entry) => ({
  profile: entry(
    "ReadProfile",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, opened: Schema.Option(Opened) },
    {
      messages: [Message.ReceivedProfile],
      modelToDependencies: ({ workspaceId, memberId, card }) => ({
        workspaceId,
        memberId,
        opened: Card.matchOrElse(
          card,
          {
            Reading: ({ subject, triggerId }) => Option.some({ subject, triggerId }),
            Showing: ({ subject, triggerId }) => Option.some({ subject, triggerId })
          },
          () => Option.none()
        )
      }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId, opened }) =>
          Option.match(opened, {
            onNone: () => Stream.empty,
            onSome: ({ subject }) =>
              stores
                .read(workspaceId, memberId, (store) => readSubject(store, subject, memberId))
                .pipe(Stream.catchCause(() => Stream.make(Message.ReceivedProfile({ profile: Option.none() }))))
          })
      }
    }
  )
}))
